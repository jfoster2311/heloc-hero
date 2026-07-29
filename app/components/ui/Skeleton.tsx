// components/ui/Skeleton.tsx — the shape of a figure, before the figure.
//
// Both tabs used to render a complete screen the instant they mounted, from
// whatever `useFinancials` could derive without the linked balances — which had
// not arrived yet. That produced a screen of confident, wrong numbers: 0%
// utilization, a "Safe to Move" recommendation computed without the HELOC
// balance, "Nothing connected yet" over three connected accounts. All of it
// then snapped to different values a second or two later.
//
// A wrong number that corrects itself is worse than no number, because the user
// has already read it. On a screen whose output is a financial decision it is
// worse still. So the rule this component exists to enforce: if a figure is not
// known yet, occupy its space and say nothing.
//
// Sized in the same units as the content it stands in for, so the layout does
// not jump when the real thing arrives — the second half of the same problem.
import { useEffect, useRef } from 'react';
import {
  View, StyleSheet, Animated, AccessibilityInfo,
  type StyleProp, type ViewStyle, type DimensionValue,
} from 'react-native';
import { Radius, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

/** One shimmering block. `onDark` for placeholders sitting on the aurora hero. */
export function Skeleton({ width = '100%', height = 14, radius = Radius.sm, onDark, style }: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    // A pulse is motion, and motion is exactly what some users have asked the
    // system to stop. Reduce Motion gets a flat block, which still reserves the
    // space and still reads as "not here yet".
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (cancelled || reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 720, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.45, duration: 720, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });

    return () => { cancelled = true; loop?.stop(); };
  }, [pulse]);

  return (
    <Animated.View
      style={[
        onDark ? styles.blockDark : styles.block,
        { width, height, borderRadius: radius, opacity: pulse },
        style,
      ]}
      // One "loading" announcement per region is plenty; the individual blocks
      // are decorative and must not each shout at a screen reader.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );
}

/**
 * A labelled group of blocks. Wraps its children in a single accessible node so
 * assistive tech hears "loading X" once instead of a run of anonymous views.
 */
export function SkeletonGroup({ label, children, style }: {
  label: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      {children}
    </View>
  );
}

/** The common case: a stat's label over its value. */
export function SkeletonStat({ width = 90 }: { width?: DimensionValue }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Skeleton width={64} height={10} />
      <Skeleton width={width} height={20} />
    </View>
  );
}

/** Two or three stats across, matching the statRow layout on both tabs. */
export function SkeletonStatRow({ count = 3 }: { count?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => <SkeletonStat key={i} width={i === 0 ? 96 : 72} />)}
    </View>
  );
}

/** A stack of full-width lines, for prose that has not loaded. */
export function SkeletonLines({ count = 2, last = '60%' }: {
  count?: number;
  last?: DimensionValue;
}) {
  const styles = useStyles();
  return (
    <View style={styles.lines}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={12} width={i === count - 1 ? last : '100%'} />
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  block: { backgroundColor: t.colors.gray200 },
  blockDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  stat: { gap: Spacing[2], flex: 1 },
  row: { flexDirection: 'row', gap: Spacing[4] },
  lines: { gap: Spacing[2] },
}));
