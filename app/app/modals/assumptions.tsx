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
import { View, Text } from 'react-native';
import { Touchable } from '../../components/ui/press';
import { useRouter } from 'expo-router';
import ModalScreen from '../../components/ui/ModalScreen';
import FormField from '../../components/ui/FormField';
import { Card, Chip, Meter } from '../../components/ui/primitives';
import { SectionHead, Caveat, type ExplainContent } from '../../components/ui/Explain';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { parsePositive } from '../../lib/parseNumeric';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { formatMonths } from '../../lib/projections';
import { RATE_STRESS_STEPS_BPS } from '../../lib/config';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

/** Thresholds offered, not a free-text percentage. A 63% cap helps nobody. */
const THRESHOLD_STEPS = [0.6, 0.7, 0.8, 0.9];

// ── The prose that used to live on the canvas ──────────────────────────────
// Every string below was a paragraph rendered between a section title and its
// control. Together they made this screen — whose actual job is two number
// fields and a threshold picker — read as an essay. See components/ui/Explain
// for the rule that decides what moved here and what stayed.
const WHY_THESE: ExplainContent = {
  title: 'Your assumptions',
  body: [
    'Every payoff date and interest figure in the app is built on these two numbers. ' +
    'A projection is only as good as the surplus it assumes.',
    'They are in front of you rather than behind an "advanced" screen on purpose. ' +
    'Hiding them would imply a precision that is not there.',
  ],
};

const WHAT_TRANSACTIONS_SHOW: ExplainContent = {
  title: 'What your transactions show',
  body: [
    'These figures are averaged over whole months, with the current part-month left out. ' +
    'Annual and irregular costs are included on purpose — they are exactly what gets ' +
    'forgotten in an estimate.',
    'Money moving between your own accounts is excluded, and so is your mortgage payment, ' +
    'which is counted separately.',
    'Deposits we cannot identify as income are not counted either. Refunds and one-off ' +
    'gifts would otherwise inflate your surplus.',
    'The app shows this next to what you entered and stops there. It never substitutes. ' +
    'The derived figure is better evidence, but it is still an inference from categorised ' +
    'bank data, and the person who lives the life is better placed to judge it than the ' +
    'arithmetic is.',
  ],
};

const REPLENISH: ExplainContent = {
  title: 'Replenish threshold',
  body: [
    'This is how far the app is willing to see your line drawn before it stops recommending ' +
    'moves and starts pointing your surplus back at the balance.',
    'Lower keeps more emergency room. Higher pays the mortgage down faster.',
    'It is the single number that decides how much of your line the app will ever suggest ' +
    'drawing, which is why it is yours to set rather than ours to assume.',
  ],
};

const SURPLUS_MODEL: ExplainContent = {
  title: 'Surplus in the projection',
  body: [
    'A modelling choice, not an instruction to the app. HELOC Hero never moves money.',
    'This only decides whether the payoff projection assumes your whole surplus reaches ' +
    'the line every month, or that some of it does not. Leaving it off is the more ' +
    'conservative assumption.',
  ],
};

const RATE_STRESS: ExplainContent = {
  title: 'If your HELOC rate rose',
  body: [
    'A HELOC rate is variable, so the plan should be judged on more than today’s number.',
    'This changes nothing about your terms. It re-runs the payoff projection as if the ' +
    'rate were higher, so you can see what a spike would actually cost you before it ' +
    'happens rather than after.',
  ],
};

export default function AssumptionsModal() {
  const styles = useStyles();
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const f = useFinancials();

  const [income,    setIncome]    = useState(profile?.monthly_income   != null ? String(profile.monthly_income) : '');
  const [expenses,  setExpenses]  = useState(profile?.monthly_expenses != null ? String(profile.monthly_expenses) : '');
  const [threshold, setThreshold] = useState(f.replenishThreshold);
  const [assumeSweep, setAssumeSweep] = useState(profile?.auto_apply_surplus ?? false);
  const [saving,    setSaving]    = useState(false);
  /** Why the last save attempt did not land. Null while it has not failed. */
  const [error, setError] = useState<string | null>(null);

  const incomeNum   = parsePositive(income);
  const expensesNum = parsePositive(expenses);
  const surplus = (incomeNum ?? 0) - (expensesNum ?? 0) - f.payment;

  const d   = f.derivedCashflow;
  const gap = f.cashflowGap;
  const enteredIncomeNum   = incomeNum ?? 0;
  const enteredExpensesNum = expensesNum ?? 0;

  async function handleSave() {
    setSaving(true);
    const { error: saveError } = await updateProfile({
      monthly_income:      incomeNum,
      monthly_expenses:    expensesNum,
      replenish_threshold: threshold,
      auto_apply_surplus:  assumeSweep,
      // Typing over the figures makes them the user's own again, whatever they
      // were before. The label on every other screen follows this flag.
      cashflow_source:     'entered',
    });
    setSaving(false);

    // Never close on a failed write. The figures the user just typed are
    // still on screen and the fix is to press the same button again.
    if (saveError) {
      hapticError();
      setError(saveError);
      return;
    }

    setError(null);
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

    const { error: adoptError } = await updateProfile({
      ...(takeIncome ? { monthly_income: Math.round(d.monthlyIncome!) } : {}),
      monthly_expenses:    Math.round(d.monthlyExpenses),
      cashflow_source:     'derived',
      cashflow_derived_at: new Date().toISOString(),
    });

    // Adopt writes the same figures Save does, so it has the same duty to say
    // when it did not. It stays open either way — this fills the fields rather
    // than finishing the screen.
    if (adoptError) {
      hapticError();
      setError(adoptError);
      return;
    }
    setError(null);
    hapticSuccess();
  }

  return (
    <ModalScreen
      title="Assumptions"
      save={{ label: 'Save assumptions', onPress: handleSave, saving, error }}
      footnote="Changing these changes every payoff date and interest figure in the app."
    >
      {/* ── What the transactions say ─────────────────────────────────────
          Shown before the fields, because the whole point is that the user
          reads this and then decides — not that the app quietly replaces the
          figures they entered with its own arithmetic. */}
      {f.awaitingTransactions && (
        <Card>
          <SectionHead label="Gathering your history" caps={false} />
          <Caveat>Your bank is still sending your transactions. Usually a few minutes.</Caveat>
        </Card>
      )}

      {d?.usable && (
        <Card>
          <SectionHead
            label="What your transactions show"
            caps={false}
            right={<Chip label={`${d.coverageMonths} months`} tone="accent" />}
            explain={WHAT_TRANSACTIONS_SHOW}
          />

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

          {/* Stays on the canvas: it says the figure the projections run on is
              wrong, and in the risky direction it says every recommended move is
              too large. Nobody should have to open a sheet to find that out. */}
          {gap?.material && (
            <Text style={styles.gapLine}>
              {gap.risky
                ? `${money(Math.abs(gap.expenseGap))} a month more than your projections use — ` +
                  'every recommended move is larger than it should be.'
                : `${money(Math.abs(gap.expenseGap))} a month less than your projections use.`}
            </Text>
          )}

          {/* Also stays: only the spending figure is on offer below, and the
              button's own label is not enough to explain why. */}
          {!d.incomeConfident && (
            <Text style={styles.gapLine}>
              No regular income found here — usually pay landing in an account you have not linked.
            </Text>
          )}

          <Touchable
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
          </Touchable>

          {/* The audit trail keeps its FIGURES — a derived number the user
              cannot check is worse than one they typed, because it arrives with
              more authority. What moved to the ⓘ is the explanation of why each
              exclusion is made, which is the same three sentences every time. */}
          <Caveat lines={2}>
            {d.excludedCount > 0
              ? `${d.excludedCount} internal transfers (${money(d.excludedTotal)}) excluded`
              : 'No internal transfers found'}
            {d.unclassifiedInflow > 100
              ? ` · ${money(d.unclassifiedInflow)} of deposits unidentified`
              : ''}
            {` · ${d.coverageMonths} whole months`}
          </Caveat>
        </Card>
      )}

      <Card>
        <SectionHead label="Your figures" caps={false} explain={WHY_THESE} />
        {f.surplusBasis === 'trailing' && (
          <Text style={styles.basisNote}>
            From your transactions. Editing makes them yours again.
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
        {/* Stays: it explains why the rest of the app will go quiet. */}
        {surplus <= 0 && (
          <Text style={styles.warn}>
            With no surplus there is nothing to replenish a draw with, so no moves are recommended.
          </Text>
        )}
      </Card>

      <Card>
        <SectionHead label="Replenish threshold" caps={false} explain={REPLENISH} />

        <View style={styles.thresholdRow}>
          {THRESHOLD_STEPS.map(t => {
            const active = Math.abs(threshold - t) < 0.001;
            return (
              <Touchable
                key={t}
                style={[styles.thresholdChip, active && styles.thresholdChipActive]}
                onPress={() => { setThreshold(t); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${Math.round(t * 100)} percent`}
              >
                <Text style={[styles.thresholdText, active && styles.thresholdTextActive]}>
                  {Math.round(t * 100)}%
                </Text>
              </Touchable>
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
        <SectionHead label="Surplus in the projection" caps={false} explain={SURPLUS_MODEL} />
        <Touchable
          style={styles.toggleRow}
          onPress={() => { setAssumeSweep(v => !v); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: assumeSweep }}
          accessibilityLabel="Assume all surplus reaches the line"
        >
          <View style={[styles.checkbox, assumeSweep && styles.checkboxOn]}>
            {assumeSweep && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.toggleLabel}>
            Assume the full surplus reaches the line
          </Text>
        </Touchable>
      </Card>

      {/* ── Rate stress ───────────────────────────────────────────────────
          Pure arithmetic, no external data, and the best answer to "what if
          rates spike" — the first question a skeptical spouse asks. It teaches
          the user to test the base case rather than trust it. Lives here, beside
          the other assumptions it shares, rather than on the daily Accounts view. */}
      <Card>
        <SectionHead label="If your HELOC rate rose" caps={false} explain={RATE_STRESS} />
        <View style={styles.stressRow}>
          {RATE_STRESS_STEPS_BPS.map(bps => {
            const active = f.forwardRateDeltaBps === bps;
            return (
              <Touchable
                key={bps}
                style={[styles.stressChip, active && styles.stressChipActive]}
                // Fire-and-forget everywhere else in this file would be a bug;
                // here it is the one write that is genuinely disposable. It
                // stores which rate-stress chip is selected — a view setting,
                // not a figure any projection is saved from — and the chip
                // re-renders from `f.forwardRateDeltaBps`, so a failed write
                // simply leaves the selection where it was. Reported anyway,
                // because silence is what this whole pass is fixing.
                onPress={async () => {
                  const { error: stressError } = await updateProfile({ forward_rate_delta_bps: bps });
                  if (stressError) { hapticError(); setError(stressError); }
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={bps === 0 ? 'Today’s rate' : `Plus ${bps / 100} percent`}
              >
                <Text style={[styles.stressText, active && styles.stressTextActive]}>
                  {bps === 0 ? 'today' : `+${bps / 100}%`}
                </Text>
              </Touchable>
            );
          })}
        </View>
        <Text style={styles.stressResult}>
          At {rate(f.helocRate + f.forwardRateDeltaBps / 10_000)} you would be mortgage-free in{' '}
          {formatMonths(f.projection.acceleratedMonths)}, saving about ${fmtK(f.projection.interestSaved)} in interest.
        </Text>
      </Card>

      <Card>
        <SectionHead label="As it stands" caps={false} />
        <Text style={styles.result}>
          Mortgage-free in {formatMonths(f.projection.acceleratedMonths)}, around{' '}
          {f.projection.acceleratedPayoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
        </Text>
        {/* Never behind a disclosure. CLAUDE.md's honesty rule is explicit that
            payoff figures are always labelled projected, and a payoff date is
            the single most quotable number on this screen. */}
        <Caveat>Projected, not guaranteed.</Caveat>
      </Card>
    </ModalScreen>
  );
}

function money(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }
function rate(d: number) { return `${(d * 100).toFixed(2)}%`; }
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return Math.round(n).toLocaleString('en-US');
}

// Section titles and their paragraphs are gone from this file — SectionHead owns
// the first and the ⓘ owns the second. What is left here styles the figures.
const useStyles = createThemedStyles(t => ({
  compareRow: { flexDirection: 'row', alignItems: 'flex-start' },
  compareCol: { flex: 1, gap: 1 },
  compareDivider: {
    width: 1, alignSelf: 'stretch',
    backgroundColor: t.colors.borderSubtle,
    marginHorizontal: Spacing[4],
  },
  compareHead: {
    fontSize: Typography.xs, fontWeight: Typography.bold,
    color: t.colors.textMuted, letterSpacing: 0.6, marginBottom: Spacing[2],
  },
  compareValue: {
    fontSize: Typography.lg, fontWeight: Typography.semibold, color: t.colors.textPrimary,
  },
  compareLabel: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 16 },
  gapLine: {
    fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20,
    marginTop: Spacing[4], paddingTop: Spacing[3],
    borderTopWidth: 1, borderTopColor: t.colors.borderSubtle,
  },
  adoptBtn: {
    minHeight: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.colors.mint50,
    borderWidth: 1, borderColor: t.colors.mint200,
  },
  adoptText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },
  basisNote: {
    fontSize: Typography.xs, color: t.colors.textMuted,
    lineHeight: 17, marginBottom: Spacing[2],
  },

  derived: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing[2],
  },
  derivedLabel: { fontSize: Typography.sm, color: t.colors.textSecondary },
  derivedValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  // Negative numbers use muted grey, never red.
  derivedNegative: { color: t.colors.gray400 },
  warn: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18, marginTop: Spacing[2] },

  thresholdRow: { flexDirection: 'row', gap: Spacing[2] },
  thresholdChip: {
    flex: 1, minHeight: 46,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  thresholdChipActive: { backgroundColor: t.colors.mint600, borderColor: t.colors.mint600 },
  thresholdText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textSecondary },
  thresholdTextActive: { color: t.colors.onAccent },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    minHeight: 48,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: Radius.sm,
    borderWidth: 1.5, borderColor: t.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: t.colors.mint600, borderColor: t.colors.mint600 },
  checkmark: { color: t.colors.onAccent, fontSize: 14, fontWeight: '800' },
  toggleLabel: { flex: 1, fontSize: Typography.sm, color: t.colors.textPrimary, lineHeight: 20 },

  result: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 21 },

  stressRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  stressChip: {
    minHeight: 44, minWidth: 60,
    paddingHorizontal: Spacing[3],
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  stressChipActive: { backgroundColor: t.colors.mint600, borderColor: t.colors.mint600 },
  stressText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textSecondary },
  stressTextActive: { color: t.colors.onAccent },
  stressResult: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20, marginTop: Spacing[3] },
}));
