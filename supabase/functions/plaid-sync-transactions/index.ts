// supabase/functions/plaid-sync-transactions/index.ts
//
// Pulls transactions for every item a user has linked, so the app can derive
// what they actually spend instead of asking them to remember.
//
// Cost note: Transactions bills as a per-item monthly subscription, not per
// call, and the link token has always initialised the product — so the
// subscription is already being paid whether or not anything reads it. What
// still needs discipline is call volume, which the cursor handles: the first
// sync fetches the full history, every later one fetches only the delta.
// Callers throttle on transactions_synced_at; the webhook drives the rest.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { syncItemTransactions } from "../_shared/transactions.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

/** Don't re-sync an item more often than this unless forced. */
const MIN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, force } = await req.json();
    if (!userId) return errorResponse("userId is required");

    const supabase = getAdminClient();

    // Service role below, so the caller must prove they are this user.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return errorResponse("Missing authorization", 401);
    const { data: caller, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !caller?.user || caller.user.id !== userId) {
      return errorResponse("Not authorized for this user", 403);
    }

    // Decrypting view — the token is in Vault, not on the table.
    const { data: items, error } = await supabase
      .from("plaid_accounts_secure")
      .select("user_id, account_type, access_token, transactions_cursor, transactions_synced_at")
      .eq("user_id", userId);

    if (error) return errorResponse("Failed to query accounts", 500);
    if (!items?.length) return jsonResponse({ synced: 0, items: [] });

    const plaid = new PlaidClient();
    const now = Date.now();

    const results = await Promise.all(
      items.map(async (item: {
        user_id: string;
        account_type: string;
        access_token: string;
        transactions_cursor: string | null;
        transactions_synced_at: string | null;
      }) => {
        const last = item.transactions_synced_at
          ? new Date(item.transactions_synced_at).getTime()
          : 0;
        // An item with no cursor has never completed its backfill, so it always
        // runs regardless of throttle — otherwise a user who links and then
        // reopens the app inside the window waits six hours for any data.
        const due = force || !item.transactions_cursor || (now - last) > MIN_SYNC_INTERVAL_MS;
        if (!due) return { account_type: item.account_type, skipped: true };

        const res = await syncItemTransactions(supabase, plaid, item);
        return { account_type: item.account_type, ...res };
      }),
    );

    return jsonResponse({
      synced: results.filter(r => !("skipped" in r)).length,
      items: results,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
