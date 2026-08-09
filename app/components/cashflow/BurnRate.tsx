// components/cashflow/BurnRate.tsx — am I spending faster than I planned to?
//
// The velocity chart above shows the shape; this reduces it to the one sentence
// a person can act on before the period is over. That timing is the entire
// value: a report at the end of the month tells you the surplus already slipped.
//
// ── Why this judges SPENDING and not net ───────────────────────────────────
// Income arrives in lumps and spending does not. Someone paid on the 15th is
// "behind plan" on net for half of every month no matter how carefully they
// spend, so a card that flagged that would be crying wolf twelve times a year.
// Spending accumulates smoothly, so a spend pace is a real signal — and it is
// also the only half of the equation the user can do anything about today.
//
// ── The colour is never the signal ─────────────────────────────────────────
// Over-pace is grey and carries the word "over"; on-pace is mint and carries the
// word. That is not a workaround for the monochrome palette — this is a card
// about someone's household spending, and red would frame an ordinary busy month
// as an error. `getBarColor` in lib/budget.ts is the one place that resolves.
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { getBarColor } from '../../lib/budget';
import type { BurnDiagnosis } from '../../lib/velocity';
import type { PeriodId } from '../../lib/spending';
import MachinedCard from '../ui/MachinedCard';

interface Props {
  burn: BurnDiagnosis;
  period: PeriodId;
}

export default function BurnRate({ burn, period }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors } = theme;

  const word = period === 'week' ? 'week' : period === 'month' ? 'month'
    : period === 'quarter' ? 'quarter' : 'year';

  // ── Scaling the track ─────────────────────────────────────────────────────
  // The track is scaled to whichever is larger, spend or plan, rather than to
  // the plan alone. Scaling to the plan means an over-pace month clamps its fill
  // at 100% — and the notch marking the plan then sits exactly under the end of
  // the fill, so the one state the card exists to show becomes the one state it
  // cannot draw. Headroom keeps the notch off the edge when spend is winning.
  const scale = burn.expectedToDate && burn.expectedToDate > 0
    ? Math.max(burn.expectedToDate, burn.outflow) * 1.06
    : null;
  const spendPct = scale ? (burn.outflow / scale) * 100 : null;
  const planPct  = scale && burn.expectedToDate ? (burn.expectedToDate / scale) * 100 : null;
  const fill = getBarColor(burn.outflow, burn.expectedToDate, theme);

  return (
    <MachinedCard>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>BURN RATE</Text>
        {burn.pace && (
          <View style={styles.tag}>
            <Ionicons
              name={burn.pace === 'over' ? 'trending-up' : burn.pace === 'under' ? 'trending-down' : 'remove'}
              size={12}
              color={colors.textSecondary}
            />
            <Text style={styles.tagText}>
              {burn.pace === 'over' ? 'over pace' : burn.pace === 'under' ? 'under pace' : 'on pace'}
            </Text>
          </View>
        )}
      </View>

      {/* ── The headline ──────────────────────────────────────────────────────
          Three genuinely different situations, and only one of them is a pace.
          Collapsing them into a single "—" was the temptation; it would leave
          the user unable to tell "we can't say yet" from "you told us nothing". */}
      <Text style={styles.headline}>
        {burn.tooEarly
          ? `Too early in the ${word} to call a pace`
          : burn.pacePct === null
            ? 'Add what you expect to spend and this tracks your pace against it'
            : burn.pace === 'on'
              ? 'Spending in line with your plan'
              : `Spending ${Math.abs(burn.pacePct).toFixed(0)}% ` +
                `${burn.pacePct > 0 ? 'above' : 'below'} your planned pace`}
      </Text>

      {spendPct !== null && (
        <>
          <View style={styles.track} accessibilityElementsHidden>
            <View
              style={[styles.fill, { width: `${Math.max(1.5, spendPct)}%`, backgroundColor: fill }]}
            />
            {/* Where an even pace would have put them by today. A notch on the
                track rather than a second number below it, because "you are
                here against where you meant to be" is a position. */}
            {planPct !== null && <View style={[styles.notch, { left: `${planPct}%` }]} />}
          </View>
          <View style={styles.trackKey}>
            <Text style={styles.trackKeyText}>Spent ${money(burn.outflow)}</Text>
            {burn.expectedToDate !== null && (
              <Text style={styles.trackKeyText}>
                Planned by today ${money(burn.expectedToDate)}
              </Text>
            )}
          </View>
        </>
      )}

      <View style={styles.figures}>
        <Figure label="Money in" value={burn.inflow} />
        <Figure label="Money out" value={burn.outflow} />
      </View>

      {/* ── What this pace lands on ───────────────────────────────────────────
          Spending is extrapolated at the measured daily rate; income is held at
          the planned figure rather than extrapolated, because someone three days
          into a month has usually not been paid and a projected income of zero
          would print a collapse that has not happened. See lib/velocity.ts. */}
      {burn.projectedNet !== null && burn.targetNet !== null && (
        <Text style={styles.projection}>
          At this pace this {word} lands at{' '}
          <Text style={styles.projectionStrong}>{signed(burn.projectedNet)}</Text>
          {' '}against the {signed(burn.targetNet)} you planned. Your spending is measured;
          income is held at the figure you gave, not projected.
        </Text>
      )}

      {burn.tooEarly && burn.plannedSpend !== null && (
        <Text style={styles.projection}>
          {burn.elapsed === 0
            ? `Nothing measured in this ${word} yet.`
            : `${burn.elapsed} day${burn.elapsed === 1 ? '' : 's'} in. ` +
              'A rate read off this few days swings by hundreds tomorrow, so it is not published.'}
        </Text>
      )}
    </MachinedCard>
  );
}

/** One of the two raw figures the pace is derived from. */
function Figure({ label, value }: { label: string; value: number }) {
  const styles = useStyles();
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>${money(value)}</Text>
    </View>
  );
}

/** Money with an explicit minus, never parentheses and never red. */
function signed(v: number): string {
  return `${v < 0 ? '−' : ''}$${money(Math.abs(v))}`;
}

function money(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    letterSpacing: 1.4,
    color: t.colors.textMuted,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: t.colors.machinedFar,
    borderWidth: 1,
    borderColor: t.colors.machinedEdge,
  },
  tagText: { fontSize: 11, fontWeight: Typography.semibold, color: t.colors.textSecondary },

  headline: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    lineHeight: 22,
    marginTop: Spacing[3],
  },

  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.semantic.ceilingTrack,
    marginTop: Spacing[3],
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { height: 8, borderRadius: 4 },
  notch: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 8,
    backgroundColor: t.colors.textMuted,
  },
  trackKey: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing[3],
    marginTop: 6,
  },
  trackKeyText: { fontSize: 11, color: t.colors.textMuted },

  figures: { flexDirection: 'row', gap: Spacing[6], marginTop: Spacing[4] },
  figure: { gap: 2 },
  figureLabel: { fontSize: 11, color: t.colors.textMuted },
  figureValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
    ...Typography.tabular,
  },

  projection: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing[3],
  },
  projectionStrong: { fontWeight: Typography.bold, color: t.colors.textPrimary },
}));
