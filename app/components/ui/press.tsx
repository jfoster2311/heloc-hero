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
  Animated, Pressable, AccessibilityInfo, LayoutAnimation, Platform, UIManager,
  type ViewStyle, type StyleProp, type AccessibilityRole,
  type LayoutAnimationConfig,
} from 'react-native';
import { hapticLight, hapticSelection, hapticMedium } from '../../lib/haptics';

/**
 * A module-level mirror of the Reduce Motion setting.
 *
 * `useReduceMotion` below covers components. `animateLayout` is called from
 * inside event handlers, where a hook cannot reach — so the value is cached here
 * and kept current by the same subscription. Read it; never write it.
 */
let reduceMotionNow = false;
AccessibilityInfo.isReduceMotionEnabled().then(r => { reduceMotionNow = r; });
AccessibilityInfo.addEventListener('reduceMotionChanged', r => { reduceMotionNow = r; });

// LayoutAnimation is opt-in on Android and silently does nothing without this.
// It used to be enabled at the top of app/tabs/calculator.tsx — a ROUTE module,
// so whether the app's accordions animated depended on whether the user had
// visited the Calculator tab yet. Here it runs when the press system loads,
// which every screen does.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * The app's one disclosure curve — for a section opening or closing in place.
 *
 * 200ms rather than the 300ms of `Presets.easeInEaseOut`, which every call site
 * used. On a disclosure that is noticeably slow: the user has already decided to
 * open the thing and is waiting on the chrome to catch up. 200 still reads as a
 * reveal rather than a jump.
 *
 * `opacity` on create/delete so the content fades as the container resizes
 * instead of appearing at full strength against a box still growing under it.
 */
const DISCLOSURE: LayoutAnimationConfig = {
  duration: 200,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

/**
 * Animate the next layout pass — for expanding a section, revealing rows, or
 * any state change whose only visual is the page reflowing.
 *
 * Call it immediately before the `setState` that changes the layout.
 *
 * This exists because six call sites each rolled their own, and they had drifted
 * into three different behaviours: three guarded on `Platform.OS === 'ios'` and
 * so never animated on Android at all, three did not and depended on a flag set
 * in a route module, and NONE of them checked Reduce Motion — so the one setting
 * a user can use to say "stop moving things" was honoured by every animation in
 * the app except the ones that reflow the page under their finger.
 */
export function animateLayout() {
  if (reduceMotionNow) return;
  LayoutAnimation.configureNext(DISCLOSURE);
}

/**
 * Whether the user has asked the system to stop animating things.
 *
 * For CONTINUOUS or REPEATED motion — a press response, a looping shimmer, a
 * control's grab state. It seeds from the module cache above rather than from
 * `false`, which matters: the setting is only readable asynchronously, so a hook
 * starting at `false` would let the first press of the session animate before
 * the answer arrived. After the first read at app start the cache is warm, so
 * every component mounting later is correct on its very first render.
 *
 * ── Not for entrance animations, and that is not an oversight ──────────────
 * Five components here — BootSplash, SuccessReveal, FreedomBoard, the welcome
 * screen and the reveal — keep their own one-shot `isReduceMotionEnabled()`
 * read, and they are right to. Their animation runs ONCE on mount and then
 * never again, so there is nothing for a live subscription to update; what it
 * would do instead is re-run the effect mid-flight if the setting changed,
 * restarting or jumping an entrance that was halfway through. A one-shot read
 * is the correct shape for a one-shot animation. Reach for this hook when the
 * motion outlives the decision to start it.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(reduceMotionNow);

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
 *
 * Returns `fireHaptic` separately rather than firing it from `onPressIn`. See
 * the note on that split below; call it from `onPress`, not from press-in.
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

  /**
   * The buzz — for `onPress`, NOT for press-in.
   *
   * This fired from `onPressIn` first, on the reasoning that iOS puts impact
   * feedback on touch-down and so anything later feels behind the finger. Half
   * of that is right and it is the visual half: the SCALE still lands on
   * touch-down, which is what actually makes a control feel instant.
   *
   * The haptic does not belong there, for two reasons.
   *
   * The one that matters: press-in is not yet a tap. Every card, row and tile in
   * this app lives inside a ScrollView, and a touch that lands and then becomes
   * a drag fires press-in and then cancels. iOS's `delaysContentTouches` hides
   * most of that — start moving quickly and the child never sees the touch — but
   * not the common case of resting a thumb on a card for a moment before
   * scrolling. That buzzed. In a finance app a haptic asserts SOMETHING
   * HAPPENED, and firing it for a scroll that touched a card on the way past is
   * the app claiming an action the user did not take.
   *
   * The one that settles it: this is also what the platform does. UISwitch fires
   * when it toggles, UISegmentedControl when the selection changes — on the
   * state change, not on contact. `UIImpactFeedbackGenerator` is documented as
   * being for when the impact OCCURS. For a button, that is the action.
   *
   * The cost is about 100ms of lateness on a real tap, against the visual which
   * is still immediate. That trade is the right way round.
   */
  function fireHaptic() {
    if (disabled) return;
    fire(haptic);
  }

  return { animatedStyle, handlers: { onPressIn, onPressOut }, fireHaptic };
}

export interface TouchableProps {
  /** Optional: a bare overlay target — the reveal's tap-to-skip — has none. */
  children?: React.ReactNode;
  /**
   * Optional because of `<Link asChild>`, which clones this element and injects
   * its own handler. Those call sites genuinely have no onPress to give.
   */
  onPress?: () => void;
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
  /**
   * Custom actions, for a control that also answers to a gesture.
   *
   * A swipe is invisible to VoiceOver and to Switch Control, so any row that
   * hides an action behind one has to publish that action here as well or the
   * action does not exist for those users. Paired with `onAccessibilityAction`.
   */
  accessibilityActions?: React.ComponentProps<typeof Pressable>['accessibilityActions'];
  onAccessibilityAction?: React.ComponentProps<typeof Pressable>['onAccessibilityAction'];
  hitSlop?: React.ComponentProps<typeof Pressable>['hitSlop'];
  /**
   * For the rare control that should be invisible to assistive tech — the
   * full-bleed skip target on the reveal, which duplicates a labelled button.
   */
  accessible?: boolean;
  importantForAccessibility?: React.ComponentProps<typeof Pressable>['importantForAccessibility'];
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
  accessibilityState, accessibilityActions, onAccessibilityAction,
  hitSlop, accessible, importantForAccessibility, testID,
}: TouchableProps) {
  const { animatedStyle, handlers, fireHaptic } = usePressScale({ scale, haptic, disabled });

  // The buzz rides the confirmed tap; the scale already landed on touch-down.
  // See fireHaptic for why the two are split. Fires BEFORE the caller's handler
  // so feedback is not queued behind whatever navigation it kicks off.
  const press = disabled
    ? undefined
    : () => { fireHaptic(); onPress?.(); };

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      onPress={press}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      testID={testID}
      accessible={accessible}
      importantForAccessibility={importantForAccessibility}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      {...handlers}
    >
      {children}
    </AnimatedPressable>
  );
}
