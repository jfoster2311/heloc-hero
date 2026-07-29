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
export type PlaidAccountType = 'mortgage' | 'home equity' | 'savings';

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
