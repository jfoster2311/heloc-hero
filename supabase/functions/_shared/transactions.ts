// supabase/functions/_shared/transactions.ts
//
// One implementation of "pull this item's transactions and write them down",
// shared by the manual sync endpoint and the Plaid webhook. Having two copies
// of cursor handling is how an item ends up re-pulling 24 months every night.

import { PlaidClient } from "./plaid.ts";

/** Plaid caps a sync page at 500; looping is mandatory, not an optimisation. */
const PAGE_SIZE = 500;
/** Safety valve. A 24-month backfill is a few thousand rows, not a million. */
const MAX_PAGES = 60;

interface PlaidTxn {
  transaction_id: string;
  account_id: string;
  date: string;
  amount: number;
  iso_currency_code: string | null;
  name: string | null;
  merchant_name: string | null;
  pending: boolean;
  personal_finance_category?: { primary?: string; detailed?: string } | null;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  backfilled: boolean;
  error?: string;
}

/**
 * Syncs one item forward from its stored cursor.
 *
 * The cursor is the whole point: the first call returns up to 24 months of
 * history, and every call after it returns only what changed. Losing the cursor
 * means silently re-pulling everything.
 *
 * Plaid's `has_more` pagination must be followed to completion before the new
 * cursor is saved — saving a mid-page cursor would skip the remainder for good.
 */
export async function syncItemTransactions(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  plaid: PlaidClient,
  item: { user_id: string; account_type: string; access_token: string; transactions_cursor: string | null },
): Promise<SyncResult> {
  let cursor = item.transactions_cursor ?? undefined;
  const wasFirstSync = !item.transactions_cursor;

  let added = 0;
  let modified = 0;
  let removed = 0;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await plaid.syncTransactions(item.access_token, cursor, PAGE_SIZE);

      const toUpsert = [
        ...(res.added ?? []),
        ...(res.modified ?? []),
      ].map((t: PlaidTxn) => shape(t, item.user_id, item.account_type));

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("transactions")
          .upsert(toUpsert, { onConflict: "transaction_id" });
        if (error) throw new Error(`transaction upsert failed: ${error.message}`);
      }

      const removedIds = (res.removed ?? []).map((r: { transaction_id: string }) => r.transaction_id);
      if (removedIds.length > 0) {
        // Plaid removes transactions that were never really there (a pending
        // row the bank withdrew). Leaving them behind would inflate expenses.
        const { error } = await supabase
          .from("transactions")
          .delete()
          .eq("user_id", item.user_id)
          .in("transaction_id", removedIds);
        if (error) throw new Error(`transaction delete failed: ${error.message}`);
      }

      added    += (res.added ?? []).length;
      modified += (res.modified ?? []).length;
      removed  += removedIds.length;

      cursor = res.next_cursor;
      if (!res.has_more) break;
    }

    // Cursor is written only after the loop drains, so an interrupted sync
    // resumes from the last complete position rather than skipping ahead.
    await supabase
      .from("plaid_accounts")
      .update({
        transactions_cursor: cursor,
        transactions_synced_at: new Date().toISOString(),
        transactions_backfilled: true,
      })
      .eq("user_id", item.user_id)
      .eq("account_type", item.account_type);

    return { added, modified, removed, backfilled: wasFirstSync };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    // PRODUCT_NOT_READY is the normal response while Plaid is still assembling
    // the historical pull after a link. It is a "come back shortly", not a fault.
    console.info(`Transaction sync for ${item.account_type}: ${message}`);
    return { added, modified, removed, backfilled: false, error: message };
  }
}

function shape(t: PlaidTxn, userId: string, accountType: string) {
  return {
    transaction_id:    t.transaction_id,
    user_id:           userId,
    account_id:        t.account_id,
    account_type:      accountType,
    date:              t.date,
    // Plaid's sign convention is preserved: positive is money OUT.
    amount:            t.amount,
    iso_currency_code: t.iso_currency_code,
    name:              t.name,
    merchant_name:     t.merchant_name,
    category_primary:  t.personal_finance_category?.primary ?? null,
    category_detailed: t.personal_finance_category?.detailed ?? null,
    pending:           !!t.pending,
    updated_at:        new Date().toISOString(),
  };
}
