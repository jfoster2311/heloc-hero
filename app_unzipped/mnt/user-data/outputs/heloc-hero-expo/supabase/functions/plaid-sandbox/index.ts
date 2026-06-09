// supabase/functions/plaid-sandbox/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
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
              { type: "depository", subtype: "savings", starting_balance: 8000, iso_currency_code: "USD" },
            ],
          }),
        },
      ));
    }

    if (action === "fireWebhook") {
      const { userId, accountType } = body;
      if (!userId) return errorResponse("userId is required");
      const supabase = getAdminClient();
      const { data } = await supabase
        .from("plaid_accounts")
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
