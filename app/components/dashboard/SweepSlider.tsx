// components/dashboard/SweepSlider.tsx — the one-gesture confirmation.
//
// A slide rather than a button, for one reason: this opens a flow that ends in
// the user moving real money at their bank. A tap is reversible and cheap; a
// deliberate 200pt drag is the interaction design equivalent of "are you sure",
// without a modal asking it.
//
// ── What this does NOT do ───────────────────────────────────────────────────
// It does not move money. HELOC Hero has no payment rail and never will in this
// form. Completing the slide opens the flow where the user records a transfer
// they make themselves at their bank. Every string here has to survive being
// read by someone who believes the app might be about to move $1,200 — so it
// says "start", never "send", "transfer", "deploy" or "execute".
//
// ── Why the gesture runs on the UI thread ───────────────────────────────────
// The dashboard is a long list with a Skia canvas in it. Tracking a drag on the
// JS thread means the thumb stutters exactly when the screen is busiest, and a
// confirmation control that lags feels broken in a way that a slow list does
// not. Gesture-handler + Reanimated worklets keep the thumb pinned to the
// finger regardless of what React is doing.
import { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS, useDerivedValue,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticSelection, hapticMedium } from '../../lib/haptics';

interface Props {
  /** The amount this move is for. Already floored and real — never a target. */
  amount: number;
  /** Decimal APR on the line, e.g. 0.085. Null when the rate is assumed. */
  apr: number | null;
  /** True when a paycheck is genuinely expected around now. */
  paydayExpected: boolean;
  /** Opens the flow where the user records the transfer. */
  onConfirm: () => void;
}

const TRACK_H = 60;
const THUMB = 52;
const PAD = 4;
/** Fraction of the track that counts as done. Short of 1 so the last few
 *  pixels — where a thumb naturally slows — do not feel like a dead zone. */
const COMMIT_AT = 0.92;
/** Detent spacing. The brief's 5px was a buzz; 12 reads as a machined dial. */
const DETENT_PX = 12;

/** The house spring. Heavy enough to feel metal, quick enough not to wait on. */
const SPRING = { stiffness: 250, damping: 30, mass: 1 };

export default function SweepSlider({ amount, apr, paydayExpected, onConfirm }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();

  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const done = useSharedValue(false);
  // Which detent last fired. Compared on the UI thread so the haptic fires once
  // per notch crossed rather than once per frame — at 120fps an unguarded call
  // is a continuous vibration, not a click.
  const lastDetent = useSharedValue(0);

  const maxX = useDerivedValue(() => Math.max(0, width.value - THUMB - PAD * 2));

  const fire = useCallback(() => { hapticSelection(); }, []);
  const commit = useCallback(() => {
    hapticMedium();
    onConfirm();
  }, [onConfirm]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      lastDetent.value = 0;
    })
    .onUpdate((e) => {
      if (done.value) return;
      const next = Math.min(Math.max(0, e.translationX), maxX.value);
      x.value = next;

      const detent = Math.floor(next / DETENT_PX);
      if (detent !== lastDetent.value) {
        lastDetent.value = detent;
        runOnJS(fire)();
      }
    })
    .onEnd(() => {
      if (done.value) return;
      if (maxX.value > 0 && x.value >= maxX.value * COMMIT_AT) {
        // Snap to full, then hand off. Settling first means the user sees the
        // gesture completed rather than the screen changing under a half-drag.
        done.value = true;
        x.value = withSpring(maxX.value, SPRING);
        runOnJS(commit)();
      } else {
        // Springs back with the elastic tension of a physical switch. This is
        // the whole reason for a spring over a timing curve.
        x.value = withSpring(0, SPRING);
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  // The fill trails the thumb exactly; it is the same value, not a second
  // animation that could drift out of step with it.
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + THUMB,
  }));

  // The label crosses over rather than switching, so there is no frame where
  // the control has no instruction on it.
  const idleLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, Math.max(1, maxX.value) * 0.45], [1, 0], Extrapolation.CLAMP),
  }));
  const activeLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      x.value,
      [Math.max(1, maxX.value) * 0.35, Math.max(1, maxX.value) * 0.8],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const money = `$${Math.round(amount).toLocaleString('en-US')}`;

  return (
    <View
      style={styles.card}
      onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
      accessibilityRole="adjustable"
      accessibilityLabel={`Start a ${money} move to your line`}
      // The gesture is unusable with a screen reader, so the same action is
      // exposed as a plain activation. Without this the control is invisible to
      // VoiceOver users, which on the primary action of the screen is a wall.
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onConfirm}
    >
      <Text style={styles.eyebrow}>
        {paydayExpected ? 'PAYDAY EXPECTED' : 'READY TO MOVE'}
      </Text>
      <Text style={styles.headline}>
        {money} ready for your line
      </Text>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />

        <Animated.Text style={[styles.trackLabel, idleLabelStyle]} numberOfLines={1}>
          Slide to start this move
        </Animated.Text>
        <Animated.Text style={[styles.trackLabel, styles.trackLabelActive, activeLabelStyle]} numberOfLines={1}>
          {apr !== null ? `Against ${(apr * 100).toFixed(2)}% APR` : 'Against your line'}
        </Animated.Text>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.thumb, thumbStyle]}>
            <Ionicons name="chevron-forward" size={22} color={colors.onAccent} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* The sentence that stops this being a payment button. */}
      <Text style={styles.foot}>
        Opens the transfer details. You make the move at your bank — HELOC Hero
        records it.
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  card: {
    backgroundColor: t.colors.machinedNear,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: t.colors.machinedEdge,
    padding: Spacing[5],
    gap: Spacing[3],
    ...t.shadows.ambient,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.bold,
    letterSpacing: 1.4,
    color: t.colors.textMuted,
  },
  headline: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    ...Typography.tabular,
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    // Milled into the card: a sunken fill plus a border, since React Native has
    // no inner shadow. The border is what sells the recess.
    backgroundColor: t.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: t.colors.machinedEdge,
    justifyContent: 'center',
    paddingHorizontal: PAD,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // 4.58:1 for `accentInk` on this fill, 4.72 on the bare track — the active
    // label crosses from one to the other as the thumb passes it, so both had
    // to clear AA independently.
    backgroundColor: t.colors.mint100,
  },
  trackLabel: {
    position: 'absolute',
    left: THUMB + Spacing[3],
    right: Spacing[3],
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
  },
  trackLabelActive: {
    color: t.colors.accentInk,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: t.colors.mint600,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.shadows.glow,
  },
  foot: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 17,
  },
}));
