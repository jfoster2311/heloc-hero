// app/onboarding/heloc-info.tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import AmountCardField, { AmountPreset } from '../../components/ui/AmountCardField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import type { HelocStatus } from '../../lib/lenders';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

function fmtDollar(v: number) {
  return '$' + Math.round(v).toLocaleString('en-US');
}

// Presets scale with the user's own surplus: 25%/50%/75%/100% of a realistic
// 12x-monthly-surplus ceiling, snapped to the nearest $5k and floored at $10k.
function buildHelocPresets(surplus: number): AmountPreset[] {
  const ceiling = Math.max(25_000, Math.min(surplus * 12, 300_000));
  const amounts = [0.25, 0.5, 0.75, 1].map(frac =>
    Math.max(10_000, Math.round((ceiling * frac) / 5_000) * 5_000)
  );
  const unique = Array.from(new Set(amounts));
  return unique.map(v => ({ value: v, label: fmtDollar(v) }));
}

export default function HelocInfoStep() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  const [helocStatus, setHelocStatus] = useState<HelocStatus>(
    data.hasHeloc ? 'have_one' : 'no_heloc',
  );
  const hasHeloc = helocStatus === 'have_one';

  // Existing-HELOC fields (text — user enters exact figures)
  const [helocBalance, setHelocBalance] = useState(String(data.helocBalance ?? '0'));
  const [helocLimit,   setHelocLimit]   = useState(String(data.helocLimit ?? ''));
  const [helocRate,    setHelocRate]    = useState(
    data.helocRate ? String(data.helocRate * 100) : '8.5',
  );

  // Projected HELOC limit for users who don't have one yet.
  // Default: 12× net monthly surplus (how much they could realistically cycle),
  // floored at $25k, capped at $150k for a sensible first guess.
  const surplus = Math.max(0,
    (data.monthlyIncome ?? 0) - (data.monthlyExpenses ?? 0) - (data.monthlyPayment ?? 0),
  );
  const defaultProjected = Math.max(25_000, Math.min(surplus * 12, 150_000));
  const [projectedLimit, setProjectedLimit] = useState(
    (!hasHeloc && data.helocLimit) ? data.helocLimit : defaultProjected,
  );
  const helocPresets = buildHelocPresets(surplus);

  const isValid = !hasHeloc || (parseFloat(helocLimit) > 0);

  function handleNext() {
    update({
      hasHeloc,
      helocBalance: hasHeloc ? parseFloat(helocBalance) || 0 : 0,
      helocLimit:   hasHeloc ? parseFloat(helocLimit)   || 0 : projectedLimit,
      helocRate:    hasHeloc ? parseFloat(helocRate) / 100  : 0.085,
    });
    nextStep();
    router.push('/onboarding/credit-score');
  }

  return (
    <OnboardingStep
      step={3}
      totalSteps={4}
      title="Do you have a HELOC?"
      subtitle="A HELOC (Home Equity Line of Credit) is the core tool in this strategy. Don't have one? We'll help you find the best options."
      whyWeAsk="We use this to estimate your payoff acceleration — never shared."
      onBack={() => { prevStep(); router.back(); }}
      onNext={handleNext}
      nextDisabled={!isValid}
    >
      {/* HELOC status */}
      <View style={styles.statusList}>
        {([
          { value: 'have_one',  icon: 'checkmark-circle',   label: 'Yes, I have a HELOC' },
          { value: 'no_heloc',  icon: 'home-outline',       label: "No, I don't have one" },
          { value: 'not_sure',  icon: 'help-circle-outline', label: 'Not sure' },
        ] as { value: HelocStatus; icon: string; label: string }[]).map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.toggleBtn, helocStatus === opt.value && styles.toggleBtnActive]}
            onPress={() => setHelocStatus(opt.value)}
          >
            <Ionicons
              name={opt.icon as never}
              size={18}
              color={helocStatus === opt.value ? colors.white : colors.textMuted}
            />
            <Text style={[styles.toggleText, helocStatus === opt.value && styles.toggleTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {hasHeloc ? (
        <>
          <FormField
            label="HELOC Credit Limit"
            prefix="$"
            value={helocLimit}
            onChangeText={setHelocLimit}
            keyboardType="decimal-pad"
            placeholder="100,000"
          />
          <FormField
            label="Current HELOC Balance"
            prefix="$"
            value={helocBalance}
            onChangeText={setHelocBalance}
            keyboardType="decimal-pad"
            placeholder="15,000"
            hint="Leave as 0 if you haven't drawn on it yet"
          />
          <FormField
            label="HELOC Interest Rate (variable)"
            suffix="%"
            value={helocRate}
            onChangeText={setHelocRate}
            keyboardType="decimal-pad"
            placeholder="8.5"
          />
        </>
      ) : (
        <>
          <View style={styles.noHelocInfo}>
            <Ionicons name="information-circle-outline" size={20} color={colors.mint600} />
            <Text style={styles.noHelocText}>
              No problem. After setup, we'll guide you through what to look for and how to
              find the right HELOC for this strategy.
            </Text>
          </View>

          {/* Projected HELOC amount — used to estimate potential acceleration */}
          <AmountCardField
            label="Projected HELOC Amount"
            value={projectedLimit}
            presets={helocPresets}
            customMin={10_000}
            customMax={300_000}
            customStep={5_000}
            format={fmtDollar}
            hint="How much you might realistically borrow — used to estimate your payoff acceleration"
            onChange={setProjectedLimit}
          />
        </>
      )}
    </OnboardingStep>
  );
}

const useStyles = createThemedStyles(t => ({
  statusList: {
    gap:          Spacing[3],
    marginBottom: Spacing[5],
  },
  toggleBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing[2],
    padding:        Spacing[4],
    borderRadius:   Radius.md,
    borderWidth:    1.5,
    borderColor:    t.colors.border,
    backgroundColor: t.colors.gray50,
  },
  toggleBtnActive: {
    backgroundColor: t.colors.mint600,
    borderColor:     t.colors.mint600,
  },
  toggleText:       { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary },
  toggleTextActive: { color: t.colors.white },
  noHelocInfo: {
    flexDirection:   'row',
    gap:             Spacing[3],
    backgroundColor: t.colors.mint50,
    borderRadius:    Radius.md,
    padding:         Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: t.colors.mint400,
    marginBottom:    Spacing[5],
  },
  noHelocText: {
    flex:       1,
    fontSize:   Typography.sm,
    color:      t.colors.mint700,
    lineHeight: 20,
  },
}));
