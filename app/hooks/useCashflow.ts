// hooks/useCashflow.ts — the trailing cash-flow picture, when there is one.
//
// Reads stored transactions and derives monthly income and expenses. It does
// NOT overwrite anything: the derived figures sit alongside the user's own
// until they choose to adopt them. That choice is the product — the app's job
// here is to notice a discrepancy and ask, not to quietly substitute its own
// arithmetic for what someone told it about their life.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, invokeFunction } from '../lib/supabase';
import { deriveCashflow, type DerivedCashflow, type TransactionRow } from '../lib/cashflow';
import { SURPLUS_WINDOW_MONTHS, TXN_SYNC_INTERVAL_HOURS } from '../lib/config';

export interface UseCashflowResult {
  derived: DerivedCashflow | null;
  loading: boolean;
  /** True while Plaid's asynchronous historical backfill is still landing. */
  awaitingBackfill: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCashflow(
  userId: string | null | undefined,
  enabled: boolean,
  windowMonths = SURPLUS_WINDOW_MONTHS,
): UseCashflowResult {
  const [derived, setDerived] = useState<DerivedCashflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [awaitingBackfill, setAwaitingBackfill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSynced = useRef(false);

  const load = useCallback(async (forceSync = false) => {
    if (!userId || !enabled) {
      setDerived(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Ask the server to pull anything new first, but only once per mount and
    // only when the throttle has elapsed. The edge function is the real
    // gatekeeper; this just avoids a pointless round trip on every render.
    if (forceSync || !hasSynced.current) {
      hasSynced.current = true;
      try {
        await invokeFunction('plaid-sync-transactions', { userId, force: forceSync });
      } catch {
        // A sync failure is not a read failure — fall through to whatever is
        // already stored rather than showing an error over usable data.
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
      setDerived(null);
      setLoading(false);
      return;
    }

    setError(null);
    const rows = (data ?? []) as unknown as TransactionRow[];
    setDerived(deriveCashflow(rows, { windowMonths }));

    // Distinguish "this user has no spending" from "Plaid hasn't sent it yet".
    // Without that, a freshly linked account looks like a broken feature.
    if (rows.length === 0) {
      const { data: items } = await supabase
        .from('plaid_accounts')
        .select('transactions_backfilled, transactions_synced_at')
        .eq('user_id', userId);
      setAwaitingBackfill(
        (items ?? []).some((i: { transactions_backfilled: boolean | null }) => !i.transactions_backfilled),
      );
    } else {
      setAwaitingBackfill(false);
    }

    setLoading(false);
  }, [userId, enabled, windowMonths]);

  useEffect(() => { load(); }, [load]);

  return {
    derived,
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
