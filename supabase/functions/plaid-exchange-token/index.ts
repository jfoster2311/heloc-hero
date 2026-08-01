// supabase/functions/plaid-exchange-token/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

const VALID_TYPES = ["mortgage", "home equity", "savings"] as const;
type AccountType = typeof VALID_TYPES[number];

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { publicToken, accountType, userId } = await req.json();

    if (!publicToken) return errorResponse("publicToken is required");
    if (!accountType) return errorResponse("accountType is required");
    if (!userId) return errorResponse("userId is required");
    if (!VALID_TYPES.includes(accountType)) {
      return errorResponse("accountType must be: mortgage | home equity | savings");
    }

    const plaid = new PlaidClient();
    const result = await plaid.exchangePublicToken(publicToken);

    if (!result.success || !result.access_token) {
      return errorResponse("Failed to exchange token");
    }

    const supabase = getAdminClient();

    // The token goes into Vault, never into a column. This RPC creates the
    // secret — or updates it in place when this account_type is being re-linked,
    // so a re-link cannot orphan the previous one — and upserts the row pointing
    // at it, in a single statement. Splitting the two is how you end up with a
    // row holding no usable token, or a secret nothing references.
    const { error: storeError } = await supabase.rpc("plaid_store_access_token", {
      p_user_id: userId,
      p_account_type: accountType as AccountType,
      p_item_id: result.item_id,
      p_token: result.access_token,
    });
    if (storeError) {
      console.error("plaid_store_access_token:", storeError.message);
      return errorResponse("Failed to save account credentials", 500);
    }

    // Fetch institution name for display
    let institutionName: string | null = null;
    try {
      const itemData = await plaid.getItem(result.access_token);
      const institutionId = itemData.item?.institution_id;
      if (institutionId) {
        const instData = await plaid.getInstitution(institutionId);
        institutionName = instData.institution?.name ?? null;
      }
    } catch {
      // Non-fatal — institution name is cosmetic
    }

    // Create/update linked_accounts row so the frontend can see the account immediately
    const { error: linkedError } = await supabase.from("linked_accounts").upsert(
      {
        user_id: userId,
        account_type: accountType as AccountType,
        institution_name: institutionName,
        plaid_item_id: result.item_id,
        accounts: [], // populated by webhook / plaid-get-balances
      },
      { onConflict: "user_id,account_type" },
    );
    if (linkedError) console.warn("linked_accounts upsert:", linkedError.message);

    // Kick off initial transaction sync
    try {
      await plaid.syncTransactions(result.access_token);
    } catch {
      // Non-fatal
    }

    // Fire sandbox webhook to trigger the first balance update
    if (plaid.env === "sandbox") {
      plaid.sandboxFireSyncUpdateWebhook(result.access_token).catch(() => {});
    }

    return jsonResponse({
      success: true,
      item_id: result.item_id,
      institution_name: institutionName,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
