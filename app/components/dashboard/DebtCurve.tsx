// components/dashboard/DebtCurve.tsx — the falling debt line behind the hero.
//
// GPU-drawn (Skia) rather than a stack of Views, because this sits BEHIND a
// 48pt number on a blurred surface and repaints whenever the hero does. The
// same shape in Views would be dozens of nodes composited on the JS thread.
//
// ── What this line is, precisely ────────────────────────────────────────────
// It is a PROJECTION, not history. Nothing in this app stores a balance time
// series — `plaid_accounts` holds current balances and nothing else — so a
// curve of where debt HAS been would be invented from the single point we have.
// Same rule EquityCurve already follows, and the caller must label it.
//
// The points come from `computeEquitySeries` inverted: home value is held flat
// in that model, so `debt = homeValue - equity` exactly. Deriving it rather
// than modelling debt separately is deliberate — two models would drift, and
// then the hero and the payoff date underneath it would tell different stories.
import { useEffect, useMemo } from 'react';
import { Canvas, Path, Skia, LinearGradient, vec, Circle, Group } from '@shopify/react-native-skia';
import {
  useSharedValue, withSpring, withRepeat, withTiming, useDerivedValue, Easing,
} from 'react-native-reanimated';

interface Props {
  /** Debt at each sampled month, present first. Needs at least two. */
  points: number[];
  width: number;
  height: number;
  /** Neon. Only legible on the dark hero — see the `neon` note in theme.ts. */
  color: string;
  /** Skips the draw-on for reduce-motion. The line still renders, just settled. */
  animate?: boolean;
}

/** Inset so the stroke and the end dot are not clipped by the canvas edge. */
const PAD = 6;

export default function DebtCurve({ points, width, height, color, animate = true }: Props) {
  // 0 → 1 drives how much of the line is drawn.
  const progress = useSharedValue(animate ? 0 : 1);
  // A separate, looping value for the end-point pulse. Kept apart from
  // `progress` so the pulse cannot rewind the draw-on when it repeats.
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!animate) { progress.value = 1; return; }
    // Spring rather than a linear draw: the line decelerates into place, which
    // reads as something settling rather than a progress bar filling.
    progress.value = withSpring(1, { stiffness: 250, damping: 30, mass: 1 });
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [animate, points.length]);

  const { line, area, lastX, lastY, ok } = useMemo(() => {
    const n = points.length;
    if (n < 2 || width <= 0 || height <= 0) {
      return { line: Skia.Path.Make(), area: Skia.Path.Make(), lastX: 0, lastY: 0, ok: false };
    }

    const min = Math.min(...points);
    const max = Math.max(...points);
    // A flat series would divide by zero. It also genuinely happens — someone
    // with no surplus has a debt line that does not move — so it draws as a
    // level line through the middle rather than as a crash to the axis.
    const span = max - min || 1;

    const innerW = width - PAD * 2;
    const innerH = height - PAD * 2;
    const xs = (i: number) => PAD + (i / (n - 1)) * innerW;
    const ys = (v: number) => PAD + (1 - (v - min) / span) * innerH;

    const line = Skia.Path.Make();
    line.moveTo(xs(0), ys(points[0]));
    // Midpoint quadratics: smooth enough to sweep, cheap enough to rebuild, and
    // it cannot overshoot the way a Catmull-Rom spline does — an overshoot here
    // would draw debt curving BELOW its own minimum, which is a lie about the
    // projection even if only by a few pixels.
    for (let i = 1; i < n; i++) {
      const px = xs(i - 1), py = ys(points[i - 1]);
      const cx = xs(i), cy = ys(points[i]);
      line.quadTo(px, py, (px + cx) / 2, (py + cy) / 2);
    }
    line.lineTo(xs(n - 1), ys(points[n - 1]));

    // The area is the same curve closed to the floor. Copied from the line so
    // the two can never disagree about the shape.
    const area = line.copy();
    area.lineTo(width, height);
    area.lineTo(0, height);
    area.close();

    return { line, area, lastX: xs(n - 1), lastY: ys(points[n - 1]), ok: true };
  }, [points, width, height]);

  // The fill trails the line slightly and never reaches full strength — it is
  // there to give the curve weight, not to be looked at.
  const areaOpacity = useDerivedValue(() => Math.max(0, progress.value - 0.15) * 0.9);
  const dotOpacity  = useDerivedValue(() => (progress.value > 0.9 ? 1 : 0));
  const dotRadius   = useDerivedValue(() => 3.5 + pulse.value * 1.5);
  const haloRadius  = useDerivedValue(() => 7 + pulse.value * 4);
  const haloOpacity = useDerivedValue(() =>
    (progress.value > 0.9 ? 1 : 0) * (0.28 - pulse.value * 0.14));

  if (!ok) return null;

  return (
    <Canvas style={{ width, height }}>
      <Group opacity={areaOpacity}>
        <Path path={area} style="fill">
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            // Fades to fully transparent rather than to the surface colour, so
            // the blurred hero behind it still shows through the tail.
            colors={[`${color}59`, `${color}00`]}
          />
        </Path>
      </Group>

      <Path
        path={line}
        style="stroke"
        strokeWidth={2.5}
        strokeCap="round"
        strokeJoin="round"
        color={color}
        // Native path trimming: `end` walks the stroke along the curve, which is
        // what makes it draw rather than fade in. Animating opacity instead
        // would reveal the whole shape at once.
        start={0}
        end={progress}
      />

      {/* The head of the line, pulsing to say the trajectory is live. */}
      <Circle cx={lastX} cy={lastY} r={haloRadius} color={color} opacity={haloOpacity} />
      <Circle cx={lastX} cy={lastY} r={dotRadius} color={color} opacity={dotOpacity} />
    </Canvas>
  );
}
