// components/InterestTicker.tsx — the reason to open the app on a Tuesday.
//
// A HELOC dump happens a few times a year. Everything between them is dead
// time, and an app with nothing to say during that time gets deleted. This is
// the one number that is genuinely different every time someone looks: interest
// they are not paying, accruing by the hour because their principal is lower
// than it would have been.
//
// ── Why this is real and not a motivational animation ───────────────────────
// Every day a dollar is off the mortgage, it does not accrue mortgage interest:
// that is `principalRemoved × rate ÷ 365` per day, arithmetic, not a forecast.
// Against it, every day a dollar sits drawn on the line, it DOES accrue HELOC
// interest. The figure shown is the net, and when the line is expensive enough
// that the net goes negative, it says so in plain words rather than hiding it.
// A ticker that only ever goes up would be a slot machine.
//
// ── On precision ────────────────────────────────────────────────────────────
// Deliberately not animated per-second. At a realistic $7/day the cents move
// about every three minutes, so a 60fps counter would be rendering invented
// decimal places to look busy. It refreshes on a slow interval and on every
// foreground, which is when someone is actually reading it.
import { View, Text } from 'react-native';
import { useInterestToday } from '../hooks/useInterestToday';
import { Typography, Spacing, Tracking } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';

interface Props {
  /** Sum of every logged principal move. No moves, no ticker. */
  totalMoved: number;
  /** Decimal fraction, e.g. 0.065. */
  mortgageRate: number;
  /**
   * Currently drawn on the line — the cost side of the trade.
   *
   * Null when there is a line whose balance we do not have. It cannot be
   * coerced to zero: this component's whole claim is that it shows the NET, and
   * a zero cost side turns it into the gross figure while still calling itself
   * net — and then says "Nothing is drawn on your line" outright, which is a
   * fabricated fact about someone's debt.
   */
  helocDrawn: number | null;
  /** Decimal fraction, e.g. 0.085. */
  helocRate: number;
}

export default function InterestTicker({
  totalMoved, mortgageRate, helocDrawn, helocRate,
}: Props) {
  const styles = useStyles();
  // The clock and the arithmetic moved to hooks/useInterestToday so the Cash
  // Shield engine on the dashboard reports the same figure as this ticker.
  // Two copies of it would eventually disagree on one screen.
  const {
    soFarToday, netPerDay, avoidedPerDay, costPerDay,
    costUnknown: unknownCost, negative,
  } = useInterestToday(totalMoved, mortgageRate, helocDrawn, helocRate);

  if (totalMoved <= 0) return null;

  return (
    <View style={styles.wrap}>
      {/* The eyebrow is the honest label for whichever figure is below it. With
          no balance the cost side cannot be subtracted, so this says "before"
          rather than letting the gross figure wear the net's headline. */}
      <Text style={styles.eyebrow}>
        {unknownCost ? 'BEFORE WHAT YOUR LINE CHARGES'
          : negative ? 'THE LINE IS COSTING MORE THAN IT SAVES'
          : 'INTEREST YOU ARE NOT PAYING'}
      </Text>

      <View style={styles.valueRow}>
        <Text style={[styles.value, negative && styles.valueMuted]}>
          {negative ? '−' : ''}${Math.abs(soFarToday).toFixed(2)}
        </Text>
        <Text style={styles.suffix}>so far today</Text>
      </View>

      <Text style={styles.detail}>
        {unknownCost
          ? `${money(netPerDay)} a day of mortgage interest avoided. Your line charges ` +
            'against that, and we cannot subtract it until we know what is drawn.'
          : negative
          ? `The line costs ${money(costPerDay)} a day against ${money(avoidedPerDay)} of ` +
            'mortgage interest avoided. Replenishing it turns this positive.'
          : `${money(netPerDay)} a day — about ${money(netPerDay * 30)} a month` +
            (costPerDay > 0.005
              ? `, already net of ${money(costPerDay)} a day of HELOC interest.`
              : '. Nothing is drawn on your line, so none of it is going back out.')}
      </Text>
    </View>
  );
}

function money(n: number) {
  const abs = Math.abs(n);
  if (abs >= 100) return `$${Math.round(abs).toLocaleString('en-US')}`;
  return `$${abs.toFixed(2)}`;
}

const useStyles = createThemedStyles(t => ({
  wrap: {
    backgroundColor: t.colors.mint50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    padding: Spacing[4],
    gap: Spacing[1],
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: Tracking.label,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing[2] },
  // A step under the realized figure this sits beneath. The ticker is the live
  // gloss on that number, not a rival to it, and at equal size the card had two
  // large greens competing inside one border.
  value: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: Tracking.heading,
  },
  // Negative is muted grey, never red — see the palette policy in lib/theme.
  valueMuted: { color: t.colors.gray500 },
  suffix: { fontSize: Typography.xs, color: t.colors.textMuted },
  detail: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },
}));
