// supabase/functions/plaid-sandbox/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { requireSelf } from "../_shared/auth.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();
    const { action } = body;
    const plaid = new PlaidClient();

    if (action === "createPublicToken") {
      const webhookUrl = Deno.env.get("PLAID_WEBHOOK_URL") ??
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/plaid-webhook`;

      return jsonResponse(await plaid.createSandboxPublicToken(
        "ins_109508",
        ["transactions", "identity", "liabilities"],
        {
          webhook: webhookUrl,
          override_username: "user_custom",
          override_password: JSON.stringify({
            version: 2,
            override_accounts: [
              { type: "loan", subtype: "mortgage", starting_balance: 350000, iso_currency_code: "USD" },
              { type: "loan", subtype: "home equity", starting_balance: 20000, iso_currency_code: "USD" },
              {
                type: "depository",
                subtype: "savings",
                starting_balance: 8000,
                iso_currency_code: "USD",
                // A custom sandbox account with no transactions produces an
                // empty history, which made the whole cash-flow derivation
                // untestable without a production link. This set is shaped to
                // exercise the parts that can actually go wrong: recurring
                // income, a lumpy annual bill, and an internal transfer that
                // must NOT be read as spending.
                transactions: buildSandboxTransactions(),
              },
            ],
          }),
        },
      ));
    }

    if (action === "fireWebhook") {
      const { userId, accountType } = body;
      if (!userId) return errorResponse("userId is required");

      // Reads plaid_accounts_secure — the DECRYPTING view — and hands the token
      // to Plaid. Unguarded, that is one authenticated user operating on
      // another's live bank credential, which is not something a sandbox helper
      // being deployed to production should be able to do.
      const denied = await requireSelf(req, userId);
      if (denied) return denied;

      const supabase = getAdminClient();
      const { data } = await supabase
        .from("plaid_accounts_secure")
        .select("access_token")
        .eq("user_id", userId)
        .eq("account_type", accountType)
        .single();

      if (!data) return errorResponse("No account found", 404);
      return jsonResponse(await plaid.sandboxFireSyncUpdateWebhook(data.access_token));
    }

    return errorResponse("Unknown action");
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});

/**
 * Six months of plausible activity for the sandbox savings account.
 *
 * Deliberately includes the three cases the derivation has to get right:
 *   · a twice-monthly salary, so recurring-inflow detection has something to find
 *   · one large irregular cost (a repair), because averaging those in is the
 *     entire reason a trailing figure beats a typed estimate
 *   · a transfer out to the HELOC, which must be excluded rather than counted
 *     as spending — the failure mode that would otherwise make the app conclude
 *     the user cannot afford the strategy it just recommended
 */
function buildSandboxTransactions() {
  const txns: Array<Record<string, unknown>> = [];
  const today = new Date();

  for (let back = 6; back >= 1; back--) {
    const month = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const y = month.getFullYear();
    const m = String(month.getMonth() + 1).padStart(2, "0");
    const on = (day: number) => `${y}-${m}-${String(day).padStart(2, "0")}`;

    // Income: negative amounts are credits in Plaid's convention.
    txns.push(row(on(1),  -4250, "ACME CORP DIRECT DEP PAYROLL"));
    txns.push(row(on(15), -4250, "ACME CORP DIRECT DEP PAYROLL"));

    // Ordinary living costs.
    txns.push(row(on(3),  1850, "SHELTER POINT PROPERTY MGMT"));
    txns.push(row(on(6),   420, "WHOLE FOODS MARKET"));
    txns.push(row(on(12),  310, "COSTCO WHOLESALE"));
    txns.push(row(on(18),  185, "CITY POWER AND LIGHT"));
    txns.push(row(on(22),  240, "SHELL OIL"));
    txns.push(row(on(26),  160, "VERIZON WIRELESS"));

    // The lumpy one, twice a year — exactly what people forget when estimating.
    if (back === 5 || back === 2) {
      txns.push(row(on(20), 1400, "STATE FARM AUTO PREMIUM"));
    }

    // An internal move to the line. Must be excluded from expenses.
    txns.push(row(on(28), 2000, "TRANSFER TO HOME EQUITY LINE"));
  }

  return txns;
}

function row(date: string, amount: number, description: string) {
  return { date_transacted: date, date_posted: date, amount, description, currency: "USD" };
}
