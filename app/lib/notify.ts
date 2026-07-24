// lib/notify.ts — action prompts, scheduled locally on the device.
//
// HELOC Hero does not move money. It watches the cycle and tells the user when
// it is worth acting; they make the transfer at their bank and record it. So
// notifications are the product, not a growth add-on.
//
// These are LOCAL notifications (expo-notifications, scheduled on-device).
// Remote push would need a token pipeline and a deployed sender; neither
// exists, so nothing here claims to be a push alert. Local scheduling is
// enough for this job: every prompt is predictable from the cycle maths, not
// from a server event.
//
// The native module is absent in Expo Go, so every call is guarded and every
// entry point degrades to a no-op rather than throwing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationsModule = any;
let Notifications: NotificationsModule = null;

function loadModule(): NotificationsModule {
  if (Notifications) return Notifications;
  try {
    Notifications = require('expo-notifications');
  } catch {
    Notifications = null;
  }
  return Notifications;
}

export function notificationsAvailable(): boolean {
  return !!loadModule();
}

/** Identifiers so a reschedule replaces its predecessor rather than stacking. */
export const REMINDER_IDS = {
  dumpReady:   'heloc-hero.dump-ready',
  sweepDue:    'heloc-hero.sweep-due',
  termsStale:  'heloc-hero.terms-stale',
  termsReview: 'heloc-hero.terms-review',
} as const;

export type ReminderId = typeof REMINDER_IDS[keyof typeof REMINDER_IDS];

/**
 * Four states, not two. A boolean cannot tell "hasn't been asked" apart from
 * "asked and said no", and those need opposite treatment: the first is a prompt
 * worth showing, the second is a trip to iOS Settings. Conflating them is how a
 * settings screen ends up displaying an ON switch that delivers nothing.
 */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/**
 * Reads expo's PermissionResponse. `granted` is the convenience boolean and the
 * only reliable signal for "will deliver"; iOS maps ONLY UNAuthorizationStatus
 * .authorized to granted and .denied to denied, leaving provisional and
 * ephemeral as undetermined — which is the right answer for us anyway, since
 * both can still be upgraded by asking. `canAskAgain` is what separates a real
 * denial from a state we may still prompt out of.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(res: any): PermissionStatus {
  if (!res) return 'unavailable';
  if (res.granted) return 'granted';
  if (res.status === 'undetermined' || res.canAskAgain === true) return 'undetermined';
  return 'denied';
}

export async function permissionStatus(): Promise<PermissionStatus> {
  const mod = loadModule();
  if (!mod) return 'unavailable';
  try {
    return normalize(await mod.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

/**
 * Asks, and reports what the answer actually is.
 *
 * iOS presents the system prompt ONCE per install. Calling request again after
 * a denial resolves immediately with the stored answer and shows the user
 * nothing — so a caller that treats this as "the prompt appeared" will leave
 * someone tapping a dead button forever. Hence the pre-check: already-answered
 * returns that answer without pretending to have asked.
 */
export async function requestPermission(): Promise<PermissionStatus> {
  const mod = loadModule();
  if (!mod) return 'unavailable';
  try {
    const existing = normalize(await mod.getPermissionsAsync());
    if (existing !== 'undetermined') return existing;
    return normalize(await mod.requestPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

export async function hasPermission(): Promise<boolean> {
  return (await permissionStatus()) === 'granted';
}

/** Cancels a previously scheduled reminder. Safe when none exists. */
export async function cancel(id: ReminderId): Promise<void> {
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing scheduled under that identifier — not an error.
  }
}

/**
 * Schedules a one-off reminder, replacing any existing one with the same id.
 * A date in the past is dropped rather than fired immediately, which would
 * otherwise turn a stale computation into a surprise buzz.
 */
export async function schedule(
  id: ReminderId,
  title: string,
  body: string,
  when: Date,
): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  if (when.getTime() <= Date.now()) return false;
  if (!(await hasPermission())) return false;

  try {
    await cancel(id);
    await mod.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, sound: true },
      trigger: { date: when },
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Cycle prompts ────────────────────────────────────────────────────────────

export interface CycleState {
  /** HELOC balance still owed. 0 means the line is replenished. */
  helocDrawn: number;
  /** What the user frees up each month. */
  monthlySurplus: number;
  /** What they would move once replenished. */
  dumpAmount: number;
  /** Whether they've asked to be told about dumps / sweeps. */
  dumpAlertsOn: boolean;
  sweepAlertsOn: boolean;
}

/**
 * When the HELOC should be clear, from surplus alone. Null when it never will
 * be — no point promising a date the maths does not support.
 */
export function projectedReplenishDate(
  helocDrawn: number,
  monthlySurplus: number,
  now = new Date(),
): Date | null {
  if (helocDrawn <= 0) return now;
  if (monthlySurplus <= 0) return null;
  const months = Math.ceil(helocDrawn / monthlySurplus);
  if (!Number.isFinite(months) || months > 600) return null;
  const d = new Date(now);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Books the prompts implied by the current cycle. Returns what it scheduled so
 * the UI can tell the user honestly, rather than implying more than happened.
 */
export async function syncCycleReminders(
  state: CycleState,
  now = new Date(),
): Promise<ReminderId[]> {
  const scheduled: ReminderId[] = [];
  if (!notificationsAvailable()) return scheduled;

  // Dump prompt — when the line is projected to be clear again.
  await cancel(REMINDER_IDS.dumpReady);
  if (state.dumpAlertsOn && state.dumpAmount > 0) {
    const date = projectedReplenishDate(state.helocDrawn, state.monthlySurplus, now);
    if (date && date.getTime() > now.getTime()) {
      const ok = await schedule(
        REMINDER_IDS.dumpReady,
        'Your HELOC should be clear',
        `If the last few months held, you can move about $${round(state.dumpAmount)} onto your principal. Open HELOC Hero to check the numbers first.`,
        date,
      );
      if (ok) scheduled.push(REMINDER_IDS.dumpReady);
    }
  }

  // Sweep prompt — a monthly nudge to move surplus across.
  await cancel(REMINDER_IDS.sweepDue);
  if (state.sweepAlertsOn && state.monthlySurplus > 0) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 10, 0, 0);
    const ok = await schedule(
      REMINDER_IDS.sweepDue,
      'Time to sweep your surplus',
      `About $${round(state.monthlySurplus)} is due to go to your HELOC this month. You make the transfer — we'll track it.`,
      next,
    );
    if (ok) scheduled.push(REMINDER_IDS.sweepDue);
  }

  return scheduled;
}

// ─── Terms review ─────────────────────────────────────────────────────────────

/**
 * A monthly nudge to confirm the HELOC terms are still current.
 *
 * No provider reports a HELOC rate and the rate is variable, so the number
 * powering every projection drifts silently. This books a light "still correct?"
 * reminder `intervalDays` out from when the terms were last confirmed — one tap
 * in the app re-confirms them and the reminder reschedules from there.
 *
 * Returns whether a reminder was actually scheduled, so the caller can be honest
 * about it rather than implying an alert that permission or platform withheld.
 */
export async function scheduleTermsReview(
  lastConfirmedAt: string | null | undefined,
  intervalDays: number,
  now = new Date(),
): Promise<boolean> {
  if (!notificationsAvailable()) return false;

  // From the last confirmation if we have one, else a full interval from today.
  const base = lastConfirmedAt ? new Date(lastConfirmedAt) : now;
  const from = Number.isNaN(base.getTime()) ? now : base;
  let when = new Date(from.getTime() + intervalDays * 86_400_000);
  // Already overdue: don't fire on open — nudge tomorrow morning instead.
  if (when.getTime() <= now.getTime()) {
    when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0);
  }

  return schedule(
    REMINDER_IDS.termsReview,
    'Is your HELOC rate still current?',
    'HELOC rates move, and no bank reports yours to us. Open HELOC Hero to confirm your terms — it takes a tap.',
    when,
  );
}

/** Drops the terms-review reminder, e.g. when the terms are cleared. */
export async function cancelTermsReview(): Promise<void> {
  await cancel(REMINDER_IDS.termsReview);
}

function round(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
