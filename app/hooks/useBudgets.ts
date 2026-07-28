// hooks/useBudgets.ts — the ceilings the user set, resolved for a given month.
//
// Storage holds two kinds of row (see the migration): a ceiling set FOR one
// month, and a standing default that carries into every month the user has not
// touched. Resolution order is the whole point of this hook, and it is exactly
// one rule: an explicit month always beats the default.
//
// That rule lives here rather than in a screen because three surfaces read the
// same ceiling — the Budget widget, the full Budget screen, and the category
// sheet — and a screen that resolved it differently would show a user two
// different budgets for the same category on the same day.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { SpendCategory } from '../lib/spending';
import type { BudgetMap } from '../lib/budget';

/** The literal stored in `month` for the standing ceiling. */
const DEFAULT_MONTH = 'default';

interface BudgetRow {
  category: SpendCategory;
  month: string;
  ceiling: number;
}

export interface UseBudgetsResult {
  /** Ceilings resolved for the month passed in. */
  budgets: BudgetMap;
  /**
   * True when the user has set a ceiling in ANY month, not just this one.
   *
   * The onboarding checklist asks "have you made a budget", which is a question
   * about the user, not about July. Answering it from `budgets` would un-tick
   * the step every time they looked at a month they had not touched.
   */
  hasAny: boolean;
  loading: boolean;
  /** Category currently being written, for a per-row spinner. */
  saving: SpendCategory | null;
  error: string | null;
  /**
   * Set (or replace) a ceiling.
   *
   * `applyToFuture` writes the standing default INSTEAD of a month row, which is
   * what makes the toggle mean what it says: a ceiling applied to future months
   * is not thirteen rows written ahead, it is one row that every unbudgeted
   * month falls back to. Writing ahead would be wrong the moment the user
   * changed their mind, leaving months they never chose still holding the old
   * figure.
   */
  setCeiling: (
    category: SpendCategory,
    ceiling: number,
    opts: { applyToFuture: boolean },
  ) => Promise<void>;
  /** Remove the ceiling for this month, and the default if one is set. */
  clearCeiling: (category: SpendCategory) => Promise<void>;
  /** True when this category's ceiling came from the standing default. */
  isInherited: (category: SpendCategory) => boolean;
}

export function useBudgets(
  userId: string | null | undefined,
  /** YYYY-MM the screen is showing. */
  month: string,
): UseBudgetsResult {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SpendCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase
      .from('category_budgets')
      .select('category, month, ceiling')
      .eq('user_id', userId);

    if (!alive.current) return;
    if (err) {
      // A budget that fails to load is not a broken screen — spending still
      // renders, it just renders without ceilings. Say so and stay usable.
      setError("Couldn't load your budgets.");
      setRows([]);
    } else {
      setError(null);
      setRows((data ?? []) as BudgetRow[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  /** Explicit month beats default. The one resolution rule, applied once. */
  const budgets = useMemo(() => {
    const map: BudgetMap = {};
    for (const r of rows) {
      if (r.month !== DEFAULT_MONTH) continue;
      map[r.category] = { category: r.category, ceiling: r.ceiling, appliesToFuture: true };
    }
    for (const r of rows) {
      if (r.month !== month) continue;
      map[r.category] = { category: r.category, ceiling: r.ceiling, appliesToFuture: false };
    }
    return map;
  }, [rows, month]);

  const isInherited = useCallback(
    (category: SpendCategory) => budgets[category]?.appliesToFuture === true,
    [budgets],
  );

  const setCeiling = useCallback(async (
    category: SpendCategory,
    ceiling: number,
    opts: { applyToFuture: boolean },
  ) => {
    if (!userId || ceiling <= 0) return;
    const targetMonth = opts.applyToFuture ? DEFAULT_MONTH : month;
    const previous = rows;

    // Optimistic: setting a budget is a deliberate act with a Save button
    // behind it, and watching the figure you just typed blink back to the old
    // one while a round trip completes reads as a rejection.
    setRows(prev => [
      ...prev.filter(r => !(r.category === category && r.month === targetMonth)),
      { category, month: targetMonth, ceiling },
    ]);
    setSaving(category);
    setError(null);

    const { error: err } = await supabase
      .from('category_budgets')
      .upsert(
        {
          user_id: userId,
          category,
          month: targetMonth,
          ceiling,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category,month' },
      );

    if (!alive.current) return;
    if (err) {
      setRows(previous);
      setError("Couldn't save that budget. Check your connection and try again.");
    }
    setSaving(null);
  }, [userId, month, rows]);

  const clearCeiling = useCallback(async (category: SpendCategory) => {
    if (!userId) return;
    const previous = rows;

    // Both the month row and the default go. Clearing only the month row would
    // leave the default underneath it, so the ceiling the user just removed
    // would reappear the moment they looked at the same category — which reads
    // as the delete having failed.
    setRows(prev => prev.filter(r => r.category !== category));
    setSaving(category);
    setError(null);

    const { error: err } = await supabase
      .from('category_budgets')
      .delete()
      .eq('user_id', userId)
      .eq('category', category)
      .in('month', [month, DEFAULT_MONTH]);

    if (!alive.current) return;
    if (err) {
      setRows(previous);
      setError("Couldn't remove that budget. Check your connection and try again.");
    }
    setSaving(null);
  }, [userId, month, rows]);

  return {
    budgets,
    hasAny: rows.length > 0,
    loading, saving, error, setCeiling, clearCeiling, isInherited,
  };
}
