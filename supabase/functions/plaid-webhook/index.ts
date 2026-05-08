// supabase/functions/plaid-webhook/index.ts
// Deploy with: supabase functions deploy plaid-webhook --no-verify-jwt
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Mirrors equityThreshold / savingsThreshold from heloc-hero-back notificationTemplates
const EQUITY_THRESHOLD = 20_000;
const SAVINGS_THRESHOLD = 5_000;

interface PlaidAccount {
  account_id: string;
  name: string;
  subtype: string;
  balances: { current: number; available: number | null; limit: number | null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { webhook_type, webhook_code, item_id } = body;

    const handled = ["TRANSACTIONS", "HOLDINGS", "LIABILITIES", "ITEM"];
    if (!handled.includes(webhook_type)) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getAdminClient();

    // Look up secure access token via plaid_accounts (never exposed to frontend)
    const { data: plaidAcct } = await supabase
      .from("plaid_accounts")
      .select("user_id, account_type, access_token")
      .eq("item_id", item_id)
      .single();

    if (!plaidAcct) {
      return new Response(JSON.stringify({ received: true, note: "account not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, account_type, access_token } = plaidAcct;

    if (webhook_type === "ITEM") {
      await handleItemEvent(supabase, user_id, webhook_code);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch live balances from Plaid
    const plaid = new PlaidClient();
    const balanceRes = await plaid.getAccountBalances(access_token);
    const newAccounts: PlaidAccount[] = balanceRes.accounts ?? [];

    // Read previous balances for threshold comparison
    const { data: linkedAcct } = await supabase
      .from("linked_accounts")
      .select("accounts")
      .eq("user_id", user_id)
      .eq("account_type", account_type)
      .single();
    const previousAccounts: PlaidAccount[] = linkedAcct?.accounts ?? [];

    // Push fresh balances to linked_accounts (what the frontend reads)
    await supabase
      .from("linked_accounts")
      .update({
        accounts: newAccounts,
        accounts_updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id)
      .eq("account_type", account_type);

    // Threshold & reduction notifications (mirrors plaidWebhookHandler.js)
    await checkThresholds(supabase, user_id, account_type, previousAccounts, newAccounts);
    if (account_type === "mortgage") {
      await checkMortgageReduction(supabase, user_id, previousAccounts, newAccounts);
    }

    return new Response(
      JSON.stringify({ received: true, accounts_updated: newAccounts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Webhook error:", err);
    // Always 200 to Plaid so it doesn't retry endlessly
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore no-explicit-any
async function handleItemEvent(supabase: any, userId: string, code: string) {
  const messages: Record<string, { title: string; body: string }> = {
    ERROR: {
      title: "Bank Connection Issue",
      body: "Please reconnect your bank account in HELOC Hero.",
    },
    PENDING_EXPIRATION: {
      title: "Bank Connection Expiring",
      body: "Your bank connection will expire soon. Please reconnect.",
    },
    LOGIN_REPAIRED: {
      title: "Bank Connection Restored",
      body: "Your bank account has been successfully reconnected.",
    },
  };
  const msg = messages[code];
  if (!msg) return;
  await supabase
    .from("notifications")
    .insert({ user_id: userId, title: msg.title, body: msg.body, type: "item_status", data: { webhook_code: code } })
    .catch(() => {});
}

// deno-lint-ignore no-explicit-any
async function checkThresholds(
  supabase: any,
  userId: string,
  accountType: string,
  previousAccounts: PlaidAccount[],
  newAccounts: PlaidAccount[],
) {
  const thresholds: Record<string, number> = {
    "home equity": EQUITY_THRESHOLD,
    savings: SAVINGS_THRESHOLD,
  };
  const threshold = thresholds[accountType];
  if (!threshold) return;

  for (const newAcct of newAccounts) {
    const prev = previousAccounts.find((a) => a.account_id === newAcct.account_id);
    const prevBal = prev?.balances?.current ?? 0;
    const newBal = newAcct.balances?.current ?? 0;

    if (prevBal < threshold && newBal >= threshold) {
      const isSavings = accountType === "savings";
      await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          title: isSavings ? "Savings Goal Reached!" : "HELOC Ready to Deploy!",
          body: isSavings
            ? `Your savings hit $${threshold.toLocaleString()} — time to dump to your HELOC!`
            : `Your HELOC balance hit $${threshold.toLocaleString()} — consider a mortgage dump!`,
          type: isSavings ? "savings_threshold" : "heloc_threshold",
          data: { account_id: newAcct.account_id, previous_balance: prevBal, new_balance: newBal, threshold },
        })
        .catch(() => {});
    }
  }
}

// deno-lint-ignore no-explicit-any
async function checkMortgageReduction(
  supabase: any,
  userId: string,
  previousAccounts: PlaidAccount[],
  newAccounts: PlaidAccount[],
) {
  for (const newAcct of newAccounts) {
    const prev = previousAccounts.find((a) => a.account_id === newAcct.account_id);
    if (!prev) continue;
    const reduction = (prev.balances?.current ?? 0) - (newAcct.balances?.current ?? 0);
    if (reduction > 0) {
      await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          title: "Mortgage Balance Reduced!",
          body: `Your mortgage dropped $${reduction.toLocaleString("en-US", { maximumFractionDigits: 0 })}. Great progress!`,
          type: "mortgage_reduction",
          data: { account_id: newAcct.account_id, reduction, new_balance: newAcct.balances?.current },
        })
        .catch(() => {});
    }
  }
}
