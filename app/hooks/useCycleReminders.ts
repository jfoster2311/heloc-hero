// hooks/useCycleReminders.ts — keeps local action prompts in step with the cycle.
//
// HELOC Hero never moves money, so the product IS the prompt: it watches the
// balances and tells the user when acting is worth it. This hook reads the
// user's alert preferences and (re)schedules the on-device reminders whenever
// the cycle maths changes.
//
// Reminders are local, not push. There is no delivery pipeline deployed, so
// nothing here or in the UI claims a server-sent alert.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { syncCycleReminders, notificationsAvailable, hasPermission } from '../lib/notify';
import type { AutomationSettings } from '../lib/types';

export interface UseCycleRemindersResult {
  /** True when at least one reminder type is switched on AND deliverable. */
  remindersOn: boolean;
  /** The user's stored preferences, defaulting to on for a paid user. */
  settings: Partial<AutomationSettings> | null;
  loading: boolean;
}

export interface CycleInputs {
  helocDrawn: number;
  monthlySurplus: number;
  dumpAmount: number;
  /** Skip scheduling entirely when the user has no paid access. */
  enabled: boolean;
}

export function useCycleReminders(
  userId: string | null | undefined,
  cycle: CycleInputs,
): UseCycleRemindersResult {
  const [settings, setSettings] = useState<Partial<AutomationSettings> | null>(null);
  const [granted, setGranted]   = useState(false);
  const [loading, setLoading]   = useState(true);

  // Preferences
  useEffect(() => {
    let cancelled = false;
    if (!userId) { setSettings(null); setLoading(false); return; }

    supabase
      .from('automation_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setSettings((data as Partial<AutomationSettings> | null) ?? {});
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  // Permission state — a preference switched on but denied at the OS level is
  // not an alert, and must not be reported as one.
  useEffect(() => {
    let cancelled = false;
    if (!notificationsAvailable()) { setGranted(false); return; }
    hasPermission().then(ok => { if (!cancelled) setGranted(ok); });
    return () => { cancelled = true; };
  }, []);

  const sweepOn = !!settings?.safe_sweep_enabled;
  const dumpOn  = !!settings?.safe_dump_enabled;

  // Reschedule whenever the cycle or the preferences move.
  useEffect(() => {
    if (!cycle.enabled || loading || !granted) return;
    syncCycleReminders({
      helocDrawn:     cycle.helocDrawn,
      monthlySurplus: cycle.monthlySurplus,
      dumpAmount:     cycle.dumpAmount,
      dumpAlertsOn:   dumpOn,
      sweepAlertsOn:  sweepOn,
    });
  }, [
    cycle.enabled, cycle.helocDrawn, cycle.monthlySurplus, cycle.dumpAmount,
    sweepOn, dumpOn, loading, granted,
  ]);

  return {
    remindersOn: granted && (sweepOn || dumpOn),
    settings,
    loading,
  };
}
