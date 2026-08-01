// supabase/functions/plaid-get-balances/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { requireSelf } from "../_shared/auth.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, accountType } = await req.json();
    if (!userId) return errorResponse("userId is required");

    // This function runs with the service role, so RLS does not apply — and it
    // ends by RETURNING the named user's linked_accounts rows: every balance,
    // account name and mask, plus the servicer liabilities blob holding the
    // mortgage rate, escrow and next payment due. Without this check any
    // authenticated user could read all of that for any other user by putting
    // their id in the body.
    const denied = await requireSelf(req, userId);
    if (denied) return denied;

    const supabase = getAdminClient();
    const plaid = new PlaidClient();

    // Decrypting view — plaid_accounts holds only a vault.secrets reference.
    let query = supabase
      .from("plaid_accounts_secure")
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

          const update: Record<string, unknown> = {
            accounts,
            accounts_updated_at: new Date().toISOString(),
          };

          // Mortgages can also report servicer terms. Liabilities is a monthly
          // per-item subscription rather than a per-call charge, so pulling it
          // alongside the balance costs nothing extra — but only mortgages are
          // worth asking about: Plaid does not cover HELOCs at all, and savings
          // accounts have no liability object.
          if (acct.account_type === "mortgage") {
            try {
              const liabRes = await plaid.getLiabilities(acct.access_token);
              const mortgage = liabRes?.liabilities?.mortgage ?? null;
              if (mortgage?.length) {
                // Keep the outgoing snapshot. Escrow and rate CHANGES are found
                // by comparing the two — Plaid publishes no forward schedule of
                // either, so without this the app could only ever show a level,
                // never a change.
                const { data: existing } = await supabase
                  .from("linked_accounts")
                  .select("liabilities")
                  .eq("user_id", acct.user_id)
                  .eq("account_type", acct.account_type)
                  .maybeSingle();

                if (existing?.liabilities) update.liabilities_prev = existing.liabilities;
                update.liabilities = { mortgage };
              }
            } catch (err) {
              // Servicers that do not participate return an error here. That is
              // a normal outcome, not a failure — the app falls back to
              // user-entered mortgage details.
              console.info(`Liabilities unavailable for ${acct.account_type}:`, err);
            }
          }

          await supabase
            .from("linked_accounts")
            .update(update)
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
