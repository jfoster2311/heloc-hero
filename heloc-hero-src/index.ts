// supabase/functions/plaid-webhook/index.ts
// Public endpoint (no JWT) — receives Plaid webhook events
// Updates account balances in Supabase and fires push notifications

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import {
  notificationTemplates,
  sendNotificationToUser,
  SAVINGS_THRESHOLD,
  EQUITY_THRESHOLD,
} from "../_shared/notifications.ts";
import { jsonResponse } from "../_shared/cors.ts";

interface PlaidAccount {
  account_id: string;
  name: string;
  subtype: string;
  balances: { current: number; available: number | null; limit: number | null };
}

Deno.serve(async (req: Request) => {
  try {
    const webhookData = await req.json();
    await handleWebhook(webhookData);
    return jsonResponse({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return jsonResponse({ received: true }); // Always 200 to prevent Plaid retries
  }
});

async function handleWebhook(data: Record<string, unknown>) {
  const webhookType = data.webhook_type as string;
  const webhookCode = data.webhook_code as string;
  const itemId = data.item_id as string;

  console.log("Plaid webhook:", webhookType, webhookCode, itemId);

  const supabase = getAdminClient();

  const { data: accountRow } = await supabase
    .from("plaid_accounts")
    .select("user_id, account_type, access_token")
    .eq("item_id", itemId)
    .single();

  if (!accountRow) {
    console.warn("No account found for item_id:", itemId);
    return;
  }

  const { user_id, account_type, access_token } = accountRow;

  switch (webhookType) {
    case "TRANSACTIONS":
    case "HOLDINGS":
    case "LIABILITIES":
      await handleBalanceUpdate(user_id, access_token, itemId, account_type);
      break;
    case "ITEM":
      await handleItemWebhook(user_id, webhookCode);
      break;
    default:
      console.log("Unhandled webhook type:", webhookType);
  }
}

async function handleBalanceUpdate(
  userId: string,
  accessToken: string,
  itemId: string,
  accountType: string,
) {
  const supabase = getAdminClient();
  const plaid = new PlaidClient();

  const { data: existing } = await supabase
    .from("plaid_accounts")
    .select("accounts")
    .eq("item_id", itemId)
    .single();

  const previousAccounts: PlaidAccount[] = (existing?.accounts as PlaidAccount[]) ?? [];

  const balancesResult = await plaid.getAccountBalances(accessToken);
  if (!balancesResult.success || !balancesResult.accounts) return;

  const newAccounts = balancesResult.accounts as PlaidAccount[];

  await supabase.from("plaid_accounts").update({
    accounts: newAccounts,
    accounts_updated_at: new Date().toISOString(),
  }).eq("item_id", itemId);

  await checkThresholdCrossings(userId, previousAccounts, newAccounts, accountType);
  await checkMortgageReduction(userId, previousAccounts, newAccounts, accountType);
}

async function checkThresholdCrossings(
  userId: string,
  prev: PlaidAccount[],
  next: PlaidAccount[],
  accountType: string,
) {
  const thresholds: Record<string, number> = {
    "home equity": EQUITY_THRESHOLD,
    savings: SAVINGS_THRESHOLD,
  };
  const threshold = thresholds[accountType];
  if (!threshold) return;

  for (const newAcct of next) {
    const prevAcct = prev.find(a => a.account_id === newAcct.account_id);
    const prevBal = prevAcct?.balances.current ?? 0;
    const newBal = newAcct.balances.current;

    if (prevBal < threshold && newBal >= threshold) {
      const tpl = accountType === "savings"
        ? notificationTemplates.savingsAccountAlert()
        : notificationTemplates.helocDumpAlert();

      await sendNotificationToUser(userId, { title: tpl.title, body: tpl.body }, {
        ...tpl.data,
        accountId: newAcct.account_id,
        previousBalance: prevBal.toString(),
        newBalance: newBal.toString(),
        threshold: threshold.toString(),
      });
    }
  }
}

async function checkMortgageReduction(
  userId: string,
  prev: PlaidAccount[],
  next: PlaidAccount[],
  accountType: string,
) {
  if (accountType !== "mortgage") return;

  for (const newAcct of next) {
    const prevAcct = prev.find(a => a.account_id === newAcct.account_id);
    if (!prevAcct) continue;

    const reduction = prevAcct.balances.current - newAcct.balances.current;
    if (reduction > 0) {
      const tpl = notificationTemplates.mortgageDumpAlert();
      await sendNotificationToUser(userId, { title: tpl.title, body: tpl.body }, {
        ...tpl.data,
        accountId: newAcct.account_id,
        reduction: reduction.toString(),
      });
    }
  }
}

async function handleItemWebhook(userId: string, webhookCode: string) {
  const messages: Record<string, { title: string; body: string }> = {
    ERROR: { title: "Bank Connection Issue", body: "Please reconnect your bank account" },
    PENDING_EXPIRATION: {
      title: "Bank Connection Expiring",
      body: "Your bank connection will expire soon. Please reconnect.",
    },
    LOGIN_REPAIRED: {
      title: "Bank Connection Restored",
      body: "Your bank account has been successfully reconnected",
    },
  };

  const msg = messages[webhookCode];
  if (msg) {
    await sendNotificationToUser(userId, msg, { type: "item_status", webhookCode });
  }
}
