// components/ui/Slider.tsx — a real, draggable slider with no native dependency.
//
// ── Why this is not @react-native-community/slider ─────────────────────────
// That package is the right recommendation in the abstract and the wrong one
// here: it is a native module, and per the build rules native modules do not
// run in the current binary. Adding it would mean nobody — including the person
// asking for this screen — could move a slider until a fresh EAS dev build
// finished. This is PanResponder from React Native core, so it works in the
// build that already exists. LineChart made the same trade against react-native-svg.
//
// ── Why it is not a painted track either ───────────────────────────────────
// The obvious shortcut is a filled bar with a thumb pinned at the fill's edge
// and no gesture attached. It looks identical in a screenshot and is a lie in
// the hand: the control the user reaches for does nothing. A fake control is
// exactly what the honesty rule forbids, and a slider is the one widget whose
// entire meaning is "you can drag me".
//
// ── Stepping, and why the value is quantised ───────────────────────────────
// A raw pixel-to-value mapping yields $1,483.62 and a number that flickers on
// every frame. Values snap to `step`, which makes the readout stable, gives the
// haptic something to fire on, and makes the keyboard/VoiceOver increment
// meaningful. The thumb is drawn from the SNAPPED value, so what the finger sees
// and what the model holds can never drift apart.
import { useRef, useState, useCallback } from 'react';
import { View, Text, PanResponder, type LayoutChangeEvent } from 'react-native';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticSelection } from '../../lib/haptics';

const THUMB = 28;
/** Apple HIG minimum. The visible track is thin; the grab area is not. */
const TOUCH_H = 44;

interface Props {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Rendered under each end of the track. */
  minLabel?: string;
  maxLabel?: string;
  /** Spoken by VoiceOver in place of the raw number. */
  formatValue?: (v: number) => string;
  accessibilityLabel: string;
  onDark?: boolean;
}

export default function Slider({
  value, onChange, min, max, step,
  minLabel, maxLabel, formatValue, accessibilityLabel, onDark = false,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  // Refs, not state: the responder callbacks are created once and would
  // otherwise close over the width and value from first render forever.
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clampSnap = useCallback((raw: number) => {
    const snapped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, snapped));
  }, [min, max, step]);

  /** Track x → value. Shared by the initial tap and every drag frame. */
  const fromX = useCallback((x: number) => {
    const usable = widthRef.current - THUMB;
    if (usable <= 0) return valueRef.current;
    const pct = Math.min(1, Math.max(0, (x - THUMB / 2) / usable));
    return clampSnap(min + pct * (max - min));
  }, [min, max, clampSnap]);

  const emit = useCallback((next: number) => {
    // Only when the snapped value actually moved, so the haptic fires once per
    // step rather than once per frame — sixty buzzes a second is a broken phone,
    // not feedback.
    if (next !== valueRef.current) {
      valueRef.current = next;
      hapticSelection();
      onChange(next);
    }
  }, [onChange]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Claim the gesture so the enclosing ScrollView does not steal a
      // horizontal drag that began on the track.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => {
        // `moveX` during a drag is page-relative while `locationX` is track-
        // relative, so the track's page origin is needed to convert between
        // them. It is captured here rather than in an `onTouchStart` prop
        // because the pan responder claims the touch and there is no guarantee
        // the View's own touch handler runs — the grant callback always does.
        pageOffset.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        emit(fromX(e.nativeEvent.locationX));
      },
      onPanResponderMove: (_e, g) => emit(fromX(g.moveX - pageOffset.current)),
    }),
  ).current;

  const pageOffset = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  // Clamped, because `value` is owned by the caller and the same field may also
  // be typed into elsewhere. A surplus of $8,000 against a $5,000 track would
  // otherwise put the thumb off the right edge of the screen.
  const pct = max > min
    ? Math.min(1, Math.max(0, (value - min) / (max - min)))
    : 0;
  const thumbLeft = pct * Math.max(0, width - THUMB);
  const shown = formatValue ? formatValue(value) : String(value);

  return (
    <View>
      <View
        style={styles.touch}
        onLayout={onLayout}
        {...responder.panHandlers}
        // "adjustable" is what tells VoiceOver this is a slider and enables the
        // swipe-up/down gesture, which the increment/decrement actions serve.
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: shown }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => {
          if (e.nativeEvent.actionName === 'increment') emit(clampSnap(value + step));
          if (e.nativeEvent.actionName === 'decrement') emit(clampSnap(value - step));
        }}
      >
        <View style={[styles.track, onDark && styles.trackOnDark]}>
          <View
            style={[
              styles.fill,
              onDark && styles.fillOnDark,
              { width: `${pct * 100}%` },
            ]}
          />
        </View>
        <View
          style={[styles.thumb, { left: thumbLeft }]}
          // Decorative: the parent already carries the role and the value.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.thumbDot, { backgroundColor: colors.mint600 }]} />
        </View>
      </View>

      {(minLabel || maxLabel) && (
        <View style={styles.labels}>
          <Text style={[styles.labelText, onDark && styles.labelTextOnDark]}>{minLabel}</Text>
          <Text style={[styles.labelText, onDark && styles.labelTextOnDark]}>{maxLabel}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  touch: {
    height: TOUCH_H,
    justifyContent: 'center',
    // The thumb is positioned against this box, so it must not clip.
    overflow: 'visible',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.borderSubtle,
    overflow: 'hidden',
  },
  trackOnDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: t.colors.mint600 },
  fillOnDark: { backgroundColor: t.colors.mint400 },

  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifted off the track so it reads as grabbable.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbDot: { width: 10, height: 10, borderRadius: 5 },

  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing[1],
  },
  labelText: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    fontWeight: Typography.medium,
  },
  labelTextOnDark: { color: 'rgba(255,255,255,0.6)' },
}));
