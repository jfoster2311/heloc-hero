// app/tabs/calculator.tsx — the free simulator.
//
// This screen has one job: prove the concept before asking for anything.
//
// Design constraints it is built to satisfy:
//  · The result is visible before the user touches an input. Realistic defaults
//    are pre-filled, so the screen is never blank and never shows a form with
//    no payoff. There is no "Calculate" button — computeProjection measures at
//    ~0.01ms, so recomputing on every keystroke costs nothing and keeps the
//    screen inside the Doherty threshold with room to spare.
//  · The outcome sits ABOVE the inputs. If someone screenshots the top third,
//    the value proposition should be legible without scrolling.
//  · Three inputs on first load (Hick's Law). Monthly payment and HELOC rate
//    live behind Advanced; the payment defaults to a real 30-year amortization
//    of the balance and rate above it, so it is right without being asked for.
//  · Exactly one accent element: the payoff number. Everything else is muted.
import {
  View, Text, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
  InputAccessoryView, Keyboard,
} from 'react-native';
import { Touchable, animateLayout } from '../../components/ui/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useState, useMemo, useEffect, useRef } from 'react';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import { Card, SectionLabel } from '../../components/ui/primitives';
import { SectionHead, type ExplainContent } from '../../components/ui/Explain';
import Slider from '../../components/ui/Slider';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { computeProjection, computeCyclingSchedule, formatMonths, calcMonthlyPayment } from '../../lib/projections';
import { parsePositive } from '../../lib/parseNumeric';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { Typography, Spacing, Radius, OnDark, TAB_BAR_CLEARANCE } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { CalculatorInputs } from '../../lib/types';
import { useStatusBarStyle } from '../../hooks/useStatusBarStyle';


// Years LEFT on the note, not the original term. Most people running this
// calculator are part-way through a mortgage, and assuming a fresh 30-year
// schedule overstates the remaining term — and therefore the saving — for every
// one of them. 30 stays the default because it is the common case on day one,
// but it is now a stated assumption the user can correct in one tap.
const TERM_OPTIONS = [10, 15, 20, 25, 30] as const;
const DEFAULT_TERM_YEARS = 30;

/** Shared by every field, so one bar serves the whole screen. iOS only. */
const KEYPAD_ACCESSORY_ID = 'calculator-keypad';

// The rate-arbitrage explanation, which is the most important thing this screen
// knows and the least suited to sitting under a figure as a five-line paragraph.
// The verdict stays on canvas; the reasoning behind it is one tap away.
const WHERE_THE_SAVING_COMES_FROM: ExplainContent = {
  title: 'Where the saving comes from',
  body: [
    'The comparison above is against doing nothing — a baseline that never spends the surplus ' +
    'at all. So the difference between the two paths contains two separate effects, and it is ' +
    'worth knowing which is which.',
    'The first is simply paying the money. Any extra principal payment shortens a mortgage, ' +
    'whether it travels through a HELOC or goes straight at the loan.',
    'The second is routing it through the line. That is what cycling actually adds, and it is ' +
    'a rate arbitrage: it wins only when your line is cheaper than your mortgage. At a typical ' +
    '8.5% line against a 6.5% mortgage it is slightly negative.',
    'Across realistic inputs the first effect is very nearly all of it. That is not an argument ' +
    'against paying your mortgage down early — it is an argument for knowing that the lever ' +
    'worth shopping for is the rate on your line.',
  ],
};

/**
 * The model, stated plainly. Shown behind "How this is calculated" so the payoff
 * number arrives with its assumptions, not without them — including the two most
 * load-bearing: the 12×-surplus dump cap and the constant-rate assumption.
 */
const ASSUMPTIONS = [
  'Each cycle: draw the HELOC, dump it straight onto your mortgage principal, then rebuild the line from your monthly surplus — and repeat.',
  'The dump is your HELOC amount, capped at 12× your monthly surplus so the line can be repaid within about a year. A larger HELOC past that point does not speed things up.',
  'HELOC interest is charged every month on the balance still owed, at the HELOC APR you entered.',
  'Your whole monthly surplus goes to repaying the HELOC each month, after covering that month’s HELOC interest.',
  'Your regular mortgage principal-and-interest payment continues every month alongside the cycling.',
  'Home value, interest rates, income and spending are all held constant. Real life varies, so treat this as a projection.',
  'Estimate only — not financial advice, and HELOC Hero is not a lender.',
];

/** Compact "when" label for the month schedule, e.g. month 14 → "Y2 M2". */
function whenLabel(month: number): string {
  const year = Math.ceil(month / 12);
  const mo = ((month - 1) % 12) + 1;
  return `Y${year} M${mo}`;
}

// Realistic defaults so the screen opens with a believable answer already on it.
const GENERIC_DEFAULTS: CalculatorInputs = {
  mortgageBalance: 400000,
  mortgageRate:    6.5,   // displayed as % — divided by 100 before compute
  monthlyPayment:  0,     // 0 = derive from balance + rate (see derivedPayment)
  monthlySurplus:  600,
  helocRate:       8.5,
  helocLimit:      25000, // size of the line drawn each cycle (capped at 12× surplus)
  lumpSum:         0,     // no windfall assumed — the user adds one if they have one
};

/**
 * Slider geometry for the two levers.
 *
 * `soft` is the track's nominal top end, not a limit on the figure: both fields
 * are also typed into, and the track grows to fit a larger number rather than
 * clamping it. A user who enters $8,000 of surplus must not have it silently
 * dragged down to $5,000 by a control they never touched.
 */
const SURPLUS_TRACK   = { soft: 5000,  step: 50 };
const INJECTION_TRACK = { soft: 20000, step: 500 };

/** Rounds the track up to a clean multiple so the labelled end stays readable. */
function trackMax(value: number, soft: number, step: number) {
  if (value <= soft) return soft;
  const grain = step * 20;
  return Math.ceil(value / grain) * grain;
}

function firstBalance(accounts: any[], type: string): number | null {
  const linked = accounts.find((a: any) => a.account_type === type);
  return linked?.accounts?.[0]?.balances?.current ?? null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalculatorScreen() {
  // This tab opens on the aurora, so the clock stays light. Declared here
  // rather than inherited: two tabs are now light-topped and set it dark, and
  // whichever screen was visited last would otherwise win. See the hook.
  useStatusBarStyle('light');

  /**
   * Re-tapping the active tab scrolls back to the top.
   *
   * A reflex on iOS, and every tab here is long enough to need it — the
   * dashboard runs seven cards past the fold. Without it the tab bar was the
   * one control that did nothing when you pressed it a second time, which
   * reads as the tap having missed.
   */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const { colors, common } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tier } = useAuth();
  const { accounts } = useAccounts(profile?.id ?? null);

  const canPrefill = tier !== 'free';

  // Pre-fill from real data when available.
  // monthlySurplus = income − living expenses − mortgage payment.
  // monthly_expenses from onboarding excludes mortgage, so we subtract it separately.
  const initialInputs: CalculatorInputs = useMemo(() => {
    if (!canPrefill) return GENERIC_DEFAULTS;
    const mb = firstBalance(accounts, 'mortgage');
    const income   = profile?.monthly_income   ?? 0;
    const expenses = profile?.monthly_expenses ?? 0;
    const payment  = profile?.monthly_payment  ?? 0;
    return {
      mortgageBalance: mb ?? GENERIC_DEFAULTS.mortgageBalance,
      mortgageRate:    (profile?.mortgage_rate ?? 0.065) * 100,
      monthlyPayment:  payment || 0,
      monthlySurplus:  Math.max(0, income - expenses - payment) || GENERIC_DEFAULTS.monthlySurplus,
      helocRate:       GENERIC_DEFAULTS.helocRate,
      helocLimit:      profile?.heloc_credit_limit || GENERIC_DEFAULTS.helocLimit,
      // Never prefilled. A windfall is a thing the user knows about and we do
      // not, and starting the screen with an assumed $5,000 bonus would inflate
      // the payoff date on first load with money nobody has.
      lumpSum:         0,
    };
  }, [canPrefill, accounts, profile]);

  // Years left, from the note's own terms when we have them: origination plus
  // term, minus what has already elapsed. Rounded up, because eleven months of
  // mortgage is a year you are still paying.
  const initialTermYears = useMemo(() => {
    if (!canPrefill) return DEFAULT_TERM_YEARS;
    const termMonths = profile?.mortgage_term_months ?? null;
    const originated = profile?.mortgage_origination_date ?? null;
    if (!termMonths || !originated) return DEFAULT_TERM_YEARS;
    const start = new Date(originated);
    if (Number.isNaN(start.getTime())) return DEFAULT_TERM_YEARS;
    const elapsed =
      (new Date().getFullYear() - start.getFullYear()) * 12 +
      (new Date().getMonth() - start.getMonth());
    const remaining = Math.ceil((termMonths - elapsed) / 12);
    return remaining > 0 && remaining <= 40 ? remaining : DEFAULT_TERM_YEARS;
  }, [canPrefill, profile]);

  const [inputs, setInputs] = useState<CalculatorInputs>(initialInputs);
  const [termYears, setTermYears] = useState(initialTermYears);
  const [paymentTouched, setPaymentTouched] = useState(
    () => (initialInputs.monthlyPayment ?? 0) > 0,
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  // Set the moment the user edits anything. Until then the screen is still
  // showing OUR numbers and is free to improve them; afterwards it is showing
  // THEIRS and must not move under their hands.
  const [edited, setEdited] = useState(false);

  // Adopt the prefill when it arrives.
  //
  // useState only reads its argument on the first render, and on that render
  // `accounts` is still [] because the fetch has not returned — so the linked
  // mortgage balance fell through to the generic $400,000 and stayed there
  // forever. A Pro user with a connected mortgage ran every projection on a
  // number that was not theirs, on the screen whose entire job is to be
  // convincing. Everything else prefilled fine, which is what kept this hidden:
  // rate, payment and surplus come off the profile, which is loaded before the
  // tab mounts.
  useEffect(() => {
    if (edited) return;
    setInputs(initialInputs);
    setTermYears(initialTermYears);
    setPaymentTouched((initialInputs.monthlyPayment ?? 0) > 0);
  }, [initialInputs, initialTermYears, edited]);

  // Until the user edits it, the payment is a real amortization of the balance
  // and rate they can see, over the term they chose — not a fixed guess that
  // silently contradicts them.
  const derivedPayment = useMemo(
    () => calcMonthlyPayment(
      inputs.mortgageBalance,
      inputs.mortgageRate / 100,
      termYears * 12,
    ),
    [inputs.mortgageBalance, inputs.mortgageRate, termYears],
  );
  const monthlyPayment = paymentTouched ? inputs.monthlyPayment : derivedPayment;
  const helocLimit = inputs.helocLimit ?? 25000;

  // What the inputs can actually support, stated honestly rather than as a result.
  const monthlyRate = inputs.mortgageRate / 100 / 12;
  const status: 'needs-balance' | 'payment-too-low' | 'ok' =
    inputs.mortgageBalance <= 0
      ? 'needs-balance'
      : monthlyPayment <= 0 || (monthlyRate > 0 && monthlyPayment <= inputs.mortgageBalance * monthlyRate)
        ? 'payment-too-low'
        : 'ok';

  // The payment-too-low state used to tell the user to "check the payment under
  // Advanced" while Advanced was collapsed — an instruction pointing at a
  // control that was not on screen. Open it for them; the fix lives inside.
  // Keyed on `status` alone, so it fires on the TRANSITION into the bad state
  // and not on every render — closing the panel while the payment is still too
  // low therefore leaves it closed, rather than fighting the user.
  useEffect(() => {
    if (status === 'payment-too-low') setShowAdvanced(true);
  }, [status]);

  const projectionInputs = useMemo(() => ({
    ...inputs,
    monthlyPayment,
    mortgageRate: inputs.mortgageRate / 100,
    helocRate:    inputs.helocRate    / 100,
  }), [inputs, monthlyPayment]);

  const projection = useMemo(
    () => (status !== 'ok' ? null : computeProjection(projectionInputs)),
    [projectionInputs, status],
  );

  // The month-by-month schedule behind the reveal. Same inputs as the headline
  // projection — it surfaces the very simulation the payoff date comes from — so
  // the month the mortgage clears here matches the hero.
  // Computed whenever the inputs are valid, NOT only when cycling wins. The
  // schedule is the simulation the verdict came out of, so withholding it in the
  // one case where the verdict is "this does not get you ahead" hides the
  // working from the only user who has a reason to check it.
  const schedule = useMemo(
    () => (status === 'ok' && projection && projection.originalMonths > 0
      ? computeCyclingSchedule(projectionInputs)
      : null),
    [projectionInputs, status, projection],
  );

  function updateField(field: keyof CalculatorInputs, next: number) {
    setEdited(true);
    setInputs(prev => ({ ...prev, [field]: next }));
  }

  function handleReset() {
    hapticLight();
    setEdited(false);
    setInputs(initialInputs);
    setTermYears(initialTermYears);
    setPaymentTouched((initialInputs.monthlyPayment ?? 0) > 0);
  }

  function handleTermChange(years: number) {
    hapticSelection();
    setEdited(true);
    setTermYears(years);
  }

  function toggleAdvanced() {
    hapticLight();
    animateLayout();
    setShowAdvanced(v => !v);
  }

  function toggleSchedule() {
    hapticLight();
    animateLayout();
    setShowSchedule(v => !v);
  }

  function toggleAssumptions() {
    hapticLight();
    animateLayout();
    setShowAssumptions(v => !v);
  }

  const hasGain = !!projection && projection.monthsSaved > 0;

  // The injection paid the mortgage off outright, so there is no payoff to
  // accelerate. Reachable whenever the balance is smaller than the injection —
  // a $15,000 balance against a $20,000 windfall — and without this the screen
  // fell into the "cycling doesn't help, add more surplus" branch, which is a
  // strange thing to tell someone whose mortgage is gone.
  const clearedOutright = !!projection && projection.originalMonths === 0;

  return (
    <View style={common.screenContainer}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          keyboardShouldPersistTaps="handled"
          // The screen whose whole premise is that the answer sits ABOVE the
          // inputs — so the reflex after typing a balance is to scroll up and
          // read the payoff. The keypad has a Done bar, but a drag should not
          // require finding it.
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ── The billboard. Everything above the fold is the answer. ────── */}
          <Hero
            intensity={0.85}
            topBar={<Text style={styles.topTitle}>Calculator</Text>}
          >
            <Text style={styles.heroEyebrow}>YOUR PROJECTED PAYOFF</Text>

            {status === 'ok' && projection ? (
              clearedOutright ? (
                <>
                  <HeroValue>Paid off</HeroValue>
                  <HeroCaption>
                    Your one-time injection covers the whole remaining balance, so
                    there is nothing left to accelerate.
                  </HeroCaption>
                </>
              ) : hasGain ? (
                <>
                  <HeroValue>{formatMonths(projection.acceleratedMonths)}</HeroValue>
                  <HeroCaption>
                    instead of {formatMonths(projection.originalMonths)} on your current schedule
                  </HeroCaption>
                  <View style={styles.heroMetaRow}>
                    <Text style={styles.heroMeta}>
                      {formatMonths(projection.monthsSaved)} sooner
                    </Text>
                    <Text style={styles.heroMetaDot}>·</Text>
                    <Text style={styles.heroMeta}>
                      ~{money(projection.interestSaved)} interest saved
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <HeroValue>{formatMonths(projection.originalMonths)}</HeroValue>
                  <HeroCaption>
                    Cycling doesn&apos;t change your payoff at these numbers. Add monthly
                    surplus below — that&apos;s the fuel the strategy runs on.
                  </HeroCaption>
                </>
              )
            ) : (
              <>
                <HeroValue>—</HeroValue>
                <HeroCaption>
                  {status === 'needs-balance'
                    ? 'Enter your remaining mortgage balance to see a projection.'
                    : 'That payment doesn’t cover the monthly interest, so the balance would never fall. Check the payment under Advanced.'}
                </HeroCaption>
              </>
            )}

            {/* The assumption is stated where the number is read, not only in
                a hint further down the page. */}
            <Text style={styles.heroDisclaimer}>
              {status === 'ok' && !paymentTouched
                ? `Assumes ${termYears} years left at the payment we calculated. Change the term below, or enter your actual payment under Advanced.`
                : 'Projected estimate from the numbers below. Not a guarantee.'}
            </Text>
          </Hero>

          <View style={styles.content}>
          {/* ── Three inputs. Everything else is behind Advanced. ──────────── */}
          <Card>
            <NumericField
              label="Remaining balance"
              prefix="$"
              value={inputs.mortgageBalance}
              onCommit={v => updateField('mortgageBalance', v)}
            />
            <NumericField
              label="Interest rate"
              suffix="%"
              value={inputs.mortgageRate}
              onCommit={v => updateField('mortgageRate', v)}
              decimals={2}
              keyboardType="decimal-pad"
            />
            <NumericField
              label="Monthly surplus to sweep"
              prefix="$"
              value={inputs.monthlySurplus}
              onCommit={v => updateField('monthlySurplus', v)}
              hint="What's left over each month after all expenses, including your mortgage payment"
            />

            {/* Promoted out of Advanced. Someone twelve years into a 30-year
                note is the normal case, not an edge case, and leaving this
                assumed produced a payment — and a saving — built on a term
                they do not have. Disabled once they type a real payment,
                because then the term is implied by the number they gave us. */}
            <TermPicker
              years={termYears}
              onChange={handleTermChange}
              disabled={paymentTouched}
              isLast
            />
          </Card>

          {/* ── YOUR LEVERS ─────────────────────────────────────────────────
              The two variables a user actually wants to push on, given a track
              instead of a keypad. Both are already editable as numbers above and
              under Advanced; these are the same fields, so dragging and typing
              stay in sync rather than being two sources of truth.

              Sliders earn their place on exactly these two and nowhere else on
              the screen: they are the inputs where the QUESTION is "how does this
              move the answer", which is a sweep, not a value. Balance and rate
              are facts a user looks up and types once — a slider would make
              precise figures fiddly to enter and imply they were guesses. */}
          <SectionLabel>YOUR LEVERS</SectionLabel>
          <Card>
            <LeverRow
              title="Monthly surplus"
              sub="Swept to the line each month — the fuel the strategy runs on"
              value={inputs.monthlySurplus}
              onChange={v => updateField('monthlySurplus', v)}
              soft={SURPLUS_TRACK.soft}
              step={SURPLUS_TRACK.step}
              a11y="Monthly surplus swept to the HELOC"
            />
            <LeverRow
              title="One-time injection"
              sub="A bonus, tax refund or sale, applied to principal today"
              value={inputs.lumpSum ?? 0}
              onChange={v => updateField('lumpSum', v)}
              soft={INJECTION_TRACK.soft}
              step={INJECTION_TRACK.step}
              a11y="One-time lump sum applied to principal"
              isLast
            />

            {/* The single most misreadable thing on this screen, said plainly.
                Without it, dragging the injection slider looks like it barely
                helps — when in fact it helps a great deal, just not because of
                cycling. See the note in prepare(). */}
            {(inputs.lumpSum ?? 0) > 0 && (
              <Text style={styles.leverNote}>
                Applied to both paths, so &ldquo;interest saved&rdquo; goes{' '}
                <Text style={styles.leverNoteEm}>down</Text> as you add more. You are better
                off; cycling is just doing less of the work.
              </Text>
            )}
          </Card>

          {/* ── THE REALITY CHECK ───────────────────────────────────────────
              Both paths stated in full rather than only their difference, so the
              figure the hero leads with can be checked against the two numbers
              it came from.

              The standard path's interest is GREY, not red. It is not an error
              or a warning — it is what a normal mortgage costs, and the palette
              rule exists precisely so this screen cannot editorialise with
              colour about a decision the user has not made yet. */}
          {projection && status === 'ok' && (
            <>
              <SectionLabel>THE REALITY CHECK</SectionLabel>
              <Card>
                <View style={styles.compareRow}>
                  <View style={styles.compareCol}>
                    <Text style={styles.compareTitle}>Standard path</Text>
                    <Text style={styles.compareTime}>
                      {formatMonths(projection.originalMonths)}
                    </Text>
                    <Text style={styles.compareCostPlain}>
                      {money(projection.originalInterest)} interest
                    </Text>
                  </View>

                  <View style={styles.vsBadge}>
                    <Text style={styles.vsText}>VS</Text>
                  </View>

                  <View style={[styles.compareCol, styles.compareColEnd]}>
                    <Text style={styles.compareTitle}>Cycling</Text>
                    <Text style={styles.compareTime}>
                      {formatMonths(projection.acceleratedMonths)}
                    </Text>
                    <Text style={styles.compareCostAccent}>
                      {money(projection.acceleratedInterest)} interest
                    </Text>
                  </View>
                </View>

                <Text style={styles.compareFoot}>
                  {clearedOutright
                    ? 'The injection covers the whole balance — neither schedule has anything left to run.'
                    : hasGain
                      ? `HELOC interest is already inside the figure on the right.`
                      : 'At these numbers cycling does not get ahead: the HELOC interest costs more than ' +
                        'the earlier principal saves.'}
                </Text>
              </Card>

              {/* ── WHERE THE SAVING COMES FROM ─────────────────────────────
                  The comparison above is against doing NOTHING, which is a
                  baseline that never spends the surplus. So its difference
                  contains two effects — the money being paid at all, and the
                  line it is routed through — and the headline attributes the
                  sum to the second.

                  Measured across realistic inputs the first is ~100% of it.
                  Cycling is a rate arbitrage: it gets ahead only when the line
                  is cheaper than the mortgage, and at a typical 8.5% line
                  against a 6.5% mortgage it is slightly negative. Splitting the
                  figure is the same move this screen already makes everywhere
                  else — state both numbers, not just their difference — and it
                  gives the user something actionable: the lever is the rate on
                  the line, and it is one they can go and shop for. */}
              {!clearedOutright && projection.interestSaved > 0 && (
                <Card>
                  <SectionHead
                    label="Where that saving comes from"
                    caps={false}
                    explain={WHERE_THE_SAVING_COMES_FROM}
                  />

                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>
                      Paying {money(inputs.monthlySurplus)}/mo at your principal
                    </Text>
                    <Text style={styles.breakdownValue}>{money(projection.fromSurplus)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Routing it through your line</Text>
                    <Text style={[
                      styles.breakdownValue,
                      projection.fromCycling < 0 && styles.breakdownValueMuted,
                    ]}>
                      {projection.fromCycling < 0 ? '−' : ''}
                      {money(Math.abs(projection.fromCycling))}
                    </Text>
                  </View>
                  <View style={[styles.breakdownRow, styles.breakdownRowLast]}>
                    <Text style={styles.breakdownLabelTotal}>Projected interest saved</Text>
                    <Text style={styles.breakdownValueTotal}>
                      {money(projection.interestSaved)}
                    </Text>
                  </View>

                  {/* Stays: someone reading a big "interest saved" figure must not
                      walk away believing cycling produced it when the surplus did. */}
                  <Text style={styles.breakdownNote}>
                    {projection.fromCycling >= 0
                      ? `Your line is cheaper than your mortgage, so cycling adds ${money(projection.fromCycling)}. ` +
                        'Most of the result is the surplus either way.'
                      : `Your line at ${inputs.helocRate}% costs more than your mortgage at ${inputs.mortgageRate}%. ` +
                        'Almost all of this is the surplus itself.'}
                  </Text>
                </Card>
              )}
            </>
          )}

          {/* ── Advanced disclosure ────────────────────────────────────────── */}
          <Card>
            <Touchable
              style={styles.advancedHeader}
              onPress={toggleAdvanced}
              accessibilityRole="button"
              accessibilityLabel={showAdvanced ? 'Hide advanced inputs' : 'Show advanced inputs'}
            >
              <Text style={styles.advancedTitle}>Advanced</Text>
              <View style={styles.advancedRight}>
                {!showAdvanced && (
                  <Text style={styles.advancedSummary}>
                    {money(monthlyPayment)}/mo · {inputs.helocRate}% · {money(helocLimit)} line
                    {paymentTouched ? '' : ` · ${termYears}yr`}
                  </Text>
                )}
                <Ionicons
                  name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </View>
            </Touchable>

            {showAdvanced && (
              <View style={styles.advancedBody}>
                <NumericField
                  label="Monthly payment (P&I)"
                  prefix="$"
                  value={monthlyPayment}
                  onCommit={v => { setPaymentTouched(true); updateField('monthlyPayment', v); }}
                  hint={paymentTouched
                    ? 'Your figure. Reset to defaults to go back to the calculated payment.'
                    : `Calculated from your balance and rate over ${termYears} years. Edit to override.`}
                />
                <NumericField
                  label="HELOC interest rate"
                  suffix="%"
                  value={inputs.helocRate}
                  onCommit={v => updateField('helocRate', v)}
                  decimals={2}
                  keyboardType="decimal-pad"
                  hint="Your HELOC's current APR"
                />
                <NumericField
                  label="HELOC amount"
                  prefix="$"
                  value={helocLimit}
                  onCommit={v => updateField('helocLimit', v)}
                  hint="The line drawn each cycle. Capped at 12× your surplus, so it can be repaid within a year."
                  isLast
                />
              </View>
            )}
          </Card>

          {/* ── Supporting detail, subordinate to the billboard ───────────────
              Gated on a valid projection, NOT on cycling winning. This card
              carries "How this is calculated" — the assumptions panel, which
              the note at the top of this file calls the reason the payoff
              number arrives with its model attached — and the month-by-month
              schedule underneath it. Hanging both on `hasGain` meant they
              vanished in exactly the case where a user has most reason to
              audit them: the screen said "at these numbers cycling does not
              get ahead" and then withdrew the working that produced it.

              That case is not an edge case. At a typical 8.5% line against a
              6.5% mortgage the routing is slightly negative on its own — see
              the note on "Where the saving comes from" below.

              Every row here is real either way: the dump size, the count, the
              HELOC interest and both payoff dates are outputs of the same
              simulation whichever direction it lands. */}
          {projection && hasGain && (
            <Card>
              <Text style={styles.sectionTitle}>How it gets there</Text>

              <BreakdownRow
                label="Swept to the HELOC each month"
                value={money(inputs.monthlySurplus)}
              />
              {schedule && (
                <>
                  <BreakdownRow
                    label="Principal dump per cycle"
                    value={money(schedule.dumpSize)}
                  />
                  <BreakdownRow
                    label="Dumps over the plan"
                    value={String(schedule.dumpCount)}
                  />
                  <BreakdownRow
                    label="HELOC interest paid (total)"
                    value={money(schedule.totalHelocInterest)}
                  />
                </>
              )}
              <BreakdownRow
                label="Payoff date, current schedule"
                value={projection.originalPayoffDate.toLocaleDateString('en-US', {
                  month: 'short', year: 'numeric',
                })}
              />
              <BreakdownRow
                label="Payoff date, cycling"
                value={projection.acceleratedPayoffDate.toLocaleDateString('en-US', {
                  month: 'short', year: 'numeric',
                })}
                isLast
              />

              {/* The mechanic, month by month: when each dump lands, the HELOC
                  interest charged while a balance is owed, and the surplus sweep
                  pulling it back down. Behind a tap so the headline reveal stays
                  clean for the reader who only wants the number.

                  Gated on there being DUMPS, not merely months. With no surplus
                  the simulation still returns a full-length schedule, and a
                  360-row table in which every dump column reads "—" is a worse
                  answer than no table. */}
              {schedule && schedule.dumpCount > 0 && (
                <>
                  <Touchable
                    style={styles.scheduleToggle}
                    onPress={toggleSchedule}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showSchedule }}
                    accessibilityLabel={showSchedule
                      ? 'Hide the month-by-month schedule'
                      : 'Show the month-by-month schedule'}
                  >
                    <Text style={styles.scheduleToggleText}>
                      {showSchedule ? 'Hide the month-by-month schedule' : 'Show the month-by-month schedule'}
                    </Text>
                    <Ionicons
                      name={showSchedule ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.accentInk}
                    />
                  </Touchable>

                  {showSchedule && (
                    <View style={styles.scheduleWrap}>
                      <Text style={styles.scheduleSummary}>
                        {schedule.dumpCount} dumps · {money(schedule.dumpSize)} each ·{' '}
                        {money(schedule.totalHelocInterest)} HELOC interest over{' '}
                        {formatMonths(schedule.payoffMonths)}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator
                        style={styles.scheduleScroll}
                      >
                        <View>
                          <View style={styles.mHead}>
                            <Text style={[styles.mHeadCell, styles.colWhen]}>When</Text>
                            <Text style={[styles.mHeadCell, styles.colNum]}>Dump</Text>
                            <Text style={[styles.mHeadCell, styles.colNum]}>HELOC owed</Text>
                            <Text style={[styles.mHeadCell, styles.colNum]}>HELOC int.</Text>
                            <Text style={[styles.mHeadCell, styles.colNum]}>Mortgage</Text>
                          </View>
                          {schedule.months.map(m => {
                            const isDump = m.dump > 0;
                            return (
                              <View key={m.month} style={[styles.mRow, isDump && styles.mRowDump]}>
                                <Text style={[styles.mCell, styles.colWhen]}>{whenLabel(m.month)}</Text>
                                <Text style={[styles.mCell, styles.colNum, isDump && styles.mDump]}>
                                  {isDump ? `↓ ${money(m.dump)}` : '—'}
                                </Text>
                                <Text style={[styles.mCell, styles.colNum]}>
                                  {m.helocDrawn > 0 ? money(m.helocDrawn) : '—'}
                                </Text>
                                <Text style={[styles.mCell, styles.colNum]}>
                                  {m.helocInterest > 0 ? money(m.helocInterest) : '—'}
                                </Text>
                                <Text style={[styles.mCell, styles.colNum]}>{money(m.mortgageBalance)}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                      <Text style={styles.scheduleNote}>
                        Balances are month-end. Projected estimate, not a guarantee.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </Card>
          )}

          {/* ── The model ───────────────────────────────────────────────────
              Its own card, and shown for ANY valid projection rather than only
              a winning one. It used to sit at the bottom of "How it gets
              there", which gated it on cycling getting ahead — so the one user
              whose numbers do not work, who has the most reason to audit the
              assumptions, was the one user who could not reach them. It was
              also seven rows down inside a card about acceleration, which is
              not where anyone looks for a list of caveats.

              The note at the top of this file says the payoff number should
              arrive with its assumptions rather than without them. A card of
              its own is what actually delivers that. */}
          {projection && status === 'ok' && (
            <Card>
              <Touchable
                style={styles.assumeToggle}
                onPress={toggleAssumptions}
                accessibilityRole="button"
                accessibilityState={{ expanded: showAssumptions }}
                accessibilityLabel={showAssumptions ? 'Hide how this is calculated' : 'How this is calculated'}
              >
                <Ionicons name="information-circle-outline" size={16} color={colors.accentInk} />
                <Text style={styles.assumeToggleText}>How this is calculated</Text>
                <Ionicons
                  name={showAssumptions ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.accentInk}
                />
              </Touchable>
              {showAssumptions && (
                <View style={styles.assumePanel}>
                  {ASSUMPTIONS.map((line, i) => (
                    <View key={i} style={styles.assumeItem}>
                      <Text style={styles.assumeBullet}>•</Text>
                      <Text style={styles.assumeText}>{line}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          )}

          {/* ── Contextual upgrade, shown against their own result ──────────── */}
          {tier === 'free' && hasGain && projection && (
            <Touchable
              style={styles.ctaBanner}
              onPress={() => router.push('/modals/upgrade')}
              accessibilityRole="button"
              accessibilityLabel="See Pro plans"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaTitle}>
                  Track this {formatMonths(projection.monthsSaved)} automatically
                </Text>
                <Text style={styles.ctaSub}>
                  Follow your real balances instead of these estimates.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.accentInk} />
            </Touchable>
          )}

          <Touchable
            style={styles.resetBtn}
            onPress={handleReset}
            accessibilityRole="button"
            accessibilityLabel="Reset to default values"
          >
            <Text style={styles.resetText}>Reset to defaults</Text>
          </Touchable>

          <Text style={styles.footnote}>
            Estimates only. Not financial advice, and not a lender.
          </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The Done bar for the number pads. Rendered once for the screen and
          referenced by every field. Android keypads have a system dismiss, so
          this is iOS-only rather than a cross-platform component. */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={KEYPAD_ACCESSORY_ID}>
          <View style={styles.keypadBar}>
            <Text style={styles.keypadHint} numberOfLines={1}>
              {status === 'ok' && projection && projection.monthsSaved > 0
                ? `${formatMonths(projection.monthsSaved)} sooner`
                : 'Results update as you type'}
            </Text>
            <Touchable
              style={styles.keypadDone}
              onPress={() => { Keyboard.dismiss(); }}
              accessibilityRole="button"
              accessibilityLabel="Done editing"
            >
              <Text style={styles.keypadDoneText}>Done</Text>
            </Touchable>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Years left on the note.
 *
 * Five chips for the common round numbers — tapping "20" beats opening a keypad —
 * plus a field for the term that isn't one of them: someone eleven years into a
 * 27-year refinance should not have to round. The chips and the field drive the
 * same value; typing a number no chip matches simply leaves none highlighted.
 * The whole control greys out once a real payment is entered under Advanced,
 * because then the term is implied by the number they gave us.
 */
function TermPicker({ years, onChange, disabled, isLast }: {
  years: number;
  onChange: (y: number) => void;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const termStyles = useTermStyles();
  const inputStyles = useInputStyles();
  // Raw keystrokes while focused; the parsed integer is what drives the math.
  // Same reason as NumericField — formatting mid-entry eats characters.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <View style={[inputStyles.group, isLast && inputStyles.groupLast]}>
      <Text style={inputStyles.label}>Years left on your mortgage</Text>
      <Text style={inputStyles.hint}>
        {disabled
          ? 'Not used — your payment below already implies a term.'
          : 'Sets the monthly payment we calculate. Tap a common term or type your own.'}
      </Text>
      <View style={termStyles.row}>
        {TERM_OPTIONS.map(y => {
          const active = !disabled && y === years;
          return (
            <Touchable
              key={y}
              style={[
                termStyles.chip,
                active && termStyles.chipActive,
                disabled && termStyles.chipDisabled,
              ]}
              onPress={() => { setDraft(null); onChange(y); }}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={`${y} years left`}
            >
              <Text style={[termStyles.chipText, active && termStyles.chipTextActive]}>
                {y}
              </Text>
            </Touchable>
          );
        })}
        <View style={[termStyles.customBox, disabled && termStyles.chipDisabled]}>
          <TextInput
            style={termStyles.customInput}
            value={draft ?? String(years)}
            onChangeText={(text) => {
              setDraft(text);
              const n = parsePositive(text);
              if (n !== null && n >= 1 && n <= 40) onChange(Math.round(n));
            }}
            onBlur={() => setDraft(null)}
            editable={!disabled}
            keyboardType="number-pad"
            maxLength={2}
            inputAccessoryViewID={Platform.OS === 'ios' ? KEYPAD_ACCESSORY_ID : undefined}
            selectTextOnFocus
            accessibilityLabel="Years left on your mortgage"
          />
          <Text style={termStyles.unit}>yrs</Text>
        </View>
      </View>
    </View>
  );
}

const useTermStyles = createThemedStyles(t => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  chip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.gray50,
  },
  chipActive: { backgroundColor: t.colors.mint600, borderColor: t.colors.mint600 },
  chipDisabled: { opacity: 0.45 },
  chipText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
  },
  chipTextActive: { color: t.colors.onAccent },
  unit: { fontSize: Typography.xs, color: t.colors.textMuted },
  customBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.borderField,
    backgroundColor: t.colors.gray50,
  },
  customInput: {
    minWidth: 26,
    textAlign: 'center',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    paddingVertical: Spacing[2],
  },

}));

/**
 * One draggable lever: title, live value, track.
 *
 * The value readout is the accent on this row and sits above the track rather
 * than beside the thumb — a figure that travels with the thumb is unreadable
 * mid-drag, which is the exact moment the user is looking at it.
 */
function LeverRow({
  title, sub, value, onChange, soft, step, a11y, isLast,
}: {
  title: string;
  sub: string;
  value: number;
  onChange: (v: number) => void;
  soft: number;
  step: number;
  a11y: string;
  isLast?: boolean;
}) {
  const styles = useStyles();
  const max = trackMax(value, soft, step);

  return (
    <View style={[styles.lever, isLast && styles.leverLast]}>
      <View style={styles.leverHead}>
        <View style={styles.leverHeadText}>
          <Text style={styles.leverTitle}>{title}</Text>
          <Text style={styles.leverSub}>{sub}</Text>
        </View>
        <Text style={styles.leverValue}>{money(value)}</Text>
      </View>
      <Slider
        value={value}
        onChange={onChange}
        min={0}
        max={max}
        step={step}
        minLabel="$0"
        // Says "+" only when the track has not already grown past its nominal
        // end, so the label never claims a ceiling the control does not have.
        maxLabel={max > soft ? money(max) : `${money(soft)}+`}
        formatValue={money}
        accessibilityLabel={a11y}
      />
    </View>
  );
}

/**
 * A numeric field that keeps the user's raw keystrokes while they type.
 *
 * Formatting the committed number straight back into the box eats characters
 * mid-entry: typing "6.5" would parse "6." to 6 and re-render "6", deleting the
 * decimal point before the 5 arrives. The draft string is what the user sees
 * while focused; the parsed number is what the math uses.
 */
function NumericField({
  label, prefix, suffix, value, onCommit, hint, decimals = 0, keyboardType, isLast,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: number;
  onCommit: (v: number) => void;
  hint?: string;
  decimals?: number;
  keyboardType?: 'numeric' | 'decimal-pad';
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  const inputStyles = useInputStyles();
  // Every field on this screen is a number pad, and iOS number pads have no
  // return key — so there was no affordance for putting the keyboard away at
  // all. Tapping the page worked, but only because keyboardShouldPersistTaps
  // happens to allow it, which is not something a user can be expected to
  // discover while half the results are hidden behind the keyboard.
  const [draft, setDraft] = useState<string | null>(null);

  const formatted = decimals > 0
    ? String(Number(value.toFixed(decimals)))
    : Math.round(value).toLocaleString();

  return (
    <View style={[inputStyles.group, isLast && inputStyles.groupLast]}>
      <Text style={inputStyles.label}>{label}</Text>
      {hint && <Text style={inputStyles.hint}>{hint}</Text>}
      <View style={inputStyles.row}>
        {prefix && <Text style={inputStyles.affix}>{prefix}</Text>}
        <TextInput
          style={inputStyles.input}
          value={draft ?? formatted}
          onChangeText={(text) => {
            setDraft(text);
            const n = parsePositive(text);
            if (n !== null) onCommit(n);
          }}
          onBlur={() => setDraft(null)}
          keyboardType={keyboardType ?? 'numeric'}
          inputAccessoryViewID={Platform.OS === 'ios' ? KEYPAD_ACCESSORY_ID : undefined}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          selectTextOnFocus
          accessibilityLabel={label}
        />
        {suffix && <Text style={inputStyles.affix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const useInputStyles = createThemedStyles(t => ({
  group: { marginBottom: Spacing[4] },
  groupLast: { marginBottom: 0 },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textSecondary,
    marginBottom: Spacing[1],
  },
  hint: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    marginBottom: Spacing[2],
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: t.colors.gray50,
    paddingHorizontal: Spacing[3],
  },
  affix: {
    fontSize: Typography.base,
    color: t.colors.textMuted,
    paddingVertical: Spacing[3],
  },
  input: {
    flex: 1,
    fontSize: Typography.base,
    color: t.colors.textPrimary,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    minHeight: 44,
  },
}));

function BreakdownRow({ label, value, isLast }: {
  label: string; value: string; isLast?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.breakdownRow, isLast && styles.breakdownRowLast]}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles(t => ({
  content: { paddingHorizontal: Spacing[4], gap: Spacing[4], paddingTop: Spacing[1] },

  // ── Hero ──────────────────────────────────────────────────────────────────
  topTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: OnDark.secondary,
    marginBottom: Spacing[5],
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: OnDark.muted,
    letterSpacing: 1.4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[2],
  },
  heroMeta: { fontSize: Typography.sm, color: OnDark.primary, fontWeight: Typography.semibold },
  heroMetaDot: { fontSize: Typography.sm, color: OnDark.faint },
  heroDisclaimer: {
    fontSize: Typography.xs,
    color: OnDark.faint,
    lineHeight: 17,
    marginTop: Spacing[3],
  },

  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    marginBottom: Spacing[3],
  },

  // ── Advanced ──────────────────────────────────────────────────────────────
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  advancedTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  advancedRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  advancedSummary: { fontSize: Typography.xs, color: t.colors.textMuted },
  advancedBody: { marginTop: Spacing[4] },

  // ── Breakdown ─────────────────────────────────────────────────────────────
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.gray100,
  },
  breakdownRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  breakdownLabel: { flex: 1, fontSize: Typography.sm, color: t.colors.textSecondary },
  breakdownValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },

  // ── Year-by-year schedule ─────────────────────────────────────────────────
  scheduleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    minHeight: 44,
    marginTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.gray100,
  },
  scheduleToggleText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },
  scheduleWrap: { marginTop: Spacing[1] },
  scheduleSummary: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 17,
    marginBottom: Spacing[3],
  },
  scheduleScroll: {
    borderTopWidth: 1,
    borderTopColor: t.colors.gray100,
  },
  mHead: {
    flexDirection: 'row',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  mHeadCell: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: t.colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  mRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.gray50,
  },
  mRowDump: { backgroundColor: t.colors.mint50 },
  mCell: { fontSize: Typography.xs, color: t.colors.textSecondary },
  mDump: { color: t.colors.mint700, fontWeight: Typography.semibold },
  colWhen: { width: 60 },
  colNum: { width: 96, textAlign: 'right', paddingLeft: Spacing[3] },
  scheduleNote: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 16,
    marginTop: Spacing[3],
  },

  // ── Assumptions panel ─────────────────────────────────────────────────────
  assumeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    minHeight: 44,
    marginTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.gray100,
  },
  assumeToggleText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },
  assumePanel: {
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  assumeItem: { flexDirection: 'row', gap: Spacing[2] },
  assumeBullet: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 18 },
  assumeText: { flex: 1, fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaBanner: {
    backgroundColor: t.colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  ctaTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: t.colors.mint700 },
  ctaSub: { fontSize: Typography.xs, color: t.colors.accentInk, marginTop: 2, lineHeight: 16 },

  // ── Keypad accessory ──────────────────────────────────────────────────────
  keypadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  keypadHint: { flex: 1, fontSize: Typography.xs, color: t.colors.textMuted },
  keypadDone: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
  },
  keypadDoneText: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },

  resetBtn: { alignItems: 'center', paddingVertical: Spacing[3], minHeight: 44, justifyContent: 'center' },
  resetText: { color: t.colors.textMuted, fontSize: Typography.sm },

  footnote: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
  },
  // ── Levers ────────────────────────────────────────────────────────────────
  lever: {
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  leverLast: { borderBottomWidth: 0, paddingBottom: Spacing[2] },
  leverHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[3],
    marginBottom: Spacing[1],
  },
  leverHeadText: { flex: 1 },
  leverTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  leverSub: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: 2 },
  leverValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: t.colors.accentInk,
  },
  leverNoteEm: { fontWeight: Typography.bold, color: t.colors.textPrimary },
  leverNote: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },

  // ── Reality check ─────────────────────────────────────────────────────────
  compareRow: { flexDirection: 'row', alignItems: 'center' },
  compareCol: { flex: 1 },
  compareColEnd: { alignItems: 'flex-end' },
  compareTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: t.colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: Spacing[2],
  },
  compareTime: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    marginBottom: 2,
  },
  // Grey, not red. The cost of a normal mortgage is not an error state, and the
  // palette has no red in it precisely so this screen cannot lean on alarm to
  // sell a strategy.
  compareCostPlain: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.gray500,
  },
  compareCostAccent: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: t.colors.accentInk,
  },
  vsBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing[3],
  },
  vsText: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: 0.5,
  },
  // Row, label and value are the shared `breakdown*` styles defined above with
  // the Advanced breakdown — same list shape, so they are reused rather than
  // forked. Only the total's emphasis and the negative tone are new.
  breakdownLabelTotal: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  // Negative is muted grey, never red — the line costing more than it saves is
  // an ordinary outcome of ordinary rates, not an error state.
  breakdownValueMuted: { color: t.colors.gray500 },
  breakdownValueTotal: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
  },
  breakdownNote: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
  compareFoot: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 17,
    marginTop: Spacing[4],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
}));
