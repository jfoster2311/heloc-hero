// hooks/useDumpHistory.ts — real cycle history from automation_log.
//
// Every row here is a move the user made and recorded. That makes this the
// record of the STRATEGY, and the only source for "how much have I actually
// dumped" — distinct from `public.transactions`, which is bank activity synced
// from Plaid and exists solely so `lib/cashflow.ts` can check the surplus
// figure. Neither is a budgeting feed: per-category spending is still not
// computed anywhere, deliberately, and must not be invented here.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AutomationLogEntry } from '../lib/types';

export interface MonthBucket {
  /** First day of the month, for ordering and labelling. */
  date: Date;
  label: string;
  total: number;
}

export interface UseDumpHistoryResult {
  entries: AutomationLogEntry[];
  /** Last `months` calendar months, oldest first. Empty months included. */
  buckets: MonthBucket[];
  totalDumped: number;
  count: number;
  lastDumpAt: Date | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDumpHistory(
  userId: string | null | undefined,
  months = 6,
): UseDumpHistoryResult {
  const [entries, setEntries] = useState<AutomationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('automation_log')
      .select('*')
      .eq('user_id', userId)
      .eq('action', 'dump')
      .eq('status', 'success')
      .order('created_at', { ascending: false });

    // Surface failures rather than rendering an empty history that looks like
    // "you have never cycled".
    setError(err ? err.message : null);
    setEntries((data ?? []) as AutomationLogEntry[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const buckets = bucketByMonth(entries, months);
  const totalDumped = entries.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const lastDumpAt = entries.length > 0 ? new Date(entries[0].created_at) : null;

  return {
    entries,
    buckets,
    totalDumped,
    count: entries.length,
    lastDumpAt,
    loading,
    error,
    refresh: load,
  };
}

/** Sums dumps into the last `months` calendar months, oldest first. */
function bucketByMonth(entries: AutomationLogEntry[], months: number): MonthBucket[] {
  const now = new Date();
  const out: MonthBucket[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      date: d,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      total: 0,
    });
  }

  for (const e of entries) {
    const d = new Date(e.created_at);
    const bucket = out.find(
      b => b.date.getFullYear() === d.getFullYear() && b.date.getMonth() === d.getMonth(),
    );
    if (bucket) bucket.total += Number(e.amount ?? 0);
  }

  return out;
}
