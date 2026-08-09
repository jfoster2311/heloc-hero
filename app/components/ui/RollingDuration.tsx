// components/ui/RollingDuration.tsx — a span of time that rolls to its new value.
//
// The sibling of RollingNumber, and it exists for the same reason: on the
// calculator, dragging the surplus slider from $600 to $1,500 has to FEEL like
// time being shaved off the mortgage. A label that swaps from "11 yrs 9 mo" to
// "7 yrs 2 mo" between frames does not register as movement — the eye reads the
// new value and never sees the travel, which is the whole reward this screen has
// to offer.
//
// ── Why not just reuse RollingNumber ───────────────────────────────────────
// Because months are not a decimal quantity and interpolating the FORMATTED
// parts independently is wrong. Rolling "11 yrs" and "9 mo" as two separate
// counters walks the month field from 9 down to 2 while the year field walks 11
// down to 7, and for most of that animation the pair reads as a duration the
// projection never produced — 7 yrs 9 mo, say, which is neither the old value
// nor the new one. This interpolates the TOTAL in months, one quantity, and
// formats at the end of every frame. Every intermediate frame is therefore a
// real duration on the way between two real durations.
//
// Same TextInput idiom as RollingNumber, and for the same reason: Reanimated
// cannot drive a <Text> child from a worklet without putting the whole thing
// back on the JS thread.
import { useEffect } from 'react';
import { TextInput, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, Easing,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  /** Total months. Fractional values are fine mid-roll; only the label rounds. */
  months: number;
  /** Roll duration in ms. */
  duration?: number;
  style?: StyleProp<TextStyle>;
  /**
   * Long form — "18 years 3 months" — for a figure that is read rather than
   * scanned. The compact form is the default because the hero is scanned.
   */
  long?: boolean;
  /** Announced instead of the rolling digits, which are noise to a screen reader. */
  accessibilityLabel?: string;
}

/**
 * Months → "18 yrs 3 mo", worklet-safe.
 *
 * Deliberately mirrors `formatMonths` in lib/projections.ts rather than calling
 * it: that one is a plain JS function and calling it from the UI thread would
 * either fail or silently hop threads. The two must agree, so any change to the
 * wording there belongs here too — which is why the rules are spelled out:
 *
 *   · under a year          → months only ("7 mo")
 *   · a whole number of yrs → years only ("18 yrs"), never "18 yrs 0 mo"
 *   · otherwise             → both
 */
function format(totalMonths: number, long: boolean): string {
  'worklet';
  const m = Math.max(0, Math.round(totalMonths));
  const years = Math.floor(m / 12);
  const rem = m % 12;
  // Singular at one year, matching `formatMonths` exactly — the two labels sit
  // on the same screen and "1 yrs" beside "1 yr" is the kind of mismatch that
  // makes a projection look unowned.
  const yUnit = long
    ? (years === 1 ? ' year' : ' years')
    : (years === 1 ? ' yr' : ' yrs');
  const mUnit = long ? (rem === 1 ? ' month' : ' months') : ' mo';
  if (years === 0) return `${rem}${mUnit}`;
  if (rem === 0)   return `${years}${yUnit}`;
  return `${years}${yUnit} ${rem}${mUnit}`;
}

export default function RollingDuration({
  months, duration = 600, style, long = false, accessibilityLabel,
}: Props) {
  const shown = useSharedValue(months);

  useEffect(() => {
    // Eased, not linear. A linear count reads as a progress bar; an eased one as
    // a mechanism settling — which is the slot-machine feel the brief asked for.
    shown.value = withTiming(months, { duration, easing: Easing.out(Easing.cubic) });
  }, [months, duration]);

  const animatedProps = useAnimatedProps(() => ({
    text: format(shown.value, long),
    // Silences the "value prop without onChange" warning without making the
    // field interactive.
    defaultValue: format(shown.value, long),
  } as never));

  return (
    <AnimatedTextInput
      editable={false}
      focusable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[styles.reset, style]}
      animatedProps={animatedProps}
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
