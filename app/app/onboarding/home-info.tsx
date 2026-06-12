// app/onboarding/home-info.tsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import SliderField from '../../components/ui/SliderField';
import ChipField from '../../components/ui/ChipField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { calcMonthlyPayment, calcRemainingBalance } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

const TERM_OPTIONS = [
  { value: 15, label: '15 yr' },
  { value: 20, label: '20 yr' },
  { value: 25, label: '25 yr' },
  { value: 30, label: '30 yr' },
];

function fmtDollar(v: number) {
  return '$' + Math.round(v).toLocaleString('en-US');
}

function fmtRate(v: number) {
  return v.toFixed(2) + '%';
}

export default function HomeInfoStep() {
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  // Primary slider inputs (numeric)
  const [homeValue,          setHomeValue]          = useState(data.homeValue          ?? 450_000);
  const [originalLoanAmount, setOriginalLoanAmount] = useState(data.loanOriginalAmount ?? 380_000);
  const [mortgageRatePct,    setMortgageRatePct]    = useState(data.mortgageRate ? data.mortgageRate * 100 : 6.5);
  const [loanTermYears,      setLoanTermYears]      = useState<number>(data.loanTermYears ?? 30);

  // Origination year — text (too many values for a slider)
  const [originationYear, setOriginationYear] = useState(String(data.loanOriginationYear ?? ''));

  // Payment + balance: auto-computed; user can tap to override
  const [monthlyPayment,   setMonthlyPayment]   = useState(data.monthlyPayment  ? String(Math.round(data.monthlyPayment))  : '');
  const [mortgageBalance,  setMortgageBalance]  = useState(data.mortgageBalance ? String(Math.round(data.mortgageBalance)) : '');
  const [paymentEstimated, setPaymentEstimated] = useState(false);
  const [balanceEstimated, setBalanceEstimated] = useState(false);

  // Auto-compute payment + balance whenever loan parameters change
  useEffect(() => {
    const year = parseInt(originationYear, 10);
    const now  = new Date();
    if (
      originalLoanAmount > 0 && mortgageRatePct > 0 && loanTermYears > 0 &&
      year >= 1970 && year <= now.getFullYear()
    ) {
      const rate         = mortgageRatePct / 100;
      const termMonths   = Math.round(loanTermYears * 12);
      const payment      = calcMonthlyPayment(originalLoanAmount, rate, termMonths);
      const elapsed      = Math.min((now.getFullYear() - year) * 12 + now.getMonth(), termMonths - 1);
      const balance      = calcRemainingBalance(originalLoanAmount, rate, termMonths, elapsed);
      setMonthlyPayment(Math.round(payment).toString());
      setPaymentEstimated(true);
      setMortgageBalance(Math.round(balance).toString());
      setBalanceEstimated(true);
    } else {
      setPaymentEstimated(false);
      setBalanceEstimated(false);
    }
  }, [originalLoanAmount, mortgageRatePct, loanTermYears, originationYear]);

  const mortgageBalNum = parseFloat(mortgageBalance) || 0;
  const monthlyPayNum  = parseFloat(monthlyPayment)  || 0;

  const isValid =
    homeValue > 0 &&
    mortgageBalNum > 0 &&
    mortgageRatePct > 0 &&
    monthlyPayNum > 0;

  function handleNext() {
    update({
      homeValue,
      mortgageBalance:     mortgageBalNum,
      mortgageRate:        mortgageRatePct / 100,
      monthlyPayment:      monthlyPayNum,
      loanOriginalAmount:  originalLoanAmount || undefined,
      loanTermYears,
      loanOriginationYear: parseInt(originationYear, 10) || undefined,
    });
    nextStep();
    router.push('/onboarding/income');
  }

  const equity    = homeValue - mortgageBalNum;
  const equityPct = homeValue > 0 ? (equity / homeValue) * 100 : 0;

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
      <SliderField
        label="Home Value (estimated)"
        value={homeValue}
        min={50_000}
        max={2_000_000}
        step={5_000}
        format={fmtDollar}
        hint="Use Zillow or your last appraisal"
        onChange={setHomeValue}
      />
      <SliderField
        label="Original Loan Amount"
        value={originalLoanAmount}
        min={50_000}
        max={1_500_000}
        step={5_000}
        format={fmtDollar}
        hint="The amount you originally borrowed"
        onChange={setOriginalLoanAmount}
      />
      <SliderField
        label="Mortgage Interest Rate"
        value={mortgageRatePct}
        min={2}
        max={15}
        step={0.25}
        format={fmtRate}
        onChange={setMortgageRatePct}
      />
      <ChipField
        label="Loan Term"
        options={TERM_OPTIONS}
        value={loanTermYears}
        onChange={setLoanTermYears}
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
        hint={balanceEstimated ? 'Estimated from elapsed payments — tap to adjust' : undefined}
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
    borderRadius:    Radius.lg,
    padding:         Spacing[4],
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.mint200,
    marginTop:       Spacing[2],
  },
  equityLabel: {
    fontSize:   Typography.sm,
    color:      Colors.mint700,
    fontWeight: Typography.medium,
  },
  equityValue: {
    fontSize:   Typography['3xl'],
    fontWeight: Typography.extrabold,
    color:      Colors.mint600,
    marginTop:  Spacing[1],
  },
  equityPct: {
    fontSize:  Typography.sm,
    color:     Colors.mint600,
    marginTop: 2,
  },
});
