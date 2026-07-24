// lib/projections.ts
import type { PayoffProjection, CalculatorInputs } from './types';

/**
 * Calculates mortgage payoff timelines with and without HELOC cycling.
 *
 * True cycling model:
 *  1. Draw the HELOC (up to helocLimit, capped at 12× surplus) and dump
 *     the full amount onto the mortgage principal immediately.
 *  2. Each month, make the regular P&I payment AND replenish the HELOC
 *     from monthly surplus (after covering HELOC interest on the drawn
 *     balance).
 *  3. Once the HELOC is fully replenished (drawn balance = 0), dump again.
 *  4. Repeat until the mortgage is paid off.
 *
 * Capping at 12× surplus guarantees the HELOC can be replenished in
 * roughly one year at any realistic HELOC rate.
 */
const MAX_MONTHS = 720;

/**
 * One month-by-month run of a plain amortizing loan.
 *
 * `series[i]` is the balance AFTER i payments, so series[0] is today's balance
 * and the last entry is zero.
 */
function runBaseline(
  startBalance: number,
  monthlyRate: number,
  monthlyPayment: number,
  collect: boolean,
): { months: number; interest: number; series: number[] } {
  let balance = startBalance;
  let months = 0;
  let interest = 0;
  const series: number[] = collect ? [balance] : [];

  while (balance > 0.01 && months < MAX_MONTHS) {
    const i = balance * monthlyRate;
    interest += i;
    const principal = Math.max(0, monthlyPayment - i);
    balance = Math.max(0, balance - principal);
    months++;
    if (collect) series.push(balance);
  }
  return { months, interest, series };
}

/**
 * One month-by-month run of the cycling strategy.
 *
 * Collects the HELOC balance alongside the mortgage balance, because equity is
 * home value minus BOTH. A curve drawn from the mortgage alone would show the
 * user gaining equity at the moment they drew against their house, which is the
 * one thing this strategy must never be allowed to imply.
 */
function runCycling(
  startBalance: number,
  monthlyRate: number,
  monthlyPayment: number,
  monthlySurplus: number,
  helocMonthlyRate: number,
  effectiveDump: number,
  collect: boolean,
): { months: number; interest: number; mortgage: number[]; heloc: number[] } {
  let balance = startBalance;
  let helocDrawn = 0;
  let months = 0;
  let interest = 0;
  const mortgage: number[] = collect ? [balance] : [];
  const heloc: number[] = collect ? [0] : [];

  while (balance > 0.01 && months < MAX_MONTHS) {
    // When HELOC is fully replenished, execute the next principal dump.
    if (helocDrawn <= 0 && effectiveDump > 0) {
      const dump = Math.min(effectiveDump, balance);
      balance -= dump;
      helocDrawn = dump;
      if (balance <= 0.01) {
        // The dump cleared the mortgage. The line is still drawn, so record
        // that state rather than ending on a frame that shows neither debt.
        if (collect) { mortgage.push(balance); heloc.push(helocDrawn); }
        break;
      }
    }

    // Regular mortgage P&I payment.
    const mortgageInterest = balance * monthlyRate;
    interest += mortgageInterest;
    const principal = Math.max(0, monthlyPayment - mortgageInterest);
    balance = Math.max(0, balance - principal);

    // Replenish HELOC from monthly surplus (after covering HELOC interest).
    const helocInterest = helocDrawn * helocMonthlyRate;
    interest += helocInterest;
    const helocPayment = Math.max(0, monthlySurplus - helocInterest);
    helocDrawn = Math.max(0, helocDrawn - helocPayment);

    months++;
    if (collect) { mortgage.push(balance); heloc.push(helocDrawn); }
  }
  return { months, interest, mortgage, heloc };
}

/** Shared setup, so the projection and its series can never disagree. */
function prepare(inputs: CalculatorInputs) {
  const { mortgageBalance, mortgageRate, monthlyPayment, monthlySurplus, helocRate, helocLimit } = inputs;

  // Maximum dump per cycle: user's helocLimit, capped at 12× surplus.
  // 12× ensures replenishment within ~12 months even after HELOC interest.
  const maxDump = Math.max(0, monthlySurplus * 12);

  return {
    mortgageBalance,
    monthlyPayment,
    monthlySurplus,
    monthlyRate:      mortgageRate / 12,
    helocMonthlyRate: (helocRate ?? 0.085) / 12,
    effectiveDump:    helocLimit && helocLimit > 0 ? Math.min(helocLimit, maxDump) : maxDump,
    /** Payment cannot cover the first month's interest — the loan never amortizes. */
    diverges: mortgageRate / 12 > 0 && monthlyPayment <= mortgageBalance * (mortgageRate / 12),
  };
}

export function computeProjection(inputs: CalculatorInputs): PayoffProjection {
  const p = prepare(inputs);

  // Guard: if payment can't cover the first month's interest the loan
  // would grow forever — return a clearly capped result.
  if (p.diverges) {
    const cap = new Date();
    cap.setFullYear(cap.getFullYear() + 60);
    return {
      originalMonths:        MAX_MONTHS,
      acceleratedMonths:     MAX_MONTHS,
      monthsSaved:           0,
      interestSaved:         0,
      originalPayoffDate:    cap,
      acceleratedPayoffDate: cap,
    };
  }

  const base = runBaseline(p.mortgageBalance, p.monthlyRate, p.monthlyPayment, false);
  const acc = runCycling(
    p.mortgageBalance, p.monthlyRate, p.monthlyPayment,
    p.monthlySurplus, p.helocMonthlyRate, p.effectiveDump, false,
  );

  const monthsSaved = Math.max(0, base.months - acc.months);
  // interestSaved already nets out all HELOC interest paid during cycling.
  const interestSaved = Math.max(0, Math.round(base.interest - acc.interest));

  const now = new Date();
  const originalPayoffDate = new Date(now);
  originalPayoffDate.setMonth(originalPayoffDate.getMonth() + base.months);
  const acceleratedPayoffDate = new Date(now);
  acceleratedPayoffDate.setMonth(acceleratedPayoffDate.getMonth() + acc.months);

  return {
    originalMonths:    base.months,
    acceleratedMonths: acc.months,
    monthsSaved,
    interestSaved,
    originalPayoffDate,
    acceleratedPayoffDate,
  };
}

/** A point on the projected equity curve. `month` is months from today. */
export interface EquityPoint {
  month: number;
  /** Home value minus mortgage balance minus anything drawn on the line. */
  equity: number;
}

export interface EquitySeries {
  /** Equity under the cycling strategy. Dips at each draw — that is the point. */
  accelerated: EquityPoint[];
  /** Equity if nothing changes, for the same span. */
  baseline: EquityPoint[];
  /** Months from today to the projected mortgage-free date. */
  payoffMonth: number;
  /** Months from today until the line is repaid too. The curve's right edge. */
  debtFreeMonth: number;
  /** Equity at debtFreeMonth. The home value, once nothing is owed against it. */
  finalEquity: number;
  /**
   * Still drawn on the line the month the mortgage clears.
   *
   * The cycle ends on a dump, so this is usually non-zero — "mortgage-free" and
   * "owns the house outright" are different dates, and the UI must not blur
   * them.
   */
  helocOutstandingAtPayoff: number;
}

/**
 * The projected equity curve behind the Accounts hero.
 *
 * Deliberately forward-looking only. Nothing in this app stores a balance
 * history, so a chart of where equity HAS been would be invented; this is the
 * same thing the reference apps draw — a projection, labelled as one.
 *
 * Home value is held flat on purpose. Appreciation would dominate the shape and
 * hand the strategy credit for a housing market it does not control.
 *
 * Equity nets out the HELOC as well as the mortgage, so a dump — which moves
 * debt from one to the other one-for-one — correctly leaves the curve flat. The
 * curve rises because surplus is retiring debt, not because money was moved.
 */
export function computeEquitySeries(
  inputs: CalculatorInputs,
  homeValue: number,
): EquitySeries | null {
  const p = prepare(inputs);
  if (p.diverges || homeValue <= 0 || p.mortgageBalance <= 0) return null;

  const base = runBaseline(p.mortgageBalance, p.monthlyRate, p.monthlyPayment, true);
  const acc = runCycling(
    p.mortgageBalance, p.monthlyRate, p.monthlyPayment,
    p.monthlySurplus, p.helocMonthlyRate, p.effectiveDump, true,
  );
  if (acc.mortgage.length < 2) return null;

  const helocOutstandingAtPayoff = acc.heloc[acc.mortgage.length - 1] ?? 0;

  // Carry on past the mortgage payoff until the line is repaid too.
  //
  // Stopping at the mortgage payoff cuts the curve immediately after a dump,
  // when the strategy is carrying a fresh draw and has not yet repaid it. On a
  // small minority of inputs that made the last point sit BELOW the do-nothing
  // reference — a chart saying the strategy leaves you worse off, purely because
  // of where it was cropped. Running to genuinely debt-free removes the artifact
  // and is the more honest endpoint anyway: it is the month the house is yours.
  const mortgageSeries = [...acc.mortgage];
  const helocSeries = [...acc.heloc];
  let drawn = helocOutstandingAtPayoff;
  let settleMonths = 0;

  while (drawn > 0.01 && settleMonths < MAX_MONTHS) {
    const interestDue = drawn * p.helocMonthlyRate;
    const toPrincipal = p.monthlySurplus - interestDue;
    // Surplus that cannot even cover the interest never retires the line.
    if (toPrincipal <= 0) break;
    drawn = Math.max(0, drawn - toPrincipal);
    settleMonths++;
    mortgageSeries.push(0);
    helocSeries.push(drawn);
  }

  const span = mortgageSeries.length;
  const last = span - 1;

  return {
    accelerated: mortgageSeries.map((m, i) => ({
      month: i,
      equity: homeValue - m - (helocSeries[i] ?? 0),
    })),
    // Baseline is padded rather than truncated: when the strategy finishes
    // first, the reference line simply continues flat at its last value.
    baseline: Array.from({ length: span }, (_, i) => ({
      month: i,
      equity: homeValue - (base.series[i] ?? base.series[base.series.length - 1]),
    })),
    payoffMonth: acc.months,
    debtFreeMonth: acc.months + settleMonths,
    finalEquity: homeValue - mortgageSeries[last] - helocSeries[last],
    helocOutstandingAtPayoff,
  };
}

/** Formats months into a human-readable string, e.g. "18 yrs 4 mo" */
export function formatMonths(months: number): string {
  const yrs = Math.floor(months / 12);
  const mo  = months % 12;
  if (yrs === 0) return `${mo} mo`;
  if (mo  === 0) return `${yrs} yr${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr${yrs !== 1 ? 's' : ''} ${mo} mo`;
}

/**
 * Standard amortization monthly P&I payment.
 * annualRate is a decimal fraction (e.g. 0.065 for 6.5%).
 */
export function calcMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / termMonths;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

/**
 * Remaining balance after elapsedMonths payments on a standard amortizing loan.
 * annualRate is a decimal fraction (e.g. 0.065 for 6.5%).
 */
export function calcRemainingBalance(
  principal: number,
  annualRate: number,
  termMonths: number,
  elapsedMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0 || elapsedMonths <= 0) return principal;
  const r = annualRate / 12;
  if (r === 0) return Math.max(0, principal * (1 - elapsedMonths / termMonths));
  const payment = calcMonthlyPayment(principal, annualRate, termMonths);
  const factor  = Math.pow(1 + r, elapsedMonths);
  return Math.max(0, principal * factor - (payment * (factor - 1)) / r);
}

/** Illustrative projection for free-tier users */
export function genericProjection(): PayoffProjection {
  return computeProjection({
    mortgageBalance: 320_000,
    mortgageRate:    0.065,
    monthlyPayment:  2_100,
    monthlySurplus:  400,
    helocRate:       0.085,
  });
}
