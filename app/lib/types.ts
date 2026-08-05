// lib/types.ts
import type { InterestCalcMethod, HomeValueSource } from './config';
import type { MortgageLiability } from './mortgage';

// Two tiers: free, and pro (billed monthly or annually). 'medium' and 'full'
// are legacy three-tier values kept so existing rows keep working; both are
// treated as pro. See lib/pricing.ts.
export type Tier = 'free' | 'pro' | 'medium' | 'full';

/** Alias used in upgrade modal */
export type SubscriptionTier = Tier;

/** Plaid account category stored in linked_accounts */
export type PlaidAccountType = 'mortgage' | 'home equity' | 'savings' | 'checking';

/**
 * The account types that hold spendable cash.
 *
 * 'savings' was the only one for a long time and came to mean two different
 * things: the role the user linked, and "the side of the ledger that is not the
 * mortgage or the line". Splitting checking out broke the second meaning
 * silently — every transaction filter written as `account_type === 'savings'`
 * would have dropped a newly linked checking account, which is precisely where
 * the paycheck lands and the spending happens. Cash flow, surplus, recurring
 * detection and the reports would all have quietly under-counted.
 *
 * So the second meaning gets its own name. Filter transactions with
 * `isCashAccountType`, never with a literal.
 */
export const CASH_ACCOUNT_TYPES = ['savings', 'checking'] as const;

export type CashAccountType = typeof CASH_ACCOUNT_TYPES[number];

/**
 * Whether a row's account_type is a spendable-cash account.
 *
 * Takes a string, not a PlaidAccountType: `transactions.account_type` is a free
 * text column, so a narrowed parameter would be a claim about the data that the
 * schema does not enforce.
 */
export function isCashAccountType(type: string | null | undefined): boolean {
  return type === 'savings' || type === 'checking';
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  home_value: number | null;
  mortgage_balance: number | null;
  mortgage_rate: number | null;
  monthly_payment: number | null;
  credit_score: number | null;
  // HELOC terms are user-entered: Plaid's /liabilities/get does not cover
  // HELOCs, so APR, margin, draw-end and payment type never arrive from a link.
  // See lib/helocTerms.ts.
  heloc_rate: number | null;
  heloc_margin: number | null;
  heloc_credit_limit: number | null;
  /**
   * The drawn balance, entered by hand.
   *
   * Unlike the terms above, this one DOES arrive from a link — it is the only
   * HELOC figure Plaid supplies. It exists here because a linked account is
   * Pro-gated while cycle tracking is not, so a free user could enter a limit
   * and then had no way to say what was drawn against it. Every module that
   * reasons about the line treated the resulting null as zero, and so told a
   * user mid-cycle that their line was untouched and a dump was open.
   *
   * A live balance always wins over this. See hooks/useFinancials.
   */
  heloc_balance: number | null;
  /** When the user last said so. A hand-entered balance goes stale. */
  heloc_balance_updated_at: string | null;
  heloc_draw_end_date: string | null;
  heloc_payment_type: 'interest_only' | 'amortizing' | null;
  heloc_terms_updated_at: string | null;
  heloc_rate_index: string | null;
  /**
   * Decides whether cycling works at all, so it caveats every projection.
   * Average-daily-balance rewards parking money in the line; statement-balance
   * ignores anything that leaves before the statement date.
   */
  heloc_interest_calc_method: InterestCalcMethod | null;
  heloc_draw_fee: number | null;
  heloc_annual_fee: number | null;
  heloc_early_closure_fee: number | null;

  // Property value is user-entered in v1, with its provenance recorded so the
  // derived equity can be judged. Shaped to accept an AVM later without change.
  home_value_as_of: string | null;
  home_value_source: HomeValueSource | null;
  property_address: string | null;

  // Mortgage facts Plaid Liabilities supplies for participating servicers, kept
  // here as the fallback for everyone else.
  mortgage_origination_date: string | null;
  mortgage_origination_principal: number | null;
  mortgage_term_months: number | null;
  mortgage_has_prepayment_penalty: boolean | null;

  /**
   * Whether monthly_income/monthly_expenses are the user's own estimate or a
   * trailing transaction average they reviewed and accepted.
   */
  cashflow_source: 'entered' | 'derived' | null;
  cashflow_derived_at: string | null;

  // Assumptions the user controls.
  replenish_threshold: number | null;
  forward_rate_delta_bps: number | null;
  auto_apply_surplus: boolean | null;

  tier: Tier;
  onboarding_complete: boolean;
  fcm_token: string | null;
  created_at: string;
}

export interface OnboardingData {
  fullName: string;
  homeValue: number;
  mortgageBalance: number;
  mortgageRate: number;
  /** Monthly P&I payment — canonical field name used everywhere */
  monthlyPayment: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  hasHeloc: boolean;
  /**
   * What the user actually answered, which `hasHeloc` cannot carry.
   *
   * "Not sure" and "No" both collapse to hasHeloc:false — they have to, since
   * every projection needs a line to model — but they are not the same claim,
   * and a screen that tells an unsure user "First step: open a HELOC" is
   * asserting something nobody established.
   */
  helocStatus: 'have_one' | 'no_heloc' | 'not_sure';
  helocBalance: number;
  helocLimit: number;
  helocRate: number;
  creditScore: number;
  /** Original principal borrowed — used to calculate payment + balance */
  loanOriginalAmount: number;
  /** Loan term in years (15, 20, 30, etc.) */
  loanTermYears: number;
  /** Calendar year the mortgage was opened, e.g. 2019 */
  loanOriginationYear: number;
  /**
   * Whether the payment and balance above are still OUR derived figures.
   *
   * Held in the store rather than in the step's local state because it has to
   * survive leaving the screen and coming back. Without it, home-info remounts
   * unable to tell an estimate it produced from a figure the user typed — and
   * it has to be able to tell, because it re-derives both whenever the loan
   * terms change and must not overwrite the second kind.
   */
  paymentIsEstimate: boolean;
  balanceIsEstimate: boolean;
}

export interface PlaidBalance {
  current: number;
  available: number | null;
  limit: number | null;
  iso_currency_code: string | null;
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  /** Last 2–4 digits. Present on most institutions; never assume it. */
  mask?: string | null;
  official_name: string | null;
  type: string;
  subtype: string;
  balances: PlaidBalance;
}

export interface LinkedAccount {
  id: string;
  user_id: string;
  account_type: PlaidAccountType;
  institution_name: string | null;
  plaid_item_id: string;
  accounts: PlaidAccount[];
  accounts_updated_at: string | null;
  /** Latest /liabilities/get payload for this item. Null for non-participating servicers. */
  liabilities: { mortgage?: MortgageLiability[] } | null;
  /** The snapshot before it — escrow and rate changes are found by comparison. */
  liabilities_prev: { mortgage?: MortgageLiability[] } | null;
  created_at: string;
}

/**
 * Alert preferences. The column names date from a planned automation feature
 * that was never built and never will be in this form — HELOC Hero has no
 * payment rail and does not move money. They now govern WHEN THE USER IS
 * PROMPTED to act, not what the app does on their behalf:
 *   safe_sweep_enabled -> remind me when surplus is ready to move to the HELOC
 *   safe_dump_enabled  -> remind me when the HELOC is replenished enough to dump
 */
export interface AutomationSettings {
  user_id: string;
  safe_sweep_enabled: boolean;
  safe_dump_enabled: boolean;
  buffer_target: number;
  upcoming_bills_estimate: number;
  min_dump_amount: number;
  /** How much spare cash a threshold alert must clear before it fires. */
  min_sweep_amount: number;
}

export interface HelocScore {
  total: number;
  surplusScore: number;
  utilizationScore: number;
  creditPoints: number;
  mteModifier: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs Work';
  color: string;
}

export interface PayoffProjection {
  originalMonths: number;
  acceleratedMonths: number;
  monthsSaved: number;
  interestSaved: number;
  originalPayoffDate: Date;
  acceleratedPayoffDate: Date;
  /**
   * Total interest each path pays, for stating the two side by side rather than
   * only their difference. `acceleratedInterest` INCLUDES the HELOC interest the
   * strategy costs, which is what makes the pair comparable — a cycling figure
   * that counted only mortgage interest would look better than it is.
   */
  originalInterest: number;
  acceleratedInterest: number;
  /**
   * What `interestSaved` is actually made of.
   *
   * `interestSaved` is measured against doing nothing at all — a baseline that
   * never spends the surplus — so it contains two separate effects and labels
   * the sum as the strategy's work. These split it:
   *
   *   fromSurplus + fromCycling === interestSaved
   *
   * `fromSurplus` is what paying the same money straight at principal achieves
   * with no HELOC involved. `fromCycling` is what routing it through the line
   * adds on top, and it is NEGATIVE whenever the line costs more than the
   * mortgage — which is the ordinary case at the 8.5% this app assumes. Any
   * surface stating the headline must be able to state this breakdown.
   */
  fromSurplus: number;
  fromCycling: number;
  /** Payoff months when the surplus goes straight at principal. */
  directMonths: number;
  directInterest: number;
}

export interface CalculatorInputs {
  mortgageBalance: number;
  mortgageRate: number;
  monthlyPayment: number;
  monthlySurplus: number;
  helocRate: number;
  /** Optional HELOC credit limit; capped internally at 12× surplus */
  helocLimit?: number;
  /**
   * A one-time principal payment applied today — a bonus, a tax refund, a sale.
   *
   * Applied to BOTH the baseline and the cycling run. See the note in
   * `prepare()`: the cash exists whether or not anyone cycles, so crediting
   * cycling with a tax refund would overstate what the strategy contributes.
   */
  lumpSum?: number;
}

// ─── Subscription Plans ───────────────────────────────────────────────────────

export type BillingPeriod = 'monthly' | 'annual';


export interface AutomationLogEntry {
  id: string;
  user_id: string;
  action: 'sweep' | 'dump';
  amount: number;
  status: 'pending' | 'success' | 'failed';
  note: string | null;
  created_at: string;
}
