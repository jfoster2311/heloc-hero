// components/NetDebt.tsx — both debts as one number, because that is the one
// that is falling.
//
// This fixes a real trap in the strategy rather than decorating it. Mid-cycle
// the HELOC balance is UP — that is what a dump looks like from the line's side
// — and a user watching two balances separately sees one of them rise and reads
// it as backsliding, at exactly the moment they did the correct thing. Stacking
// them into a single bar moves the anchor to the total, which is the figure the
// strategy actually moves.
//
// ── The bar counts the drawn line AGAINST the user, on purpose ─────────────
// Nothing here nets the HELOC out or hides it behind a toggle. Mid-cycle, with a
// line freshly drawn, `vsSchedule` can legitimately read BEHIND the original
// note — and it should, because until that balance is repaid the money is
// genuinely still owed. A version of this card that quietly dropped the HELOC to
// keep the comparison flattering would be telling the exact lie the unified view
// exists to prevent.
import { View, Text } from 'react-native';
import { Card, CardHead } from './ui/primitives';
import { Typography, Spacing, Radius, Tracking } from '../lib/theme';
import { createThemedStyles } from '../lib/themeContext';
import type { NetDebt as NetDebtModel } from '../lib/strike';

export default function NetDebt({
  debt, onPress,
}: {
  debt: NetDebtModel;
  onPress?: () => void;
}) {
  const styles = useStyles();

  if (debt.total <= 0) {
    return (
      <Card>
        <CardHead title="What you owe" icon="layers-outline" />
        <Text style={styles.empty}>
          Add your mortgage and this shows both debts as the single number the
          strategy moves.
        </Text>
      </Card>
    );
  }

  const hasHeloc = debt.heloc > 0;
  const ahead = debt.vsSchedule !== null && debt.vsSchedule < 0;

  return (
    <Card onPress={onPress} accessibilityLabel="What you owe in total">
      <CardHead title="What you owe" icon="layers-outline" />

      <Text style={styles.total}>${fmt(debt.total)}</Text>
      <Text style={styles.caption}>
        {hasHeloc
          ? 'Your mortgage and your drawn line, together. This is the figure to watch — the split between them moves every cycle.'
          : 'Your mortgage. Once you draw the line, the amount drawn is added here rather than tracked apart from it.'}
      </Text>

      {/* One bar, two segments, separated by a surface gap so the boundary is a
          gap rather than a colour change — the two greens are adjacent steps of
          one ramp and would otherwise need to be told apart by shade alone. */}
      <View
        style={styles.bar}
        accessibilityRole="image"
        accessibilityLabel={
          hasHeloc
            ? `Total ${fmt(debt.total)} dollars: mortgage ${fmt(debt.mortgage)}, ` +
              `drawn line ${fmt(debt.heloc)}`
            : `Mortgage ${fmt(debt.mortgage)} dollars`
        }
      >
        <View style={[styles.segMortgage, { flex: Math.max(0.02, debt.mortgageShare) }]} />
        {hasHeloc && <View style={styles.segGap} />}
        {hasHeloc && (
          <View style={[styles.segHeloc, { flex: Math.max(0.02, 1 - debt.mortgageShare) }]} />
        )}
      </View>

      <View style={styles.legend}>
        <LegendItem label="Mortgage" value={`$${fmt(debt.mortgage)}`} tone="mortgage" />
        {hasHeloc && <LegendItem label="Drawn line" value={`$${fmt(debt.heloc)}`} tone="heloc" />}
      </View>

      {/* Omitted rather than estimated when the original note is not on file —
          see `scheduledBalance` in lib/strike.ts. */}
      {debt.vsSchedule !== null && (
        <View style={styles.compare}>
          <Text style={styles.compareText}>
            {ahead
              ? `That is $${fmt(Math.abs(debt.vsSchedule))} less than your original schedule says you would owe today.`
              : `That is $${fmt(debt.vsSchedule)} more than your original schedule says you would owe today` +
                (hasHeloc
                  ? ' — the drawn line is counted here, and comes back down as you repay it.'
                  : '.')}
          </Text>
        </View>
      )}
    </Card>
  );
}

function LegendItem({ label, value, tone }: {
  label: string;
  value: string;
  tone: 'mortgage' | 'heloc';
}) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, tone === 'heloc' ? styles.swatchHeloc : styles.swatchMortgage]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function fmt(n: number) { return Math.round(Math.abs(n)).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  empty: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  total: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  caption: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    marginTop: 2,
  },

  bar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: Spacing[4],
  },
  // The two ends of the breakdown ramp, which is already ΔE-validated in both
  // themes — reusing it means the bar cannot drift out of step with the ring.
  segMortgage: { backgroundColor: t.categoryRamp.steps[0], height: '100%' },
  segHeloc:    { backgroundColor: t.categoryRamp.steps[2], height: '100%' },
  segGap:      { width: 2, backgroundColor: t.colors.surface, height: '100%' },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[4],
    marginTop: Spacing[3],
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  swatchMortgage: { backgroundColor: t.categoryRamp.steps[0] },
  swatchHeloc:    { backgroundColor: t.categoryRamp.steps[2] },
  legendLabel: { fontSize: Typography.xs, color: t.colors.textSecondary },
  legendValue: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },

  compare: {
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: Spacing[4],
  },
  compareText: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
}));
