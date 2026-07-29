// components/ui/GaugeArc.tsx — a 270° arc for one "am I under it" reading.
//
// Same constraint and same technique as DonutRing and LineChart: react-native-svg
// is a native module, so the arc is a dense run of short rotated Views placed by
// trig. See DonutRing for the full reasoning — this is that geometry with the
// sweep cut to 270° and opened at the bottom.
//
// ── Why an arc rather than the bar used everywhere else ────────────────────
// A progress bar is the right mark for a row in a list, because a column of
// bars is comparable down its length. This is the opposite job: one aggregate,
// alone, read at a glance from across a room. The open bottom gives the figure
// somewhere to sit, and the fixed 270° sweep means "nearly full" looks nearly
// full — which a bar in an unfamiliar width does not.
//
// Overshoot is deliberately NOT drawn past the end of the track. A 300%-of-
// budget arc would wrap past its own start and read as 0%, so the arc clamps
// and the caption states the overage in words.
import { View, Text, StyleSheet } from 'react-native';
import { Typography, Spacing, Tracking } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

interface Props {
  /** 0–100, already clamped by the caller's budgetStatus. */
  pct: number;
  /** The fill colour, from getBarColor — never chosen here. */
  color: string;
  /** Small caps above the figure. */
  label: string;
  /** The headline, already formatted. */
  value: string;
  /** One line beneath, e.g. "of a $5,000 budget". */
  sub?: string;
  size?: number;
  thickness?: number;
  accessibilityLabel: string;
}

/** Degrees per tick. Matches DonutRing — past the seam, and cheap. */
const STEP = 2.5;
/** Total sweep. Opens at the bottom, 45° clear on each side. */
const SWEEP = 270;
/** Where the arc starts, measured clockwise from twelve o'clock. */
const START = 135;

export default function GaugeArc({
  pct, color, label, value, sub, size = 200, thickness = 16, accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const radius = (size - thickness) / 2;
  const center = size / 2;
  const filledDeg = (Math.min(100, Math.max(0, pct)) / 100) * SWEEP;

  const ticks: { angle: number; filled: boolean }[] = [];
  for (let a = 0; a <= SWEEP; a += STEP) {
    ticks.push({ angle: a, filled: a <= filledDeg });
  }

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      {ticks.map((t, i) => {
        // START is measured from twelve o'clock going clockwise; screen angles
        // run from three o'clock, hence the -90.
        const deg = START + t.angle - 90;
        const rad = (deg * Math.PI) / 180;
        return (
          <View
            key={i}
            style={[
              styles.tick,
              {
                width: thickness,
                height: thickness,
                borderRadius: thickness / 2,
                backgroundColor: t.filled ? color : colors.gray100,
                left: center + radius * Math.cos(rad) - thickness / 2,
                top:  center + radius * Math.sin(rad) - thickness / 2,
              },
            ]}
          />
        );
      })}

      <View style={styles.center}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {value}
        </Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  wrap: { alignSelf: 'center' },
  tick: { position: 'absolute' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: Tracking.eyebrow,
  },
  value: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: -1,
  },
  sub: { fontSize: Typography.xs, color: t.colors.textMuted, textAlign: 'center' },
}));
