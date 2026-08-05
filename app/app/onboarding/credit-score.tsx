// app/onboarding/credit-score.tsx
// The bands live in lib/helocScore.ts, with the score that reads them. They used
// to be declared here too, with different midpoints for the same labels — so
// someone picking "Very good" at onboarding and re-picking it later on the score
// screen would watch their score move without changing their answer.
import { useState } from 'react';
import { View, Text, Linking } from 'react-native';
import { Touchable } from '../../components/ui/press';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import OnboardingStep from '../../components/ui/OnboardingStep';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { hapticSelection } from '../../lib/haptics';
import { CREDIT_RANGES, FREE_CREDIT_REPORT_URL } from '../../lib/helocScore';

import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

const RANGES = CREDIT_RANGES;

export default function CreditScoreStep() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { data, update, prevStep } = useOnboardingStore();
  const [selected, setSelected] = useState<number>(data.creditScore ?? 720);
  // The `error` state that used to live here was never written to — nothing on
  // this screen can fail, since it only picks a band and hands off to reveal,
  // which owns the save and its own error handling. The banner it fed could not
  // render, so both are gone rather than left as scaffolding for a failure mode
  // this screen does not have.

  async function handleFinish() {
    update({ creditScore: selected });
    // Always go to reveal — reveal handles save + final routing
    router.push('/onboarding/reveal');
  }

  return (
    <OnboardingStep
      step={4}
      totalSteps={4}
      title="Estimate your credit score"
      // Was "helps calculate your HELOC Hero Score™ and HELOC approval odds".
      // We do not estimate approval odds — there is no underwriting model behind
      // anything here, and lib/helocScore.ts is careful to say so. Promising it
      // at onboarding and disclaiming it later is the drift this app has been
      // caught in before.
      subtitle="It's one of four things your HELOC Hero score looks at. An estimate is fine."
      whyWeAsk="Only feeds your HELOC Hero score. We never pull your credit, and it is never shared."
      onBack={() => { prevStep(); router.back(); }}
      onNext={handleFinish}
      nextLabel="See My Results →"
      loading={false}
    >
      <View style={styles.rangeList}>
        {RANGES.map(r => {
          const active = selected === r.value;
          return (
            <Touchable
              haptic="selection"
              key={r.value}
              style={[styles.rangeItem, active && styles.rangeItemActive]}
              onPress={() => { setSelected(r.value); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${r.label}, ${r.range}`}
            >
              <View style={styles.rangeText}>
                <Text style={styles.rangeLabel}>{r.label}</Text>
                <Text style={styles.rangeScore}>{r.range}</Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={22} color={colors.accentInk} />
              )}
            </Touchable>
          );
        })}
      </View>

      {/* Where to actually get it, and an honest statement that we do not.
          "Check Credit Karma" pointed at a commercial product; this is the
          statutory free-report site. */}
      <Touchable
        style={styles.hint}
        onPress={() => Linking.openURL(FREE_CREDIT_REPORT_URL)}
        accessibilityRole="link"
        accessibilityLabel="Get your credit report free at annualcreditreport.com"
      >
        <Text style={styles.hintText}>
          Don&apos;t know it? Your bank or card issuer probably shows a score, or get your
          report free at annualcreditreport.com. We never pull your credit — this is your
          estimate, and it only feeds your HELOC Hero score.
        </Text>
      </Touchable>
    </OnboardingStep>
  );
}

const useStyles = createThemedStyles(t => ({
  rangeList: { gap: Spacing[3], marginBottom: Spacing[5] },
  rangeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.gray50,
    gap: Spacing[3],
    minHeight: 64,
  },
  rangeItemActive: { borderColor: t.colors.mint600, backgroundColor: t.colors.mint50 },
  rangeText: { flex: 1 },
  rangeLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  rangeScore: {
    fontSize: Typography.sm,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  hint: {
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: t.colors.mint200,
  },
  hintText: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
  },
}));
