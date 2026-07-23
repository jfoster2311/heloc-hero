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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { computeProjection, formatMonths, calcMonthlyPayment } from '../../lib/projections';
import { parsePositive } from '../../lib/parseNumeric';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';
import type { CalculatorInputs } from '../../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STANDARD_TERM_MONTHS = 360;

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

  const [inputs, setInputs] = useState<CalculatorInputs>(initialInputs);
  const [paymentTouched, setPaymentTouched] = useState(
    () => (initialInputs.monthlyPayment ?? 0) > 0,
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Until the user edits it, the payment is a real amortization of the balance
  // and rate they can see — not a fixed guess that silently contradicts them.
  const derivedPayment = useMemo(
    () => calcMonthlyPayment(
      inputs.mortgageBalance,
      inputs.mortgageRate / 100,
      STANDARD_TERM_MONTHS,
    ),
    [inputs.mortgageBalance, inputs.mortgageRate],
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

  const projection = useMemo(() => {
    if (status !== 'ok') return null;
    return computeProjection({
      ...inputs,
      monthlyPayment,
      mortgageRate: inputs.mortgageRate / 100,
      helocRate:    inputs.helocRate    / 100,
    });
  }, [inputs, monthlyPayment, status]);

  function updateField(field: keyof CalculatorInputs, next: number) {
    setInputs(prev => ({ ...prev, [field]: next }));
  }

  function handleReset() {
    setInputs(initialInputs);
    setPaymentTouched((initialInputs.monthlyPayment ?? 0) > 0);
  }

  function toggleAdvanced() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAdvanced(v => !v);
  }

  const hasGain = !!projection && projection.monthsSaved > 0;

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── The billboard. Everything above the fold is the answer. ────── */}
          <View style={styles.billboard}>
            <Text style={styles.billboardLabel}>YOUR PROJECTED PAYOFF</Text>

            {status === 'ok' && projection ? (
              hasGain ? (
                <>
                  <Text style={styles.billboardHero}>
                    {formatMonths(projection.acceleratedMonths)}
                  </Text>
                  <Text style={styles.billboardSub}>
                    instead of {formatMonths(projection.originalMonths)} on your current schedule
                  </Text>
                  <View style={styles.billboardMetaRow}>
                    <Text style={styles.billboardMeta}>
                      {formatMonths(projection.monthsSaved)} sooner
                    </Text>
                    <Text style={styles.billboardMetaDot}>·</Text>
                    <Text style={styles.billboardMeta}>
                      ~{money(projection.interestSaved)} interest saved
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.billboardHero}>
                    {formatMonths(projection.originalMonths)}
                  </Text>
                  <Text style={styles.billboardSub}>
                    Cycling doesn&apos;t change your payoff at these numbers. Add monthly
                    surplus below — that&apos;s the fuel the strategy runs on.
                  </Text>
                </>
              )
            ) : (
              <>
                <Text style={styles.billboardHero}>—</Text>
                <Text style={styles.billboardSub}>
                  {status === 'needs-balance'
                    ? 'Enter your remaining mortgage balance to see a projection.'
                    : 'That payment doesn’t cover the monthly interest, so the balance would never fall. Check the payment under Advanced.'}
                </Text>
              </>
            )}

            {/* The derived payment assumes a fresh 30-year schedule, which
                overstates the remaining term — and so the saving — for anyone
                part-way through a mortgage. Say so where the number is read,
                not only in the Advanced hint. */}
            <Text style={styles.billboardDisclaimer}>
              {status === 'ok' && !paymentTouched
                ? 'Assumes a 30-year schedule. Enter your actual monthly payment under Advanced for a figure based on your real term.'
                : 'Projected estimate from the numbers below. Not a guarantee.'}
            </Text>
          </View>

          {/* ── Three inputs. Everything else is behind Advanced. ──────────── */}
          <View style={CommonStyles.card}>
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
              isLast
            />
          </View>

          {/* ── Advanced disclosure ────────────────────────────────────────── */}
          <View style={CommonStyles.card}>
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
                    : 'Calculated from your balance and rate over 30 years. Edit to override.'}
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
          </View>

          {/* ── Supporting detail, subordinate to the billboard ─────────────── */}
          {projection && hasGain && (
            <View style={CommonStyles.card}>
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
            </View>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  // ── Billboard ─────────────────────────────────────────────────────────────
  billboard: {
    alignItems: 'center',
    paddingTop: Spacing[6],
    paddingBottom: Spacing[5],
    paddingHorizontal: Spacing[4],
    gap: Spacing[1],
  },
  billboardLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: Spacing[1],
  },
  // The one accent element on the screen.
  billboardHero: {
    fontSize: Typography['4xl'],
    fontWeight: Typography.extrabold,
    color: Colors.mint600,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  billboardSub: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  billboardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[2],
  },
  billboardMeta: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.semibold },
  billboardMetaDot: { fontSize: Typography.sm, color: Colors.textMuted },
  billboardDisclaimer: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing[2],
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
