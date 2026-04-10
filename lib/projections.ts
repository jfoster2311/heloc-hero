// lib/projections.ts
import type { PayoffProjection, CalculatorInputs } from './types';

/**
 * Calculates mortgage payoff timelines with and without HELOC acceleration.
 *
 * Strategy: each month surplus is swept to the HELOC; every 12 months the
 * accumulated HELOC balance is dumped as a lump-sum principal payment.
 */
export function computeProjection(inputs: CalculatorInputs): PayoffProjection {
  const { mortgageBalance, mortgageRate, monthlyPayment, monthlySurplus } = inputs;
  const monthlyRate = mortgageRate / 12;

  // --- Standard payoff (no HELOC strategy) ---
  let balance = mortgageBalance;
  let originalMonths = 0;
  while (balance > 0.01 && originalMonths < 720) {
    const interest = balance * monthlyRate;
    const principal = Math.max(0, monthlyPayment - interest);
    balance = Math.max(0, balance - principal);
    originalMonths++;
  }

  // --- Accelerated payoff (HELOC sweep + annual dump) ---
  balance = mortgageBalance;
  let accumulated = 0;
  let acceleratedMonths = 0;
  const DUMP_INTERVAL = 12;

  while (balance > 0.01 && acceleratedMonths < 720) {
    const interest = balance * monthlyRate;
    const principal = Math.max(0, monthlyPayment - interest);
    balance = Math.max(0, balance - principal);
    accumulated += monthlySurplus;
    acceleratedMonths++;

    // Annual lump-sum principal payment
    if (acceleratedMonths % DUMP_INTERVAL === 0 && accumulated > 0) {
      balance = Math.max(0, balance - accumulated);
      accumulated = 0;
    }
  }

  const monthsSaved = Math.max(0, originalMonths - acceleratedMonths);

  // Interest saved: avg monthly interest × months eliminated
  const avgMonthlyInterest = (mortgageBalance * monthlyRate) * 0.5; // rough midpoint
  const interestSaved = Math.round(monthsSaved * avgMonthlyInterest);

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

/** Formats months into a human-readable "X yrs Y mo" string */
export function formatMonths(months: number): string {
  const yrs = Math.floor(months / 12);
  const mo  = months % 12;
  if (yrs === 0) return `${mo} mo`;
  if (mo  === 0) return `${yrs} yr${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr${yrs !== 1 ? 's' : ''} ${mo} mo`;
}

/** Returns a generic projection for free-tier users (illustrative) */
export function genericProjection(): PayoffProjection {
  return computeProjection({
    mortgageBalance:  320000,
    mortgageRate:     0.065,
    monthlyPayment:   2100,
    monthlySurplus:   2400,
    helocRate:        0.085,
  });
}
