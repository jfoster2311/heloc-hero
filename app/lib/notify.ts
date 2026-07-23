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
} as const;

export type ReminderId = typeof REMINDER_IDS[keyof typeof REMINDER_IDS];

export async function hasPermission(): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    const { status } = await mod.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
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

function round(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
