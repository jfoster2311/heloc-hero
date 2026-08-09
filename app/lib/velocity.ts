// lib/velocity.ts — did the surplus the projection is sized on actually happen?
//
// Every payoff date this app prints rests on one number: the monthly surplus.
// `projections.ts` takes it as an input and never questions it. This module is
// the only place that asks whether the money showed up, by comparing the plan
// against what the linked accounts really cleared, day by day.
//
// ── The one basis rule, and why the mortgage is not in here ────────────────
// Both series are "money in minus money out, BEFORE the mortgage payment", and
// they have to be, because the payment is modelled rather than measured:
// `classifyTransactions` holds it out of the transaction stream on purpose, and
// the Cash flow screen subtracts `payment × months` separately further down.
//
// Subtracting a modelled monthly payment from a MEASURED daily series would mean
// choosing a day to charge it on, which is a fact this app does not have — a
// payment posts when the servicer posts it. Amortising it evenly across the days
// would be worse: it would draw an outflow on days no money left the account.
//
// So the payment is absent from both lines, the caller labels the card with that
// sentence, and the after-mortgage figure keeps living on the summary card that
// already shows the subtraction. Two cards, one basis each, both stated.
//
// ── What is measured and what is planned ───────────────────────────────────
// The ACTUAL line is measured, and stops at today. The PROJECTED line is the
// user's own plan spread evenly across the period — it is not a forecast this
// module made up, it is their figures drawn as a pace. Income arrives in lumps
// and spending does not, so the actual line crosses the plan several times in a
// normal month; that is a property of getting paid twice, not a verdict, and the
// UI must not read a mid-month dip as failure. `burnRate` below is the part that
// carries a judgement, and it judges SPENDING pace only, for exactly that reason.
import { summarizableRows, type PeriodRange } from './spending';
import type { TransactionRow, TransactionClassification } from './cashflow';
import { VELOCITY } from './config';

/** Local-date ISO, matching the string dates stored on the rows. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── The two lines ────────────────────────────────────────────────────────────

export interface VelocitySeries {
  /** Days in the whole period. */
  days: number;
  /**
   * Days with data behind them — stops at today while the period is running.
   *
   * The actual line is drawn only this far. Running it flat to the end of the
   * month would draw "nothing else happened", which is a claim about days that
   * have not arrived.
   */
  elapsed: number;
  /** Cumulative net at the end of each ELAPSED day. Length `elapsed`. */
  actual: number[];
  /**
   * The plan, spread evenly, for every day of the period. Length `days`.
   *
   * Empty when the user has entered no figures — there is no plan to draw, and
   * a flat line at zero would look like a plan to break even.
   */
  projected: number[];
  /** Net cleared so far. The card's headline figure. */
  netToDate: number;
  /** Where an even pace would have put them by today. */
  planToDate: number | null;
  /** Where an even pace lands at the end of the period. */
  planFinal: number | null;
  /** Money in and money out over the elapsed days, unnetted. */
  inflow: number;
  outflow: number;
  /** True once there is at least one measured day to draw. */
  measured: boolean;
}

/**
 * Cumulative net cash flow across a period, against the plan.
 *
 * Day indices come from local date strings rather than millisecond arithmetic,
 * for the reason `cumulativeSpend` gives: a DST boundary inside the period
 * would otherwise shift a transaction into the wrong bucket.
 */
export function velocitySeries(args: {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  range: PeriodRange;
  /**
   * The user's planned net for the WHOLE period, before the mortgage payment.
   * Null when they have entered nothing — see `projected` above.
   */
  plannedNet: number | null;
  now?: Date;
}): VelocitySeries {
  const { transactions, classification, range, plannedNet, now = new Date() } = args;

  const dayIndex = new Map<string, number>();
  const cursor = new Date(range.start);
  let days = 0;
  while (cursor < range.endExclusive) {
    dayIndex.set(iso(cursor), days);
    cursor.setDate(cursor.getDate() + 1);
    days++;
  }
  if (days === 0) {
    return {
      days: 0, elapsed: 0, actual: [], projected: [],
      netToDate: 0, planToDate: null, planFinal: null,
      inflow: 0, outflow: 0, measured: false,
    };
  }

  const dailyNet = new Array<number>(days).fill(0);
  let inflowAll = 0;
  let outflowAll = 0;
  const dailyIn  = new Array<number>(days).fill(0);
  const dailyOut = new Array<number>(days).fill(0);

  for (const t of summarizableRows(transactions, classification)) {
    const i = dayIndex.get(t.date);
    if (i === undefined) continue;
    // Plaid's sign convention: positive is money OUT. Net flips it so the line
    // rises when the user is ahead, which is the only orientation a chart called
    // "velocity" can have.
    dailyNet[i] += -t.amount;
    if (t.amount < 0) dailyIn[i]  += -t.amount;
    else              dailyOut[i] += t.amount;
  }

  const today = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const todayIdx = dayIndex.get(today);
  const elapsed = range.inProgress && todayIdx !== undefined ? todayIdx + 1 : days;

  const actual: number[] = [];
  let running = 0;
  for (let i = 0; i < elapsed; i++) {
    running += dailyNet[i];
    actual.push(running);
    inflowAll  += dailyIn[i];
    outflowAll += dailyOut[i];
  }

  const projected: number[] = [];
  if (plannedNet !== null) {
    for (let i = 0; i < days; i++) projected.push((plannedNet * (i + 1)) / days);
  }

  return {
    days,
    elapsed,
    actual,
    projected,
    netToDate: actual[elapsed - 1] ?? 0,
    planToDate: plannedNet === null ? null : (plannedNet * elapsed) / days,
    planFinal:  plannedNet,
    inflow: inflowAll,
    outflow: outflowAll,
    // At least one day of real rows. `elapsed > 0` alone is not enough — an
    // account linked yesterday has elapsed days and nothing in them, and a line
    // drawn flat at zero across a month would read as "you spent nothing".
    measured: inflowAll > 0 || outflowAll > 0,
  };
}

// ─── The pace judgement ───────────────────────────────────────────────────────

/** Which side of the plan the spending pace is on. Never a colour on its own. */
export type Pace = 'over' | 'under' | 'on';

export interface BurnDiagnosis {
  elapsed: number;
  days: number;
  /** Measured, period to date. */
  inflow: number;
  outflow: number;
  /** The user's planned spend for the whole period. Null with no figures. */
  plannedSpend: number | null;
  /** That plan prorated to today — the bar's ceiling. */
  expectedToDate: number | null;
  /** Outflow against `expectedToDate`, as a signed percentage. */
  pacePct: number | null;
  pace: Pace | null;
  /**
   * Spend projected to the end of the period at the measured daily rate.
   *
   * Extrapolated from SPENDING only. Income is deliberately not extrapolated —
   * someone three days into a month has usually not been paid, and running their
   * daily income rate out to the 31st would print a collapse that has not
   * happened. See `projectedNet`.
   */
  projectedSpend: number | null;
  /** The income the plan expects for the period. Held, never extrapolated. */
  plannedIncome: number | null;
  /** `plannedIncome − projectedSpend`. Where this period lands at this pace. */
  projectedNet: number | null;
  /** The planned net this is being measured against. */
  targetNet: number | null;
  /**
   * Too few elapsed days to extrapolate from, so no pace is published.
   *
   * A single large day two days into a month projects a catastrophe. The floor
   * is in lib/config.ts because it moves a rendered judgement.
   */
  tooEarly: boolean;
}

export function burnRate(args: {
  series: VelocitySeries;
  /** Monthly figures the user entered or adopted, and the period's length. */
  monthlyIncome: number;
  monthlyExpenses: number;
  months: number;
}): BurnDiagnosis {
  const { series, monthlyIncome, monthlyExpenses, months } = args;
  const { elapsed, days, inflow, outflow } = series;

  const hasPlan = monthlyIncome > 0 || monthlyExpenses > 0;
  const plannedSpend  = hasPlan ? monthlyExpenses * months : null;
  const plannedIncome = hasPlan ? monthlyIncome * months : null;
  const targetNet     = hasPlan ? (monthlyIncome - monthlyExpenses) * months : null;

  const tooEarly = elapsed < VELOCITY.minElapsedDays || !series.measured;

  const expectedToDate = plannedSpend === null || days === 0
    ? null
    : (plannedSpend * elapsed) / days;

  // A zero expectation cannot be divided into. Someone whose stated expenses are
  // zero has no pace to be over or under, and the UI says so rather than
  // rendering an infinite percentage.
  const pacePct = expectedToDate === null || expectedToDate <= 0 || tooEarly
    ? null
    : ((outflow - expectedToDate) / expectedToDate) * 100;

  const pace: Pace | null = pacePct === null
    ? null
    : Math.abs(pacePct) <= VELOCITY.paceTolerancePct ? 'on' : pacePct > 0 ? 'over' : 'under';

  const projectedSpend = tooEarly || elapsed === 0 ? null : (outflow / elapsed) * days;

  return {
    elapsed, days, inflow, outflow,
    plannedSpend, expectedToDate, pacePct, pace,
    projectedSpend, plannedIncome,
    projectedNet: projectedSpend === null || plannedIncome === null
      ? null
      : plannedIncome - projectedSpend,
    targetNet,
    tooEarly,
  };
}

// ─── The black hole ───────────────────────────────────────────────────────────

export interface UntaggedShare {
  count: number;
  amount: number;
  /** Share of the period's spend, 0–100. */
  pct: number;
  /** True once the share is large enough that the breakdown misleads. */
  material: boolean;
}

/**
 * How much of the spend is sitting in Other because the bank sent no label.
 *
 * This is the honest limit on every category figure above it: a breakdown with a
 * fifth of the money in one unnamed bucket is not a breakdown, and a user acting
 * on it would be tuning the wrong category. `summarizePeriod` already counts
 * these rows; this adds the dollars, because "18 transactions" and "$1,240" are
 * very different reasons to care.
 *
 * `untaggedCount` is taken from the summary rather than recomputed — it applies
 * the user's overrides, and a second count here would drift the moment someone
 * retagged a row.
 */
export function untaggedShare(args: {
  untaggedCount: number;
  untaggedAmount: number;
  spend: number;
}): UntaggedShare {
  const { untaggedCount, untaggedAmount, spend } = args;
  const pct = spend > 0 ? (untaggedAmount / spend) * 100 : 0;
  return {
    count: untaggedCount,
    amount: untaggedAmount,
    pct,
    material: untaggedCount > 0 && pct >= VELOCITY.untaggedCalloutPct,
  };
}
