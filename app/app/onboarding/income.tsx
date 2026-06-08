// app/onboarding/income.tsx
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

export default function IncomeStep() {
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  const [income, setIncome] = useState(String(data.monthlyIncome ?? ''));
  const [expenses, setExpenses] = useState(String(data.monthlyExpenses ?? ''));

  const incomeNum = parseFloat(income) || 0;
  const expensesNum = parseFloat(expenses) || 0;
  const surplus = incomeNum - expensesNum;
  const surplusPct = incomeNum > 0 ? (surplus / incomeNum) * 100 : 0;

  const isValid = incomeNum > 0 && expensesNum > 0;

  function getSurplusColor() {
    if (surplusPct >= 25) return Colors.success;
    if (surplusPct >= 10) return Colors.warning;
    return Colors.error;
  }

  function getSurplusMessage() {
    if (surplus <= 0) return 'Expenses exceed income — let\'s work on this together.';
    if (surplusPct >= 30) return 'Excellent! This surplus is your mortgage-crushing fuel.';
    if (surplusPct >= 15) return 'Good surplus. Even this amount will dramatically accelerate payoff.';
    return 'Small surplus is fine — the HELOC strategy still saves you significantly.';
  }

  function handleNext() {
    update({ monthlyIncome: incomeNum, monthlyExpenses: expensesNum });
    nextStep();
    router.push('/onboarding/heloc-info');
  }

  return (
    <OnboardingStep
      step={2}
      totalSteps={4}
      title="What's your monthly cash flow?"
      subtitle="Your surplus is the engine of this strategy. Don't worry if it's small."
      onBack={() => { prevStep(); router.back(); }}
      onNext={handleNext}
      nextDisabled={!isValid}
    >
      <FormField
        label="Monthly Take-Home Income"
        prefix="$"
        value={income}
        onChangeText={setIncome}
        keyboardType="decimal-pad"
        placeholder="8,000"
        hint="After-tax income across all household earners"
      />
      <FormField
        label="Monthly Expenses (excluding mortgage)"
        prefix="$"
        value={expenses}
        onChangeText={setExpenses}
        keyboardType="decimal-pad"
        placeholder="5,500"
        hint="Food, utilities, subscriptions, car payments, etc."
      />

      {isValid && (
        <View style={[styles.surplusCard, { borderColor: getSurplusColor() }]}>
          <Text style={styles.surplusLabel}>Monthly Surplus</Text>
          <Text style={[styles.surplusValue, { color: getSurplusColor() }]}>
            ${Math.abs(surplus).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            {surplus < 0 ? ' deficit' : '/mo'}
          </Text>
          <Text style={styles.surplusPct}>
            {surplusPct.toFixed(1)}% of income
          </Text>
          <Text style={styles.surplusMsg}>{getSurplusMessage()}</Text>
        </View>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  surplusCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: Colors.gray50,
    marginTop: Spacing[2],
    gap: Spacing[1],
  },
  surplusLabel: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  surplusValue: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
  },
  surplusPct: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  surplusMsg: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing[2],
  },
});
