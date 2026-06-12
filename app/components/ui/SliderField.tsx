// components/ui/SliderField.tsx
import { useRef, useState } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

const THUMB = 24;

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
  const [trackWidth, setTrackWidth] = useState(1);

  // Refs keep values fresh inside PanResponder (created once, no stale closures)
  const refs = useRef({ min, max, step, onChange, trackWidth, startRatio: 0 });
  refs.current.min       = min;
  refs.current.max       = max;
  refs.current.step      = step;
  refs.current.onChange  = onChange;
  refs.current.trackWidth = trackWidth;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Only steal the gesture when the move is more horizontal than vertical,
      // so vertical scrolling in the parent ScrollView still works.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) + 2,
      onPanResponderGrant: (e) => {
        const { min: mn, max: mx, step: st, onChange: cb, trackWidth: tw } = refs.current;
        const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / tw));
        refs.current.startRatio = ratio;
        cb(snap(mn + ratio * (mx - mn), st, mn, mx));
      },
      onPanResponderMove: (_, g) => {
        const { min: mn, max: mx, step: st, onChange: cb, trackWidth: tw, startRatio } = refs.current;
        const ratio = Math.max(0, Math.min(1, startRatio + g.dx / tw));
        cb(snap(mn + ratio * (mx - mn), st, mn, mx));
      },
    })
  ).current;

  const ratio     = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
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
        accessibilityValue={{ min, max, now: value }}
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

const styles = StyleSheet.create({
  container:  { marginBottom: Spacing[4] },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] },
  label:      { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  valueText:  { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.mint600 },
  trackWrap:  { height: THUMB, justifyContent: 'center' },
  track: {
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.gray200,
    overflow:        'hidden',
  },
  fill: {
    height:          '100%',
    backgroundColor: Colors.mint400,
    borderRadius:    2,
  },
  thumb: {
    position:        'absolute',
    width:           THUMB,
    height:          THUMB,
    borderRadius:    THUMB / 2,
    backgroundColor: Colors.mint600,
    borderWidth:     3,
    borderColor:     Colors.surface,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.18,
    shadowRadius:    3,
    elevation:       3,
    top:             0,
  },
  hint: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[1] },
});
