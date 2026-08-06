// lib/notify.ts — action prompts, scheduled locally on the device.
//
// HELOC Hero does not move money. It watches the cycle and tells the user when
// it is worth acting; they make the transfer at their bank and record it. So
// notifications are the product, not a growth add-on.
//
// Almost everything here is a LOCAL notification (expo-notifications, scheduled
// on-device), because almost every prompt is predictable from the cycle maths
// rather than from a server event: the 1st of the month does not need a server
// to announce it.
//
// The one exception is `registerPushToken` below. A balance crossing is NOT
// predictable from a date, and nothing on the phone can read a bank balance
// while the app is closed, so that alert needs a sender — plaid-webhook, which
// pushes via the token registered here.
//
// The native module is absent in Expo Go, so every call is guarded and every
// entry point degrades to a no-op rather than throwing.
import { computeStrike } from './strike';

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

/**
 * Tells iOS to show a notification that arrives while the app is OPEN.
 *
 * Without this, iOS silently suppresses foreground notifications — and that is
 * not an edge case here, it is the main path: the cash-threshold prompt is
 * evaluated on foreground balance refresh and delivered with a null trigger,
 * so it arrives while the user is looking at the app every single time. Missing
 * this handler made that alert fire correctly and display nothing.
 *
 * Must be called once during startup, before anything can be delivered.
 *
 * `shouldShowAlert` is deprecated in expo-notifications 0.32 — banner and list
 * are the replacements and are separately required, so a notification can show
 * as a banner without being kept in Notification Centre or vice versa. Both are
 * on: this prompt is worth glancing at AND worth finding again later.
 */
export function configureNotificationHandler(): void {
  const mod = loadModule();
  if (!mod) return;
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        // The app never sets, decrements or clears a badge count. Turning this
        // on would leave a dot on the icon that nothing in the product knows
        // how to remove.
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Expo Go, or a runtime without the native module. Nothing to degrade:
    // scheduling is already a no-op there.
  }
}

/** Identifiers so a reschedule replaces its predecessor rather than stacking. */
export const REMINDER_IDS = {
  dumpReady:     'heloc-hero.dump-ready',
  sweepDue:      'heloc-hero.sweep-due',
  termsStale:    'heloc-hero.terms-stale',
  termsReview:   'heloc-hero.terms-review',
  cashThreshold: 'heloc-hero.cash-threshold',
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
  /**
   * HELOC balance still owed. Null when there is a line whose balance we do not
   * have — see hooks/useCycleReminders. Never coerce it: a zero here reads as
   * "already replenished" and books a notification saying so.
   */
  helocDrawn: number | null;
  /** Where the balance has to fall to for the next dump to open. */
  replenishTarget: number | null;
  /** Decimal APR on the line. */
  helocRate: number;
  /** What the user frees up each month. */
  monthlySurplus: number;
  /** What they would move once replenished. */
  dumpAmount: number;
  /**
   * What is actually committed to the line this month — `sweep.committed` from
   * computeSafeToSweep, passed in rather than recomputed.
   *
   * The reminder used to name the whole monthly surplus, which contradicted the
   * Safe to Sweep card the user would open on tapping it: that card's entire
   * purpose is that only part of the surplus is owed to the line and the rest is
   * genuinely free to spend. Null falls back to naming no figure at all.
   */
  sweepAmount: number | null;
  /** Whether they've asked to be told about dumps / sweeps. */
  dumpAlertsOn: boolean;
  sweepAlertsOn: boolean;
}

/**
 * When the next dump is projected to open.
 *
 * This used to be `ceil(helocDrawn / monthlySurplus)` computed right here, and
 * it was wrong twice over in opposite directions:
 *
 *  1. It ignored the line's interest. The balance does not fall by the whole
 *     surplus — interest is charged first, and what repays is the remainder.
 *     A line whose interest exceeds the surplus never replenishes at all, and
 *     this happily returned a date for it.
 *  2. It counted down to ZERO, when the product gates the next dump at
 *     `limit × replenishThreshold` — a balance well above zero.
 *
 * So the notification named a date the dashboard's own meter disagreed with,
 * which is exactly the failure lib/strike.ts's header warns about. The fix is
 * not to reimplement the arithmetic correctly here; it is to have one
 * implementation. `computeStrike` is it, and the meter renders the same call.
 */
export function projectedReplenishDate(
  cycle: Pick<CycleState, 'helocDrawn' | 'replenishTarget' | 'helocRate' | 'monthlySurplus'>,
  now = new Date(),
): Date | null {
  if (cycle.helocDrawn === null || cycle.replenishTarget === null) return null;

  // computeStrike works from a limit and a threshold; the caller has already
  // resolved those into the target balance, so hand it back an equivalent pair.
  // Threshold 1 with limit = target means "the target IS the target", which is
  // the identity that keeps this from re-deriving anything.
  const strike = computeStrike({
    helocDrawn:         cycle.helocDrawn,
    helocLimit:         cycle.replenishTarget > 0 ? cycle.replenishTarget : null,
    monthlySurplus:     cycle.monthlySurplus,
    helocRate:          cycle.helocRate,
    replenishThreshold: 1,
  });

  if (strike.state === 'open') return now;
  if (strike.monthsToGo === null) return null;
  if (strike.monthsToGo > 600) return null;

  const d = new Date(now);
  d.setMonth(d.getMonth() + strike.monthsToGo);
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

  // Dump prompt — when the balance is projected to reach the threshold.
  await cancel(REMINDER_IDS.dumpReady);
  if (state.dumpAlertsOn && state.dumpAmount > 0) {
    const date = projectedReplenishDate(state, now);
    if (date && date.getTime() > now.getTime()) {
      const ok = await schedule(
        REMINDER_IDS.dumpReady,
        // Was "Your HELOC should be clear", which named the wrong event: this
        // fires when the balance reaches the replenish threshold, which is a
        // long way above zero. Someone opening the app to a line still carrying
        // most of its target balance would reasonably conclude the app was
        // broken — and the one they should distrust is the notification.
        'Your next dump should be open',
        `If the last few months held, you can move about $${round(state.dumpAmount)} onto your principal. Open HELOC Hero to check the numbers first.`,
        date,
      );
      if (ok) scheduled.push(REMINDER_IDS.dumpReady);
    }
  }

  // Sweep prompt — a monthly nudge to move what is committed.
  await cancel(REMINDER_IDS.sweepDue);
  if (state.sweepAlertsOn && state.monthlySurplus > 0) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 10, 0, 0);
    const ok = await schedule(
      REMINDER_IDS.sweepDue,
      'Time to sweep your surplus',
      state.sweepAmount !== null && state.sweepAmount > 0
        ? `About $${round(state.sweepAmount)} is owed to your line this month. ` +
          "You make the transfer — we'll track it."
        : "Open HELOC Hero to see what is owed to your line this month. You make " +
          "the transfer — we'll track it.",
      next,
    );
    if (ok) scheduled.push(REMINDER_IDS.sweepDue);
  }

  return scheduled;
}

// ─── Push registration ────────────────────────────────────────────────────────
//
// Everything above this line is scheduled ON the device and needs no server.
// This is the one piece that does: an Expo push token, so plaid-webhook can
// reach the user when a balance moves while the app is closed — the one case
// local scheduling cannot cover, because nothing on the phone can read a bank
// balance while nothing is running.

/**
 * Registers this device for push, returning the token or null.
 *
 * Null is an ordinary outcome, not a failure to report: Expo Go has no push
 * entitlement, a simulator cannot register, and permission may be denied. Each
 * of those leaves the local reminders working exactly as before, so nothing
 * user-facing should treat a null here as an error.
 */
export async function registerPushToken(projectId?: string): Promise<string | null> {
  const mod = loadModule();
  if (!mod) return null;
  // Asking Expo for a token before permission is granted throws on iOS.
  if (!(await hasPermission())) return null;

  try {
    // projectId is required in SDK 49+ when the app is not built from a
    // classic Expo account context. Passing it explicitly avoids the
    // "No projectId found" throw that otherwise only appears in a real build.
    const res = await mod.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = res?.data;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    // Simulators and Expo Go land here. Local reminders are unaffected.
    return null;
  }
}

// ─── Taps ─────────────────────────────────────────────────────────────────────

/**
 * Subscribes to taps on our notifications. Returns null where there is no
 * native module, so the caller needs no separate availability check.
 */
export function addNotificationResponseListener(
  onResponse: (data: Record<string, unknown>) => void,
): { remove: () => void } | null {
  const mod = loadModule();
  if (!mod) return null;
  try {
    return mod.addNotificationResponseReceivedListener((res: unknown) => {
      onResponse(responseData(res));
    });
  } catch {
    return null;
  }
}

/**
 * True once the launch response has been read, so it is acted on ONCE.
 *
 * Module scope, not component state: this is a property of the app process, and
 * a remount must not re-navigate. Without it, every mount of the root layout
 * would replay whatever notification last launched the app — sending someone
 * back to the dashboard mid-task, long after they dealt with it.
 */
let launchResponseRead = false;

/**
 * The tap that LAUNCHED the app, if this start came from one.
 *
 * A cold start delivers the response before any listener can attach — and this
 * alert's whole point is reaching someone whose app is closed, so that is the
 * common path here, not the rare one. Returns null on every call after the
 * first.
 */
export async function readLaunchNotification(): Promise<Record<string, unknown> | null> {
  const mod = loadModule();
  if (!mod || launchResponseRead) return null;
  launchResponseRead = true;
  try {
    const res = await mod.getLastNotificationResponseAsync();
    return res ? responseData(res) : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function responseData(res: any): Record<string, unknown> {
  return (res?.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
}

/**
 * The Expo token for THIS device, without registering anything new.
 *
 * Exists for sign-out, which has to know which row to remove. Deleting every
 * row for the user would be wrong: a phone signing out must not silence that
 * person's other devices.
 */
export async function currentPushToken(projectId?: string): Promise<string | null> {
  return registerPushToken(projectId);
}

// ─── Cash threshold ───────────────────────────────────────────────────────────
//
// The other prompts in this file are scheduled against a DATE — the 1st of the
// month, a projected replenish date. This one is a LEVEL: it fires when the
// cash account rises past what the user asked to keep, because that is the
// moment a sweep becomes worth making and it does not fall on a calendar.
//
// The honest limitation, which the UI must not overstate: this path is LOCAL,
// and a local notification cannot observe a bank balance while the app is
// closed. It is evaluated when the app is in the foreground and balances
// refresh, so it reaches someone who opens the app and no one else.
//
// plaid-webhook covers the closed-app case by pushing the same alert. That is
// deployed and was verified end to end on a device on 2026-08-06, so copy may
// now name the server trigger — "when your bank reports a change" — alongside
// the local one.
//
// What it still may NOT claim is speed. The push rides on Plaid refreshing a
// linked item, which happens a few times a day, and the server re-reads a
// balance at most once every 12h to keep the per-call billing sane. "We'll tell
// you the moment your balance crosses" would be a promise the pipe cannot keep.
// It also reaches only a Pro user, on a real build, who granted permission and
// linked an account — which is why the local "when you open the app" path stays
// in the copy rather than being replaced by it.

/**
 * Whether a crossing may fire, and when one last did.
 *
 * Persisted by the caller. `armed` is the whole point: without it, every
 * balance refresh while the account sits above the line would fire again, so a
 * user with a healthy buffer would be buzzed on every app open until they spent
 * the money. The alert is about the CROSSING, not the state.
 */
export interface ThresholdArmState {
  armed: boolean;
  lastFiredAt: string | null;
}

export const INITIAL_ARM_STATE: ThresholdArmState = { armed: true, lastFiredAt: null };

/**
 * Decides whether this observation is a fireable crossing.
 *
 * Pure, and separate from the notification call, because the rules are the part
 * worth getting right:
 *
 *  - Below the floor re-arms. Falling back under the line is what makes the
 *    next rise a new crossing rather than a continuation of this one.
 *  - Above the floor fires only when armed, so one crossing yields one prompt.
 *  - `minGapDays` is a backstop for a balance that oscillates across the line —
 *    a paycheck landing and direct debits clearing can cross it repeatedly in a
 *    week, and each crossing is technically real. Without the gap that is a
 *    daily buzz, which trains the user to ignore the one that matters.
 */
export function evaluateCashThreshold(
  spare: number,
  floor: number,
  prev: ThresholdArmState,
  minGapDays: number,
  now = new Date(),
): { fire: boolean; next: ThresholdArmState } {
  // Below the line: nothing to say, and the next rise counts as fresh.
  if (spare < floor) {
    return { fire: false, next: { armed: true, lastFiredAt: prev.lastFiredAt } };
  }
  if (!prev.armed) return { fire: false, next: prev };

  if (prev.lastFiredAt) {
    const since = now.getTime() - new Date(prev.lastFiredAt).getTime();
    // NaN from an unparseable stored date must not read as "long enough ago".
    if (!Number.isFinite(since) || since < minGapDays * 86_400_000) {
      return { fire: false, next: prev };
    }
  }

  return { fire: true, next: { armed: false, lastFiredAt: now.toISOString() } };
}

// Arm state used to live on the device (AsyncStorage, keyed by user). It moved
// into `automation_settings` when plaid-webhook gained the ability to send this
// same alert, and the two are the same crossing seen from two places: the
// server notices it on a Plaid refresh, the app notices it on a foreground
// refresh. Two stores meant two prompts for one event — the server pushing, and
// then the app firing again locally because nothing had told it the user had
// already been informed.
//
// One row per user is the correct grain for "has this person been told", so the
// reader/writer now live at the call site in hooks/useCycleReminders.ts, where
// the Supabase client is. See _shared/cashAlert.ts for the sender's half.

/**
 * Presents a prompt immediately rather than booking one for later.
 *
 * A null trigger is expo's "deliver now". The scheduled path is wrong here: the
 * crossing has already happened, and by the time any future date arrived the
 * balance it describes could be gone.
 */
export async function notifyCashThreshold(
  spare: number,
  committed: number | null,
): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  if (!(await hasPermission())) return false;

  try {
    await cancel(REMINDER_IDS.cashThreshold);
    await mod.scheduleNotificationAsync({
      identifier: REMINDER_IDS.cashThreshold,
      content: {
        title: 'Cash is building up',
        // Names the same figure the Safe to Sweep card shows, for the same
        // reason the dump reminder does: the user taps this and lands on that
        // card, and a notification the destination screen contradicts costs
        // more trust than it buys attention.
        body: committed !== null && committed > 0
          ? `You have about $${round(spare)} spare. About $${round(committed)} of it is ` +
            "owed to your line — you make the transfer, we'll track it."
          : `You have about $${round(spare)} above what you asked to keep. Open HELOC ` +
            'Hero to see what is worth moving to your line.',
        sound: true,
        // Matches the payload plaid-webhook sends, so a tap routes the same way
        // whichever side produced the prompt. The user cannot tell them apart
        // and should not have to.
        data: { type: 'cash_threshold', spare },
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
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
