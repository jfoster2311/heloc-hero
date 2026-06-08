// app/onboarding/credit-score.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { useAuth } from '../../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

const RANGES = [
  { label: 'Exceptional', range: '800+',       value: 820, color: '#059669' },
  { label: 'Very Good',   range: '740–799',    value: 760, color: '#10b981' },
  { label: 'Good',        range: '670–739',    value: 700, color: '#34d399' },
  { label: 'Fair',        range: '580–669',    value: 620, color: Colors.warning },
  { label: 'Poor',        range: 'Below 580',  value: 550, color: Colors.error },
];

export default function CreditScoreStep() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, update, submit, saving, prevStep } = useOnboardingStore();
  const [selected, setSelected] = useState<number>(data.creditScore ?? 720);
  const [error, setError] = useState('');

  async function handleFinish() {
    update({ creditScore: selected });
    if (!user) {
      router.push('/auth/signup');
      return;
    }
    const { error: saveError } = await submit(user.id);
    if (saveError) {
      setError(saveError);
      return;
    }
    router.replace('/tabs/dashboard');
  }

  const selectedRange = RANGES.find(r => r.value === selected);

  return (
    <OnboardingStep
      step={4}
      totalSteps={4}
      title="Estimate your credit score"
      subtitle="This helps calculate your HELOC Hero Score™ and HELOC approval odds."
      onBack={() => { prevStep(); router.back(); }}
      onNext={handleFinish}
      nextLabel={user ? 'Finish Setup' : 'Create Account →'}
      loading={saving}
    >
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!user && (
        <View style={styles.signupPrompt}>
          <Text style={styles.signupPromptText}>
            Almost done! You'll create your free account on the next screen to save your results.
          </Text>
        </View>
      )}

      <View style={styles.rangeList}>
        {RANGES.map(r => (
          <TouchableOpacity
            key={r.value}
            style={[
              styles.rangeItem,
              selected === r.value && { borderColor: r.color, backgroundColor: `${r.color}12` },
            ]}
            onPress={() => setSelected(r.value)}
          >
            <View style={[styles.rangeDot, { backgroundColor: r.color }]} />
            <View style={styles.rangeText}>
              <Text style={styles.rangeLabel}>{r.label}</Text>
              <Text style={styles.rangeScore}>{r.range}</Text>
            </View>
            {selected === r.value && (
              <View style={[styles.selectedBadge, { backgroundColor: r.color }]}>
                <Text style={styles.selectedBadgeText}>Selected</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {selectedRange && (
        <View style={[styles.hint, { borderLeftColor: selectedRange.color }]}>
          <Text style={styles.hintText}>
            Don't know your exact score? Check Credit Karma or your bank app for a free estimate.
          </Text>
        </View>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: { color: Colors.error, fontSize: Typography.sm },
  signupPrompt: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.md,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  signupPromptText: {
    fontSize: Typography.sm,
    color: Colors.mint700,
    lineHeight: 20,
    textAlign: 'center',
  },
  rangeList: { gap: Spacing[3], marginBottom: Spacing[5] },
  rangeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
    gap: Spacing[3],
  },
  rangeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  rangeText: { flex: 1 },
  rangeLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  rangeScore: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  selectedBadge: {
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  selectedBadgeText: {
    color: Colors.white,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  hint: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderLeftWidth: 3,
  },
  hintText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
