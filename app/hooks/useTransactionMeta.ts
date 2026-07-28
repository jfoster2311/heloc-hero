// hooks/useTransactionMeta.ts — what the user has recorded about their own rows.
//
// Three annotations, one table: hidden, a note, and a user-asserted recurring
// flag. They travel together because they are written from the same sheet and
// share a primary key, and splitting them would mean three round trips to open
// one transaction.
//
// `hiddenIds` is the load-bearing export. It feeds `classifyTransactions`, which
// every total in the app is summed through — so a row hidden here disappears
// from the breakdown, the budget, the heat grid and the trailing surplus at the
// same instant. That is the only arrangement in which the numbers on the Cash
// flow tab still reconcile with the payoff date after a user hides something.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export interface TransactionMeta {
  hidden: boolean;
  note: string | null;
  recurring: boolean;
}

const EMPTY: TransactionMeta = { hidden: false, note: null, recurring: false };

export interface UseTransactionMetaResult {
  meta: Record<string, TransactionMeta>;
  /** Rows excluded from every total. Pass to classifyTransactions. */
  hiddenIds: Set<string>;
  loading: boolean;
  /** Transaction id currently being written. */
  saving: string | null;
  error: string | null;
  get: (transactionId: string) => TransactionMeta;
  setHidden: (transactionId: string, hidden: boolean) => Promise<void>;
  setNote: (transactionId: string, note: string) => Promise<void>;
  setRecurring: (transactionId: string, recurring: boolean) => Promise<void>;
}

interface MetaRow {
  transaction_id: string;
  hidden: boolean;
  note: string | null;
  recurring: boolean;
}

export function useTransactionMeta(
  userId: string | null | undefined,
): UseTransactionMetaResult {
  const [meta, setMeta] = useState<Record<string, TransactionMeta>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setMeta({});
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('transaction_meta')
        .select('transaction_id, hidden, note, recurring')
        .eq('user_id', userId);

      if (cancelled) return;
      if (err) {
        // Failing open is the safe direction here, and it is worth being
        // explicit about why: with no meta loaded, nothing is hidden, so every
        // total INCLUDES rows the user meant to exclude. That overstates
        // spending, which understates surplus, which makes the app recommend a
        // smaller move than it could have. The opposite failure — dropping rows
        // we could not confirm were hidden — would understate spending and
        // oversize a draw against someone's house.
        setError("Couldn't load your transaction edits.");
        setMeta({});
      } else {
        setError(null);
        const map: Record<string, TransactionMeta> = {};
        for (const row of (data ?? []) as MetaRow[]) {
          map[row.transaction_id] = {
            hidden: row.hidden,
            note: row.note,
            recurring: row.recurring,
          };
        }
        setMeta(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Rebuilt only when the map changes, because this identity is a dependency of
  // the classification, which is a dependency of every figure on the tab.
  // Rebuilding it per render would recompute the whole breakdown per render.
  const hiddenIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, m] of Object.entries(meta)) if (m.hidden) set.add(id);
    return set;
  }, [meta]);

  const get = useCallback(
    (transactionId: string) => meta[transactionId] ?? EMPTY,
    [meta],
  );

  /**
   * One writer for all three fields.
   *
   * Upserting the whole row rather than patching one column: the three
   * annotations share a primary key, and a partial upsert would reset the
   * columns it omitted to their defaults — silently clearing a note the moment
   * someone toggled "hide".
   */
  const write = useCallback(async (
    transactionId: string,
    patch: Partial<TransactionMeta>,
  ) => {
    if (!userId) return;
    const previous = meta[transactionId];
    const next = { ...(previous ?? EMPTY), ...patch };

    setMeta(prev => ({ ...prev, [transactionId]: next }));
    setSaving(transactionId);
    setError(null);

    const { error: err } = await supabase
      .from('transaction_meta')
      .upsert(
        {
          transaction_id: transactionId,
          user_id: userId,
          hidden: next.hidden,
          note: next.note,
          recurring: next.recurring,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'transaction_id' },
      );

    if (!alive.current) return;
    if (err) {
      setMeta(prev => {
        const rolledBack = { ...prev };
        if (previous === undefined) delete rolledBack[transactionId];
        else rolledBack[transactionId] = previous;
        return rolledBack;
      });
      setError("Couldn't save that change. Check your connection and try again.");
    }
    setSaving(null);
  }, [userId, meta]);

  return {
    meta,
    hiddenIds,
    loading,
    saving,
    error,
    get,
    setHidden:    (id, hidden)    => write(id, { hidden }),
    setNote:      (id, note)      => write(id, { note: note.trim() === '' ? null : note }),
    setRecurring: (id, recurring) => write(id, { recurring }),
  };
}
