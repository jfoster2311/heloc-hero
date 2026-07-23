// app/modals/assumptions.tsx — the inputs behind every projection, made editable.
//
// The argument for putting these in front of the user rather than behind an
// "advanced" disclosure: a payoff date is only as good as the surplus it
// assumes, and until someone links an account the app cannot check that surplus
// at all. Hiding the inputs would imply a precision that is not there.
//
// When transactions ARE available, this screen shows what they say next to what
// the user said — and stops. It never substitutes. The derived figure is better
// evidence, but it is still an inference from categorised bank data, and the
// person who lives the life is better placed to judge it than the arithmetic is.
//
// The replenish threshold is here too, because it is the single number that
// decides how much of the line the app is willing to recommend drawing. Someone
// who wants to keep more emergency room should be able to say so without
// arguing with a recommendation every month.
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import ModalScreen from '../../components/ui/ModalScreen';
import FormField from '../../components/ui/FormField';
import { Card, Chip, Meter } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { parsePositive } from '../../lib/parseNumeric';
import { hapticLight, hapticSuccess } from '../../lib/haptics';
import { formatMonths } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

/** Thresholds offered, not a free-text percentage. A 63% cap helps nobody. */
const THRESHOLD_STEPS = [0.6, 0.7, 0.8, 0.9];

export default function AssumptionsModal() {
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const f = useFinancials();

  const [income,    setIncome]    = useState(profile?.monthly_income   != null ? String(profile.monthly_income) : '');
  const [expenses,  setExpenses]  = useState(profile?.monthly_expenses != null ? String(profile.monthly_expenses) : '');
  const [threshold, setThreshold] = useState(f.replenishThreshold);
  const [assumeSweep, setAssumeSweep] = useState(profile?.auto_apply_surplus ?? false);
  const [saving,    setSaving]    = useState(false);

  const incomeNum   = parsePositive(income);
  const expensesNum = parsePositive(expenses);
  const surplus = (incomeNum ?? 0) - (expensesNum ?? 0) - f.payment;

  const d   = f.derivedCashflow;
  const gap = f.cashflowGap;
  const enteredIncomeNum   = incomeNum ?? 0;
  const enteredExpensesNum = expensesNum ?? 0;

  async function handleSave() {
    setSaving(true);
    await updateProfile({
      monthly_income:      incomeNum,
      monthly_expenses:    expensesNum,
      replenish_threshold: threshold,
      auto_apply_surplus:  assumeSweep,
      // Typing over the figures makes them the user's own again, whatever they
      // were before. The label on every other screen follows this flag.
      cashflow_source:     'entered',
    });
    setSaving(false);
    hapticSuccess();
    router.back();
  }

  /**
   * Adopt the derived figures.
   *
   * Fills the fields rather than saving straight off, so the user sees exactly
   * what they are agreeing to and can still edit before committing. Recording
   * the source is what lets the rest of the app say "your last 12 months"
   * instead of "your entered figures" — and stop claiming a precision it does
   * not have when the numbers really were typed.
   */
  async function handleAdopt() {
    if (!d?.usable || d.monthlyExpenses === null) return;
    hapticLight();

    // Income only comes across when we could actually identify it. Where a
    // salary lands in an account the user never linked, derived income is near
    // zero — adopting that would tell someone their income collapsed and hand
    // them a wildly wrong surplus. Expenses are still worth having on their own.
    const takeIncome = d.incomeConfident && d.monthlyIncome !== null;

    setExpenses(String(Math.round(d.monthlyExpenses)));
    if (takeIncome) setIncome(String(Math.round(d.monthlyIncome!)));

    await updateProfile({
      ...(takeIncome ? { monthly_income: Math.round(d.monthlyIncome!) } : {}),
      monthly_expenses:    Math.round(d.monthlyExpenses),
      cashflow_source:     'derived',
      cashflow_derived_at: new Date().toISOString(),
    });
    hapticSuccess();
  }

  return (
    <ModalScreen
      title="Assumptions"
      intro={
        d?.usable
          ? 'Every projection in the app is built on these. Your linked accounts give a ' +
            'second opinion below — compare, then decide which figures to run on.'
          : 'Every projection in the app is built on these. Link an account and the app can ' +
            'check them against what you actually spend.'
      }
      save={{ label: 'Save assumptions', onPress: handleSave, saving }}
      footnote="Changing these changes every payoff date and interest figure in the app."
    >
      {/* ── What the transactions say ─────────────────────────────────────
          Shown before the fields, because the whole point is that the user
          reads this and then decides — not that the app quietly replaces the
          figures they entered with its own arithmetic. */}
      {f.awaitingTransactions && (
        <Card>
          <Text style={styles.sectionTitle}>Gathering your history</Text>
          <Text style={styles.hint}>
            Your bank is still sending the last two years of transactions. It usually takes a
            few minutes, and nothing here is blocked while it arrives.
          </Text>
        </Card>
      )}

      {d?.usable && (
        <Card>
          <View style={styles.derivedHead}>
            <Text style={styles.sectionTitle}>What your transactions show</Text>
            <Chip label={`${d.coverageMonths} months`} tone="accent" />
          </View>

          <View style={styles.compareRow}>
            <View style={styles.compareCol}>
              <Text style={styles.compareHead}>You entered</Text>
              <Text style={styles.compareValue}>{money(enteredIncomeNum)}</Text>
              <Text style={styles.compareLabel}>income</Text>
              <Text style={[styles.compareValue, { marginTop: Spacing[3] }]}>
                {money(enteredExpensesNum)}
              </Text>
              <Text style={styles.compareLabel}>expenses</Text>
            </View>

            <View style={styles.compareDivider} />

            <View style={styles.compareCol}>
              <Text style={styles.compareHead}>Your accounts</Text>
              <Text style={styles.compareValue}>
                {d.incomeConfident ? money(d.monthlyIncome ?? 0) : '—'}
              </Text>
              <Text style={styles.compareLabel}>
                {d.incomeConfident ? 'income' : 'income not identifiable'}
              </Text>
              <Text style={[styles.compareValue, { marginTop: Spacing[3] }]}>
                {money(d.monthlyExpenses ?? 0)}
              </Text>
              <Text style={styles.compareLabel}>
                expenses · median {money(d.medianExpenses ?? 0)}
              </Text>
            </View>
          </View>

          {gap?.material && (
            <Text style={styles.gapLine}>
              {gap.risky
                ? `That is ${money(Math.abs(gap.expenseGap))} a month more than the figure your ` +
                  'projections currently use, which makes every recommended move larger than it should be.'
                : `That is ${money(Math.abs(gap.expenseGap))} a month less than the figure your ` +
                  'projections currently use.'}
            </Text>
          )}

          {/* The audit trail. A derived number the user cannot check is worse
              than the one they typed, because it arrives with more authority. */}
          <Text style={styles.auditLine}>
            {d.excludedCount > 0
              ? `${d.excludedCount} transfers totalling ${money(d.excludedTotal)} were left out — ` +
                'money moving between your own accounts, and your mortgage payment, which is ' +
                'counted separately.'
              : 'No internal transfers were detected in this window.'}
            {d.unclassifiedInflow > 100 &&
              ` ${money(d.unclassifiedInflow)} of deposits could not be identified as income, so ` +
              'they are not counted — refunds and one-off gifts would otherwise inflate your surplus.'}
          </Text>

          {!d.incomeConfident && (
            <Text style={styles.gapLine}>
              We could not identify regular income in this account — most often because pay
              lands somewhere you have not linked. Only the spending figure is offered below.
            </Text>
          )}

          <TouchableOpacity
            style={styles.adoptBtn}
            onPress={handleAdopt}
            accessibilityRole="button"
            accessibilityLabel={d.incomeConfident
              ? 'Use the income and spending figures from my accounts'
              : 'Use the spending figure from my accounts'}
          >
            <Text style={styles.adoptText}>
              {d.incomeConfident ? 'Use these figures' : 'Use the spending figure'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            Averaged over {d.coverageMonths} whole months, with the current part-month left out.
            Annual and irregular costs are included on purpose — they are exactly what gets
            forgotten in an estimate.
          </Text>
        </Card>
      )}

      <Card>
        {f.surplusBasis === 'trailing' && (
          <Text style={styles.basisNote}>
            These came from your transactions. Editing them makes them yours again.
          </Text>
        )}
        <FormField
          label="Monthly income"
          prefix="$"
          value={income}
          onChangeText={setIncome}
          keyboardType="numeric"
          placeholder="8500"
          hint="Take-home, after tax."
          accessibilityLabel="Monthly income"
        />
        <FormField
          label="Monthly expenses"
          prefix="$"
          value={expenses}
          onChangeText={setExpenses}
          keyboardType="numeric"
          placeholder="4200"
          hint="Everything except the mortgage payment below."
          accessibilityLabel="Monthly expenses"
        />

        <View style={styles.derived}>
          <Text style={styles.derivedLabel}>Mortgage payment</Text>
          <Text style={styles.derivedValue}>{money(f.payment)}</Text>
        </View>
        <View style={styles.derived}>
          <Text style={styles.derivedLabel}>Leaves a monthly surplus of</Text>
          <Text style={[styles.derivedValue, surplus < 0 && styles.derivedNegative]}>
            {surplus < 0 ? '−' : ''}{money(Math.abs(surplus))}
          </Text>
        </View>
        {surplus <= 0 && (
          <Text style={styles.warn}>
            With no surplus there is nothing to replenish a draw with, so the app will not
            recommend moving money to principal.
          </Text>
        )}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Replenish threshold</Text>
        <Text style={styles.hint}>
          How far the app is willing to see your line drawn before it stops recommending
          moves and starts pointing surplus back at the balance. Lower keeps more emergency
          room; higher pays the mortgage down faster.
        </Text>

        <View style={styles.thresholdRow}>
          {THRESHOLD_STEPS.map(t => {
            const active = Math.abs(threshold - t) < 0.001;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.thresholdChip, active && styles.thresholdChipActive]}
                onPress={() => { hapticLight(); setThreshold(t); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${Math.round(t * 100)} percent`}
              >
                <Text style={[styles.thresholdText, active && styles.thresholdTextActive]}>
                  {Math.round(t * 100)}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* The gauge shows where the threshold sits against today's balance —
            the same mark the dashboard draws, from the same value. */}
        <View style={{ marginTop: Spacing[3] }}>
          <Meter
            value={f.utilization ?? 0}
            marks={[{ at: threshold, label: `threshold ${Math.round(threshold * 100)}%` }]}
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Surplus in the projection</Text>
        <Text style={styles.hint}>
          A modelling choice, not an instruction to the app. HELOC Hero never moves money —
          this only decides whether the payoff projection assumes your surplus reaches the
          line every month, or that some of it does not.
        </Text>
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => { hapticLight(); setAssumeSweep(v => !v); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: assumeSweep }}
          accessibilityLabel="Assume all surplus reaches the line"
        >
          <View style={[styles.checkbox, assumeSweep && styles.checkboxOn]}>
            {assumeSweep && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.toggleLabel}>
            Assume the full surplus reaches the line each month
          </Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>As it stands</Text>
        <Text style={styles.result}>
          Mortgage-free in {formatMonths(f.projection.acceleratedMonths)}, around{' '}
          {f.projection.acceleratedPayoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
          Projected, not guaranteed.
        </Text>
      </Card>
    </ModalScreen>
  );
}

function money(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }

const styles = StyleSheet.create({
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },

  derivedHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: Spacing[3],
  },
  compareRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing[2] },
  compareCol: { flex: 1, gap: 1 },
  compareDivider: {
    width: 1, alignSelf: 'stretch',
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: Spacing[4],
  },
  compareHead: {
    fontSize: Typography.xs, fontWeight: Typography.bold,
    color: Colors.textMuted, letterSpacing: 0.6, marginBottom: Spacing[2],
  },
  compareValue: {
    fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary,
  },
  compareLabel: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
  gapLine: {
    fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20,
    marginTop: Spacing[4], paddingTop: Spacing[3],
    borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
  },
  auditLine: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  adoptBtn: {
    minHeight: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.mint50,
    borderWidth: 1, borderColor: Colors.mint200,
  },
  adoptText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.mint700 },
  basisNote: {
    fontSize: Typography.xs, color: Colors.textMuted,
    lineHeight: 17, marginBottom: Spacing[2],
  },
  hint: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18, marginTop: Spacing[1] },

  derived: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing[2],
  },
  derivedLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  derivedValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  // Negative numbers use muted grey, never red.
  derivedNegative: { color: Colors.gray400 },
  warn: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18, marginTop: Spacing[2] },

  thresholdRow: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
  thresholdChip: {
    flex: 1, minHeight: 46,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  thresholdChipActive: { backgroundColor: Colors.mint600, borderColor: Colors.mint600 },
  thresholdText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  thresholdTextActive: { color: Colors.white },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    minHeight: 48, marginTop: Spacing[3],
  },
  checkbox: {
    width: 24, height: 24, borderRadius: Radius.sm,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.mint600, borderColor: Colors.mint600 },
  checkmark: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  toggleLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 20 },

  result: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
});
