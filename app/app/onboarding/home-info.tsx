// app/onboarding/home-info.tsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { calcMonthlyPayment, calcRemainingBalance } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

export default function HomeInfoStep() {
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  const [homeValue,          setHomeValue]          = useState(String(data.homeValue ?? ''));
  const [originalLoanAmount, setOriginalLoanAmount] = useState(String(data.loanOriginalAmount ?? ''));
  const [originationYear,    setOriginationYear]    = useState(String(data.loanOriginationYear ?? ''));
  const [loanTermYears,      setLoanTermYears]      = useState(String(data.loanTermYears ?? '30'));
  const [mortgageRate,       setMortgageRate]       = useState(
    data.mortgageRate ? String(data.mortgageRate * 100) : '',
  );
  const [monthlyPayment,     setMonthlyPayment]     = useState(
    String(data.mortgageMonthlyPayment ?? ''),
  );
  const [mortgageBalance,    setMortgageBalance]    = useState(String(data.mortgageBalance ?? ''));
  const [paymentEstimated,   setPaymentEstimated]   = useState(false);
  const [balanceEstimated,   setBalanceEstimated]   = useState(false);

  // Auto-calculate monthly payment and current balance when loan parameters are available.
  useEffect(() => {
    const principal = parseFloat(originalLoanAmount);
    const rate      = parseFloat(mortgageRate) / 100;
    const termYrs   = parseFloat(loanTermYears);
    const year      = parseInt(originationYear, 10);
    const now       = new Date();

    if (
      principal > 0 && rate > 0 && termYrs > 0 &&
      year >= 1970 && year <= now.getFullYear()
    ) {
      const termMonths    = Math.round(termYrs * 12);
      const payment       = calcMonthlyPayment(principal, rate, termMonths);
      const elapsedMonths = Math.min(
        (now.getFullYear() - year) * 12 + now.getMonth(),
        termMonths - 1,
      );
      const balance = calcRemainingBalance(principal, rate, termMonths, elapsedMonths);

      setMonthlyPayment(Math.round(payment).toString());
      setPaymentEstimated(true);
      setMortgageBalance(Math.round(balance).toString());
      setBalanceEstimated(true);
    } else {
      setPaymentEstimated(false);
      setBalanceEstimated(false);
    }
  }, [originalLoanAmount, mortgageRate, loanTermYears, originationYear]);

  const isValid =
    parseFloat(homeValue) > 0 &&
    parseFloat(mortgageBalance) > 0 &&
    parseFloat(mortgageRate) > 0 &&
    parseFloat(monthlyPayment) > 0;

  function handleNext() {
    update({
      homeValue:              parseFloat(homeValue),
      mortgageBalance:        parseFloat(mortgageBalance),
      mortgageRate:           parseFloat(mortgageRate) / 100,
      mortgageMonthlyPayment: parseFloat(monthlyPayment),
      loanOriginalAmount:     parseFloat(originalLoanAmount) || undefined,
      loanTermYears:          parseFloat(loanTermYears) || undefined,
      loanOriginationYear:    parseInt(originationYear, 10) || undefined,
    });
    nextStep();
    router.push('/onboarding/income');
  }

  const equity    = parseFloat(homeValue) - parseFloat(mortgageBalance);
  const equityPct = parseFloat(homeValue) > 0 ? (equity / parseFloat(homeValue)) * 100 : 0;

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
        hint="Use Zillow or your last appraisal"
      />
      <FormField
        label="Original Loan Amount"
        prefix="$"
        value={originalLoanAmount}
        onChangeText={setOriginalLoanAmount}
        keyboardType="decimal-pad"
        placeholder="380,000"
        hint="The amount you originally borrowed"
      />
      <FormField
        label="Year Loan Was Opened"
        value={originationYear}
        onChangeText={setOriginationYear}
        keyboardType="number-pad"
        placeholder="2019"
        hint="Used to estimate your current balance"
      />
      <FormField
        label="Loan Term"
        suffix=" yrs"
        value={loanTermYears}
        onChangeText={setLoanTermYears}
        keyboardType="number-pad"
        placeholder="30"
        hint="Typically 15, 20, or 30 years"
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
        label="Monthly P&I Payment"
        prefix="$"
        value={monthlyPayment}
        onChangeText={(v) => { setMonthlyPayment(v); setPaymentEstimated(false); }}
        keyboardType="decimal-pad"
        placeholder="1,800"
        hint={paymentEstimated
          ? 'Calculated from your loan details — tap to adjust'
          : 'Principal + interest only (not taxes/insurance)'}
      />
      <FormField
        label="Current Mortgage Balance"
        prefix="$"
        value={mortgageBalance}
        onChangeText={(v) => { setMortgageBalance(v); setBalanceEstimated(false); }}
        keyboardType="decimal-pad"
        placeholder="350,000"
        hint={balanceEstimated
          ? 'Estimated from elapsed payments — tap to adjust'
          : undefined}
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
