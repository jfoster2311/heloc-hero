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
//
// ── Tapping a tile ─────────────────────────────────────────────────────────
// The board was a picture: correct, legible as a whole, and undecodable per
// tile — there was no way to ask "which year is that square, and do I still pay
// it?". Each tile is now a button that answers exactly that, in a line under the
// board.
//
// What a tap CANNOT show is cycle history, and the reason is structural: these
// tiles are the years REMAINING, so tile 0 is this year and every tile after it
// is the future. There is no history in the future to show. Only the current
// year's tile carries logged activity (`thisYear`), and the rest say what they
// honestly can — the calendar year, and whether it is a year you still pay.
// Backfilling elapsed years onto the left of the board was the alternative and
// it would change what the board means: the length of the board is the length of
// the schedule ahead, which is the number the strategy moves.
//
// ── On the 44pt rule ───────────────────────────────────────────────────────
// A 30-year board is 8 columns of ~39pt tiles, and there is no layout where
// thirty tiles are each 44pt on a phone. They carry a hitSlop that brings the
// effective target to ~43pt without overlapping the 5pt gap. This is the one
// place in the app that misses the bar, it misses it by a point, and the
// alternative is not having the affordance at all.
import { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, AccessibilityInfo, LayoutAnimation, Platform,
} from 'react-native';
import { Touchable } from './ui/press';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '../lib/haptics';
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
  /** Month and year of the projected payoff, for the finish tile's detail. */
  payoffLabel?: string;
  /** Dumps logged in the CURRENT calendar year — the only year that has any. */
  thisYear?: { count: number; total: number };
}

export default function FreedomBoard({
  originalMonths,
  acceleratedMonths,
  hasRealData = true,
  payoffLabel,
  thisYear,
}: Props) {
  // Whole years, rounded up: a board tile is a year you are either paying for
  // or not, and eleven months of mortgage is a year you still pay.
  const totalYears = Math.max(1, Math.ceil(originalMonths / 12));
  const paidYears = Math.min(Math.max(1, Math.ceil(acceleratedMonths / 12)), totalYears);
  const removedYears = totalYears - paidYears;

  const [boardW, setBoardW] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const thisYearNum = new Date().getFullYear();

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

  // A refresh can shorten the board. Holding a selection past the new end would
  // caption a tile that is no longer on screen.
  useEffect(() => { setSelected(null); }, [totalYears]);

  const boardH = tileSize > 0 ? rows * tileSize + (rows - 1) * GAP : 0;

  return (
    <View style={styles.wrap}>
      {/* No container-level accessibilityLabel any more: the tiles are controls
          now, and a labelled parent wrapping thirty buttons reads the summary
          before every one of them. The summary still exists in text — it is the
          legend directly below, which was always the accessible version of this
          picture. */}
      <View
        style={[styles.board, boardH > 0 && { height: boardH }]}
        onLayout={(e) => setBoardW(e.nativeEvent.layout.width)}
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
            <Touchable
              key={i}
              style={[
                styles.tile,
                selected === i && styles.tileSelected,
                {
                  width: tileSize,
                  height: tileSize,
                  left: col * (tileSize + GAP),
                  top: row * (tileSize + GAP),
                },
              ]}
              // Brings a ~39pt tile to ~43pt without crossing the 5pt gap into
              // its neighbour. See the note on the 44pt rule in the header.
              hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
              onPress={() => {
                if (Platform.OS === 'ios') {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }
                setSelected(s => (s === i ? null : i));
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === i }}
              accessibilityLabel={yearDetail({
                index: i, paidYears, isFinish, thisYearNum, payoffLabel, thisYear,
              })}
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
            </Touchable>
          );
        })}
      </View>

      {/* The conclusion in words. The board is the feeling; this is the fact.
          A selected tile swaps the legend for that year's line rather than
          stacking on top of it — this sits inside the hero, and growing the
          hero on tap would push the whole card stream down under the user's
          thumb. */}
      {selected !== null && selected < totalYears ? (
        <Touchable
          style={styles.detail}
          hitSlop={{ top: 7, bottom: 7, left: 0, right: 0 }}
          onPress={() => {
            if (Platform.OS === 'ios') {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
            setSelected(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Close year detail"
        >
          <Text style={styles.detailText} numberOfLines={2}>
            {yearDetail({
              index: selected,
              paidYears,
              isFinish: selected === paidYears - 1,
              thisYearNum,
              payoffLabel,
              thisYear,
            })}
          </Text>
          {/* The detail row replaces the legend, and the legend is where the
              example tag lives. Without this, tapping a tile in example mode
              swapped a marked-as-illustrative board for a specific calendar
              year stated flat. */}
          {!hasRealData && <Text style={styles.exampleTag}>example</Text>}
          <Ionicons name="close" size={14} color={OnDark.muted} />
        </Touchable>
      ) : (
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
      )}
    </View>
  );
}

/**
 * What one tile says about its year — the tap target's label and the line the
 * board shows when it is selected, so the two can never disagree.
 *
 * The current year is the only one that can carry logged activity, and it says
 * so plainly when there is none. "No dumps logged yet" is a true and useful
 * thing to read in July; an empty detail line would just look broken.
 */
function yearDetail({
  index, paidYears, isFinish, thisYearNum, payoffLabel, thisYear,
}: {
  index: number;
  paidYears: number;
  isFinish: boolean;
  thisYearNum: number;
  payoffLabel?: string;
  thisYear?: { count: number; total: number };
}): string {
  const year = thisYearNum + index;
  const finish = payoffLabel ? `you finish here, ${payoffLabel}` : 'you finish here';

  // The current year is also the finish year for anyone nearly done, so these
  // compose rather than falling through a chain that would drop one of them.
  if (index === 0) {
    const activity = !thisYear || thisYear.count === 0
      ? 'no dumps logged yet'
      : `${thisYear.count} dump${thisYear.count === 1 ? '' : 's'} logged, ` +
        `$${Math.round(thisYear.total).toLocaleString('en-US')} moved`;
    return isFinish
      ? `${year}, this year — ${finish}. ${capitalize(activity)}.`
      : `${year}, this year — ${activity}.`;
  }
  if (isFinish)            return `${year} — ${finish}.`;
  if (index < paidYears)   return `${year} — a year you still pay.`;
  return `${year} — projected off by the strategy.`;
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

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
  // Selection reads as a brighter frame rather than a fill change: the fill is
  // already carrying "paid or removed", and overloading it would make a tapped
  // removed year look like a year you pay.
  tileSelected: { borderColor: 'rgba(255,255,255,0.85)', borderWidth: 1.5 },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Aurora.glow,
  },
  fillFinish: { backgroundColor: '#ffffff' },

  // Same minHeight as the legend it swaps with, so selecting a tile does not
  // shove the card stream below the hero down under the reader's thumb. The
  // row is short for a touch target, so it carries a hitSlop to reach 44.
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 30,
  },
  detailText: { flex: 1, fontSize: Typography.xs, color: OnDark.secondary, lineHeight: 17 },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing[4],
    minHeight: 30,
  },
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
