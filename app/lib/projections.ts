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
export function computeProjection(inputs: CalculatorInputs): PayoffProjection {
  const { mortgageBalance, mortgageRate, monthlyPayment, monthlySurplus, helocRate, helocLimit } = inputs;
  const monthlyRate      = mortgageRate / 12;
  const helocMonthlyRate = (helocRate ?? 0.085) / 12;

  // Maximum dump per cycle: user's helocLimit, capped at 12× surplus.
  // 12× ensures replenishment within ~12 months even after HELOC interest.
  const maxDump      = Math.max(0, monthlySurplus * 12);
  const effectiveDump = helocLimit && helocLimit > 0
    ? Math.min(helocLimit, maxDump)
    : maxDump;

  // Guard: if payment can't cover the first month's interest the loan
  // would grow forever — return a clearly capped result.
  if (monthlyRate > 0 && monthlyPayment <= mortgageBalance * monthlyRate) {
    const cap = new Date();
    cap.setFullYear(cap.getFullYear() + 60);
    return {
      originalMonths:        720,
      acceleratedMonths:     720,
      monthsSaved:           0,
      interestSaved:         0,
      originalPayoffDate:    cap,
      acceleratedPayoffDate: cap,
    };
  }

  // ─── Standard payoff (no extra payments) ───────────────────────────────────
  let balance          = mortgageBalance;
  let originalMonths   = 0;
  let totalStdInterest = 0;

  while (balance > 0.01 && originalMonths < 720) {
    const interest  = balance * monthlyRate;
    totalStdInterest += interest;
    const principal = Math.max(0, monthlyPayment - interest);
    balance         = Math.max(0, balance - principal);
    originalMonths++;
  }

  // ─── HELOC cycling payoff ──────────────────────────────────────────────────
  balance = mortgageBalance;
  let acceleratedMonths = 0;
  let helocDrawn        = 0;       // outstanding HELOC balance this cycle
  let totalAccInterest  = 0;       // mortgage interest + HELOC interest paid

  while (balance > 0.01 && acceleratedMonths < 720) {
    // When HELOC is fully replenished, execute the next principal dump.
    if (helocDrawn <= 0 && effectiveDump > 0) {
      const dump  = Math.min(effectiveDump, balance);
      balance    -= dump;
      helocDrawn  = dump;
      if (balance <= 0.01) break;   // dump cleared the mortgage
    }

    // Regular mortgage P&I payment.
    const mortgageInterest = balance * monthlyRate;
    totalAccInterest      += mortgageInterest;
    const principal        = Math.max(0, monthlyPayment - mortgageInterest);
    balance                = Math.max(0, balance - principal);

    // Replenish HELOC from monthly surplus (after covering HELOC interest).
    const helocInterest = helocDrawn * helocMonthlyRate;
    totalAccInterest   += helocInterest;
    const helocPayment  = Math.max(0, monthlySurplus - helocInterest);
    helocDrawn          = Math.max(0, helocDrawn - helocPayment);

    acceleratedMonths++;
  }

  const monthsSaved   = Math.max(0, originalMonths - acceleratedMonths);
  // interestSaved already nets out all HELOC interest paid during cycling.
  const interestSaved = Math.max(0, Math.round(totalStdInterest - totalAccInterest));

  const now = new Date();
  const originalPayoffDate    = new Date(now);
  originalPayoffDate.setMonth(originalPayoffDate.getMonth() + originalMonths);
  const acceleratedPayoffDate = new Date(now);
  acceleratedPayoffDate.setMonth(acceleratedPayoffDate.getMonth() + acceleratedMonths);

  return {
    originalMonths,
    acceleratedMonths,
    monthsSaved,
    interestSaved,
    originalPayoffDate,
    acceleratedPayoffDate,
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
