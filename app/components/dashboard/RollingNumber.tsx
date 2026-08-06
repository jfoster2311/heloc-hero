// components/dashboard/RollingNumber.tsx — a figure that rolls to its new value.
//
// Watching a debt fall is the reward this product has to offer between dumps,
// and a number that simply swaps from one value to another does not register as
// movement. This interpolates on the UI thread so the digits travel.
//
// ── Why a TextInput ─────────────────────────────────────────────────────────
// Reanimated cannot drive a <Text> child from a worklet — children are React
// state, and touching state per frame puts the whole thing back on the JS
// thread, which is the problem this exists to avoid. TextInput exposes `text`
// as a native prop that CAN be written from a worklet. It is a well-worn
// Reanimated idiom, and the input is non-editable and non-focusable so it
// behaves as a label in every respect that matters.
import { useEffect } from 'react';
import { TextInput, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, Easing,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  value: number;
  /** Decimal places to SHOW. Never more than the inputs justify. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Roll duration. 600ms is the brief's slot-machine feel. */
  duration?: number;
  style?: StyleProp<TextStyle>;
  /** Announced instead of the rolling digits, which are noise to a screen reader. */
  accessibilityLabel?: string;
}

/**
 * Groups thousands with commas, worklet-safe.
 *
 * `toLocaleString` is not reliably available in the Reanimated worklet runtime —
 * it is a JSC/Hermes Intl surface, not a language primitive — so a formatter
 * that works on the JS thread can silently produce an unseparated number on the
 * UI thread. Hand-rolled, this behaves identically in both.
 */
function format(v: number, decimals: number, prefix: string, suffix: string): string {
  'worklet';
  const neg = v < 0;
  const abs = Math.abs(v);
  const fixed = abs.toFixed(decimals);
  const dot = fixed.indexOf('.');
  const whole = dot === -1 ? fixed : fixed.slice(0, dot);
  const frac = dot === -1 ? '' : fixed.slice(dot);

  let grouped = '';
  let count = 0;
  for (let i = whole.length - 1; i >= 0; i--) {
    grouped = whole[i] + grouped;
    count++;
    if (count % 3 === 0 && i > 0) grouped = ',' + grouped;
  }
  return (neg ? '−' : '') + prefix + grouped + frac + suffix;
}

export default function RollingNumber({
  value, decimals = 0, prefix = '', suffix = '', duration = 600, style,
  accessibilityLabel,
}: Props) {
  const shown = useSharedValue(value);

  useEffect(() => {
    // Eased rather than linear: a linear count-up reads as a progress bar, an
    // eased one as something settling into place.
    shown.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration]);

  const animatedProps = useAnimatedProps(() => ({
    text: format(shown.value, decimals, prefix, suffix),
    // Silences the "value prop without onChange" warning without making the
    // field interactive.
    defaultValue: format(shown.value, decimals, prefix, suffix),
  } as never));

  return (
    <AnimatedTextInput
      editable={false}
      // Focus would put a caret in a label and let a keyboard open over the
      // dashboard.
      focusable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[styles.reset, style]}
      animatedProps={animatedProps}
      // The rolling digits are noise read aloud; announce the settled figure.
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    />
  );
}

const styles = StyleSheet.create({
  reset: {
    // A TextInput carries platform padding a Text does not, so without this the
    // figure sits a few points off from any label beside it.
    padding: 0,
    margin: 0,
  },
});
