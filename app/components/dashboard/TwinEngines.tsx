// components/dashboard/TwinEngines.tsx — the two figures that move between dumps.
//
// A dump happens a few times a year. Everything in between is waiting, and an
// app with nothing to show during the wait gets deleted. These are the two
// numbers that are genuinely different every time someone opens the screen:
//
//   Shield — net interest not being paid, accruing through today
//   Strike — how far the line has left to replenish before the next dump
//
// Both are arithmetic, not encouragement. The shield goes NEGATIVE when the
// line costs more than the mortgage interest it avoids, and says so, because a
// figure that only ever rises is a slot machine.
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import RollingNumber from './RollingNumber';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { Strike } from '../../lib/strike';

interface Props {
  /** Net interest accrued so far today. Negative when the line costs more. */
  shieldToday: number;
  /** Net per day, for the caption. */
  shieldPerDay: number;
  /** True when the drawn balance is unknown, so the cost side is missing. */
  shieldCostUnknown: boolean;
  strike: Strike;
}

const RING = 76;
const RING_STROKE = 7;

export default function TwinEngines({
  shieldToday, shieldPerDay, shieldCostUnknown, strike,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();

  const negative = shieldPerDay < 0;
  // The ring cannot be drawn without a position, and a coerced zero would show
  // "fully replenished" to someone mid-cycle. See StrikeState.unknown_balance.
  const ringUnknown = strike.state === 'no_line' || strike.state === 'unknown_balance';
  const pct = ringUnknown ? 0 : Math.max(0, Math.min(1, strike.progress));

  const r = (RING - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={styles.row}>
      {/* ── Shield ──────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color={negative ? colors.gray500 : colors.accentInk}
          />
        </View>

        <RollingNumber
          value={Math.abs(shieldToday)}
          decimals={2}
          prefix={negative ? '−$' : '$'}
          style={[styles.figure, negative && styles.figureMuted]}
          accessibilityLabel={
            `${negative ? 'Net cost' : 'Interest not paid'} so far today, ` +
            `${Math.abs(shieldToday).toFixed(2)} dollars`
          }
        />

        <Text style={styles.caption}>
          {shieldCostUnknown
            ? 'Mortgage interest avoided today, before what your line charges.'
            : negative
              ? 'Your line costs more than it saves today.'
              : 'Interest not paid, so far today.'}
        </Text>
      </View>

      {/* ── Strike ──────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.ringWrap}>
          <Svg width={RING} height={RING}>
            <Circle
              cx={RING / 2} cy={RING / 2} r={r}
              stroke={colors.borderSubtle}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {!ringUnknown && (
              <Circle
                cx={RING / 2} cy={RING / 2} r={r}
                stroke={colors.mint600}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={circumference * (1 - pct)}
                // Starts at 12 o'clock instead of 3, which is where every
                // progress ring a user has ever seen starts.
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            )}
          </Svg>
          <View style={styles.ringCenter} pointerEvents="none">
            <Ionicons
              name="locate-outline"
              size={18}
              color={ringUnknown ? colors.gray500 : colors.accentInk}
            />
          </View>
        </View>

        {ringUnknown ? (
          <Text style={styles.figureUnknown}>Not yet</Text>
        ) : (
          <RollingNumber
            value={strike.drawn}
            prefix="$"
            style={styles.figureSm}
            accessibilityLabel={`${Math.round(strike.drawn)} dollars drawn, of a ${Math.round(strike.target)} dollar target`}
          />
        )}

        <Text style={styles.caption}>
          {ringUnknown
            ? strike.state === 'no_line'
              ? 'Add your line to track the next dump.'
              : 'Your line’s balance is not in yet.'
            : strike.toGo > 0
              ? `$${Math.round(strike.toGo).toLocaleString('en-US')} to go before the next dump.`
              : 'Your next dump is open.'}
        </Text>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  row: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  card: {
    flex: 1,
    backgroundColor: t.colors.machinedNear,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: t.colors.machinedEdge,
    padding: Spacing[4],
    gap: Spacing[2],
    ...t.shadows.ambient,
  },
  iconWrap: { height: RING, justifyContent: 'center' },
  ringWrap: { height: RING, width: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  figure: {
    fontSize: 30,
    fontWeight: Typography.extrabold,
    // NOT the neon. This sits on a light machined card where #22C55E measures
    // 2.28:1 — `accentInk` is the ink form of the accent and clears AA at 5.00.
    color: t.colors.accentInk,
    ...Typography.tabular,
  },
  // Negative is grey, never red. A loss on this screen is information, not an
  // alarm, and the palette has no red in it by design.
  figureMuted: { color: t.colors.gray500 },
  figureSm: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
    ...Typography.tabular,
  },
  figureUnknown: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: t.colors.gray500,
  },
  caption: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 16,
  },
}));
