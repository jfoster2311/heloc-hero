// hooks/useCycleReminders.ts — keeps local action prompts in step with the cycle.
//
// HELOC Hero never moves money, so the product IS the prompt: it watches the
// balances and tells the user when acting is worth it. This hook reads the
// user's alert preferences and (re)schedules the on-device reminders whenever
// the cycle maths changes.
//
// The date-based reminders are local, scheduled on the device. The cash-level
// alert is the one that also has a server sender (plaid-webhook), because it is
// the one that cannot be predicted from a calendar. This hook registers the
// push token that sender delivers to, and shares its arm state so a single
// crossing produces a single prompt from whichever side sees it first.
import { useState, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  syncCycleReminders, scheduleTermsReview, cancelTermsReview,
  notificationsAvailable, hasPermission,
  evaluateCashThreshold, notifyCashThreshold, registerPushToken,
} from '../lib/notify';
import Constants from 'expo-constants';
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

  // Push token — the only part of this hook that talks to a server.
  //
  // Registered once permission is actually granted, because asking Expo for a
  // token before that throws on iOS. Re-run whenever `granted` flips, which
  // covers the user leaving for iOS Settings and coming back: that is the path
  // where a token would otherwise never be obtained until a cold start.
  //
  // Tokens rotate (reinstall, restore from backup) and handsets change hands,
  // so registration goes through the register_push_token RPC rather than a
  // direct upsert. A plain upsert on `token` cannot do the handover: the row
  // still belongs to the previous user and RLS rejects the update (42501), so
  // the write failed silently, the new user got no alerts, and the previous
  // user's — which quote a dollar figure — kept arriving on the new user's
  // phone. The RPC claims the token for the caller instead.
  useEffect(() => {
    let cancelled = false;
    if (!userId || !cycle.enabled || !granted) return;

    (async () => {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      const token = await registerPushToken(projectId);
      // Null in Expo Go, on a simulator, or if permission was revoked between
      // the check above and here. Local reminders still work; nothing to say.
      if (!token || cancelled) return;

      const { error } = await supabase.rpc('register_push_token', {
        p_token: token,
        p_platform: Platform.OS,
      });
      // Not surfaced: the failure mode is "no push", and every date-based
      // reminder still works. Logged so it is not invisible while debugging a
      // device that never receives one.
      if (error) console.warn('push token registration:', error.message);
    })();

    return () => { cancelled = true; };
  }, [userId, cycle.enabled, granted]);

  // Cash threshold — a LEVEL, not a date.
  //
  // The two reminders above are booked against a calendar. This one watches the
  // balance and fires the moment it clears what the user asked to keep, because
  // that is when a sweep becomes worth making.
  //
  // It runs on foreground refresh, which is the bound of a local notification:
  // nothing on the phone can read a bank balance while the app is closed. So
  // this reaches a user who opens the app. plaid-webhook sends the same alert
  // from the server for the case where they do not — the two share arm state
  // below so that a crossing seen by both still produces one prompt.
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
      // Read fresh rather than off the `settings` snapshot: that was loaded on
      // mount, and the webhook sender may have fired since. A stale "armed"
      // here is exactly the double-prompt this state exists to prevent.
      const { data: armRow } = await supabase
        .from('automation_settings')
        .select('cash_alert_armed, cash_alert_last_fired_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;

      // Absent or malformed reads default to ARMED. The failure modes are not
      // symmetric: defaulting to disarmed silently kills the feature with no
      // way for the user to notice, while the worst case here is one extra
      // prompt that minGapDays still bounds.
      const prev = {
        armed: armRow?.cash_alert_armed !== false,
        lastFiredAt: armRow?.cash_alert_last_fired_at ?? null,
      };

      const { fire, next } = evaluateCashThreshold(spare, floor, prev, CASH_ALERT_MIN_GAP_DAYS);

      // Persist only on an actual change, so a balance sitting quietly above or
      // below the line does not rewrite the row on every refresh.
      if (next.armed === prev.armed && next.lastFiredAt === prev.lastFiredAt) return;

      // Compare-and-swap on `armed`. The webhook can be disarming this same row
      // at this same moment — a Plaid refresh is what moved the balance the app
      // is reacting to, so the two racing is the normal case, not the exotic
      // one. Claiming the transition in the WHERE clause makes the winner the
      // only sender: whoever updates zero rows lost, and stays quiet.
      const { data: claimed } = await supabase
        .from('automation_settings')
        .update({
          cash_alert_armed: next.armed,
          cash_alert_last_fired_at: next.lastFiredAt,
        })
        .eq('user_id', userId)
        .eq('cash_alert_armed', prev.armed)
        .select('user_id');

      if (cancelled || !fire) return;
      if (!claimed || claimed.length === 0) return;

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
