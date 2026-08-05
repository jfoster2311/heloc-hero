// components/ui/press.tsx — what a control does under a finger.
//
// The app had no answer to this, and the default was a bad one. 175 touchables
// ship in here and only 33 set `activeOpacity`, so the other ~142 inherited
// TouchableOpacity's default of **0.2** — every unstyled card, row and chip
// flashed to a fifth of its opacity on touch and snapped back. That is not a
// press; it is a blink, and it is the single loudest thing separating this app
// from the ones it is benchmarked against.
//
// The fix is not a better opacity number. A premium control responds the way an
// object does: it takes the pressure, moves a little, and springs back. So a
// press here is a SCALE plus a small opacity drop, released on a spring —
// asymmetric on purpose, because that asymmetry is the whole effect:
//
//   in    ~90ms, eased out       the finger arrives and the surface gives way
//   out   spring, slight bounce  the surface pushes back
//
// A symmetric timing curve in both directions reads as a UI state change. A fast
// press and a sprung release reads as a physical object, and the difference is
// entirely in the release.
//
// ── Haptics fire on press IN, not on press ────────────────────────────────
// The 191 scattered `hapticLight()` calls in this codebase almost all sit inside
// an `onPress`, which is touch-UP. That is measurably late: the user has already
// committed, lifted, and begun looking for the result. iOS fires impact feedback
// on touch-DOWN, which is why its controls feel instant and ours felt slightly
// behind the finger. Owning the haptic here moves every control onto the right
// edge of the gesture at once, and means a call site cannot forget it — which
// half of them had (5 of 8 LinkRows were silent).
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Pressable, AccessibilityInfo,
  type ViewStyle, type StyleProp, type AccessibilityRole,
} from 'react-native';
import { hapticLight, hapticSelection, hapticMedium } from '../../lib/haptics';

/**
 * Whether the user has asked the system to stop animating things.
 *
 * Six components already read this, each with a one-shot
 * `isReduceMotionEnabled().then(...)` in a mount effect. That misses the case
 * where the setting is changed WHILE the app is open — the user turns Reduce
 * Motion on, comes back, and everything still moves. This subscribes as well,
 * so the answer stays current.
 *
 * Exported so the existing six can adopt it rather than each keeping a copy.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let gone = false;
    AccessibilityInfo.isReduceMotionEnabled().then(r => { if (!gone) setReduced(r); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { gone = true; sub.remove(); };
  }, []);

  return reduced;
}

/**
 * How far a control gives way, by how big it is.
 *
 * One scale value cannot serve every surface, because scale is proportional and
 * perception is not. A 350pt card at 0.94 lurches; an 80pt chip at 0.98 moves
 * 1.6pt in total and reads as nothing at all. These are picked so the ABSOLUTE
 * travel lands in the same 3–6pt band whatever the control's size, which is what
 * makes a card and a chip feel like they belong to one system.
 */
export const PressScale = {
  /** Cards, nav tiles — anything a whole hand's worth of screen wide. */
  surface: 0.98,
  /** Buttons and full-width rows. */
  control: 0.96,
  /** Chips, pills, small inline actions. */
  chip:    0.94,
} as const;

export type PressHaptic = 'light' | 'selection' | 'medium' | 'none';

function fire(h: PressHaptic) {
  if (h === 'light')     hapticLight();
  else if (h === 'selection') hapticSelection();
  else if (h === 'medium')    hapticMedium();
}

/**
 * The press animation, without the component.
 *
 * For the places that already have their own Touchable and only want the feel —
 * or that need the animated style on a node other than the pressable itself.
 */
export function usePressScale({
  scale = PressScale.control,
  haptic = 'light',
  disabled,
}: {
  scale?: number;
  haptic?: PressHaptic;
  disabled?: boolean;
} = {}) {
  const v = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  function onPressIn() {
    if (disabled) return;
    fire(haptic);
    Animated.timing(v, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();
  }

  function onPressOut() {
    if (disabled) return;
    // Spring, not timing. See the header note — the release is the effect.
    // Low bounciness: a finance card that boings reads as a toy, but zero
    // overshoot reads as a dialog box closing. 4 is the smallest value that
    // still feels like the surface pushed back.
    Animated.spring(v, {
      toValue: 0,
      speed: 20,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  }

  // Reduce Motion keeps the feedback and drops the movement. The opacity change
  // is not decoration here — without it a press would have no visible response
  // at all for exactly the users least able to spare one.
  const animatedStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }),
    ...(reduceMotion ? null : {
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }],
    }),
  };

  return { animatedStyle, handlers: { onPressIn, onPressOut } };
}

export interface TouchableProps {
  children: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  /**
   * The control's box — exactly as it would be on a TouchableOpacity.
   *
   * The animation rides this same node (see the note on Touchable), so `flex`,
   * `alignSelf` and width behave identically to the component this replaces.
   * That is what makes swapping one for the other a safe, mechanical change.
   */
  style?: StyleProp<ViewStyle>;
  /** Defaults to `control`. Use `PressScale.surface` for cards. */
  scale?: number;
  /** Defaults to a light impact on press-in. `none` for rows that fire their own. */
  haptic?: PressHaptic;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: React.ComponentProps<typeof Pressable>['accessibilityState'];
  hitSlop?: React.ComponentProps<typeof Pressable>['hitSlop'];
  testID?: string;
}

/**
 * Pressable, made animatable, so the transform lands on the SAME node that
 * carries `style`.
 *
 * The first version of this put the animation on an inner view, which forced
 * every caller whose parent sized it — the two halves of an ActionPair, the
 * two NavTiles in a row — to split its layout across a second prop. That is a
 * trap: it makes the component subtly non-equivalent to the TouchableOpacity it
 * replaces, so migrating the ~136 remaining call sites could not be mechanical
 * and every one would need its flex checked by hand. One node, one style prop,
 * and the swap is safe.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The app's tappable surface. Replaces bare TouchableOpacity everywhere a press
 * should feel like pressing something.
 *
 * Pressable rather than TouchableOpacity because TouchableOpacity owns its own
 * opacity animation and would fight this one for the same style property.
 */
export function Touchable({
  children, onPress, onLongPress, style,
  scale = PressScale.control, haptic = 'light', disabled,
  accessibilityRole = 'button', accessibilityLabel, accessibilityHint,
  accessibilityState, hitSlop, testID,
}: TouchableProps) {
  const { animatedStyle, handlers } = usePressScale({ scale, haptic, disabled });

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      {...handlers}
    >
      {children}
    </AnimatedPressable>
  );
}
