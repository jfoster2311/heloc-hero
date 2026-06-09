// app/onboarding/heloc-info.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import type { HelocStatus } from '../../lib/lenders';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

export default function HelocInfoStep() {
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  const [helocStatus, setHelocStatus] = useState<HelocStatus>(
    data.hasHeloc ? 'have_one' : 'no_heloc',
  );
  const hasHeloc = helocStatus === 'have_one';
  const [helocBalance, setHelocBalance] = useState(String(data.helocBalance ?? '0'));
  const [helocLimit, setHelocLimit] = useState(String(data.helocLimit ?? ''));
  const [helocRate, setHelocRate] = useState(
    data.helocRate ? String(data.helocRate * 100) : '8.5',
  );

  const isValid = !hasHeloc || (parseFloat(helocLimit) > 0);

  function handleNext() {
    update({
      hasHeloc,
      helocBalance: hasHeloc ? parseFloat(helocBalance) || 0 : 0,
      helocLimit:   hasHeloc ? parseFloat(helocLimit)   || 0 : 0,
      helocRate:    hasHeloc ? parseFloat(helocRate) / 100 : 0.085,
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
      onBack={() => { prevStep(); router.back(); }}
      onNext={handleNext}
      nextDisabled={!isValid}
    >
      {/* HELOC status — 3-way */}
      <View style={styles.statusList}>
        {([
          { value: 'have_one',  icon: 'checkmark-circle', label: 'Yes, I have a HELOC' },
          { value: 'no_heloc',  icon: 'home-outline',     label: "No, I don't have one" },
          { value: 'not_sure',  icon: 'help-circle-outline', label: "Not sure" },
        ] as { value: HelocStatus; icon: string; label: string }[]).map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.toggleBtn, helocStatus === opt.value && styles.toggleBtnActive]}
            onPress={() => setHelocStatus(opt.value)}
          >
            <Ionicons
              name={opt.icon as never}
              size={18}
              color={helocStatus === opt.value ? Colors.white : Colors.textMuted}
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
        <View style={styles.noHelocInfo}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.mint600} />
          <Text style={styles.noHelocText}>
            No problem. After setup, we'll guide you through what to look for and how to
            find the right HELOC for this strategy.
          </Text>
        </View>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  statusList: {
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    padding: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
  },
  toggleBtnActive: {
    backgroundColor: Colors.mint600,
    borderColor: Colors.mint600,
  },
  toggleText: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textSecondary,
  },
  toggleTextActive: { color: Colors.white },
  noHelocInfo: {
    flexDirection: 'row',
    gap: Spacing[3],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: Colors.mint400,
  },
  noHelocText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.mint700,
    lineHeight: 20,
  },
});
