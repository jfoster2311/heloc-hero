// hooks/useCycleHistory.ts — real cycle history from automation_log.
//
// Every row here is a move the user made and recorded. That makes this the
// record of the STRATEGY, and the only source for "how much have I actually
// dumped" — distinct from `public.transactions`, which is bank activity synced
// from Plaid and exists solely so `lib/cashflow.ts` can check the surplus
// figure. Neither is a budgeting feed: per-category spending is still not
// computed anywhere, deliberately, and must not be invented here.
//
// ── Why this reads both halves of the cycle ────────────────────────────────
// It used to select `.eq('action', 'dump')`, and so did every other reader of
// this table. `/modals/log-sweep` writes `action: 'sweep'` rows — so a sweep,
// which is the half of the loop a user performs EVERY month, was written and
// then never read by anything, anywhere. The user logged it, got a reward
// screen, and the record vanished. Next month there was no way to tell from
// inside the app whether they had already recorded one.
//
// So this hook now reads both actions in one query and partitions them. The
// partition is load-bearing and must not be collapsed: `entries`, `totalDumped`
// and `count` stay DUMPS ONLY, because `totalDumped` feeds `computeRealized`,
// and a sweep is a repayment on the line rather than a principal payment
// against the mortgage. Summing the two together would inflate the realized-
// interest figure the dashboard leads with — the one number on that screen that
// is supposed to be beyond argument.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AutomationLogEntry } from '../lib/types';

export interface MonthBucket {
  /** First day of the month, for ordering and labelling. */
  date: Date;
  label: string;
  /** Dumps in this month. Named `total` from when dumps were all this held. */
  total: number;
  /** Sweeps onto the line in this month. */
  swept: number;
}

/**
 * Everyone currently rendering cycle history.
 *
 * The hook loads once per userId and had no invalidation at all, so recording a
 * move — the single most important thing a user does in this app — left the
 * dashboard's totals, the streak and the realized-interest figure exactly as
 * they were. The action looked like it had done nothing, which is the fastest
 * way to teach someone not to bother doing it.
 *
 * A module-level notification rather than Realtime on `automation_log`: the
 * writer is this device, the readers are already mounted, and it needs no
 * publication config to be correct.
 */
const listeners = new Set<() => void>();

/**
 * Call after inserting a dump OR a sweep so every mounted history view
 * re-reads. It was `notifyDumpLogged` and the sweep sheet deliberately did not
 * call it, correctly, because the hook could not see sweeps. It can now.
 */
export function notifyCycleLogged(): void {
  listeners.forEach(fn => fn());
}

export interface UseCycleHistoryResult {
  /** Dumps only. See the partition note at the top of this file. */
  entries: AutomationLogEntry[];
  /** Sweeps onto the line, newest first. */
  sweeps: AutomationLogEntry[];
  /** Last `months` calendar months, oldest first. Empty months included. */
  buckets: MonthBucket[];
  totalDumped: number;
  totalSwept: number;
  /** Dumps logged. */
  count: number;
  sweepCount: number;
  lastDumpAt: Date | null;
  lastSweepAt: Date | null;
  /** Swept so far in the current calendar month — what a sweep sheet needs. */
  sweptThisMonth: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCycleHistory(
  userId: string | null | undefined,
  months = 6,
): UseCycleHistoryResult {
  const [rows, setRows]       = useState<AutomationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('automation_log')
      .select('*')
      .eq('user_id', userId)
      .in('action', ['dump', 'sweep'])
      .eq('status', 'success')
      .order('created_at', { ascending: false });

    // Surface failures rather than rendering an empty history that looks like
    // "you have never cycled".
    setError(err ? err.message : null);
    setRows((data ?? []) as AutomationLogEntry[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Re-read when any screen records a move, including this one's own siblings:
  // the dashboard and cash flow both render history, and the modals that write
  // it are presented over the top of them.
  useEffect(() => {
    const listener = () => { load(); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [load]);

  const entries = rows.filter(r => r.action === 'dump');
  const sweeps  = rows.filter(r => r.action === 'sweep');

  const buckets = bucketByMonth(entries, sweeps, months);
  const totalDumped = sum(entries);
  const totalSwept  = sum(sweeps);
  const lastDumpAt  = entries.length > 0 ? new Date(entries[0].created_at) : null;
  const lastSweepAt = sweeps.length  > 0 ? new Date(sweeps[0].created_at)  : null;

  const now = new Date();
  const sweptThisMonth = sum(sweeps.filter(e => {
    const d = new Date(e.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }));

  return {
    entries,
    sweeps,
    buckets,
    totalDumped,
    totalSwept,
    count: entries.length,
    sweepCount: sweeps.length,
    lastDumpAt,
    lastSweepAt,
    sweptThisMonth,
    loading,
    error,
    refresh: load,
  };
}

function sum(entries: AutomationLogEntry[]): number {
  return entries.reduce((acc, e) => acc + Number(e.amount ?? 0), 0);
}

/** Sums each action into the last `months` calendar months, oldest first. */
function bucketByMonth(
  dumps: AutomationLogEntry[],
  sweeps: AutomationLogEntry[],
  months: number,
): MonthBucket[] {
  const now = new Date();
  const out: MonthBucket[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      date: d,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      total: 0,
      swept: 0,
    });
  }

  const find = (iso: string) => {
    const d = new Date(iso);
    return out.find(
      b => b.date.getFullYear() === d.getFullYear() && b.date.getMonth() === d.getMonth(),
    );
  };

  for (const e of dumps)  { const b = find(e.created_at); if (b) b.total += Number(e.amount ?? 0); }
  for (const e of sweeps) { const b = find(e.created_at); if (b) b.swept += Number(e.amount ?? 0); }

  return out;
}
