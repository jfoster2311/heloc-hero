// components/ui/SuccessReveal.tsx — the moment after a manual step is recorded.
//
// Velocity banking is a habit performed in another app, and the only thing this
// one can offer for it is acknowledgement. That makes this component load-bearing
// rather than decorative: it is the whole reward for the work, and if it feels
// perfunctory the habit does not survive month three.
//
// ── What it will not do ─────────────────────────────────────────────────────
// It takes rows of already-computed figures and reveals them. It does not count
// up, interpolate toward a target, or animate a number the caller did not hand
// it — a tally that races to a total is inventing intermediate values, and on a
// screen about somebody's debt those frames are all wrong. The figures appear;
// they do not perform.
//
// ── Reduced motion ─────────────────────────────────────────────────────────
// Matches every other animation in the app (FreedomBoard, BootSplash, Skeleton,
// the reveal screen): asks the OS first and lands on the final frame when the
// user has asked for less movement. The reward is the FIGURES, so removing the
// motion costs nothing — which is the test of whether an animation was carrying
// meaning it should not have been.
import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

/** Long enough to read as deliberate, short enough not to be in the way. */
const MARK_MS = 320;
const ROW_MS  = 220;
const ROW_STAGGER_MS = 70;

export interface RevealRow {
  label: string;
  value: string;
  /** The one row that is the point. Rendered in the accent. */
  emphasis?: boolean;
}

export default function SuccessReveal({
  title, caption, rows, announcement,
}: {
  title: string;
  caption?: string;
  rows: RevealRow[];
  /** Spoken once when the reveal lands. Defaults to title + caption. */
  announcement?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();

  const mark = useRef(new Animated.Value(0)).current;
  // One value drives all rows; each reads a different slice of it, so the
  // stagger costs no extra animations and stays in step with the mark.
  const body = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    let gone = false;
    AccessibilityInfo.isReduceMotionEnabled().then(r => {
      if (gone) return;
      setReduced(r);
      if (r) { mark.setValue(1); body.setValue(1); return; }
      mark.setValue(0); body.setValue(0);
      Animated.sequence([
        // A spring on the mark and a timing on the rows: the tick should feel
        // like something landing, the figures should not overshoot.
        Animated.spring(mark, {
          toValue: 1, friction: 6, tension: 90, useNativeDriver: true,
        }),
        Animated.timing(body, {
          toValue: 1,
          duration: ROW_MS + ROW_STAGGER_MS * Math.max(0, rows.length - 1),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
    return () => { gone = true; };
  }, [mark, body, rows.length]);

  // Announced rather than left to focus order: the sheet does not navigate, so
  // a screen-reader user gets no transition to tell them the state changed.
  useEffect(() => {
    if (reduced === null) return;
    const said = announcement ?? [title, caption].filter(Boolean).join('. ');
    AccessibilityInfo.announceForAccessibility(said);
  }, [reduced, announcement, title, caption]);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.markWrap,
          {
            opacity: mark,
            transform: [{
              scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
            }],
          },
        ]}
      >
        <Ionicons name="checkmark" size={30} color={colors.onAccent} />
      </Animated.View>

      <Text style={styles.title}>{title}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}

      {rows.length > 0 && (
        <View style={styles.rows}>
          {rows.map((r, i) => {
            // Each row's window inside the shared 0..1 progress.
            const span = Math.max(1, rows.length);
            const start = i / (span + 1);
            const end = (i + 1) / (span + 1);
            const opacity = body.interpolate({
              inputRange: [start, end, 1],
              outputRange: [0, 1, 1],
              extrapolate: 'clamp',
            });
            const translateY = body.interpolate({
              inputRange: [start, end, 1],
              outputRange: [6, 0, 0],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={r.label}
                style={[styles.row, { opacity, transform: [{ translateY }] }]}
              >
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={[styles.rowValue, r.emphasis && styles.rowValueEmphasis]}>
                  {r.value}
                </Text>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  wrap: { alignItems: 'center', paddingVertical: Spacing[4], gap: Spacing[2] },
  markWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.mint600,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    textAlign: 'center',
  },
  caption: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing[2],
  },
  rows: { alignSelf: 'stretch', marginTop: Spacing[3] },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  rowLabel: { flex: 1, fontSize: Typography.sm, color: t.colors.textSecondary },
  rowValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  rowValueEmphasis: {
    fontSize: Typography.base,
    fontWeight: Typography.extrabold,
    color: t.colors.accentInk,
  },
}));
