// lib/onboardingStore.ts
import { create } from 'zustand';
import type { OnboardingData } from './types';
import { supabase } from './supabase';

interface OnboardingStore {
  data: Partial<OnboardingData>;
  step: number;
  saving: boolean;
  update: (patch: Partial<OnboardingData>) => void;
  nextStep: () => void;
  prevStep: () => void;
  submit: (userId: string) => Promise<{ error: string | null }>;
  reset: () => void;
}

const DEFAULTS: Partial<OnboardingData> = {
  hasHeloc: false,
  helocBalance: 0,
  helocLimit: 0,
  helocRate: 0.085,
  creditScore: 720,
};

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  data: DEFAULTS,
  step: 0,
  saving: false,

  update: (patch) =>
    set(s => ({ data: { ...s.data, ...patch } })),

  nextStep: () =>
    set(s => ({ step: s.step + 1 })),

  prevStep: () =>
    set(s => ({ step: Math.max(0, s.step - 1) })),

  submit: async (userId) => {
    set({ saving: true });
    const { data } = get();

    const { error } = await supabase
      .from('users')
      .update({
        full_name:           data.fullName          ?? null,
        monthly_income:      data.monthlyIncome     ?? null,
        monthly_expenses:    data.monthlyExpenses   ?? null,
        home_value:          data.homeValue         ?? null,
        mortgage_balance:    data.mortgageBalance   ?? null,
        mortgage_rate:       data.mortgageRate      ?? null,
        monthly_payment:     data.monthlyPayment    ?? null,
        credit_score:        data.creditScore       ?? null,
        // Onboarding asks for these on heloc-info; before this they were
        // collected, used once for the reveal, then dropped — so every later
        // screen fell back to an assumed rate the user had already told us.
        heloc_rate:             data.helocRate  ?? null,
        heloc_credit_limit:     data.helocLimit ?? null,
        heloc_terms_updated_at: data.helocRate ? new Date().toISOString() : null,
        onboarding_complete: true,
      })
      .eq('id', userId);

    set({ saving: false });
    return { error: error?.message ?? null };
  },

  reset: () => set({ data: DEFAULTS, step: 0 }),
}));
