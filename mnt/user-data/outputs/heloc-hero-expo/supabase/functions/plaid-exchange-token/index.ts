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
      return errorResponse(result.error ?? "Failed to exchange token");
    }

    const supabase = getAdminClient();
    const { error: upsertError } = await supabase.from("plaid_accounts").upsert(
      {
        user_id: userId,
        account_type: accountType as AccountType,
        access_token: result.access_token as string,
        item_id: result.item_id as string,
      },
      { onConflict: "user_id,account_type" },
    );

    if (upsertError) return errorResponse("Failed to save account", 500);

    // Kick off initial balance fetch
    await plaid.syncTransactions(result.access_token as string);

    if (plaid.env === "sandbox") {
      plaid.sandboxFireSyncUpdateWebhook(result.access_token as string);
    }

    return jsonResponse({ success: true, item_id: result.item_id });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
