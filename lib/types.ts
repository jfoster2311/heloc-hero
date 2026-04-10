// lib/types.ts

export type Tier = 'free' | 'medium' | 'full';

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
  account_type: 'mortgage' | 'home equity' | 'savings';
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
