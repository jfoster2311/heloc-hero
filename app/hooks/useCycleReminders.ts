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
  evaluateCashThreshold, notifyCashThreshold, readArmState, writeArmState,
} from '../lib/notify';
import { computeSweepAmount, DEFAULT_AUTOMATION_SETTINGS } from '../lib/automation';
import { TERMS_REVIEW_DAYS, CASH_ALERT_MIN_GAP_DAYS } from '../lib/config';
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
  /**
   * Live balance of the cash account the sweep is measured against.
   *
   * Null when nothing is linked, and NOT coerced to zero — a zero reads as
   * "your account is empty", which re-arms the threshold on no evidence and
   * would fire a spurious prompt the moment a balance did arrive.
   */
  cashBalance?: number | null;
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

  // Cash threshold — a LEVEL, not a date.
  //
  // The two reminders above are booked against a calendar. This one watches the
  // balance and fires the moment it clears what the user asked to keep, because
  // that is when a sweep becomes worth making.
  //
  // It runs on foreground refresh, which is the honest bound of a local-only
  // notification: nothing can read a bank balance while the app is closed, and
  // there is no push pipeline here to do it server-side. So this reaches a user
  // who opens the app — the monthly sweepDue reminder is what brings them in.
  //
  // Rides on `safe_sweep_enabled`: it is the same question that switch already
  // asks ("tell me when surplus is ready to move"), just answered by the
  // balance instead of the 1st of the month. A second switch for the same
  // intent would be a settings screen explaining itself.
  useEffect(() => {
    if (!cycle.enabled || loading || !granted || !sweepOn) return;
    if (!userId) return;
    // Undefined means the caller does not track it; null means nothing linked.
    // Neither is an observation of the balance, so neither may move arm state.
    if (cycle.cashBalance === null || cycle.cashBalance === undefined) return;

    let cancelled = false;
    const buffer = settings?.buffer_target ?? DEFAULT_AUTOMATION_SETTINGS.buffer_target;
    const bills  = settings?.upcoming_bills_estimate
                     ?? DEFAULT_AUTOMATION_SETTINGS.upcoming_bills_estimate;
    const floor  = settings?.min_sweep_amount ?? DEFAULT_AUTOMATION_SETTINGS.min_sweep_amount;

    // The same function the Safe to Sweep card and the thresholds modal use, so
    // the alert cannot fire on a definition of "spare" the screens disagree with.
    const spare = computeSweepAmount(cycle.cashBalance, buffer, bills);

    (async () => {
      const prev = await readArmState(userId);
      if (cancelled) return;

      const { fire, next } = evaluateCashThreshold(spare, floor, prev, CASH_ALERT_MIN_GAP_DAYS);

      // Persist only on an actual change, so a balance sitting quietly above or
      // below the line does not rewrite storage on every refresh.
      if (next.armed !== prev.armed || next.lastFiredAt !== prev.lastFiredAt) {
        await writeArmState(userId, next);
      }
      if (!fire || cancelled) return;

      await notifyCashThreshold(spare, cycle.sweepAmount);
    })();

    return () => { cancelled = true; };
  }, [
    cycle.enabled, cycle.cashBalance, cycle.sweepAmount, userId,
    settings?.buffer_target, settings?.upcoming_bills_estimate, settings?.min_sweep_amount,
    sweepOn, loading, granted,
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
