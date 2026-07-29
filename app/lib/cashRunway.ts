// lib/cashRunway.ts — can this move clear the bills that land before payday?
//
// The gap this fills is a TIMING question, and it is the one the rest of the app
// cannot answer. `safeToMove` guards liquidity as a ratio — cash plus available
// credit measured in months of expenses — which is the right shape for "is this
// household resilient" and the wrong shape for "rent is due Tuesday".
// `computeSafeToSweep` divides up the MONTHLY surplus, which is already net of
// expenses in aggregate. Neither knows what date anything lands on.
//
// So a user could be shown CLEAR, move the recommended amount, and bounce a
// direct debit four days later without the app ever having been wrong by its own
// arithmetic. That is the churn mechanism: one overdraft fee teaches someone that
// this strategy is dangerous, and they are right to conclude it from what they
// were shown.
//
// ── Why this is a trough and not a sum ─────────────────────────────────────
// The obvious version reserves "bills due in the next N days" — total them up,
// subtract from cash. That systematically over-reserves, because it ignores the
// money arriving inside the same window: rent due on the 10th is not a claim on
// today's balance if payday is on the 3rd.
//
// What actually constrains a withdrawal today is the LOWEST the balance gets
// between now and the horizon. Every dollar removed today lowers every later
// balance by a dollar, so the amount that can safely leave is exactly
// `trough − floor`. That is both more permissive and more correct than a sum,
// which matters: over-reserving tells someone $0 is free when $900 is, and
// lib/sweep.ts already documents why a figure that reads as needlessly punitive
// gets the app deleted.
//
// ── Direction of error, and what counts as evidence ────────────────────────
// Outflows are counted whenever they can be dated. Inflows are held to a higher
// bar, because counting one lets the user move MORE money on the strength of a
// deposit nobody has promised — an expected paycheque is a pattern extended, per
// the note in components/UpcomingMoney.tsx, not a scheduled event. A stream is
// only allowed to raise the free figure when it has enough observations behind
// it to be worth trusting, and when the trough depends on one arriving, the
// result says so rather than quietly resting on it.
//
// Streams that repeat but cannot be dated are reported, never netted. Putting a
// number on screen that the dated rows beneath it do not reproduce is the same
// mistake `committedAhead` avoids in lib/recurring.ts.
//
// This module computes; it does not move money. HELOC Hero has no payment rail.
import type { RecurringStream } from './cashflow';
import type { RecurringExpense } from './recurring';

/** Below this many observations a stream is too thin to lean on. */
const MIN_INFLOW_OBSERVATIONS = 4;
/** Matches the UpcomingMoney strip, which is the same two weeks a user sees. */
export const RUNWAY_HORIZON_DAYS = 14;

export interface RunwayEvent {
  date: string;
  label: string;
  /** Negative is money out. */
  amount: number;
  /** True when this is a pattern extended rather than a reported date. */
  expected: boolean;
}

export interface CashRunway {
  /**
   * Null when there is nothing dated to reason from — no linked transactions,
   * no servicer due date. NOT zero: "we cannot see your bills" and "nothing is
   * due" are different answers and the UI must not merge them.
   */
  freeNow: number | null;
  /** Cash held back to keep the trough above the floor. */
  reserved: number;
  /** The lowest projected balance inside the horizon, before any move. */
  trough: number;
  troughDate: string | null;
  /** Every dated event used, in order. The arithmetic above is reproducible. */
  events: RunwayEvent[];
  /**
   * True when the free figure is only that large because an EXPECTED deposit
   * arrives — i.e. it rests on a pattern rather than a promise.
   *
   * Tested by re-running the projection with the inflows removed and comparing
   * troughs, which is the only way to catch the case that matters most: cash on
   * hand covers everything until a bill lands late in the window, so the trough
   * is the OPENING balance and no event caused it. The naive test — "had we seen
   * an inflow by the time we hit the low point" — reports false there, while
   * draining to the floor today would still overdraft if the deposit never came.
   */
  dependsOnExpectedIncome: boolean;
  /**
   * What would be free if no expected deposit arrived at all. Always ≤ freeNow.
   * Lets a caller state the cautious figure alongside the likely one instead of
   * choosing between being useless and being optimistic.
   */
  freeIfNoIncome: number | null;
  /** Repeating charges with no projectable date — reported, never netted. */
  undatedCount: number;
  undatedTotal: number;
}

export interface CashRunwayInputs {
  /** Reachable cash today. */
  liquidCash: number;
  /** Dated recurring outflows, from detectRecurringExpenses. */
  expenses: RecurringExpense[];
  /** Wage-like inflows with a projectable date, from derived.recurringIncome. */
  income: RecurringStream[];
  /** The servicer's figure when we have it. */
  mortgage: { amount: number; dueDate: string | null } | null;
  /**
   * The balance the projection must never dip below. Zero is the overdraft line;
   * a caller wanting a cushion passes one.
   */
  floor?: number;
  horizonDays?: number;
  now?: Date;
}

export function computeCashRunway(inputs: CashRunwayInputs): CashRunway {
  const {
    liquidCash, expenses, income, mortgage,
    floor = 0, horizonDays = RUNWAY_HORIZON_DAYS, now = new Date(),
  } = inputs;

  const today = iso(now);
  const limit = addDays(today, horizonDays);

  const events: RunwayEvent[] = [];
  let undatedCount = 0;
  let undatedTotal = 0;

  // ── Outflows ──────────────────────────────────────────────────────────────
  for (const e of expenses) {
    if (e.nextExpected === null) {
      undatedCount++;
      undatedTotal += e.typicalAmount;
      continue;
    }
    // Projected repeatedly: a weekly charge inside a fortnight lands twice.
    let cursor = e.nextExpected;
    let guard = 0;
    while (cursor <= limit && guard < 60) {
      if (cursor >= today) {
        events.push({ date: cursor, label: e.name, amount: -Math.abs(e.typicalAmount), expected: true });
      }
      if (e.cadenceDays < 1) break;
      cursor = addDays(cursor, e.cadenceDays);
      guard++;
    }
  }

  if (mortgage && mortgage.dueDate && mortgage.dueDate >= today && mortgage.dueDate <= limit) {
    events.push({
      date: mortgage.dueDate,
      label: 'Mortgage payment',
      amount: -Math.abs(mortgage.amount),
      // A reported due date, not a guess — the one row here that is scheduled.
      expected: false,
    });
  }

  // ── Inflows, held to the higher bar ───────────────────────────────────────
  for (const s of income) {
    if (!s.nextExpected) continue;
    if (s.cadenceDays < 1) continue;
    if (s.observations < MIN_INFLOW_OBSERVATIONS) continue;
    let cursor = s.nextExpected;
    let guard = 0;
    while (cursor <= limit && guard < 60) {
      if (cursor >= today) {
        events.push({ date: cursor, label: s.name, amount: Math.abs(s.typicalAmount), expected: true });
      }
      cursor = addDays(cursor, s.cadenceDays);
      guard++;
    }
  }

  // Nothing dated means no opinion, which is not the same as a free figure of
  // zero. Manual users land here and must be told we cannot see, not that they
  // are broke.
  if (events.length === 0) {
    return {
      freeNow: null, reserved: 0, trough: liquidCash, troughDate: null,
      events: [], dependsOnExpectedIncome: false, freeIfNoIncome: null,
      undatedCount, undatedTotal,
    };
  }

  // Same-day ordering puts money OUT before money IN. Two things land on the
  // 1st and the balance dips between them; assuming the deposit clears first
  // would hide exactly the overdraft this exists to prevent.
  events.sort((a, b) =>
    a.date === b.date ? a.amount - b.amount : a.date.localeCompare(b.date));

  const withIncome = walk(events, liquidCash);
  // The same window with every expected deposit struck out. Only outflows are
  // certain enough to plan around, so this is the floor under the answer.
  const withoutIncome = walk(events.filter(e => e.amount < 0), liquidCash);

  // Every dollar taken out today shifts the whole curve down by a dollar, so
  // the headroom at the low point IS the amount that can leave. Capped at the
  // cash on hand, because a high trough cannot license moving money that is
  // not there.
  const free = (trough: number) => Math.max(0, Math.min(liquidCash, trough - floor));
  const freeNow = free(withIncome.trough);
  const freeIfNoIncome = free(withoutIncome.trough);

  return {
    freeNow,
    reserved: Math.max(0, liquidCash - freeNow),
    trough: withIncome.trough,
    troughDate: withIncome.troughDate,
    events,
    // Strictly: the answer is larger than it would be on outflows alone.
    dependsOnExpectedIncome: freeNow > freeIfNoIncome,
    freeIfNoIncome,
    undatedCount,
    undatedTotal,
  };
}

/** Running balance over dated events, returning the low point. */
function walk(events: RunwayEvent[], start: number): { trough: number; troughDate: string | null } {
  let balance = start;
  let trough = start;
  let troughDate: string | null = null;
  for (const ev of events) {
    balance += ev.amount;
    if (balance < trough) { trough = balance; troughDate = ev.date; }
  }
  return { trough, troughDate };
}

// ─── Dates, as ISO day strings so comparisons are lexicographic ──────────────

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}
