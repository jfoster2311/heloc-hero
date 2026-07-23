// lib/mortgage.ts — the mortgage, from whichever source actually has it.
//
// Plaid's /liabilities/get DOES cover type `loan` subtype `mortgage`, so unlike
// the HELOC (see lib/helocTerms.ts) a linked mortgage can populate itself:
// rate, term, maturity, escrow, next payment, YTD interest, origination. Not
// every servicer participates, so every field here carries its source and
// falls back to a user-entered value rather than to a guess.
//
// The source tag is not bookkeeping. `ytdInterestPaid` is the one figure in the
// app a user can check against a paper statement, and it is only worth that if
// the screen can say it came from the servicer.

export type FieldSource = 'liability' | 'user' | 'derived' | 'none';

export interface Sourced<T> {
  value: T | null;
  source: FieldSource;
}

/** Plaid mortgage liability, as returned by /liabilities/get. */
export interface MortgageLiability {
  account_id?: string;
  current_late_fee?: number | null;
  escrow_balance?: number | null;
  has_pmi?: boolean | null;
  has_prepayment_penalty?: boolean | null;
  interest_rate?: { percentage?: number | null; type?: string | null } | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
  loan_term?: string | null;                  // e.g. "30 year"
  loan_type_description?: string | null;
  maturity_date?: string | null;
  next_monthly_payment?: number | null;
  next_payment_due_date?: string | null;
  origination_date?: string | null;
  origination_principal_amount?: number | null;
  past_due_amount?: number | null;
  property_address?: {
    street?: string | null; city?: string | null;
    region?: string | null; postal_code?: string | null; country?: string | null;
  } | null;
  ytd_interest_paid?: number | null;
  ytd_principal_paid?: number | null;
}

/** User-entered stand-ins for the same facts, off the profile row. */
export interface MortgageUserFallback {
  balance: number | null;
  rate: number | null;                 // decimal
  monthlyPayment: number | null;
  originationDate: string | null;
  originationPrincipal: number | null;
  termMonths: number | null;
  hasPrepaymentPenalty: boolean | null;
  propertyAddress: string | null;
}

export interface ResolvedMortgage {
  balance:              Sourced<number>;
  rate:                 Sourced<number>;      // decimal, e.g. 0.065
  rateType:             Sourced<string>;      // 'fixed' | 'variable'
  termMonths:           Sourced<number>;
  maturityDate:         Sourced<string>;
  nextPayment:          Sourced<number>;
  nextPaymentDueDate:   Sourced<string>;
  escrowBalance:        Sourced<number>;
  ytdInterestPaid:      Sourced<number>;
  ytdPrincipalPaid:     Sourced<number>;
  originationDate:      Sourced<string>;
  originationPrincipal: Sourced<number>;
  hasPmi:               Sourced<boolean>;
  hasPrepaymentPenalty: Sourced<boolean>;
  currentLateFee:       Sourced<number>;
  pastDueAmount:        Sourced<number>;
  propertyAddress:      Sourced<string>;
  /** True when anything at all came from the servicer. */
  isLive: boolean;
}

export function resolveMortgage(
  liability: MortgageLiability | null | undefined,
  liveBalance: number | null,
  user: MortgageUserFallback,
): ResolvedMortgage {
  const L = liability ?? null;
  const isLive = !!L && Object.values(L).some(v => v !== null && v !== undefined);

  return {
    balance: liveBalance != null
      ? { value: liveBalance, source: 'liability' }
      : pick(null, user.balance),
    // Plaid reports the rate as a percentage; everything downstream is decimal.
    rate:      pick(pctToDecimal(L?.interest_rate?.percentage), user.rate),
    rateType:  pick(L?.interest_rate?.type ?? null, null),
    termMonths: pick(parseLoanTerm(L?.loan_term), user.termMonths),
    maturityDate: pick(L?.maturity_date ?? null, null),
    nextPayment: pick(L?.next_monthly_payment ?? null, user.monthlyPayment),
    nextPaymentDueDate: pick(L?.next_payment_due_date ?? null, null),
    escrowBalance: pick(L?.escrow_balance ?? null, null),
    ytdInterestPaid: pick(L?.ytd_interest_paid ?? null, null),
    ytdPrincipalPaid: pick(L?.ytd_principal_paid ?? null, null),
    originationDate: pick(L?.origination_date ?? null, user.originationDate),
    originationPrincipal: pick(L?.origination_principal_amount ?? null, user.originationPrincipal),
    hasPmi: pick(L?.has_pmi ?? null, null),
    hasPrepaymentPenalty: pick(L?.has_prepayment_penalty ?? null, user.hasPrepaymentPenalty),
    currentLateFee: pick(L?.current_late_fee ?? null, null),
    pastDueAmount: pick(L?.past_due_amount ?? null, null),
    propertyAddress: pick(formatAddress(L?.property_address), user.propertyAddress),
    isLive,
  };
}

function pick<T>(fromLiability: T | null, fromUser: T | null): Sourced<T> {
  if (fromLiability !== null && fromLiability !== undefined) {
    return { value: fromLiability, source: 'liability' };
  }
  if (fromUser !== null && fromUser !== undefined) {
    return { value: fromUser, source: 'user' };
  }
  return { value: null, source: 'none' };
}

function pctToDecimal(p: number | null | undefined): number | null {
  if (typeof p !== 'number' || !Number.isFinite(p)) return null;
  // Servicers report 6.5 for 6.5%. A value under 1 is already a decimal.
  return p > 1 ? p / 100 : p;
}

/** Plaid returns loan_term as free text, e.g. "30 year" or "360 month". */
export function parseLoanTerm(term: string | null | undefined): number | null {
  if (!term) return null;
  const m = term.match(/(\d+)\s*(year|yr|month|mo)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /year|yr/i.test(m[2]) ? n * 12 : n;
}

export function formatAddress(
  a: MortgageLiability['property_address'] | null | undefined,
): string | null {
  if (!a) return null;
  const parts = [a.street, a.city, a.region, a.postal_code].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

// ─── The baseline schedule ────────────────────────────────────────────────────

export interface Baseline {
  /** When the loan pays off on its ORIGINAL terms, with no user input at all. */
  payoffDate: Date | null;
  /** Months from today to that date. */
  monthsRemaining: number | null;
  /** Principal retired ÷ original principal, 0..1. */
  percentComplete: number | null;
  source: FieldSource;
}

/**
 * The original payoff date, derived rather than asked for.
 *
 * Preference order matters. `maturity_date` is what the servicer says the loan
 * ends; origination + term is the same fact computed. Amortizing forward from
 * today's balance is a different number — it is the schedule the user is on
 * NOW, which after any extra payment is already ahead of the original note.
 * Using it as "baseline" would quietly credit the strategy with progress the
 * user made before installing the app.
 */
export function deriveBaseline(
  m: ResolvedMortgage,
  currentBalance: number | null,
  now = new Date(),
): Baseline {
  const maturity = parseDate(m.maturityDate.value);
  const origination = parseDate(m.originationDate.value);
  const term = m.termMonths.value;

  let payoffDate: Date | null = null;
  let source: FieldSource = 'none';

  if (maturity) {
    payoffDate = maturity;
    source = m.maturityDate.source;
  } else if (origination && term && term > 0) {
    payoffDate = addMonths(origination, term);
    source = 'derived';
  }

  const monthsRemaining = payoffDate ? monthsBetween(now, payoffDate) : null;

  const principal = m.originationPrincipal.value;
  const percentComplete =
    principal && principal > 0 && currentBalance !== null
      ? clamp01((principal - currentBalance) / principal)
      : null;

  return { payoffDate, monthsRemaining, percentComplete, source };
}

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
