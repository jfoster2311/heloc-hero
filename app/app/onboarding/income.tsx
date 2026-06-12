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

  const [income,   setIncome]   = useState(String(data.monthlyIncome   ?? ''));
  const [expenses, setExpenses] = useState(String(data.monthlyExpenses ?? ''));

  const incomeNum   = parseFloat(income)   || 0;
  const expensesNum = parseFloat(expenses) || 0;
  const grossSurplus = incomeNum - expensesNum;
  const grossPct     = incomeNum > 0 ? (grossSurplus / incomeNum) * 100 : 0;

  // Mortgage payment was entered in step 1 and is available in the store
  const mortgagePayment = data.monthlyPayment ?? 0;
  // True HELOC surplus = income − living expenses − mortgage payment
  const helocSurplus    = Math.max(0, grossSurplus - mortgagePayment);

  const isValid = incomeNum > 0 && expensesNum > 0;

  function getSurplusColor() {
    if (grossPct >= 25) return Colors.mint600;
    if (grossPct >= 10) return Colors.mint400;
    return Colors.gray400;
  }

  function getSurplusMessage() {
    if (grossSurplus <= 0) return 'Expenses exceed income — let\'s work on this together.';
    if (grossPct >= 30)    return 'Excellent cash flow — this is your mortgage-crushing engine.';
    if (grossPct >= 15)    return 'Good surplus. Even this amount dramatically accelerates payoff.';
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
        <>
          {/* Gross surplus (income minus living expenses) */}
          <View style={[styles.surplusCard, { borderColor: getSurplusColor() }]}>
            <Text style={styles.surplusLabel}>Gross Monthly Surplus</Text>
            <Text style={[styles.surplusValue, { color: getSurplusColor() }]}>
              ${Math.abs(grossSurplus).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              {grossSurplus < 0 ? ' deficit' : '/mo'}
            </Text>
            <Text style={styles.surplusPct}>{grossPct.toFixed(1)}% of income</Text>
            <Text style={styles.surplusMsg}>{getSurplusMessage()}</Text>
          </View>

          {/* Net HELOC surplus — only show when mortgage payment is known from step 1 */}
          {mortgagePayment > 0 && grossSurplus > 0 && (
            <View style={styles.helocSurplusCard}>
              <View style={styles.helocSurplusRow}>
                <Text style={styles.helocSurplusLabel}>After mortgage payment</Text>
                <Text style={[styles.helocSurplusValue, { color: helocSurplus > 0 ? Colors.mint600 : Colors.gray400 }]}>
                  ${helocSurplus.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
                </Text>
              </View>
              <Text style={styles.helocSurplusSub}>
                This is the amount swept to your HELOC each month in the strategy.
              </Text>
            </View>
          )}
        </>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  surplusCard: {
    borderRadius: Radius.lg, padding: Spacing[4],
    alignItems: 'center', borderWidth: 2,
    backgroundColor: Colors.gray50, gap: Spacing[1],
  },
  surplusLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  surplusValue: { fontSize: Typography['3xl'], fontWeight: Typography.extrabold },
  surplusPct:   { fontSize: Typography.sm, color: Colors.textMuted },
  surplusMsg:   { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: Spacing[2] },

  helocSurplusCard: {
    backgroundColor: Colors.mint50, borderRadius: Radius.md,
    padding: Spacing[4], borderWidth: 1, borderColor: Colors.mint200,
    gap: Spacing[1],
  },
  helocSurplusRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  helocSurplusLabel:{ fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.mint700 },
  helocSurplusValue:{ fontSize: Typography.base, fontWeight: Typography.extrabold },
  helocSurplusSub:  { fontSize: Typography.xs, color: Colors.mint600, lineHeight: 16, marginTop: 2 },
});
