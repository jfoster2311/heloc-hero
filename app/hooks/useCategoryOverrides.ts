// hooks/useCategoryOverrides.ts — the user's own spending categories.
//
// Writes to public.transaction_categories, never to public.transactions: the
// bank-reported row stays exactly as the bank reported it (see the migration for
// why). This hook only ever records a human disagreeing with Plaid's guess.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { SpendCategory } from '../lib/spending';

export interface UseCategoryOverridesResult {
  overrides: Record<string, SpendCategory>;
  loading: boolean;
  /** Transaction id currently being written, for a per-row spinner. */
  saving: string | null;
  error: string | null;
  setCategory: (transactionId: string, category: SpendCategory) => Promise<void>;
}

export function useCategoryOverrides(
  userId: string | null | undefined,
): UseCategoryOverridesResult {
  const [overrides, setOverrides] = useState<Record<string, SpendCategory>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a write landing after the component that started it is gone.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setOverrides({});
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('transaction_categories')
        .select('transaction_id, category')
        .eq('user_id', userId);

      if (cancelled) return;
      if (err) {
        // A missing override set is not a broken screen — Plaid's own
        // categories still render. Report it, keep the breakdown usable.
        setError(err.message);
        setOverrides({});
      } else {
        setError(null);
        const map: Record<string, SpendCategory> = {};
        for (const row of (data ?? []) as { transaction_id: string; category: string }[]) {
          map[row.transaction_id] = row.category as SpendCategory;
        }
        setOverrides(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /**
   * Optimistic, and reverted on failure.
   *
   * Retagging is a small, frequent, low-stakes action — waiting on a round trip
   * to see the chip move would make it feel broken. But a silent revert would be
   * worse than the wait, so a failed write puts the old value back AND surfaces
   * the error, rather than leaving the user believing it saved.
   */
  const setCategory = useCallback(async (transactionId: string, category: SpendCategory) => {
    if (!userId) return;
    const previous = overrides[transactionId];

    setOverrides(prev => ({ ...prev, [transactionId]: category }));
    setSaving(transactionId);
    setError(null);

    const { error: err } = await supabase
      .from('transaction_categories')
      .upsert(
        { transaction_id: transactionId, user_id: userId, category, updated_at: new Date().toISOString() },
        { onConflict: 'transaction_id' },
      );

    if (!alive.current) return;
    if (err) {
      setOverrides(prev => {
        const next = { ...prev };
        if (previous === undefined) delete next[transactionId];
        else next[transactionId] = previous;
        return next;
      });
      setError("Couldn't save that category. Check your connection and try again.");
    }
    setSaving(null);
  }, [userId, overrides]);

  return { overrides, loading, saving, error, setCategory };
}
