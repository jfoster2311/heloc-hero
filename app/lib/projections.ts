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

/** One month of the cycling simulation, for the transparency schedule. */
export interface CyclingMonth {
  /** 1-based month from today. */
  month: number;
  /** Principal dumped onto the mortgage this month. 0 on non-dump months. */
  dump: number;
  /** Mortgage balance after this month's P&I payment. */
  mortgageBalance: number;
  /** Mortgage interest charged this month. */
  mortgageInterest: number;
  /** HELOC balance still owed after this month's sweep. */
  helocDrawn: number;
  /** HELOC interest charged this month on the drawn balance. */
  helocInterest: number;
  /** Surplus applied to repay the HELOC this month (after its interest). */
  sweep: number;
}

/**
 * One month-by-month run of the cycling strategy.
 *
 * Collects the HELOC balance alongside the mortgage balance, because equity is
 * home value minus BOTH. A curve drawn from the mortgage alone would show the
 * user gaining equity at the moment they drew against their house, which is the
 * one thing this strategy must never be allowed to imply.
 *
 * When collecting, it also emits a per-month `detail` row — the raw material for
 * the calculator's transparency schedule. That path is gated on `collect`, so
 * computeProjection (and the whole app, via useFinancials) pays nothing for it.
 */
function runCycling(
  startBalance: number,
  monthlyRate: number,
  monthlyPayment: number,
  monthlySurplus: number,
  helocMonthlyRate: number,
  effectiveDump: number,
  collect: boolean,
): { months: number; interest: number; mortgage: number[]; heloc: number[]; detail: CyclingMonth[] } {
  let balance = startBalance;
  let helocDrawn = 0;
  let months = 0;
  let interest = 0;
  const mortgage: number[] = collect ? [balance] : [];
  const heloc: number[] = collect ? [0] : [];
  const detail: CyclingMonth[] = [];

  while (balance > 0.01 && months < MAX_MONTHS) {
    // When HELOC is fully replenished, execute the next principal dump.
    let dumpThisMonth = 0;
    if (helocDrawn <= 0 && effectiveDump > 0) {
      const dump = Math.min(effectiveDump, balance);
      balance -= dump;
      helocDrawn = dump;
      dumpThisMonth = dump;
      if (balance <= 0.01) {
        // The dump cleared the mortgage. The line is still drawn, so record
        // that state rather than ending on a frame that shows neither debt.
        months++;
        if (collect) {
          mortgage.push(balance); heloc.push(helocDrawn);
          detail.push({
            month: months, dump: dumpThisMonth,
            mortgageBalance: balance, mortgageInterest: 0,
            helocDrawn, helocInterest: 0, sweep: 0,
          });
        }
        break;
      }
    }

    // Regular mortgage P&I payment.
    const mortgageInterest = balance * monthlyRate;
    interest += mortgageInterest;
    const principal = Math.max(0, monthlyPayment - mortgageInterest);
    balance = Math.max(0, balance - principal);

    // Replenish HELOC from monthly surplus (after covering HELOC interest).
    //
    // Anything left over once the line is clear goes at the mortgage rather
    // than evaporating. It used to be `helocDrawn = max(0, drawn - payment)`,
    // which silently discarded the overshoot — real money, in the month the
    // line is repaid, every single cycle. Measured against paying the same
    // surplus straight at principal, the leak cost $2.4k–$4.3k over a plan and
    // was large enough to invert the verdict: on a 5.5% line against a 7.5%
    // mortgage — where cycling genuinely wins — the model had it LOSING by
    // $4,331, when it in fact wins by $2,703.
    const helocInterest = helocDrawn * helocMonthlyRate;
    interest += helocInterest;
    const available   = Math.max(0, monthlySurplus - helocInterest);
    const toLine      = Math.min(available, helocDrawn);
    helocDrawn -= toLine;
    const helocPayment = toLine;
    balance = Math.max(0, balance - (available - toLine));

    months++;
    if (collect) {
      mortgage.push(balance); heloc.push(helocDrawn);
      detail.push({
        month: months, dump: dumpThisMonth,
        mortgageBalance: balance, mortgageInterest,
        helocDrawn, helocInterest, sweep: helocPayment,
      });
    }
  }
  return { months, interest, mortgage, heloc, detail };
}

/**
 * The third path: the same surplus paid straight at principal, no line involved.
 *
 * This exists because `interestSaved` compares cycling against a baseline that
 * never spends the surplus at all, so the difference measures TWO things at once
 * — the benefit of paying extra, and the benefit of routing it through a HELOC —
 * and attributes the total to the second. Measured across realistic inputs, the
 * first is ~100% of it and the second is ±1%.
 *
 * `prepare` already refuses to make this mistake with `lumpSum`, for exactly the
 * stated reason: money that arrives on its own must not be credited to the
 * strategy. The surplus was doing the same thing at six times the magnitude.
 *
 * Cycling is a rate arbitrage. It gets ahead only when the line is cheaper than
 * the mortgage, and at the 8.5% this app assumes against typical mortgage rates
 * it is slightly negative. That is a true thing about the strategy, not a defect
 * in the model, and the product is better for saying it: a user who is told the
 * line is currently costing them can go and find a cheaper one.
 */
function runDirect(
  startBalance: number,
  monthlyRate: number,
  monthlyPayment: number,
  monthlySurplus: number,
): { months: number; interest: number } {
  let balance = startBalance;
  let months = 0;
  let interest = 0;

  while (balance > 0.01 && months < MAX_MONTHS) {
    const i = balance * monthlyRate;
    interest += i;
    balance = Math.max(0, balance - Math.max(0, monthlyPayment + monthlySurplus - i));
    months++;
  }
  return { months, interest };
}

/** Shared setup, so the projection and its series can never disagree. */
function prepare(inputs: CalculatorInputs) {
  const {
    mortgageRate, monthlyPayment, monthlySurplus, helocRate, helocLimit, lumpSum,
  } = inputs;

  // ── The one-time injection reduces the OPENING BALANCE of both paths ───────
  // Not just the cycling run, and that asymmetry is the whole point of doing it
  // here in the shared setup rather than inside runCycling.
  //
  // A bonus or a tax refund is cash the user has whether or not they ever open
  // a HELOC. Applying it only to the accelerated path would fold "I got $20k"
  // into the measured benefit of cycling, and the interest-saved figure — which
  // is the number this app is built to state — would climb every time the user
  // dragged the injection slider, crediting the strategy for money that arrived
  // on its own. Both paths get the cash; the delta stays honest about what
  // cycling itself contributes.
  //
  // It lands as an immediate principal payment, so it also feeds `diverges`
  // below: knocking the balance down can be exactly what makes a payment that
  // previously could not cover the interest start amortizing.
  const mortgageBalance = Math.max(0, inputs.mortgageBalance - Math.max(0, lumpSum ?? 0));

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
      // Not zero, which would render as "$0 interest" on the comparison — the
      // most flattering possible reading of a loan that never amortizes. NaN-free
      // and clearly unusable is the honest shape for a capped result.
      originalInterest:      Number.POSITIVE_INFINITY,
      acceleratedInterest:   Number.POSITIVE_INFINITY,
      fromSurplus:           0,
      fromCycling:           0,
      directMonths:          MAX_MONTHS,
      directInterest:        Number.POSITIVE_INFINITY,
    };
  }

  const base = runBaseline(p.mortgageBalance, p.monthlyRate, p.monthlyPayment, false);
  const acc = runCycling(
    p.mortgageBalance, p.monthlyRate, p.monthlyPayment,
    p.monthlySurplus, p.helocMonthlyRate, p.effectiveDump, false,
  );
  const dir = runDirect(
    p.mortgageBalance, p.monthlyRate, p.monthlyPayment, p.monthlySurplus,
  );

  const monthsSaved = Math.max(0, base.months - acc.months);
  // interestSaved already nets out all HELOC interest paid during cycling.
  const interestSaved = Math.max(0, Math.round(base.interest - acc.interest));

  // Rounded so the two parts sum to the whole EXACTLY. Rounding each leg
  // independently lets them miss by a dollar, and a breakdown that does not add
  // up is the fastest way to make a user distrust the figure it explains.
  const fromSurplus = Math.round(base.interest - dir.interest);
  const fromCycling = Math.round(base.interest - acc.interest) - fromSurplus;

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
    originalInterest:    Math.round(base.interest),
    // Includes HELOC interest: runCycling adds it to the same accumulator, which
    // is the only reason the two figures can sit next to each other honestly.
    acceleratedInterest: Math.round(acc.interest),
    fromSurplus,
    fromCycling,
    directMonths:   dir.months,
    directInterest: Math.round(dir.interest),
  };
}

/** The cycling strategy, month by month, plus the totals worth stating. */
export interface CyclingSummary {
  /** Every month of the plan, in order. Empty when the loan never amortizes. */
  months: CyclingMonth[];
  /** How many principal dumps the plan makes. */
  dumpCount: number;
  /** Total HELOC interest paid across the plan — the cost of the strategy. */
  totalHelocInterest: number;
  /** Size of each dump: the HELOC amount, capped at 12× monthly surplus. */
  dumpSize: number;
  /** Months from today to the projected mortgage-free date. */
  payoffMonths: number;
}

/**
 * The cycling strategy laid out month by month, for the calculator's schedule.
 *
 * This is not a second model — it runs the same runCycling the headline
 * projection uses and surfaces its per-month detail, so the schedule and the
 * payoff date above it can never disagree. It makes the mechanic legible: which
 * month each dump lands, the HELOC interest charged while a balance is owed, and
 * the surplus sweep pulling that balance back down.
 *
 * Empty when the payment cannot cover the interest (the loan never amortizes),
 * matching computeProjection's divergence guard.
 */
export function computeCyclingSchedule(inputs: CalculatorInputs): CyclingSummary {
  const p = prepare(inputs);
  if (p.diverges || p.mortgageBalance <= 0 || p.monthlyPayment <= 0) {
    return { months: [], dumpCount: 0, totalHelocInterest: 0, dumpSize: 0, payoffMonths: 0 };
  }

  const acc = runCycling(
    p.mortgageBalance, p.monthlyRate, p.monthlyPayment,
    p.monthlySurplus, p.helocMonthlyRate, p.effectiveDump, true,
  );

  let dumpCount = 0;
  let totalHelocInterest = 0;
  for (const m of acc.detail) {
    if (m.dump > 0) dumpCount++;
    totalHelocInterest += m.helocInterest;
  }

  return {
    months: acc.detail,
    dumpCount,
    totalHelocInterest: Math.round(totalHelocInterest),
    dumpSize: Math.round(p.effectiveDump),
    payoffMonths: acc.months,
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
