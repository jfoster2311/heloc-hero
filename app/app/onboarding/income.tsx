// app/onboarding/income.tsx
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import AmountCardField, { AmountPreset } from '../../components/ui/AmountCardField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

function fmtDollar(v: number) {
  return '$' + Math.round(v).toLocaleString('en-US') + '/mo';
}

const INCOME_PRESETS: AmountPreset[] = [4_000, 6_000, 8_000, 12_000].map(v => ({ value: v, label: fmtDollar(v) }));
const EXPENSE_PRESETS: AmountPreset[] = [2_500, 4_000, 5_500, 8_000].map(v => ({ value: v, label: fmtDollar(v) }));

export default function IncomeStep() {
  const { colors } = useTheme();
  const styles = useStyles();
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

  /**
   * The card's BORDER only.
   *
   * This used to colour the headline figure as well, through a three-step
   * mint600 → mint400 → gray400 ramp. Every one of those is a fill token: on
   * this card's gray50 they measure roughly 2.6:1, 1.5:1 and 2.5:1, so all
   * three failed AA — including the 3:1 floor that large text gets — on the
   * biggest number on the screen. The contrast audit that took the app from 19
   * failures to zero covered the tabs and the components they render; these
   * onboarding screens were not in its path.
   *
   * As a border it is fine: a boundary is decorative reinforcement here, and it
   * is never the only channel — the figure is labelled, the percentage is
   * printed, and getSurplusMessage() says the same thing in words.
   */
  function surplusBorder() {
    if (grossPct >= 25) return colors.mint600;
    if (grossPct >= 10) return colors.mint400;
    return colors.gray400;
  }

  // Ink, per the design system's two sanctioned choices: accentInk for a
  // positive accent figure, gray500 for a negative one. Deliberately two states
  // rather than three — the ramp above was encoding a tier in colour that the
  // message below already states in words.
  const surplusInk = grossSurplus > 0 ? colors.accentInk : colors.gray500;

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
          <View style={[styles.surplusCard, { borderColor: surplusBorder() }]}>
            <Text style={styles.surplusLabel}>Gross Monthly Surplus</Text>
            <Text style={[styles.surplusValue, { color: surplusInk }]}>
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
                {/* mint600 on mint50 was worse than it looked — the tinted
                    surface lifts the background and drops the ratio further
                    than the same pairing on white. accentInk is the token that
                    exists for exactly this. */}
                <Text style={[styles.helocSurplusValue, { color: helocSurplus > 0 ? colors.accentInk : colors.gray500 }]}>
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

const useStyles = createThemedStyles(t => ({
  surplusCard: {
    borderRadius: Radius.lg, padding: Spacing[4],
    alignItems: 'center', borderWidth: 2,
    backgroundColor: t.colors.gray50, gap: Spacing[1],
  },
  surplusLabel: { fontSize: Typography.sm, color: t.colors.textSecondary, fontWeight: Typography.medium },
  surplusValue: { fontSize: Typography['3xl'], fontWeight: Typography.extrabold },
  surplusPct:   { fontSize: Typography.sm, color: t.colors.textMuted },
  surplusMsg:   { fontSize: Typography.sm, color: t.colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: Spacing[2] },

  helocSurplusCard: {
    backgroundColor: t.colors.mint50, borderRadius: Radius.md,
    padding: Spacing[4], borderWidth: 1, borderColor: t.colors.mint200,
    gap: Spacing[1],
  },
  helocSurplusRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  helocSurplusLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },
  helocSurplusValue: { fontSize: Typography.base, fontWeight: Typography.extrabold },
  helocSurplusSub:   { fontSize: Typography.xs, color: t.colors.accentInk, lineHeight: 16, marginTop: 2 },
}));
