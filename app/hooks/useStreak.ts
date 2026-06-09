// hooks/useStreak.ts — consecutive-month cycling streak from dump history
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { AutomationLogEntry } from '../lib/types';

export interface UseStreakResult {
  streak: number;
  loading: boolean;
}

/**
 * Counts consecutive calendar months (ending with the most recent)
 * in which at least one successful dump was recorded.
 * Resets when a month gap (> 45 days between consecutive dumps) is detected.
 */
export function useStreak(userId: string | null | undefined): UseStreakResult {
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setStreak(0); setLoading(false); return; }

    supabase
      .from('automation_log')
      .select('created_at')
      .eq('user_id', userId)
      .eq('action', 'dump')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setStreak(computeStreak((data ?? []) as Pick<AutomationLogEntry, 'created_at'>[]));
        setLoading(false);
      });
  }, [userId]);

  return { streak, loading };
}

function computeStreak(entries: Pick<AutomationLogEntry, 'created_at'>[]): number {
  if (entries.length === 0) return 0;

  // Deduplicate to one entry per calendar month (year-month key)
  const monthSet = new Set<string>();
  for (const e of entries) {
    const d = new Date(e.created_at);
    monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
  }

  // Sort months descending and count consecutive run from most recent
  const months = Array.from(monthSet)
    .map(key => {
      const [y, m] = key.split('-').map(Number);
      return new Date(y, m, 1);
    })
    .sort((a, b) => b.getTime() - a.getTime());

  let count = 1;
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1];
    const curr = months[i];
    // Expected: curr is exactly one month before prev
    const expected = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    if (curr.getTime() === expected.getTime()) {
      count++;
    } else {
      break;
    }
  }
  return count;
}
