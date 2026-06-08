// app/onboarding/heloc-info.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

export default function HelocInfoStep() {
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  const [hasHeloc, setHasHeloc] = useState<boolean>(data.hasHeloc ?? false);
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
      helocLimit: hasHeloc ? parseFloat(helocLimit) || 0 : 0,
      helocRate: hasHeloc ? parseFloat(helocRate) / 100 : 0.085,
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
      {/* Yes / No toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, hasHeloc && styles.toggleBtnActive]}
          onPress={() => setHasHeloc(true)}
        >
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={hasHeloc ? Colors.white : Colors.textMuted}
          />
          <Text style={[styles.toggleText, hasHeloc && styles.toggleTextActive]}>
            Yes, I have a HELOC
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, !hasHeloc && styles.toggleBtnActive]}
          onPress={() => setHasHeloc(false)}
        >
          <Ionicons
            name="search"
            size={18}
            color={!hasHeloc ? Colors.white : Colors.textMuted}
          />
          <Text style={[styles.toggleText, !hasHeloc && styles.toggleTextActive]}>
            No, help me get one
          </Text>
        </TouchableOpacity>
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
          <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
          <Text style={styles.noHelocText}>
            No problem! After setup we'll show you the best HELOC options based on your
            home equity and credit profile.
          </Text>
        </View>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
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
    backgroundColor: '#eff6ff',
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
  },
  noHelocText: {
    flex: 1,
    fontSize: Typography.sm,
    color: '#1e40af',
    lineHeight: 20,
  },
});
