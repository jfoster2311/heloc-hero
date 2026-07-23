// app/modals/assumptions.tsx — the inputs behind every projection, made editable.
//
// The argument for putting these in front of the user rather than behind a
// "advanced" disclosure: a payoff date is only as good as the surplus it
// assumes, and the app cannot compute that surplus. There is no transactions
// table and nothing persists Plaid transactions, so income and expenses are
// figures the user gave us — which makes hiding them a way of implying a
// precision we do not have.
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
import { Card, Meter } from '../../components/ui/primitives';
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

  async function handleSave() {
    setSaving(true);
    await updateProfile({
      monthly_income:      incomeNum,
      monthly_expenses:    expensesNum,
      replenish_threshold: threshold,
      auto_apply_surplus:  assumeSweep,
    });
    setSaving(false);
    hapticSuccess();
    router.back();
  }

  return (
    <ModalScreen
      title="Assumptions"
      intro={
        'Every projection in the app is built on these. The app has no view of your ' +
        'transactions, so income and expenses are yours to state — and worth revisiting ' +
        'when your situation changes.'
      }
      save={{ label: 'Save assumptions', onPress: handleSave, saving }}
      footnote="Changing these changes every payoff date and interest figure in the app."
    >
      <Card>
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
