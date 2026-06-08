// app/onboarding/home-info.tsx
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

export default function HomeInfoStep() {
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  const [homeValue, setHomeValue] = useState(String(data.homeValue ?? ''));
  const [mortgageBalance, setMortgageBalance] = useState(String(data.mortgageBalance ?? ''));
  const [mortgageRate, setMortgageRate] = useState(
    data.mortgageRate ? String(data.mortgageRate * 100) : '',
  );
  const [monthlyPayment, setMonthlyPayment] = useState(
    String(data.mortgageMonthlyPayment ?? ''),
  );

  const isValid =
    parseFloat(homeValue) > 0 &&
    parseFloat(mortgageBalance) > 0 &&
    parseFloat(mortgageRate) > 0 &&
    parseFloat(monthlyPayment) > 0;

  function handleNext() {
    update({
      homeValue: parseFloat(homeValue),
      mortgageBalance: parseFloat(mortgageBalance),
      mortgageRate: parseFloat(mortgageRate) / 100,
      mortgageMonthlyPayment: parseFloat(monthlyPayment),
    });
    nextStep();
    router.push('/onboarding/income');
  }

  const equity =
    parseFloat(homeValue) - parseFloat(mortgageBalance);
  const equityPct = parseFloat(homeValue) > 0
    ? (equity / parseFloat(homeValue)) * 100 : 0;

  return (
    <OnboardingStep
      step={1}
      totalSteps={4}
      title="Tell us about your home"
      subtitle="This lets us calculate exactly how much interest you can save."
      onBack={() => { prevStep(); router.back(); }}
      onNext={handleNext}
      nextDisabled={!isValid}
    >
      <FormField
        label="Home Value (estimated)"
        prefix="$"
        value={homeValue}
        onChangeText={setHomeValue}
        keyboardType="decimal-pad"
        placeholder="450,000"
        hint="Use Zillow or your last appraisal for a rough estimate"
      />
      <FormField
        label="Mortgage Balance"
        prefix="$"
        value={mortgageBalance}
        onChangeText={setMortgageBalance}
        keyboardType="decimal-pad"
        placeholder="350,000"
      />
      <FormField
        label="Mortgage Interest Rate"
        suffix="%"
        value={mortgageRate}
        onChangeText={setMortgageRate}
        keyboardType="decimal-pad"
        placeholder="6.5"
      />
      <FormField
        label="Monthly Mortgage Payment"
        prefix="$"
        value={monthlyPayment}
        onChangeText={setMonthlyPayment}
        keyboardType="decimal-pad"
        placeholder="1,800"
        hint="Principal + interest only (not taxes/insurance)"
      />

      {isValid && (
        <View style={styles.equityCard}>
          <Text style={styles.equityLabel}>Your Home Equity</Text>
          <Text style={styles.equityValue}>
            ${Math.max(0, equity).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </Text>
          <Text style={styles.equityPct}>{Math.max(0, equityPct).toFixed(1)}% of home value</Text>
        </View>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  equityCard: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.mint200,
    marginTop: Spacing[2],
  },
  equityLabel: {
    fontSize: Typography.sm,
    color: Colors.mint700,
    fontWeight: Typography.medium,
  },
  equityValue: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: Colors.mint600,
    marginTop: Spacing[1],
  },
  equityPct: {
    fontSize: Typography.sm,
    color: Colors.mint600,
    marginTop: 2,
  },
});
