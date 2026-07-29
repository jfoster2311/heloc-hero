// components/ui/SliderField.tsx
import { useRef, useState } from 'react';
import { View, Text, PanResponder } from 'react-native';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticSelection } from '../../lib/haptics';

const THUMB = 38;
const TRACK_HEIGHT = 12;
// Touch target taller than the visual thumb, so the drag area exceeds what's drawn
// (plain Views can't take a hitSlop prop the way Touchables can).
const HIT_HEIGHT = 44;

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}

function snap(raw: number, step: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(raw / step) * step));
}

export default function SliderField({ label, value, min, max, step = 1, format, hint, onChange }: Props) {
  const styles = useStyles();
  const [trackWidth, setTrackWidth] = useState(1);

  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  // Refs keep values fresh inside PanResponder (created once, no stale closures)
  const refs = useRef({ min, max, step, onChange, trackWidth, startRatio: 0, lastValue: value, ratio });
  refs.current.min       = min;
  refs.current.max       = max;
  refs.current.step      = step;
  refs.current.onChange  = onChange;
  refs.current.trackWidth = trackWidth;
  refs.current.lastValue = value;
  refs.current.ratio     = ratio;

  function moveTo(ratioRaw: number) {
    const { min: mn, max: mx, step: st, onChange: cb } = refs.current;
    const clamped = Math.max(0, Math.min(1, ratioRaw));
    const next = snap(mn + clamped * (mx - mn), st, mn, mx);
    if (next !== refs.current.lastValue) {
      hapticSelection();
      refs.current.lastValue = next;
    }
    cb(next);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Only steal the gesture when the move is more horizontal than vertical,
      // so vertical scrolling in the parent ScrollView still works.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) + 2,
      // Grab from wherever the thumb already sits — don't snap to the touch
      // point, or the thumb visibly jumps before the drag starts.
      onPanResponderGrant: () => {
        refs.current.startRatio = refs.current.ratio;
      },
      onPanResponderMove: (_, g) => {
        const { trackWidth: tw, startRatio } = refs.current;
        moveTo(startRatio + g.dx / tw);
      },
    })
  ).current;
  const usableW   = Math.max(0, trackWidth - THUMB);
  const thumbLeft = ratio * usableW;
  const fillWidth = thumbLeft + THUMB / 2;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.valueText}>{format ? format(value) : String(value)}</Text>
      </View>
      <View
        style={styles.trackWrap}
        onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: Math.round(min), max: Math.round(max), now: Math.round(value) }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: Math.max(0, fillWidth) }]} />
        </View>
        {trackWidth > 1 && (
          <View style={[styles.thumb, { left: thumbLeft }]} />
        )}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  container:  { marginBottom: Spacing[4] },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] },
  label:      { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary },
  valueText:  { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint600 },
  trackWrap:  { height: Math.max(HIT_HEIGHT, THUMB), justifyContent: 'center' },
  track: {
    height:          TRACK_HEIGHT,
    borderRadius:    TRACK_HEIGHT / 2,
    backgroundColor: t.colors.gray200,
    overflow:        'hidden',
  },
  fill: {
    height:          '100%',
    backgroundColor: t.colors.mint400,
    borderRadius:    TRACK_HEIGHT / 2,
  },
  thumb: {
    position:        'absolute',
    width:           THUMB,
    height:          THUMB,
    borderRadius:    THUMB / 2,
    backgroundColor: t.colors.mint600,
    borderWidth:     3,
    borderColor:     t.colors.surface,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.18,
    shadowRadius:    3,
    elevation:       3,
    top:             (Math.max(HIT_HEIGHT, THUMB) - THUMB) / 2,
  },
  hint: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: Spacing[1] },
}));
