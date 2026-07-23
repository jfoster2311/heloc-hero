// components/PayoffBoard.tsx — the reveal ritual's countdown board.
//
// A serpentine path of "years remaining" tiles. The FIRST tile is the user's
// current remaining term (e.g. 25) and the numbers count DOWN. The avatar
// starts there and hops until it reaches the projected payoff year (e.g. 5),
// so the distance it travels IS the time the strategy removes.
//
// The direction is the whole point. This board used to count UP (1…25) and
// stop on the payoff year, which meant a bigger saving produced a SHORTER
// walk — the animation shrank as the result got better, and landing on tile 5
// of 25 read as stopping early. Counting down makes the journey proportional
// to the win: 20 years saved is 20 hops.
//
// Deliberately not board-game trade dress: no ring layout, corner squares,
// property bands, or licensed iconography. Just a green path of year tiles.
import { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius, Aurora } from '../lib/theme';
import { hapticLight, hapticSuccess } from '../lib/haptics';

const BASE_COLS = 6;
const MAX_COLS = 10;
const MAX_ROWS = 6;          // keeps the board on screen on a 4.7" device
const GAP = 6;
const HOP_ARC = 14;          // peak lift of a single hop, in points
const WALK_BUDGET_MS = 2200; // total walk time, spread across however many hops
const HOP_MIN_MS = 55;
const HOP_MAX_MS = 165;

/**
 * Columns needed to keep the board under MAX_ROWS. Six reads best and covers
 * every ordinary term, but computeProjection caps at 720 months — a 60-tile
 * board is 10 rows and taller than a small phone, so widen rather than overflow.
 */
function colsFor(total: number): number {
  return Math.min(MAX_COLS, Math.max(BASE_COLS, Math.ceil(total / MAX_ROWS)));
}

/** Serpentine layout: rows alternate direction so the path reads as continuous. */
function tileColRow(i: number, cols: number): { col: number; row: number } {
  const row = Math.floor(i / cols);
  const within = i % cols;
  return { col: row % 2 === 0 ? within : cols - 1 - within, row };
}

interface Props {
  /** Years left on the original schedule — the first tile and the board's length. */
  totalYears: number;
  /** Projected payoff year under the strategy — the tile the avatar stops on. */
  targetYear: number;
  /** Flips to true to start the walk. */
  active: boolean;
  reduceMotion?: boolean;
  onArrive?: () => void;
}

export default function PayoffBoard({
  totalYears,
  targetYear,
  active,
  reduceMotion = false,
  onArrive,
}: Props) {
  // Callers pass whole years already (see reveal.tsx on why it ceils rather
  // than rounds); these just clamp to a drawable range.
  const total = Math.max(1, Math.ceil(totalYears));
  const target = Math.min(Math.max(1, Math.ceil(targetYear)), total);

  // Tile i is labelled (total - i), so tile 0 reads `total` and the numbers
  // count down. The avatar's destination is therefore the tile at index
  // (total - target), and the number of hops equals the years removed.
  const targetIdx = total - target;
  const yearsSaved = targetIdx;

  const [boardW, setBoardW] = useState(0);
  const [passed, setPassed] = useState(0); // tile index the avatar currently occupies
  const [arrived, setArrived] = useState(false);

  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hop = useRef(new Animated.Value(0)).current;
  const landPulse = useRef(new Animated.Value(0)).current;
  // The avatar sits on top of the tile it lands on, which is exactly the tile
  // whose year the user needs to read. Fade it out once it has arrived.
  const avatarFade = useRef(new Animated.Value(1)).current;
  const calloutIn = useRef(new Animated.Value(0)).current;

  const cols = colsFor(total);
  const rows = Math.ceil(total / cols);
  const tileSize = boardW > 0 ? (boardW - GAP * (cols - 1)) / cols : 0;

  const tileXY = useCallback(
    (idx: number) => {
      const { col, row } = tileColRow(idx, cols);
      return { x: col * (tileSize + GAP), y: row * (tileSize + GAP) };
    },
    [tileSize, cols],
  );

  // Park the avatar on the first tile (the user's current remaining term).
  useEffect(() => {
    if (tileSize <= 0) return;
    pos.setValue(tileXY(0));
  }, [tileSize, tileXY, pos]);

  useEffect(() => {
    if (!active || tileSize <= 0) return;
    let cancelled = false;

    /** Landing sequence: pulse, then step aside so the tile's year is legible. */
    function land() {
      setArrived(true);
      hapticSuccess();
      Animated.sequence([
        Animated.timing(landPulse, {
          toValue: 1, duration: 260, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true,
        }),
        Animated.timing(landPulse, {
          toValue: 0.55, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(avatarFade, {
            toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true,
          }),
          Animated.timing(calloutIn, {
            toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
          }),
        ]),
      ]).start();
      onArrive?.();
    }

    if (reduceMotion) {
      pos.setValue(tileXY(targetIdx));
      setPassed(targetIdx);
      setArrived(true);
      landPulse.setValue(0.55);
      avatarFade.setValue(0);
      calloutIn.setValue(1);
      onArrive?.();
      return;
    }

    // No projected saving — nothing to walk. Land on the first tile immediately
    // rather than animating a zero-length journey.
    if (targetIdx <= 0) {
      setPassed(0);
      land();
      return;
    }

    const hopMs = Math.min(
      HOP_MAX_MS,
      Math.max(HOP_MIN_MS, Math.round(WALK_BUDGET_MS / targetIdx)),
    );

    function stepTo(idx: number) {
      if (cancelled) return;

      hop.setValue(0);
      Animated.parallel([
        Animated.timing(pos, {
          toValue: tileXY(idx),
          duration: hopMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hop, {
          toValue: 1,
          duration: hopMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (cancelled || !finished) return;

        setPassed(idx);

        if (idx >= targetIdx) {
          land();
          return;
        }
        hapticLight();
        stepTo(idx + 1);
      });
    }

    stepTo(1);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tileSize, targetIdx]);

  const hopLift = hop.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -HOP_ARC, 0],
  });

  const boardH = rows > 0 && tileSize > 0 ? rows * tileSize + (rows - 1) * GAP : 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>
        {arrived ? 'Your projected payoff' : 'Cutting years off your mortgage…'}
      </Text>

      <View
        style={[styles.board, boardH > 0 && { height: boardH }]}
        onLayout={(e) => setBoardW(e.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityLabel={
          `Payoff board. ${total} years remaining on your current schedule, ` +
          `projected down to ${target}.`
        }
      >
        {tileSize > 0 && Array.from({ length: total }, (_, i) => {
          const yearsLeft = total - i;
          const { col, row } = tileColRow(i, cols);
          // Tiles the avatar has already crossed are the years being removed.
          const isRemoved = i < passed;
          const isTarget = i === targetIdx;

          return (
            <View
              key={yearsLeft}
              style={[
                styles.tile,
                {
                  width: tileSize,
                  height: tileSize,
                  left: col * (tileSize + GAP),
                  top: row * (tileSize + GAP),
                },
                // Years you still pay sit past the destination — solid, but quiet.
                i > targetIdx && styles.tileKept,
                isRemoved && styles.tileRemoved,
                isTarget && arrived && styles.tileTarget,
              ]}
            >
              <Text
                style={[
                  styles.tileLabel,
                  i > targetIdx && styles.tileLabelKept,
                  isRemoved && styles.tileLabelRemoved,
                  isTarget && arrived && styles.tileLabelTarget,
                ]}
              >
                {yearsLeft}
              </Text>
            </View>
          );
        })}

        {/* Avatar */}
        {tileSize > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.avatar,
              {
                width: tileSize,
                height: tileSize,
                opacity: avatarFade,
                transform: [
                  { translateX: pos.x },
                  { translateY: Animated.add(pos.y, hopLift) },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.avatarChip,
                {
                  transform: [{
                    scale: landPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }),
                  }],
                },
              ]}
            >
              <Ionicons name="walk" size={Math.min(20, tileSize * 0.5)} color={Aurora.deepest} />
            </Animated.View>
          </Animated.View>
        )}
      </View>

      {/* The conclusion, stated outright — a board the user has to decode is homework */}
      <Animated.View
        style={[
          styles.callout,
          {
            opacity: calloutIn,
            transform: [{
              translateY: calloutIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
            }],
          },
        ]}
      >
        <Text style={styles.calloutYear}>
          {target} {target === 1 ? 'year' : 'years'} left
        </Text>
        {yearsSaved > 0 && (
          <Text style={styles.calloutSub}>
            instead of {total} — {yearsSaved} {yearsSaved === 1 ? 'year' : 'years'} projected off
          </Text>
        )}
      </Animated.View>

      {/* Legend states conclusions, not colour definitions */}
      {yearsSaved > 0 && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, styles.swatchRemoved]} />
            <Text style={styles.legendText}>
              {yearsSaved} {yearsSaved === 1 ? 'year' : 'years'} removed
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, styles.swatchKept]} />
            <Text style={styles.legendText}>
              {target} {target === 1 ? 'year' : 'years'} you pay
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: Spacing[4] },
  caption: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.62)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  board: { width: '100%', position: 'relative' },

  // Default tile = a year still on the clock, not yet crossed.
  tile: {
    position: 'absolute',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Crossed by the avatar: these years are gone. Receding, not celebrating —
  // the accent belongs to exactly one element on this screen.
  tileRemoved: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  // The years the user still pays: present and solid, deliberately quiet.
  tileKept: {
    backgroundColor: 'rgba(18,183,106,0.16)',
    borderColor: 'rgba(18,183,106,0.38)',
  },
  tileTarget: {
    backgroundColor: Aurora.glow,
    borderColor: '#ffffff',
    shadowColor: Aurora.glow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 6,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: Typography.semibold,
    color: 'rgba(255,255,255,0.30)',
  },
  tileLabelRemoved: { color: 'rgba(255,255,255,0.16)' },
  tileLabelKept: { color: 'rgba(255,255,255,0.72)' },
  tileLabelTarget: { color: Aurora.deepest, fontWeight: Typography.extrabold },

  avatar: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChip: {
    width: '76%',
    height: '76%',
    borderRadius: Radius.full,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },

  callout: { alignItems: 'center', gap: 2 },
  calloutYear: {
    fontSize: 30,
    fontWeight: Typography.extrabold,
    color: '#ffffff',
    letterSpacing: -0.6,
  },
  calloutSub: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
  },

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing[4],
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  swatchRemoved: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  swatchKept: {
    backgroundColor: 'rgba(18,183,106,0.16)',
    borderColor: 'rgba(18,183,106,0.38)',
  },
  legendText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.55)' },
});
