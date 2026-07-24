// components/ui/LineChart.tsx — a smooth line, without react-native-svg.
//
// The first version of this drew N vertical bars with flat 2px caps, which is
// a bar chart wearing a line chart's clothes: every sample became a visible
// stair, and at 64 samples across 340pt the result read as choppy.
//
// A stroke is a sequence of segments, so that is what this draws. Each segment
// is one View, sized to the distance between two points, rotated to their
// angle, and centred on their midpoint. Rotation happens on the GPU, the
// geometry is exact, and the join between segments is hidden by rounding the
// ends — so the line is genuinely smooth rather than finely stepped.
//
// Points are resampled with Catmull-Rom interpolation before they are drawn.
// Financial series are monotone and gently curved; sampling them straight
// produces visible facets on the bends, and one interpolation pass removes
// those for a few dozen extra Views.
//
// This exists instead of react-native-svg because that is a native module: it
// would force a fresh EAS build on every machine that touches the repo, which
// is a heavy price for one chart.
import { useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export interface LineChartSeries {
  /** Y values in data units. X is assumed evenly spaced. */
  values: number[];
  color: string;
  width?: number;
  /** Fills the area beneath the stroke at this alpha. Omit for a bare line. */
  fillColor?: string;
  /** Draws the stroke with a soft glow. One series per chart, at most. */
  glow?: boolean;
}

interface Props {
  series: LineChartSeries[];
  height: number;
  /** Data-space bounds. Supplying both keeps multiple charts comparable. */
  min: number;
  max: number;
  /** Interpolated points per input sample. Higher is smoother and heavier. */
  resolution?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const MAX_POINTS = 160;

export default function LineChart({
  series, height, min, max, resolution = 4, style, children,
}: Props) {
  const [width, setWidth] = useState(0);
  const span = max - min || 1;

  return (
    <View
      style={[{ height, position: 'relative', overflow: 'hidden' }, style]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && series.map((s, si) => {
        if (s.values.length < 2) return null;

        const pts = smooth(s.values, resolution).map((v, i, arr) => ({
          x: (i / (arr.length - 1)) * width,
          y: height - ((v - min) / span) * height,
        }));

        return (
          <View key={si} style={StyleSheet.absoluteFill}>
            {s.fillColor && <Fill points={pts} height={height} color={s.fillColor} />}
            <Stroke
              points={pts}
              color={s.color}
              width={s.width ?? 2}
              glow={s.glow}
            />
          </View>
        );
      })}
      {children}
    </View>
  );
}

/**
 * The stroke: one rotated View per segment.
 *
 * Each segment is placed by its midpoint because RN rotates around a view's
 * centre. Ends are rounded so consecutive segments meet without a notch on the
 * outside of a bend.
 */
function Stroke({ points, color, width, glow }: {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  glow?: boolean;
}) {
  return (
    <>
      {points.slice(0, -1).map((p, i) => {
        const q = points[i + 1];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) return null;

        return (
          <View
            key={i}
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: p.x + dx / 2 - len / 2,
                top: p.y + dy / 2 - width / 2,
                width: len,
                height: width,
                borderRadius: width / 2,
                backgroundColor: color,
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              },
              glow && {
                shadowColor: color,
                shadowOpacity: 0.55,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          />
        );
      })}
    </>
  );
}

/**
 * The area beneath the stroke.
 *
 * Columns, one per interpolated point, so the top edge tracks the same smooth
 * curve the stroke follows. Any residual stepping is sub-pixel at this density
 * and sits under an opaque line, so it never reaches the eye.
 */
function Fill({ points, height, color }: {
  points: { x: number; y: number }[];
  height: number;
  color: string;
}) {
  const w = points.length > 1 ? points[1].x - points[0].x : 0;
  return (
    <>
      {points.map((p, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: p.x - w / 2,
            // Overdraw by a hair so neighbouring columns cannot show a seam.
            width: w + 1,
            top: p.y,
            height: Math.max(0, height - p.y),
            backgroundColor: color,
          }}
        />
      ))}
    </>
  );
}

/**
 * Catmull-Rom resampling.
 *
 * A centripetal spline through the samples, which for monotone financial data
 * cannot overshoot into a false dip the way a naive cubic can — important when
 * the curve is someone's equity and a phantom downturn would be a lie.
 */
function smooth(values: number[], perSegment: number): number[] {
  if (values.length < 3 || perSegment <= 1) return values;

  const budget = Math.max(2, Math.floor(MAX_POINTS / (values.length - 1)));
  const steps = Math.min(perSegment, budget);
  if (steps <= 1) return values;

  const out: number[] = [];
  for (let i = 0; i < values.length - 1; i++) {
    const p0 = values[Math.max(0, i - 1)];
    const p1 = values[i];
    const p2 = values[i + 1];
    const p3 = values[Math.min(values.length - 1, i + 2)];

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const v = 0.5 * (
        2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      );
      // Clamp to the bracketing samples: the spline may only smooth the path
      // between two real data points, never invent a value outside them.
      out.push(Math.min(Math.max(v, Math.min(p1, p2)), Math.max(p1, p2)));
    }
  }
  out.push(values[values.length - 1]);
  return out;
}
