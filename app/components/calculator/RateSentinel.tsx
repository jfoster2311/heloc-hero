// components/calculator/RateSentinel.tsx — the one thing this screen must not
// let a user miss.
//
// Cycling is a rate arbitrage. It gets ahead only when the line is cheaper than
// the mortgage, and at a typical 8.5% line against a 6.5% mortgage the routing
// leg is slightly NEGATIVE — the surplus is doing essentially all of the work.
// That fact already lives in the "Where that saving comes from" card, but it
// lived there in two ways that made it easy to miss:
//
//   · it was the last line of a card most of the way down the page, and
//   · that whole card is gated on `interestSaved > 0`, so the user whose
//     numbers make cycling worst of all was the one least likely to be told.
//
// So the verdict is hoisted to a banner directly under the levers that produce
// it. This does not replace the breakdown — it points at it.
//
// ── The palette, and why this is not the brief's yellow glass ──────────────
// The brief specified a "yellow-tinted glassmorphic banner". Two separate
// problems, and both are recorded findings rather than preferences:
//
//   1. Amber is banned alongside red (CLAUDE.md). This app shows people numbers
//      about their own house, and a caution colour would frame a rate the user
//      cannot instantly change as an error they have made. Severity is carried
//      by saturation and by an explicit word, exactly as everywhere else.
//   2. Glassmorphism does not work here TWICE over. A BlurView over a surface
//      that scrolls WITH the page is a no-op — blurring a flat colour returns
//      that colour, so it renders nothing and costs a GPU pass per frame. And a
//      translucent surface has no fixed background, so its text cannot be
//      contrast-measured at all, which is disqualifying on a screen carrying
//      financial figures.
//
// What carries it instead is position, an icon, a heavier border and the plain
// sentence. Remove the colour entirely and the warning is still the warning.
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable } from '../ui/press';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

interface Props {
  /** Percent, as displayed — e.g. 8.5. */
  helocRate: number;
  mortgageRate: number;
  /**
   * What routing through the line actually contributed, in dollars.
   *
   * Signed, and passed in rather than recomputed: `computeProjection` already
   * splits it into `fromSurplus` and `fromCycling`, and a banner deriving its
   * own version of that split would eventually disagree with the breakdown card
   * it is pointing at.
   */
  fromCycling: number;
  /** Scrolls to / opens the full breakdown. */
  onExplain?: () => void;
}

export default function RateSentinel({ helocRate, mortgageRate, fromCycling, onExplain }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();

  // Only when the line genuinely costs more. When it is cheaper, cycling is
  // doing real work and a caution would be inventing a problem — the breakdown
  // card below says so in the positive case.
  if (helocRate <= mortgageRate) return null;

  const gap = (helocRate - mortgageRate).toFixed(2).replace(/\.?0+$/, '');

  return (
    <View style={styles.shell} accessibilityRole="summary">
      <View style={styles.head}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textPrimary} />
        {/* The word does the work the colour is not allowed to do. */}
        <Text style={styles.title}>Caution — your line costs more than your mortgage</Text>
      </View>

      <Text style={styles.body}>
        At {helocRate}% against {mortgageRate}%, the line is {gap} points more expensive. Routing
        your surplus through it {fromCycling < 0 ? 'costs' : 'adds'}{' '}
        <Text style={styles.strong}>
          {fromCycling < 0 ? '−' : ''}${Math.abs(Math.round(fromCycling)).toLocaleString('en-US')}
        </Text>
        {' '}against paying it straight at the principal — so the speed above is driven almost
        entirely by the surplus itself, not by cycling.
      </Text>

      <Text style={styles.body}>
        That is not an argument against paying the mortgage down early. It is an argument that the
        lever worth shopping for is the rate on your line.
      </Text>

      {onExplain && (
        <Touchable
          style={styles.action}
          onPress={onExplain}
          accessibilityRole="button"
          accessibilityLabel="See the full breakdown of where the saving comes from"
        >
          <Text style={styles.actionText}>See the breakdown</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accentInk} />
        </Touchable>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  shell: {
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.gray50,
    // Heavier than a card's decorative edge. This is the one boundary on the
    // screen that is carrying meaning rather than separating surfaces, and
    // `borderField` is the token that exists for exactly that job — 3.02:1 on
    // the canvas, against `border`'s 1.23:1.
    borderWidth: 1,
    borderColor: t.colors.borderField,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  title: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
  },
  body: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 18,
  },
  strong: { fontWeight: Typography.bold, color: t.colors.textPrimary },
  action: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
  },
  actionText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },
}));
