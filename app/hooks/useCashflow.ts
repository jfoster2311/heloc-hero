// hooks/useCashflow.ts — the trailing cash-flow picture, when there is one.
//
// Reads stored transactions and derives monthly income and expenses. It does
// NOT overwrite anything: the derived figures sit alongside the user's own
// until they choose to adopt them. That choice is the product — the app's job
// here is to notice a discrepancy and ask, not to quietly substitute its own
// arithmetic for what someone told it about their life.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, invokeFunction } from '../lib/supabase';
import { deriveCashflow, type DerivedCashflow, type TransactionRow } from '../lib/cashflow';
import { SURPLUS_WINDOW_MONTHS, TXN_SYNC_INTERVAL_HOURS } from '../lib/config';

/** Rows the user hid as duplicates. Held out of the trailing average too. */
const NO_HIDDEN: Set<string> = new Set();

export interface UseCashflowResult {
  derived: DerivedCashflow | null;
  /**
   * The rows the derivation ran on.
   *
   * Exposed so the Cash flow tab can break spending down by category without
   * mounting this hook a second time — a second mount means a second edge
   * function invoke, a second read, and two copies of the same transactions that
   * can differ mid-flight. Same rows in, same rows on screen.
   */
  transactions: TransactionRow[];
  loading: boolean;
  /** True while Plaid's asynchronous historical backfill is still landing. */
  awaitingBackfill: boolean;
  error: string | null;
  /**
   * Force a sync past its throttle, then re-read.
   *
   * Resolves FALSE when the sync could not reach the server. That distinction
   * is not academic: two screens hang a "Check for new transactions" button off
   * this and then tell the user "checked just now — nothing new has arrived".
   * With no signal to go on they said it after a failed check too, which is a
   * claim about the bank made on the strength of a request that never landed.
   */
  refresh: () => Promise<boolean>;
}

export function useCashflow(
  userId: string | null | undefined,
  enabled: boolean,
  /**
   * Rows the user marked as duplicates.
   *
   * Passed in rather than read here so this hook keeps one job. It matters that
   * the trailing average honours a hide: if it did not, hiding a duplicated
   * $4,000 charge would fix the Cash flow tab's total and leave the surplus the
   * payoff date is computed from still counting it.
   */
  hiddenIds: Set<string> = NO_HIDDEN,
  /** Confirmed mortgage payments, held out for the same reason. */
  mortgagePaymentIds: Set<string> = NO_HIDDEN,
  windowMonths = SURPLUS_WINDOW_MONTHS,
): UseCashflowResult {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [awaitingBackfill, setAwaitingBackfill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSynced = useRef(false);

  const load = useCallback(async (forceSync = false): Promise<boolean> => {
    if (!userId || !enabled) {
      setTransactions([]);
      setLoading(false);
      return false;
    }
    setLoading(true);
    let syncReached = true;

    // Ask the server to pull anything new first, but only once per mount and
    // only when the throttle has elapsed. The edge function is the real
    // gatekeeper; this just avoids a pointless round trip on every render.
    if (forceSync || !hasSynced.current) {
      hasSynced.current = true;
      try {
        await invokeFunction('plaid-sync-transactions', { userId, force: forceSync });
      } catch {
        // A sync failure is not a read failure — fall through to whatever is
        // already stored rather than showing an error over usable data. It is
        // still REPORTED, so a caller that intends to say "we checked" can
        // tell whether it actually did.
        syncReached = false;
      }
    }

    const since = new Date();
    since.setMonth(since.getMonth() - (windowMonths + 1));

    const { data, error: err } = await supabase
      .from('transactions')
      .select(
        'transaction_id, account_id, account_type, date, amount, name, merchant_name, ' +
        'category_primary, category_detailed, pending',
      )
      .eq('user_id', userId)
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false });

    if (err) {
      setError(err.message);
      setTransactions([]);
      setLoading(false);
      return false;
    }

    setError(null);
    const rows = (data ?? []) as unknown as TransactionRow[];
    setTransactions(rows);

    // Distinguish "this user has no spending" from "Plaid hasn't sent it yet".
    // Without that, a freshly linked account looks like a broken feature.
    if (rows.length === 0) {
      const { data: items, error: itemsError } = await supabase
        .from('plaid_accounts')
        .select('transactions_backfilled, transactions_synced_at')
        .eq('user_id', userId);

      // A failed read is not an answer, and `items ?? []` turned it into one.
      // `.some()` over an empty array is false, so this set awaitingBackfill to
      // FALSE — which is the branch that tells a freshly linked user they have
      // no spending. That is precisely the confusion the comment above says
      // this check exists to prevent, produced by the check itself.
      //
      // When we cannot tell, we leave the flag where it was rather than
      // asserting the flattering-looking half of a distinction we just failed
      // to make.
      if (!itemsError) {
        setAwaitingBackfill(
          (items ?? []).some((i: { transactions_backfilled: boolean | null }) => !i.transactions_backfilled),
        );
      }
    } else {
      setAwaitingBackfill(false);
    }

    setLoading(false);
    return syncReached;
  }, [userId, enabled, windowMonths]);

  useEffect(() => { load(); }, [load]);

  // Derived from the rows in state rather than computed inside `load`, so that
  // hiding a transaction re-derives immediately. Computing it at fetch time
  // would leave the trailing average holding a row the user had just excluded
  // until the next sync — and the figure it feeds is the one every projection
  // is sized from.
  const derived = useMemo(
    () => (transactions.length > 0
      ? deriveCashflow(transactions, { windowMonths, hiddenIds, mortgagePaymentIds })
      : null),
    [transactions, windowMonths, hiddenIds, mortgagePaymentIds],
  );

  return {
    derived,
    transactions,
    loading,
    awaitingBackfill,
    error,
    refresh: () => load(true),
  };
}

/** Hours since a sync, for the "how fresh is this" line. Exported for tests. */
export function syncIsStale(syncedAt: string | null): boolean {
  if (!syncedAt) return true;
  return (Date.now() - new Date(syncedAt).getTime()) / 3_600_000 > TXN_SYNC_INTERVAL_HOURS;
}
