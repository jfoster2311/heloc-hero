// components/FreedomBoard.tsx — the dashboard's signature object.
//
// One tile per year left on the original schedule, read left to right as time.
// The first tiles are solid: those are the years you still pay. The rest fade
// to outlines on mount — those are the years the strategy removes, and watching
// them go is the entire product in one gesture.
//
// This is deliberately NOT another line chart. Every competitor's home screen is
// a net-worth curve; none of them can draw this, because none of them is about
// deleting years. It is the same motif as the onboarding reveal board
// (components/PayoffBoard), so the moment someone was sold on becomes the thing
// they see every morning.
//
// Differences from PayoffBoard, on purpose:
//   · chronological, not counting down — a static board with no avatar walking
//     it needs the axis to be time, or the ordering is arbitrary
//   · no per-tile numerals — this sits on a dashboard the user reads daily, and
//     thirty numbers is the density problem this redesign exists to fix
//   · the conclusion is stated in words underneath, because a board someone has
//     to decode is homework
import { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius, Aurora, OnDark } from '../lib/theme';

const GAP = 5;
const MAX_ROWS = 4;
const MIN_COLS = 8;
const MAX_COLS = 14;
const FADE_BUDGET_MS = 1100;

/** Columns that keep the board under MAX_ROWS without going past MAX_COLS. */
function colsFor(total: number): number {
  return Math.min(MAX_COLS, Math.max(MIN_COLS, Math.ceil(total / MAX_ROWS)));
}

interface Props {
  /** Months remaining on the current schedule — the board's length. */
  originalMonths: number;
  /** Months remaining under the strategy — how many tiles stay solid. */
  acceleratedMonths: number;
  /** False when the numbers are illustrative rather than the user's own. */
  hasRealData?: boolean;
}

export default function FreedomBoard({
  originalMonths,
  acceleratedMonths,
  hasRealData = true,
}: Props) {
  // Whole years, rounded up: a board tile is a year you are either paying for
  // or not, and eleven months of mortgage is a year you still pay.
  const totalYears = Math.max(1, Math.ceil(originalMonths / 12));
  const paidYears = Math.min(Math.max(1, Math.ceil(acceleratedMonths / 12)), totalYears);
  const removedYears = totalYears - paidYears;

  const [boardW, setBoardW] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  const cols = colsFor(totalYears);
  const rows = Math.ceil(totalYears / cols);
  const tileSize = boardW > 0 ? (boardW - GAP * (cols - 1)) / cols : 0;

  useEffect(() => {
    let gone = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (gone) return;
      if (reduced || removedYears === 0) {
        fade.setValue(1);
        return;
      }
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: FADE_BUDGET_MS,
        delay: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    return () => { gone = true; };
  }, [fade, removedYears]);

  const boardH = tileSize > 0 ? rows * tileSize + (rows - 1) * GAP : 0;

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.board, boardH > 0 && { height: boardH }]}
        onLayout={(e) => setBoardW(e.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityLabel={
          removedYears > 0
            ? `Payoff board. ${paidYears} of ${totalYears} years remain under the strategy, ` +
              `so ${removedYears} years are projected off.`
            : `Payoff board. ${totalYears} years remain and no acceleration is projected yet.`
        }
      >
        {tileSize > 0 && Array.from({ length: totalYears }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const isPaid = i < paidYears;
          const isFinish = i === paidYears - 1;

          // Each removed tile fades on its own slice of the timeline, so the
          // years peel away left to right instead of blinking out together.
          const k = i - paidYears;
          const start = removedYears > 1 ? (k / removedYears) * 0.72 : 0;
          const fillOpacity = isPaid
            ? 1
            : fade.interpolate({
                inputRange: [start, Math.min(1, start + 0.28)],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              });

          return (
            <View
              key={i}
              style={[
                styles.tile,
                {
                  width: tileSize,
                  height: tileSize,
                  left: col * (tileSize + GAP),
                  top: row * (tileSize + GAP),
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.fill,
                  isFinish && styles.fillFinish,
                  { opacity: fillOpacity },
                ]}
              />
              {isFinish && tileSize >= 14 && (
                <Ionicons
                  name="home"
                  size={Math.min(13, tileSize * 0.52)}
                  color={Aurora.deepest}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* The conclusion in words. The board is the feeling; this is the fact. */}
      <View style={styles.legend}>
        <LegendItem
          swatch={<View style={[styles.swatch, styles.swatchPaid]} />}
          text={`${paidYears} ${paidYears === 1 ? 'year' : 'years'} you pay`}
        />
        {removedYears > 0 && (
          <LegendItem
            swatch={<View style={[styles.swatch, styles.swatchGone]} />}
            text={`${removedYears} ${removedYears === 1 ? 'year' : 'years'} projected off`}
          />
        )}
        {!hasRealData && (
          <Text style={styles.exampleTag}>example</Text>
        )}
      </View>
    </View>
  );
}

function LegendItem({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: Spacing[3] },
  board: { width: '100%', position: 'relative' },

  // The persistent outline. A removed year does not disappear — it becomes an
  // empty frame, so the length of the original schedule stays legible.
  tile: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Aurora.glow,
  },
  fillFinish: { backgroundColor: '#ffffff' },

  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing[4] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  swatch: { width: 9, height: 9, borderRadius: 2, borderWidth: 1 },
  swatchPaid: { backgroundColor: Aurora.glow, borderColor: Aurora.glow },
  swatchGone: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.28)' },
  legendText: { fontSize: Typography.xs, color: OnDark.muted },
  exampleTag: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    letterSpacing: 1,
    color: OnDark.faint,
    borderWidth: 1,
    borderColor: OnDark.hairline,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
