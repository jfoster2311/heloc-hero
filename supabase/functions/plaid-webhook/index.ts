// supabase/functions/plaid-webhook/index.ts
// Deploy with: supabase functions deploy plaid-webhook --no-verify-jwt
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { verifyPlaidWebhook } from "../_shared/plaidWebhook.ts";
import { syncItemTransactions } from "../_shared/transactions.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { sendPush } from "../_shared/notifications.ts";
import {
  computeSweepAmount, evaluateCashThreshold, isPaidTier,
  resolveCashBalance, isCashAccountType,
} from "../_shared/cashAlert.ts";

/** Mirrors lib/config.ts CASH_ALERT_MIN_GAP_DAYS. */
const CASH_ALERT_MIN_GAP_DAYS = 5;

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
    // Read as TEXT, once. The signature covers these exact bytes, so parsing to
    // JSON and re-serialising for the hash would produce a different string and
    // a check that never passes. Everything below parses from this same value.
    const rawBody = await req.text();
    const plaidClient = new PlaidClient();

    const verification = await verifyPlaidWebhook(req, rawBody, plaidClient);
    if (!verification.valid) {
      // Logged in full, answered in one word. This endpoint is public, and
      // telling an unauthenticated caller WHICH check they failed is a free
      // tutorial in passing it.
      console.warn("plaid-webhook: rejected —", verification.reason);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Malformed body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      webhook_type = "",
      webhook_code = "",
      item_id = "",
    } = body as { webhook_type?: string; webhook_code?: string; item_id?: string };

    // Defaulted to "" above rather than left possibly-undefined: a verified
    // request can still be missing a field, and every use below — the
    // `handled` check, the item_id lookup, handleItemEvent — wants a string.
    if (!item_id) {
      return new Response(JSON.stringify({ received: true, note: "no item_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const handled = ["TRANSACTIONS", "HOLDINGS", "LIABILITIES", "ITEM"];
    if (!handled.includes(webhook_type)) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getAdminClient();

    // Token comes from the decrypting view, never the table — plaid_accounts
    // itself holds only a vault.secrets reference. service_role only.
    const { data: plaidAcct } = await supabase
      .from("plaid_accounts_secure")
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

    // Transaction webhooks were being acknowledged and thrown away. This is the
    // event that tells us the asynchronous historical backfill has landed —
    // without handling it, a newly linked user's 24 months of history only
    // arrives whenever they next happen to open the app.
    if (webhook_type === "TRANSACTIONS") {
      const syncCodes = [
        "SYNC_UPDATES_AVAILABLE",
        "INITIAL_UPDATE",
        "HISTORICAL_UPDATE",
        "DEFAULT_UPDATE",
        "TRANSACTIONS_REMOVED",
      ];
      if (syncCodes.includes(webhook_code)) {
        const { data: item } = await supabase
          .from("plaid_accounts")
          .select("transactions_cursor")
          .eq("item_id", item_id)
          .single();

        const result = await syncItemTransactions(supabase, plaidClient, {
          user_id,
          account_type,
          access_token,
          transactions_cursor: item?.transactions_cursor ?? null,
        });
        return new Response(JSON.stringify({ received: true, transactions: result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch live balances from Plaid. Reuses the client built for
    // verification above rather than constructing a third one.
    const balanceRes = await plaidClient.getAccountBalances(access_token);
    const newAccounts: PlaidAccount[] = balanceRes.accounts ?? [];

    // The previous balances used to be read here, to spot the moment a figure
    // crossed a hardcoded threshold. The alert now works from the user's own
    // thresholds and its own arm state (automation_settings), so a before/after
    // comparison of the raw balance is no longer what decides anything.

    // Push fresh balances to linked_accounts (what the frontend reads)
    await supabase
      .from("linked_accounts")
      .update({
        accounts: newAccounts,
        accounts_updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id)
      .eq("account_type", account_type);

    // The balance is written above regardless. This only decides whether the
    // change is worth interrupting someone about, and a failure inside it must
    // never cost the balance update — see the try/catch in the helper.
    if (isCashAccountType(account_type)) {
      await maybeAlertCashThreshold(supabase, user_id);
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

/**
 * Push a sweep prompt when the user's cash has risen past what they asked to keep.
 *
 * Replaces a pair of helpers that compared balances to a hardcoded $5,000 /
 * $20,000 and wrote rows into a `notifications` table no client has ever read.
 * Those alerts were invisible AND used numbers the user never chose.
 *
 * Every gate below is a reason NOT to send, and they are all cheap reads done
 * before the push:
 *   · paid tier — live sync and its alerts are the Pro feature
 *   · safe_sweep_enabled — the user asked for this specific prompt
 *   · a registered token — permission was granted on some device
 *   · the crossing is fresh — arm state, so one crossing is one prompt
 */
// deno-lint-ignore no-explicit-any
async function maybeAlertCashThreshold(supabase: any, userId: string) {
  try {
    const [{ data: user }, { data: settings }] = await Promise.all([
      supabase.from("users").select("tier").eq("id", userId).maybeSingle(),
      supabase
        .from("automation_settings")
        .select(
          "safe_sweep_enabled, buffer_target, upcoming_bills_estimate, " +
            "min_sweep_amount, cash_alert_armed, cash_alert_last_fired_at",
        )
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (!isPaidTier(user?.tier)) return;
    // No row means the user has never opened alert settings, and the columns
    // default to off. Absence is not consent.
    if (!settings?.safe_sweep_enabled) return;

    // Resolved from ALL of the user's cash accounts, not just the item that
    // fired: the app measures the sweep against checking-then-savings, and a
    // webhook for savings must not quote savings while the app shows checking.
    const { data: linked } = await supabase
      .from("linked_accounts")
      .select("account_type, accounts")
      .eq("user_id", userId);

    const cashBalance = resolveCashBalance(linked ?? []);
    // Null is "we have no balance", which is not the same as zero and must not
    // re-arm the alert on no evidence.
    if (cashBalance === null) return;

    const spare = computeSweepAmount(
      cashBalance,
      Number(settings.buffer_target ?? 0),
      Number(settings.upcoming_bills_estimate ?? 0),
    );

    const { fire, next } = evaluateCashThreshold(
      spare,
      Number(settings.min_sweep_amount ?? 0),
      {
        armed: settings.cash_alert_armed !== false,
        lastFiredAt: settings.cash_alert_last_fired_at ?? null,
      },
      CASH_ALERT_MIN_GAP_DAYS,
    );

    // Persisted whether or not we send — falling back below the line re-arms,
    // and that transition is exactly as important to record as a firing.
    const prevArmed = settings.cash_alert_armed !== false;
    if (
      next.armed === prevArmed &&
      next.lastFiredAt === (settings.cash_alert_last_fired_at ?? null)
    ) {
      return;
    }

    // Compare-and-swap on `armed`, matching hooks/useCycleReminders.ts. The app
    // evaluates this same crossing on foreground refresh, and the refresh it
    // reacts to is the one this webhook just wrote — so the two racing is the
    // normal case. Claiming the transition in the WHERE clause makes the winner
    // the only sender; whoever updates zero rows lost, and stays quiet.
    const { data: claimed } = await supabase
      .from("automation_settings")
      .update({
        cash_alert_armed: next.armed,
        cash_alert_last_fired_at: next.lastFiredAt,
      })
      .eq("user_id", userId)
      .eq("cash_alert_armed", prevArmed)
      .select("user_id");

    if (!fire) return;
    if (!claimed || claimed.length === 0) return;

    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);

    const tokens = (tokenRows ?? []).map((r: { token: string }) => r.token);
    if (tokens.length === 0) return;

    const result = await sendPush(tokens, {
      title: "Cash is building up",
      // "your bank reported" rather than "your balance just crossed": Plaid
      // refreshes an item a few times a day, so this is news of a change, not
      // a live reading. Claiming immediacy would be a promise the pipe cannot keep.
      body: `Your bank reported about $${Math.round(spare).toLocaleString("en-US")} ` +
        "above what you asked to keep. Open HELOC Hero to see what is worth moving.",
      data: { type: "cash_threshold", spare },
    });

    // Expo says these devices are gone. Left in place they would be retried on
    // every crossing forever.
    if (result.invalidTokens.length > 0) {
      await supabase.from("push_tokens").delete().in("token", result.invalidTokens);
    }
    if (result.error) console.warn("cash alert push:", result.error);
  } catch (err) {
    // Swallowed on purpose. The balance write already succeeded, and throwing
    // here would return a non-2xx to Plaid and earn a retry of the entire sync
    // for the sake of a notification.
    console.warn("maybeAlertCashThreshold:", err);
  }
}
