// lib/types.ts

export type Tier = 'free' | 'medium' | 'full';

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
  monthlyPayment: number;
  /** Alias used in home-info step */
  mortgageMonthlyPayment: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  hasHeloc: boolean;
  helocBalance: number;
  helocLimit: number;
  helocRate: number;
  creditScore: number;
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
  created_at: string;
}

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
}

export interface CalculatorInputs {
  mortgageBalance: number;
  mortgageRate: number;
  monthlyPayment: number;
  monthlySurplus: number;
  helocRate: number;
}

// ─── Subscription Plans ───────────────────────────────────────────────────────

export interface SubscriptionPlan {
  tier: Exclude<Tier, 'free'>;
  name: string;
  price: number;
  highlighted: boolean;
  features: string[];
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'medium',
    name: 'Accelerator',
    price: 14.99,
    highlighted: false,
    features: [
      'Link real bank accounts via Plaid',
      'Personalized HELOC Hero Score™',
      'Real payoff projections with live data',
      'Mortgage, HELOC & savings tracking',
      '6-month cash flow analysis',
    ],
  },
  {
    tier: 'full',
    name: 'Autopilot',
    price: 50,
    highlighted: true,
    features: [
      'Everything in Accelerator',
      'Safe Sweep™ — auto-move surplus to HELOC',
      'Safe Dump™ — auto-pay HELOC to mortgage',
      'Real-time account syncing',
      'Push alerts for sweeps & dumps',
      'Priority support',
    ],
  },
];
