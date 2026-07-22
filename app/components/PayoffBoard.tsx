// components/PayoffBoard.tsx — the reveal ritual's year board.
//
// A serpentine path of year tiles spanning the ORIGINAL mortgage term. An
// avatar hops tile to tile and stops on the projected payoff year; every tile
// past that stays dim. Those unwalked tiles are the point of the whole screen —
// they are the years the strategy is projected to remove.
//
// Deliberately not board-game trade dress: no ring layout, corner squares,
// property bands, or licensed iconography. Just a green path of year tiles.
import { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius, Aurora } from '../lib/theme';
import { hapticLight, hapticSuccess } from '../lib/haptics';

const COLS = 6;
const GAP = 6;
const HOP_ARC = 14;          // peak lift of a single hop, in points
const WALK_BUDGET_MS = 2200; // total walk time, spread across however many hops
const HOP_MIN_MS = 70;
const HOP_MAX_MS = 165;

/** Serpentine layout: rows alternate direction so the path reads as continuous. */
function tileColRow(i: number): { col: number; row: number } {
  const row = Math.floor(i / COLS);
  const within = i % COLS;
  return { col: row % 2 === 0 ? within : COLS - 1 - within, row };
}

interface Props {
  /** Years in the original term — the full length of the board. */
  totalYears: number;
  /** Projected payoff year — where the avatar stops. */
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
  const total = Math.max(1, Math.round(totalYears));
  const target = Math.min(Math.max(1, Math.round(targetYear)), total);

  const [boardW, setBoardW] = useState(0);
  const [walked, setWalked] = useState(0); // years walked so far (1-based); 0 = not started
  const [arrived, setArrived] = useState(false);

  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hop = useRef(new Animated.Value(0)).current;
  const landPulse = useRef(new Animated.Value(0)).current;
  // The avatar sits on top of the tile it lands on, which is exactly the tile
  // whose year the user needs to read. Fade it out once it has arrived.
  const avatarFade = useRef(new Animated.Value(1)).current;
  const calloutIn = useRef(new Animated.Value(0)).current;

  const rows = Math.ceil(total / COLS);
  const tileSize = boardW > 0 ? (boardW - GAP * (COLS - 1)) / COLS : 0;

  const tileXY = useCallback(
    (yearIdx: number) => {
      const { col, row } = tileColRow(yearIdx);
      return { x: col * (tileSize + GAP), y: row * (tileSize + GAP) };
    },
    [tileSize],
  );

  // Park the avatar on tile 0 as soon as we know the geometry.
  useEffect(() => {
    if (tileSize <= 0) return;
    const p = tileXY(0);
    pos.setValue(p);
  }, [tileSize, tileXY, pos]);

  useEffect(() => {
    if (!active || tileSize <= 0) return;
    let cancelled = false;

    if (reduceMotion) {
      const p = tileXY(target - 1);
      pos.setValue(p);
      setWalked(target);
      setArrived(true);
      landPulse.setValue(0.55);
      avatarFade.setValue(0);
      calloutIn.setValue(1);
      onArrive?.();
      return;
    }

    const hopMs = Math.min(
      HOP_MAX_MS,
      Math.max(HOP_MIN_MS, Math.round(WALK_BUDGET_MS / Math.max(1, target - 1 || 1))),
    );

    function stepTo(yearIdx: number) {
      if (cancelled) return;

      const dest = tileXY(yearIdx);
      hop.setValue(0);

      Animated.parallel([
        Animated.timing(pos, {
          toValue: dest,
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

        setWalked(yearIdx + 1);

        if (yearIdx + 1 >= target) {
          setArrived(true);
          hapticSuccess();
          Animated.sequence([
            Animated.timing(landPulse, {
              toValue: 1, duration: 260, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true,
            }),
            Animated.timing(landPulse, {
              toValue: 0.55, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
            }),
            // Step aside so the landed tile's year is legible.
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
          return;
        }

        hapticLight();
        stepTo(yearIdx + 1);
      });
    }

    setWalked(1);
    if (target > 1) stepTo(1);
    else {
      setArrived(true);
      hapticSuccess();
      onArrive?.();
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tileSize, target]);

  const hopLift = hop.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -HOP_ARC, 0],
  });

  const boardH = rows > 0 && tileSize > 0 ? rows * tileSize + (rows - 1) * GAP : 0;
  const yearsSaved = total - target;

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>
        {arrived ? 'Your projected payoff' : 'Fast-forwarding your timeline…'}
      </Text>

      <View
        style={[styles.board, boardH > 0 && { height: boardH }]}
        onLayout={(e) => setBoardW(e.nativeEvent.layout.width)}
      >
        {tileSize > 0 && Array.from({ length: total }, (_, i) => {
          const year = i + 1;
          const { col, row } = tileColRow(i);
          const isWalked = year <= walked;
          const isTarget = year === target;

          return (
            <View
              key={year}
              style={[
                styles.tile,
                {
                  width: tileSize,
                  height: tileSize,
                  left: col * (tileSize + GAP),
                  top: row * (tileSize + GAP),
                },
                isWalked && styles.tileWalked,
                isTarget && arrived && styles.tileTarget,
              ]}
            >
              <Text
                style={[
                  styles.tileLabel,
                  isWalked && styles.tileLabelWalked,
                  isTarget && arrived && styles.tileLabelTarget,
                ]}
              >
                {year}
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

      {/* Landed year, stated outright — the tile alone is small to read */}
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
        <Text style={styles.calloutYear}>YEAR {target}</Text>
        {yearsSaved > 0 && (
          <Text style={styles.calloutSub}>
            instead of year {total} — {yearsSaved} {yearsSaved === 1 ? 'year' : 'years'} projected
          </Text>
        )}
      </Animated.View>

      {/* Legend — the unwalked tail is the product's whole argument */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchWalked]} />
          <Text style={styles.legendText}>
            {arrived ? `Paid off year ${target}` : 'Years you pay'}
          </Text>
        </View>
        {yearsSaved > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.swatch, styles.swatchDim]} />
            <Text style={styles.legendText}>
              {arrived ? `${yearsSaved} years you skip` : `Original term: ${total} yrs`}
            </Text>
          </View>
        )}
      </View>
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

  tile: {
    position: 'absolute',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileWalked: {
    backgroundColor: 'rgba(18,183,106,0.22)',
    borderColor: 'rgba(18,183,106,0.55)',
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
  tileLabelWalked: { color: 'rgba(255,255,255,0.72)' },
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
  swatchWalked: {
    backgroundColor: 'rgba(18,183,106,0.22)',
    borderColor: 'rgba(18,183,106,0.55)',
  },
  swatchDim: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  legendText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.55)' },
});
