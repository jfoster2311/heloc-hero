// components/dashboard/MonolithHero.tsx — the one number the dashboard is about.
//
// Unified net debt: the mortgage plus whatever is drawn on the line. Those are
// two balances the user otherwise has to add up themselves, and the whole point
// of cycling is that moving money between them changes nothing — only paying it
// down does. One figure makes that legible; two invite the arithmetic.
//
// ── The honesty constraints on this surface ────────────────────────────────
// 1. A drawn balance we do not have is UNKNOWN, never zero. Summing a null as 0
//    would understate someone's debt on the largest number in the app. When
//    that happens this shows the mortgage alone and says so.
// 2. The curve is a PROJECTION. There is no stored balance history to draw, so
//    the caption says "projected" and the payoff pill says "projected" too.
// 3. The pill is a date the model produced, not a promise. "Projected
//    mortgage-free" — never "you will be".
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DebtCurve from './DebtCurve';
import { Typography, Spacing, Radius, Tracking, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { NetDebt } from '../../lib/strike';

interface Props {
  /**
   * The already-computed unified figure, from lib/strike `computeNetDebt`.
   *
   * Taken whole rather than re-summed from two balances. The NetDebt card lower
   * on this screen shows the same number, and a hero that added it up its own
   * way would eventually disagree with the card it sits above.
   */
  debt: NetDebt;
  /** The single derivation of "there is a line and we do not know what is on it". */
  helocBalanceUnknown: boolean;
  /** Projected debt at each sampled month, present first. */
  curve: number[];
  /** Projected mortgage-free date, or null when it cannot be modelled. */
  payoffDate: Date | null;
  /** False when the figures are illustrative rather than this user's own. */
  hasRealData?: boolean;
  /** Measured width available to the hero. */
  width: number;
}

const CHART_H = 116;

export default function MonolithHero({
  debt, helocBalanceUnknown, curve, payoffDate, hasRealData = true, width,
}: Props) {
  const styles = useStyles();
  const { colors, mode } = useTheme();

  // Both stops are measured, because text lands anywhere along the diagonal and
  // the LIGHTER stop is the one that has to hold. Composited against it:
  //
  //   light  #166534 -> #14532D   white 7.13/9.11 · secondary 4.56/5.59 · neon 4.09/5.23
  //   dark   #14532D -> #0C3D22   white 9.11/12.31 · secondary 5.59/7.17 · neon 5.23/7.06
  //
  // The dark pair started at #1B6B43 and was darkened: `secondary` measured
  // 4.24 there, which fails AA for the 11pt caption. Any lighter stop breaks
  // that pairing first — check it before adjusting these.
  const gradient: readonly [string, string] =
    mode === 'dark' ? ['#14532D', '#0C3D22'] : ['#166534', '#14532D'];

  // `computeNetDebt` coerces an unknown drawn balance to 0, which is right for
  // its own purposes and wrong for the largest figure on the screen: it would
  // quietly present a partial total as if it were the whole debt. So when the
  // line's balance is missing this shows the mortgage alone and relabels
  // itself. `helocBalanceUnknown` is READ here, never re-derived — useFinancials
  // is the one place that question gets answered.
  const partial = helocBalanceUnknown;
  const total = partial ? debt.mortgage : debt.total;
  const hasFigure = debt.total > 0 || debt.mortgage > 0;

  return (
    <View style={[styles.shell, { width }]}>
      {/* The machined face of the monolith.
          ── Why this is a gradient and not a BlurView ────────────────────────
          The brief asked for frosted glass, and a BlurView here was removed
          after being built: this hero scrolls WITH the page rather than over
          it, so what sits behind it is the flat canvas colour. Blurring a flat
          colour returns that same colour — it rendered nothing and cost a GPU
          pass per frame. Glass only reads when something varied is behind it.
          Reinstate the blur the day this becomes a sticky/overlay header, and
          re-measure the two ink pairings below when you do, because a
          translucent surface has no fixed background to measure against. */}
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Behind the number, deliberately. It gives the figure a horizon to sit
          on; it is not a chart anyone is meant to read values off. */}
      <View style={styles.chartLayer} pointerEvents="none">
        <DebtCurve
          points={curve}
          width={width}
          height={CHART_H}
          color={colors.neon}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          {partial ? 'MORTGAGE BALANCE' : 'UNIFIED NET DEBT'}
        </Text>

        {hasFigure ? (
          <Text
            style={styles.figure}
            // Read as one amount rather than digit-by-digit.
            accessibilityLabel={`${partial ? 'Mortgage balance' : 'Unified net debt'} ${Math.round(total).toLocaleString('en-US')} dollars`}
          >
            ${Math.round(total).toLocaleString('en-US')}
          </Text>
        ) : (
          <Text style={styles.figureEmpty}>Add your mortgage</Text>
        )}

        {/* Says what the number leaves out, at the moment it leaves it out —
            rather than a general disclaimer nobody reads. */}
        <Text style={styles.caption}>
          {partial
            ? 'Your line’s balance is not in yet, so this is the mortgage only.'
            : hasRealData
              ? 'Mortgage plus what’s drawn on your line. Curve is projected.'
              : 'Example figures. Add your accounts to see your own.'}
        </Text>
      </View>

      {payoffDate && hasFigure && (
        <View style={styles.pill}>
          <View style={styles.pillDot} />
          <Text style={styles.pillText}>
            Projected mortgage-free:{' '}
            {payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </Text>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  shell: {
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    minHeight: 208,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: OnDark.hairline,
    ...t.shadows.ambient,
  },
  chartLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Sits low so the curve reads as a floor under the figure rather than as a
    // line through it.
    bottom: 52,
    opacity: 0.9,
  },
  content: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[6],
    paddingBottom: Spacing[4],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.semibold,
    letterSpacing: Tracking.monolith,
    // NOT the neon. At 11pt this is normal-size text needing 4.5:1, and the
    // neon measures 4.09 on heroTint — fine for the 48pt figure below, short
    // here. White measures 7.13. See the `neon` note in theme.ts.
    color: OnDark.secondary,
  },
  figure: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: Typography.extrabold,
    letterSpacing: Tracking.display,
    color: OnDark.accent,
    marginTop: Spacing[1],
    // Large text (>=24pt) so 3:1 applies; 4.09 clears it comfortably.
    ...Typography.tabular,
  },
  figureEmpty: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.semibold,
    color: OnDark.primary,
    marginTop: Spacing[1],
  },
  caption: {
    fontSize: Typography.xs,
    // `OnDark.faint` was the obvious choice and fails here: composited over the
    // hero's lighter stop it measures 3.15:1, and this is 12pt normal text
    // needing 4.5. Its own note documents 4.51 against the AURORA, which is a
    // darker surface than this one — a token measured elsewhere is not measured
    // here. `secondary` clears at 4.56.
    color: OnDark.secondary,
    marginTop: Spacing[1],
    lineHeight: 17,
  },
  pill: {
    position: 'absolute',
    right: Spacing[5],
    bottom: Spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: OnDark.fill,
    borderWidth: 1,
    borderColor: OnDark.hairline,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: OnDark.accent,
  },
  pillText: {
    fontSize: 11,
    fontWeight: Typography.medium,
    color: OnDark.primary,
  },
}));
