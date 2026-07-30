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
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  syncCycleReminders, scheduleTermsReview, cancelTermsReview,
  notificationsAvailable, hasPermission,
} from '../lib/notify';
import { TERMS_REVIEW_DAYS } from '../lib/config';
import type { AutomationSettings } from '../lib/types';

export interface UseCycleRemindersResult {
  /** True when at least one reminder type is switched on AND deliverable. */
  remindersOn: boolean;
  /** The user's stored preferences, defaulting to on for a paid user. */
  settings: Partial<AutomationSettings> | null;
  loading: boolean;
}

export interface CycleInputs {
  /**
   * Null when there is a line whose balance we do not have. Not coerced: the
   * dump reminder's date is computed from this, and a zero would mean "already
   * replenished" — the app telling someone their line is clear on no evidence,
   * in a notification, while they are not even in the app to check it.
   */
  helocDrawn: number | null;
  /** Where the balance has to fall to before the next dump opens. */
  replenishTarget: number | null;
  /** Decimal APR on the line — interest comes out of the surplus first. */
  helocRate: number;
  monthlySurplus: number;
  dumpAmount: number;
  /** What is committed to the line this month — computeSafeToSweep's own figure. */
  sweepAmount: number | null;
  /** Skip scheduling entirely when the user has no paid access. */
  enabled: boolean;
  /** True once the user has entered HELOC terms worth re-confirming. */
  hasHelocTerms?: boolean;
  /** When those terms were last confirmed, so the nudge dates from there. */
  helocTermsUpdatedAt?: string | null;
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
  //
  // Re-checked whenever the app returns to the foreground, because every way of
  // granting permission leaves this screen first: the primer's system prompt,
  // the Settings sheet, and the round trip out to iOS Settings. Checking once on
  // mount meant a user could grant permission and still have nothing scheduled
  // until the next cold start.
  useEffect(() => {
    let cancelled = false;
    if (!notificationsAvailable()) { setGranted(false); return; }

    const check = () => { hasPermission().then(ok => { if (!cancelled) setGranted(ok); }); };
    check();

    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => { cancelled = true; sub.remove(); };
  }, []);

  const sweepOn = !!settings?.safe_sweep_enabled;
  const dumpOn  = !!settings?.safe_dump_enabled;

  // Reschedule whenever the cycle or the preferences move.
  useEffect(() => {
    if (!cycle.enabled || loading || !granted) return;
    syncCycleReminders({
      helocDrawn:      cycle.helocDrawn,
      replenishTarget: cycle.replenishTarget,
      helocRate:       cycle.helocRate,
      monthlySurplus:  cycle.monthlySurplus,
      dumpAmount:      cycle.dumpAmount,
      sweepAmount:     cycle.sweepAmount,
      dumpAlertsOn:    dumpOn,
      sweepAlertsOn:   sweepOn,
    });
  }, [
    cycle.enabled, cycle.helocDrawn, cycle.replenishTarget, cycle.helocRate,
    cycle.monthlySurplus, cycle.dumpAmount, cycle.sweepAmount,
    sweepOn, dumpOn, loading, granted,
  ]);

  // The monthly terms-confirm nudge rides on the same consent as the cycle
  // reminders — a HELOC rate is variable and unreported, so the figure behind
  // every projection needs a periodic human check. It carries no separate
  // preference switch: it books only once notifications are granted and terms
  // exist, and it clears itself when they do not.
  useEffect(() => {
    if (!cycle.enabled || !granted) return;
    if (cycle.hasHelocTerms) {
      scheduleTermsReview(cycle.helocTermsUpdatedAt ?? null, TERMS_REVIEW_DAYS);
    } else {
      cancelTermsReview();
    }
  }, [cycle.enabled, granted, cycle.hasHelocTerms, cycle.helocTermsUpdatedAt]);

  return {
    remindersOn: granted && (sweepOn || dumpOn),
    settings,
    loading,
  };
}
