// lib/moveDecision.ts
//
// The arithmetic behind "should I move money onto my mortgage right now?".
//
// This module exists so the decision screen can SHOW ITS REASONING rather than
// issue a verdict. Every figure the screen states — the utilization it would
// land on, how long replenishing takes, what the HELOC interest costs, what
// comes off the payoff — is computed here and can be checked independently.
//
// It deliberately reports the downside with the same precision as the upside.
// A tool that touches someone's home equity should not make the cost of a move
// harder to read than its benefit.

/** Above this utilization the HELOC has little room left for an emergency. */
export const CAUTION_UTILIZATION = 0.8;

/** Matches computeProjection's ceiling so both agree on "never pays off". */
const MAX_MONTHS = 720;

export interface MoveInputs {
  helocLimit: number;
  helocDrawn: number;
  moveAmount: number;
  monthlySurplus: number;
  helocRate: number;       // decimal, e.g. 0.085
  mortgageBalance: number;
  mortgageRate: number;    // decimal, e.g. 0.065
  monthlyPayment: number;
}

export interface MoveAnalysis {
  /** HELOC balance after the draw. */
  newDrawn: number;
  utilBefore: number;      // 0..1
  utilAfter: number;       // 0..1
  /** Credit still available afterwards — the emergency buffer. */
  availableAfter: number;
  /** Months of surplus needed to clear the draw. 0 when it never clears. */
  replenishMonths: number;
  replenishable: boolean;
  /** HELOC interest paid while replenishing. A real cost of the move. */
  helocInterestCost: number;
  /**
   * HELOC interest per month at the new balance. When the draw cannot be
   * repaid, replenishMonths is 0 and helocInterestCost is 0 — which would read
   * as "free". This is the figure that is actually true in that case: a carrying
   * cost with no end date.
   */
  monthlyInterestAtNewBalance: number;
  /** Mortgage interest avoided by reducing principal now. */
  mortgageInterestSaved: number;
  /** Mortgage interest saved minus HELOC interest paid. Can be negative. */
  netInterestSaved: number;
  /** Months removed from the mortgage payoff. */
  monthsOffPayoff: number;
  exceedsLimit: boolean;
  crossesCaution: boolean;
  /** True when the payment cannot cover interest, so the maths is meaningless. */
  mortgageStalls: boolean;
}

/** Total interest paid over the life of a fixed-payment amortizing loan. */
function totalInterest(balance: number, annualRate: number, payment: number): {
  interest: number; months: number; stalls: boolean;
} {
  const r = annualRate / 12;
  if (balance <= 0) return { interest: 0, months: 0, stalls: false };
  if (payment <= 0 || (r > 0 && payment <= balance * r)) {
    return { interest: 0, months: MAX_MONTHS, stalls: true };
  }

  let b = balance;
  let interest = 0;
  let months = 0;
  while (b > 0.01 && months < MAX_MONTHS) {
    const i = b * r;
    interest += i;
    b = Math.max(0, b - (payment - i));
    months++;
  }
  return { interest, months, stalls: false };
}

/**
 * Months to repay `drawn` from `surplus`, charging HELOC interest each month.
 * Returns 0 when the surplus cannot outpace the interest.
 */
function replenish(drawn: number, surplus: number, annualRate: number): {
  months: number; interestPaid: number; clears: boolean;
} {
  if (drawn <= 0) return { months: 0, interestPaid: 0, clears: true };
  if (surplus <= 0) return { months: 0, interestPaid: 0, clears: false };

  const r = annualRate / 12;
  let bal = drawn;
  let interestPaid = 0;
  let months = 0;

  while (bal > 0.01 && months < MAX_MONTHS) {
    const i = bal * r;
    // Surplus covers interest first; only the remainder reduces the balance.
    if (surplus <= i) return { months: 0, interestPaid, clears: false };
    interestPaid += i;
    bal = Math.max(0, bal - (surplus - i));
    months++;
  }
  return { months, interestPaid, clears: bal <= 0.01 };
}

export function analyzeMove(inputs: MoveInputs): MoveAnalysis {
  const {
    helocLimit, helocDrawn, moveAmount, monthlySurplus,
    helocRate, mortgageBalance, mortgageRate, monthlyPayment,
  } = inputs;

  const amount = Math.max(0, moveAmount);
  const newDrawn = helocDrawn + amount;

  const utilBefore = helocLimit > 0 ? helocDrawn / helocLimit : 0;
  const utilAfter  = helocLimit > 0 ? newDrawn   / helocLimit : 0;

  const before = totalInterest(mortgageBalance, mortgageRate, monthlyPayment);
  const after  = totalInterest(Math.max(0, mortgageBalance - amount), mortgageRate, monthlyPayment);

  const rep = replenish(newDrawn, monthlySurplus, helocRate);

  const mortgageInterestSaved = before.stalls ? 0 : Math.max(0, before.interest - after.interest);
  const helocInterestCost     = rep.interestPaid;

  return {
    newDrawn,
    utilBefore,
    utilAfter,
    availableAfter: Math.max(0, helocLimit - newDrawn),
    replenishMonths: rep.clears ? rep.months : 0,
    replenishable: rep.clears,
    helocInterestCost,
    monthlyInterestAtNewBalance: newDrawn * (helocRate / 12),
    mortgageInterestSaved,
    netInterestSaved: mortgageInterestSaved - helocInterestCost,
    monthsOffPayoff: before.stalls ? 0 : Math.max(0, before.months - after.months),
    exceedsLimit: helocLimit > 0 && newDrawn > helocLimit,
    crossesCaution: helocLimit > 0 && utilAfter > CAUTION_UTILIZATION,
    mortgageStalls: before.stalls,
  };
}

/**
 * The largest move that stays at or under the caution line, rounded down to a
 * round number. Offered as a starting point — never auto-applied, because the
 * amount is the user's call.
 */
export function suggestedMove(
  helocLimit: number,
  helocDrawn: number,
  monthlySurplus: number,
): number {
  if (helocLimit <= 0) return Math.max(0, Math.floor(monthlySurplus * 12));
  const headroom = helocLimit * CAUTION_UTILIZATION - helocDrawn;
  if (headroom <= 0) return 0;
  return Math.max(0, Math.floor(headroom / 500) * 500);
}
