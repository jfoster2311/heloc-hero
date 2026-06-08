// lib/projections.ts
import type { PayoffProjection, CalculatorInputs } from './types';

/**
 * Calculates mortgage payoff timelines with and without HELOC acceleration.
 *
 * Strategy model:
 *  - Each month the regular P&I payment reduces mortgage balance.
 *  - monthlySurplus (income − all living expenses − mortgage payment)
 *    accumulates in the HELOC.
 *  - Every 12 months the accumulated surplus is dumped as an extra
 *    lump-sum principal payment.
 *  - HELOC interest cost on the accumulated balance is deducted from
 *    the effective surplus so projections aren’t overly optimistic.
 */
export function computeProjection(inputs: CalculatorInputs): PayoffProjection {
  const { mortgageBalance, mortgageRate, monthlyPayment, monthlySurplus, helocRate } = inputs;
  const monthlyRate       = mortgageRate / 12;
  const helocMonthlyRate  = (helocRate ?? 0.085) / 12;

  // Guard: if payment can’t cover the first month’s interest the loan
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

  // ─── Standard payoff (no extra payments) ───
  let balance         = mortgageBalance;
  let originalMonths  = 0;
  let totalStdInterest = 0;

  while (balance > 0.01 && originalMonths < 720) {
    const interest  = balance * monthlyRate;
    totalStdInterest += interest;
    const principal = Math.max(0, monthlyPayment - interest);
    balance = Math.max(0, balance - principal);
    originalMonths++;
  }

  // ─── Accelerated payoff (annual HELOC dump) ───
  balance = mortgageBalance;
  let acceleratedMonths = 0;
  let accumulated       = 0;
  let totalAccInterest  = 0;
  const DUMP_INTERVAL   = 12;

  while (balance > 0.01 && acceleratedMonths < 720) {
    // Regular mortgage payment
    const interest  = balance * monthlyRate;
    totalAccInterest += interest;
    const principal = Math.max(0, monthlyPayment - interest);
    balance = Math.max(0, balance - principal);

    // Accumulate surplus, minus the HELOC interest cost on the running balance.
    // Approximation: average HELOC balance this month = accumulated / 2.
    const helocInterestThisMonth = (accumulated / 2) * helocMonthlyRate;
    accumulated += Math.max(0, monthlySurplus - helocInterestThisMonth);
    acceleratedMonths++;

    // Annual lump-sum principal dump
    if (acceleratedMonths % DUMP_INTERVAL === 0 && accumulated > 0) {
      balance     = Math.max(0, balance - accumulated);
      accumulated = 0;
    }
  }

  // Final dump: if any surplus remains after the last full year
  if (balance > 0.01 && accumulated > 0) {
    balance = Math.max(0, balance - accumulated);
    // If this clears the loan, don’t add any more interest
  }

  const monthsSaved    = Math.max(0, originalMonths - acceleratedMonths);
  const interestSaved  = Math.max(0, Math.round(totalStdInterest - totalAccInterest));

  const now = new Date();
  const originalPayoffDate = new Date(now);
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
