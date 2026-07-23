// lib/helocTerms.ts
//
// What Plaid can and cannot tell us about a HELOC, and how the app copes.
//
// Plaid's /liabilities/get supports only account type `credit` with subtype
// `credit card` or `paypal`, and type `loan` with subtype `student` or
// `mortgage`. A HELOC is in neither bucket, so for EVERY institution these are
// unavailable: APR, margin, draw-period end date, minimum payment, and
// origination terms.
//
// What does arrive, because `home equity` and `line of credit` are valid
// account subtypes, is /accounts/balance/get — current and available balance.
// That is enough for the balance-driven features:
//   · Safe-to-move scoring    — available balance + cash flow
//   · Utilization threshold   — current ÷ limit, and limit = current + available
//   · Payoff Clock            — needs APR and payment terms, so NOT enough
//
// The consequence for the product: terms are user-entered and must be
// re-verified, because a HELOC rate is variable and will drift. Balances
// refresh themselves around that manual core. Nothing here should assume one
// link call populates everything.

/** HELOC APRs are variable; a figure this old should be re-confirmed. */
export const TERMS_STALE_DAYS = 90;

/** Used only when the user has told us nothing. Always disclosed as an assumption. */
export const ASSUMED_HELOC_RATE = 0.085;

export type HelocPaymentType = 'interest_only' | 'amortizing';

export interface HelocTerms {
  rate: number | null;               // APR as a decimal
  margin: number | null;             // over the index, decimal
  creditLimit: number | null;        // user-entered fallback
  drawEndDate: string | null;        // ISO date
  paymentType: HelocPaymentType | null;
  updatedAt: string | null;
}

export interface BalanceShape {
  current: number | null;
  available: number | null;
  limit: number | null;
}

/**
 * The credit limit, in order of reliability.
 *
 * Plaid populates `limit` inconsistently for lines of credit, so the dependable
 * derivation is drawn + available: on a line of credit those sum to the limit.
 * The user's own figure is the last resort, not the first, because a linked
 * balance is fresher than something typed months ago.
 */
export function deriveCreditLimit(
  balances: BalanceShape | null,
  userEnteredLimit: number | null,
): { limit: number | null; source: 'plaid_limit' | 'derived' | 'user' | 'unknown' } {
  if (balances) {
    if (typeof balances.limit === 'number' && balances.limit > 0) {
      return { limit: balances.limit, source: 'plaid_limit' };
    }
    // current = drawn balance, available = remaining credit.
    if (typeof balances.current === 'number' && typeof balances.available === 'number') {
      const sum = balances.current + balances.available;
      if (sum > 0) return { limit: sum, source: 'derived' };
    }
  }
  if (userEnteredLimit && userEnteredLimit > 0) {
    return { limit: userEnteredLimit, source: 'user' };
  }
  return { limit: null, source: 'unknown' };
}

/**
 * The rate to compute with, and whether it is the user's or our assumption.
 * Callers must surface `isAssumed` — an invented rate drives real interest
 * figures on screen.
 */
export function resolveHelocRate(userRate: number | null | undefined): {
  rate: number; isAssumed: boolean;
} {
  if (typeof userRate === 'number' && userRate > 0) {
    return { rate: userRate, isAssumed: false };
  }
  return { rate: ASSUMED_HELOC_RATE, isAssumed: true };
}

/** Days since the terms were last confirmed, or null if never. */
export function daysSinceVerified(updatedAt: string | null | undefined, now = new Date()): number | null {
  if (!updatedAt) return null;
  const then = new Date(updatedAt);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

/** True when terms have never been entered, or are old enough to have drifted. */
export function termsAreStale(updatedAt: string | null | undefined, now = new Date()): boolean {
  const days = daysSinceVerified(updatedAt, now);
  return days === null || days >= TERMS_STALE_DAYS;
}

export type DrawStatus = 'unknown' | 'covers_payoff' | 'ends_before_payoff' | 'ended';

/**
 * Whether the interest-only draw period outlasts the payoff plan.
 *
 * This is the risk the strategy lives or dies on: once the draw period closes,
 * the HELOC amortizes and can no longer be cycled. A plan that runs past the
 * draw-end date is not a plan.
 */
export function drawPeriodStatus(
  drawEndDate: string | null | undefined,
  payoffMonths: number,
  now = new Date(),
): { status: DrawStatus; monthsRemaining: number | null } {
  if (!drawEndDate) return { status: 'unknown', monthsRemaining: null };
  const end = new Date(drawEndDate);
  if (Number.isNaN(end.getTime())) return { status: 'unknown', monthsRemaining: null };

  const monthsRemaining =
    (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());

  if (monthsRemaining <= 0) return { status: 'ended', monthsRemaining };
  if (payoffMonths > 0 && monthsRemaining < payoffMonths) {
    return { status: 'ends_before_payoff', monthsRemaining };
  }
  return { status: 'covers_payoff', monthsRemaining };
}

/**
 * Cycling depends on interest-only payments during the draw. An amortizing
 * HELOC forces principal repayment on a schedule, which defeats the mechanic.
 */
export function supportsCycling(paymentType: HelocPaymentType | null | undefined): boolean | null {
  if (!paymentType) return null;   // unknown, not "no"
  return paymentType === 'interest_only';
}

/** Reads the HELOC terms off a user profile row. */
export function termsFromProfile(profile: Record<string, unknown> | null | undefined): HelocTerms {
  return {
    rate:        num(profile?.heloc_rate),
    margin:      num(profile?.heloc_margin),
    creditLimit: num(profile?.heloc_credit_limit),
    drawEndDate: str(profile?.heloc_draw_end_date),
    paymentType: (str(profile?.heloc_payment_type) as HelocPaymentType | null),
    updatedAt:   str(profile?.heloc_terms_updated_at),
  };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
