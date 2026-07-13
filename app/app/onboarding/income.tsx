// app/onboarding/income.tsx
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import AmountCardField, { AmountPreset } from '../../components/ui/AmountCardField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

function fmtDollar(v: number) {
  return '$' + Math.round(v).toLocaleString('en-US') + '/mo';
}

const INCOME_PRESETS: AmountPreset[] = [4_000, 6_000, 8_000, 12_000].map(v => ({ value: v, label: fmtDollar(v) }));
const EXPENSE_PRESETS: AmountPreset[] = [2_500, 4_000, 5_500, 8_000].map(v => ({ value: v, label: fmtDollar(v) }));

export default function IncomeStep() {
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  // Sliders — numeric state directly
  const income   = data.monthlyIncome   ?? 8_000;
  const expenses = data.monthlyExpenses ?? 5_500;

  const grossSurplus = income - expenses;
  const grossPct     = income > 0 ? (grossSurplus / income) * 100 : 0;

  // Mortgage payment from step 1
  const mortgagePayment = data.monthlyPayment ?? 0;
  const helocSurplus    = Math.max(0, grossSurplus - mortgagePayment);

  const isValid = income > 0 && expenses > 0;

  function getSurplusColor() {
    if (grossPct >= 25) return Colors.mint600;
    if (grossPct >= 10) return Colors.mint400;
    return Colors.gray400;
  }

  function getSurplusMessage() {
    if (grossSurplus <= 0) return "Expenses exceed income — let's work on this together.";
    if (grossPct >= 30)    return 'Excellent cash flow — this is your mortgage-crushing engine.';
    if (grossPct >= 15)    return 'Good surplus. Even this amount dramatically accelerates payoff.';
    return 'Small surplus is fine — the HELOC strategy still saves you significantly.';
  }

  function handleNext() {
    update({ monthlyIncome: income, monthlyExpenses: expenses });
    nextStep();
    router.push('/onboarding/heloc-info');
  }

  return (
    <OnboardingStep
      step={2}
      totalSteps={4}
      title="What's your monthly cash flow?"
      subtitle="Your surplus is the engine of this strategy. Don't worry if it's small."
      whyWeAsk="We use this to project your monthly HELOC paydown — never shared."
      onBack={() => { prevStep(); router.back(); }}
      onNext={handleNext}
      nextDisabled={!isValid}
    >
      <AmountCardField
        label="Monthly Take-Home Income"
        value={income}
        presets={INCOME_PRESETS}
        customMin={1_000}
        customMax={30_000}
        customStep={250}
        format={fmtDollar}
        hint="After-tax income across all household earners"
        onChange={(v) => update({ monthlyIncome: v })}
      />
      <AmountCardField
        label="Monthly Expenses (excluding mortgage)"
        value={expenses}
        presets={EXPENSE_PRESETS}
        customMin={500}
        customMax={20_000}
        customStep={250}
        format={fmtDollar}
        hint="Food, utilities, subscriptions, car payments, etc."
        onChange={(v) => update({ monthlyExpenses: v })}
      />

      {isValid && (
        <>
          <View style={[styles.surplusCard, { borderColor: getSurplusColor() }]}>
            <Text style={styles.surplusLabel}>Gross Monthly Surplus</Text>
            <Text style={[styles.surplusValue, { color: getSurplusColor() }]}>
              ${Math.abs(grossSurplus).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              {grossSurplus < 0 ? ' deficit' : '/mo'}
            </Text>
            <Text style={styles.surplusPct}>{grossPct.toFixed(1)}% of income</Text>
            <Text style={styles.surplusMsg}>{getSurplusMessage()}</Text>
          </View>

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
  helocSurplusRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  helocSurplusLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.mint700 },
  helocSurplusValue: { fontSize: Typography.base, fontWeight: Typography.extrabold },
  helocSurplusSub:   { fontSize: Typography.xs, color: Colors.mint600, lineHeight: 16, marginTop: 2 },
});
