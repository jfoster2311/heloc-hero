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
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager,
  InputAccessoryView, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useMemo, useEffect } from 'react';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import { Card } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { computeProjection, computePayoffSchedule, formatMonths, calcMonthlyPayment } from '../../lib/projections';
import { parsePositive } from '../../lib/parseNumeric';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, OnDark, CommonStyles, TAB_BAR_CLEARANCE } from '../../lib/theme';
import type { CalculatorInputs } from '../../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Years LEFT on the note, not the original term. Most people running this
// calculator are part-way through a mortgage, and assuming a fresh 30-year
// schedule overstates the remaining term — and therefore the saving — for every
// one of them. 30 stays the default because it is the common case on day one,
// but it is now a stated assumption the user can correct in one tap.
const TERM_OPTIONS = [10, 15, 20, 25, 30] as const;
const DEFAULT_TERM_YEARS = 30;

/** Shared by every field, so one bar serves the whole screen. iOS only. */
const KEYPAD_ACCESSORY_ID = 'calculator-keypad';

// Realistic defaults so the screen opens with a believable answer already on it.
const GENERIC_DEFAULTS: CalculatorInputs = {
  mortgageBalance: 400000,
  mortgageRate:    6.5,   // displayed as % — divided by 100 before compute
  monthlyPayment:  0,     // 0 = derive from balance + rate (see derivedPayment)
  monthlySurplus:  600,
  helocRate:       8.5,
};

function firstBalance(accounts: any[], type: string): number | null {
  const linked = accounts.find((a: any) => a.account_type === type);
  return linked?.accounts?.[0]?.balances?.current ?? null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalculatorScreen() {
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

  // The year-by-year schedule behind the reveal. Same inputs as the headline
  // projection, so the year the cycling column hits $0 matches the hero.
  const schedule = useMemo(
    () => (status === 'ok' && projection && projection.monthsSaved > 0
      ? computePayoffSchedule(projectionInputs)
      : []),
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAdvanced(v => !v);
  }

  function toggleSchedule() {
    hapticLight();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowSchedule(v => !v);
  }

  const hasGain = !!projection && projection.monthsSaved > 0;

  return (
    <View style={CommonStyles.screenContainer}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── The billboard. Everything above the fold is the answer. ────── */}
          <Hero
            intensity={0.85}
            topBar={<Text style={styles.topTitle}>Calculator</Text>}
          >
            <Text style={styles.heroEyebrow}>YOUR PROJECTED PAYOFF</Text>

            {status === 'ok' && projection ? (
              hasGain ? (
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

          {/* ── Advanced disclosure ────────────────────────────────────────── */}
          <Card>
            <TouchableOpacity
              style={styles.advancedHeader}
              onPress={toggleAdvanced}
              accessibilityRole="button"
              accessibilityLabel={showAdvanced ? 'Hide advanced inputs' : 'Show advanced inputs'}
            >
              <Text style={styles.advancedTitle}>Advanced</Text>
              <View style={styles.advancedRight}>
                {!showAdvanced && (
                  <Text style={styles.advancedSummary}>
                    {money(monthlyPayment)}/mo · {inputs.helocRate}% HELOC
                    {paymentTouched ? '' : ` · ${termYears}yr`}
                  </Text>
                )}
                <Ionicons
                  name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textMuted}
                />
              </View>
            </TouchableOpacity>

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
                  isLast
                />
              </View>
            )}
          </Card>

          {/* ── Supporting detail, subordinate to the billboard ─────────────── */}
          {projection && hasGain && (
            <Card>
              <Text style={styles.sectionTitle}>How it gets there</Text>

              <BreakdownRow
                label="Swept to the HELOC each month"
                value={money(inputs.monthlySurplus)}
              />
              <BreakdownRow
                label="Principal dump per cycle"
                value={money(inputs.monthlySurplus * 12)}
              />
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

              {/* The schedule makes the saving concrete: two balance columns, and
                  the cycling one reaches $0 years before the current plan. Behind
                  a tap so the reveal stays clean for the reader who just wants the
                  headline. */}
              {schedule.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.scheduleToggle}
                    onPress={toggleSchedule}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showSchedule }}
                    accessibilityLabel={showSchedule
                      ? 'Hide the year-by-year schedule'
                      : 'Show the year-by-year schedule'}
                  >
                    <Text style={styles.scheduleToggleText}>
                      {showSchedule ? 'Hide the year-by-year schedule' : 'Show the year-by-year schedule'}
                    </Text>
                    <Ionicons
                      name={showSchedule ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.mint600}
                    />
                  </TouchableOpacity>

                  {showSchedule && (
                    <View style={styles.scheduleTable}>
                      <View style={styles.scheduleHead}>
                        <Text style={[styles.scheduleHeadCell, styles.scheduleYearCol]}>Year</Text>
                        <Text style={[styles.scheduleHeadCell, styles.scheduleNumCol]}>Current plan</Text>
                        <Text style={[styles.scheduleHeadCell, styles.scheduleNumCol]}>With cycling</Text>
                      </View>
                      {schedule.map(row => (
                        <View key={row.year} style={styles.scheduleRow}>
                          <Text style={[styles.scheduleCell, styles.scheduleYearCol]}>{row.year}</Text>
                          <Text style={[styles.scheduleCell, styles.scheduleNumCol]}>{money(row.baseline)}</Text>
                          <Text
                            style={[
                              styles.scheduleCell,
                              styles.scheduleNumCol,
                              row.cycling === 0 && styles.schedulePaid,
                            ]}
                          >
                            {row.cycling === 0 ? 'Paid off' : money(row.cycling)}
                          </Text>
                        </View>
                      ))}
                      <Text style={styles.scheduleNote}>
                        Mortgage balance at each year-end. Projected estimate, not a guarantee.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </Card>
          )}

          {/* ── Contextual upgrade, shown against their own result ──────────── */}
          {tier === 'free' && hasGain && projection && (
            <TouchableOpacity
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
                  Connect your accounts and HELOC Hero follows your real balances instead
                  of these estimates.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.mint600} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleReset}
            accessibilityRole="button"
            accessibilityLabel="Reset to default values"
          >
            <Text style={styles.resetText}>Reset to defaults</Text>
          </TouchableOpacity>

          <Text style={styles.footnote}>
            Estimates only, based on the values above. Not financial advice, and not a lender.
            Results vary with rates, spending, and how consistently the strategy is followed.
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
            <TouchableOpacity
              style={styles.keypadDone}
              onPress={() => { hapticLight(); Keyboard.dismiss(); }}
              accessibilityRole="button"
              accessibilityLabel="Done editing"
            >
              <Text style={styles.keypadDoneText}>Done</Text>
            </TouchableOpacity>
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
            <TouchableOpacity
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
            </TouchableOpacity>
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

const termStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  chip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
  },
  chipActive: { backgroundColor: Colors.mint600, borderColor: Colors.mint600 },
  chipDisabled: { opacity: 0.45 },
  chipText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
  },
  chipTextActive: { color: Colors.white },
  unit: { fontSize: Typography.xs, color: Colors.textMuted },
  customBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
  },
  customInput: {
    minWidth: 26,
    textAlign: 'center',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    paddingVertical: Spacing[2],
  },
});

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
          placeholderTextColor={Colors.textMuted}
          selectTextOnFocus
          accessibilityLabel={label}
        />
        {suffix && <Text style={inputStyles.affix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  group: { marginBottom: Spacing[4] },
  groupLast: { marginBottom: 0 },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing[1],
  },
  hint: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginBottom: Spacing[2],
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing[3],
  },
  affix: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    paddingVertical: Spacing[3],
  },
  input: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    minHeight: 44,
  },
});

function BreakdownRow({ label, value, isLast }: {
  label: string; value: string; isLast?: boolean;
}) {
  return (
    <View style={[styles.breakdownRow, isLast && styles.breakdownRowLast]}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    color: Colors.textPrimary,
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
    color: Colors.textPrimary,
  },
  advancedRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  advancedSummary: { fontSize: Typography.xs, color: Colors.textMuted },
  advancedBody: { marginTop: Spacing[4] },

  // ── Breakdown ─────────────────────────────────────────────────────────────
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  breakdownRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  breakdownLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  breakdownValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
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
    borderTopColor: Colors.gray100,
  },
  scheduleToggleText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint600,
  },
  scheduleTable: { marginTop: Spacing[1] },
  scheduleHead: {
    flexDirection: 'row',
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  scheduleHeadCell: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray50,
  },
  scheduleCell: { fontSize: Typography.sm, color: Colors.textSecondary },
  scheduleYearCol: { width: 44 },
  scheduleNumCol: { flex: 1, textAlign: 'right' },
  schedulePaid: { color: Colors.mint600, fontWeight: Typography.semibold },
  scheduleNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: Spacing[3],
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaBanner: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  ctaTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.mint700 },
  ctaSub: { fontSize: Typography.xs, color: Colors.mint600, marginTop: 2, lineHeight: 16 },

  // ── Keypad accessory ──────────────────────────────────────────────────────
  keypadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  keypadHint: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted },
  keypadDone: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
  },
  keypadDoneText: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.mint600,
  },

  resetBtn: { alignItems: 'center', paddingVertical: Spacing[3], minHeight: 44, justifyContent: 'center' },
  resetText: { color: Colors.textMuted, fontSize: Typography.sm },

  footnote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
  },
});
