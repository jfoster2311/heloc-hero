// app/onboarding/home-info.tsx
import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingStep from '../../components/ui/OnboardingStep';
import FormField from '../../components/ui/FormField';
import SliderField from '../../components/ui/SliderField';
import ChipField from '../../components/ui/ChipField';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { calcMonthlyPayment, calcRemainingBalance } from '../../lib/projections';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

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
  const styles = useStyles();
  const router = useRouter();
  const { data, update, nextStep, prevStep } = useOnboardingStore();

  // Primary slider inputs (numeric)
  const [homeValue,          setHomeValue]          = useState(data.homeValue          ?? 450_000);
  const [originalLoanAmount, setOriginalLoanAmount] = useState(data.loanOriginalAmount ?? 380_000);
  const [mortgageRatePct,    setMortgageRatePct]    = useState(data.mortgageRate ? data.mortgageRate * 100 : 6.5);
  const [loanTermYears,      setLoanTermYears]      = useState<number>(data.loanTermYears ?? 30);

  // Origination year — text (too many values for a slider)
  // Default to 5 years ago so auto-compute fires on mount and Continue is enabled.
  const [originationYear, setOriginationYear] = useState(
    String(data.loanOriginationYear ?? (new Date().getFullYear() - 5))
  );

  // Payment + balance: auto-computed; user can tap to override
  const [monthlyPayment,   setMonthlyPayment]   = useState(data.monthlyPayment  ? String(Math.round(data.monthlyPayment))  : '');
  const [mortgageBalance,  setMortgageBalance]  = useState(data.mortgageBalance ? String(Math.round(data.mortgageBalance)) : '');
  // Seeded from the store, so stepping forward and coming back does not lose
  // which of these two figures is ours to recompute. First visit has neither
  // recorded and no value stored, so both start as ours by default.
  const [paymentEstimated, setPaymentEstimated] = useState(
    data.paymentIsEstimate ?? !data.monthlyPayment,
  );
  const [balanceEstimated, setBalanceEstimated] = useState(
    data.balanceIsEstimate ?? !data.mortgageBalance,
  );

  // Two fields the user may have TYPED, which must then stop being derived.
  //
  // The estimate is a courtesy — it fills the payment and the balance from the
  // loan terms so nobody has to look them up. But the effect below re-ran on
  // every slider movement and overwrote both fields unconditionally, including
  // when the value in them was the user's own. Correct your real mortgage
  // balance, nudge the rate slider a notch, and the correction was gone with no
  // indication it had ever been there — on the single figure every projection
  // in this app is sized from.
  //
  // `paymentEstimated`/`balanceEstimated` already recorded which of the two was
  // still ours: the onChangeText handlers below clear them the moment the user
  // types. They were only ever read for the hint text. Now they gate the write,
  // which is what they were describing all along.
  const paymentIsOurs = paymentEstimated || monthlyPayment === '';
  const balanceIsOurs = balanceEstimated || mortgageBalance === '';

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
      if (paymentIsOurs) {
        setMonthlyPayment(Math.round(payment).toString());
        setPaymentEstimated(true);
      }
      if (balanceIsOurs) {
        setMortgageBalance(Math.round(balance).toString());
        setBalanceEstimated(true);
      }
    } else {
      // Only ever demotes a figure WE put there. A typed value is not an
      // estimate, so the terms going incomplete must not relabel it as one.
      if (paymentIsOurs) setPaymentEstimated(false);
      if (balanceIsOurs) setBalanceEstimated(false);
    }
    // paymentIsOurs/balanceIsOurs are deliberately absent from the deps: they
    // are read as a guard, not tracked as an input. Including them would re-run
    // the effect the instant a user's first keystroke flipped one to false,
    // which is the overwrite this exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      paymentIsEstimate:   paymentEstimated,
      balanceIsEstimate:   balanceEstimated,
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
      whyWeAsk="We use this to calculate your home equity — never shared."
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
        // The override is now sticky, so the way back to the estimate has to be
        // stated. Clearing the field is what restores it, and nobody guesses
        // that unprompted.
        hint={paymentEstimated
          ? 'Calculated from your loan details — tap to adjust'
          : 'Principal + interest only (not taxes/insurance). Clear it to go back to our estimate.'}
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
          : 'Your figure. Clear it to go back to our estimate.'}
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

const useStyles = createThemedStyles(t => ({
  equityCard: {
    backgroundColor: t.colors.mint50,
    borderRadius:    Radius.lg,
    padding:         Spacing[4],
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     t.colors.mint200,
    marginTop:       Spacing[2],
  },
  equityLabel: {
    fontSize:   Typography.sm,
    color:      t.colors.mint700,
    fontWeight: Typography.medium,
  },
  equityValue: {
    fontSize:   Typography['3xl'],
    fontWeight: Typography.extrabold,
    color:      t.colors.accentInk,
    marginTop:  Spacing[1],
  },
  equityPct: {
    fontSize:  Typography.sm,
    color:     t.colors.accentInk,
    marginTop: 2,
  },
}));
