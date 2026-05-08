// supabase/functions/plaid-get-balances/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, accountType } = await req.json();
    if (!userId) return errorResponse("userId is required");

    const supabase = getAdminClient();
    const plaid = new PlaidClient();

    // Query secure token store
    let query = supabase
      .from("plaid_accounts")
      .select("user_id, account_type, access_token")
      .eq("user_id", userId);
    if (accountType) query = query.eq("account_type", accountType);

    const { data: plaidAccounts, error } = await query;
    if (error) return errorResponse("Failed to query accounts", 500);
    if (!plaidAccounts?.length) return jsonResponse({ accounts: [], refreshed: 0 });

    let refreshed = 0;
    await Promise.all(
      plaidAccounts.map(async (acct: { user_id: string; account_type: string; access_token: string }) => {
        try {
          const balanceRes = await plaid.getAccountBalances(acct.access_token);
          const accounts = balanceRes.accounts ?? [];
          await supabase
            .from("linked_accounts")
            .update({ accounts, accounts_updated_at: new Date().toISOString() })
            .eq("user_id", acct.user_id)
            .eq("account_type", acct.account_type);
          refreshed++;
        } catch (err) {
          console.warn(`Balance refresh failed for ${acct.account_type}:`, err);
        }
      }),
    );

    // Return updated linked_accounts rows for the caller
    const { data: linked } = await supabase
      .from("linked_accounts")
      .select("*")
      .eq("user_id", userId);

    return jsonResponse({ accounts: linked ?? [], refreshed });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
