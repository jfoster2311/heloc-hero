// components/cashflow/VelocityTracker.tsx — the race against the plan.
//
// A standard income/expense bar chart answers "what happened". This answers the
// only question velocity banking actually turns on: is the surplus the payoff
// date was sized on showing up THIS period, or has it quietly slipped? So the
// two lines are cumulative and they share an axis — the solid one riding above
// the dotted one is the whole reading, and it takes no arithmetic.
//
// ── What the two lines are ─────────────────────────────────────────────────
// Solid: measured. Cumulative net from the linked accounts, stopping at today.
// Dotted: the user's OWN figures spread evenly across the period. It is a pace,
// not a forecast this app invented, and the caption says so.
//
// Both are before the mortgage payment, which is modelled rather than measured —
// see the basis note at the top of lib/velocity.ts. The card states it, because
// a net figure that silently excluded the largest outflow of the month would be
// the most flattering possible lie on the most important number here.
//
// ── Why Skia and why the paths morph ───────────────────────────────────────
// This canvas repaints on every frame of a scrub, and the timeframe pills change
// its shape entirely. Remounting a chart on a timeframe change is what makes an
// app feel assembled: the container flashes, the card jumps height, and the user
// loses the thread between the two views. So the canvas is never remounted —
// both series are resampled to a FIXED number of points, and the pills animate
// between the old sample array and the new one on the UI thread. A spring rather
// than a timing curve, so it decelerates into the new shape like something with
// mass.
//
// The line is a polyline, deliberately, where DebtCurve is smoothed. That curve
// is a projection whose exact path means nothing; this one is a ledger, and
// rounding the corner off a payday would draw money arriving on a day it did not.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Path, Skia, Circle, DashPathEffect } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useDerivedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient as ExpoGradient } from 'expo-linear-gradient';
import { Touchable } from '../ui/press';
import { Typography, Spacing, Radius, Tracking, Gradients } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticSelection } from '../../lib/haptics';
import { PERIODS, type PeriodId, type PeriodRange } from '../../lib/spending';
import type { VelocitySeries } from '../../lib/velocity';

/**
 * Points every series is resampled to.
 *
 * Fixed so that a week (7 days) and a year (365) produce arrays of the same
 * length, which is what makes them interpolable — you cannot morph between
 * paths of different point counts without inventing points anyway, so they are
 * invented once, here, rather than per transition.
 */
const SAMPLES = 48;
const CHART_H = 148;
/** Inset so the stroke, the end dot and the crosshair are not clipped. */
const PAD = 8;
/** The house spring. Same values as SweepSlider — one physics for the app. */
const SPRING = { stiffness: 250, damping: 30, mass: 1 };

interface Props {
  series: VelocitySeries;
  range: PeriodRange;
  period: PeriodId;
  onChangePeriod: (p: PeriodId) => void;
  /** False while the figures are still loading, so the card can hold its shape. */
  ready: boolean;
}

/** One period's chart, already normalised into 0–1 space. */
interface Frame {
  /** Cumulative net, resampled and normalised. */
  actual: number[];
  /** The even pace, resampled and normalised. Flat at `zero` with no plan. */
  plan: number[];
  /** Where $0 sits, normalised. The line crosses it when the period is negative. */
  zero: number;
  /** Share of the width the measured line spans — short while a period runs. */
  actualEnd: number;
  /** 1 when there is a plan to draw. Interpolated, so the ghost fades in. */
  hasPlan: number;
  /**
   * 1 when there are real rows behind the measured line.
   *
   * Without this the chart draws a flat line at $0 for an account that has sent
   * nothing yet, which reads as "you netted exactly zero" — a measurement,
   * where the truth is that no measurement exists. Interpolated rather than
   * branched so the line fades in when the first transactions land.
   */
  hasActual: number;
}

export default function VelocityTracker({
  series, range, period, onChangePeriod, ready,
}: Props) {
  const styles = useStyles();
  const { colors, mode } = useTheme();
  const [width, setWidth] = useState(0);

  // ── The frame this period resolves to ────────────────────────────────────
  const frame = useMemo(() => buildFrame(series), [series]);

  // ── Morphing between frames ──────────────────────────────────────────────
  // `from` holds the shape currently on screen and `to` the one being animated
  // toward; `t` walks between them. Seeding `from` with the first frame rather
  // than with zeros matters — otherwise the very first render animates up from a
  // flat line, which reads as a loading animation for data that was already there.
  const from = useSharedValue<Frame>(frame);
  const to   = useSharedValue<Frame>(frame);
  const t    = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      from.value = frame;
      to.value = frame;
      t.value = 1;
      return;
    }
    // Snapshot where the morph currently IS, so interrupting one transition with
    // another continues from the visible shape rather than snapping back to the
    // last settled one.
    from.value = blend(from.value, to.value, t.value);
    to.value = frame;
    t.value = 0;
    t.value = withSpring(1, SPRING);
  }, [frame]);

  // ── Scrubbing ────────────────────────────────────────────────────────────
  // `scrubX` is the finger, on the UI thread. `scrubDay` is the day it has
  // landed on, mirrored into React state only when it CHANGES — at 120fps an
  // unguarded setState per frame would be a re-render storm, and an unguarded
  // haptic would be a continuous buzz rather than a comb of clicks.
  const scrubX = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const lastDay = useSharedValue(-1);
  const [scrubDay, setScrubDay] = useState<number | null>(null);

  const maxDay = Math.max(0, series.elapsed - 1);

  const onDay = useCallback((d: number | null) => {
    if (d !== null) hapticSelection();
    setScrubDay(d);
  }, []);

  const innerW = Math.max(1, width - PAD * 2);
  // The measured line stops at today, so the crosshair stops there too. Letting
  // the finger run into the rest of the month would read a value off days that
  // have not happened — the same reason `actualEnd` exists on the frame.
  const spanW = innerW * (series.days <= 1 ? 1 : Math.max(0.02, Math.min(1, series.elapsed / series.days)));

  const pan = Gesture.Pan()
    // Nothing to read off an empty chart, and a crosshair that reported "$0 on
    // 12 Aug" over a line that is not there would be inventing a measurement.
    .enabled(series.measured)
    // The chart lives in a vertical ScrollView. Without a horizontal activation
    // window the scrub steals every attempt to scroll the page past this card.
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(e => {
      scrubbing.value = withTiming(1, { duration: 120 });
      scrubX.value = Math.min(Math.max(PAD, e.x), PAD + spanW);
      lastDay.value = -1;
    })
    .onUpdate(e => {
      const x = Math.min(Math.max(PAD, e.x), PAD + spanW);
      scrubX.value = x;
      const frac = spanW <= 0 ? 0 : (x - PAD) / spanW;
      const day = Math.min(maxDay, Math.max(0, Math.round(frac * maxDay)));
      if (day !== lastDay.value) {
        lastDay.value = day;
        runOnJS(onDay)(day);
      }
    })
    .onFinalize(() => {
      scrubbing.value = withTiming(0, { duration: 160 });
      lastDay.value = -1;
      runOnJS(onDay)(null);
    });

  // ── The paths, rebuilt on the UI thread ──────────────────────────────────
  const actualPath = useDerivedValue(() =>
    linePath(blendArr(from.value.actual, to.value.actual, t.value),
             width, CHART_H,
             from.value.actualEnd + (to.value.actualEnd - from.value.actualEnd) * t.value));

  const planPath = useDerivedValue(() =>
    linePath(blendArr(from.value.plan, to.value.plan, t.value), width, CHART_H, 1));

  const planOpacity = useDerivedValue(() =>
    from.value.hasPlan + (to.value.hasPlan - from.value.hasPlan) * t.value);

  const actualOpacity = useDerivedValue(() =>
    from.value.hasActual + (to.value.hasActual - from.value.hasActual) * t.value);

  const zeroY = useDerivedValue(() => {
    const z = from.value.zero + (to.value.zero - from.value.zero) * t.value;
    return PAD + (1 - z) * (CHART_H - PAD * 2);
  });

  const crossX = useDerivedValue(() => scrubX.value);
  const crossOpacity = useDerivedValue(() => scrubbing.value);
  const crossY = useDerivedValue(() => {
    const arr = blendArr(from.value.actual, to.value.actual, t.value);
    const end = from.value.actualEnd + (to.value.actualEnd - from.value.actualEnd) * t.value;
    const innerWv = Math.max(1, width - PAD * 2);
    const span = Math.max(1e-6, innerWv * end);
    const frac = Math.min(1, Math.max(0, (scrubX.value - PAD) / span));
    const i = Math.min(arr.length - 1, Math.max(0, Math.round(frac * (arr.length - 1))));
    return PAD + (1 - (arr[i] ?? 0)) * (CHART_H - PAD * 2);
  });

  const tipStyle = useAnimatedStyle(() => ({
    opacity: scrubbing.value,
    transform: [{ translateX: scrubX.value }],
  }));

  // ── Copy ─────────────────────────────────────────────────────────────────
  const scrubbed = scrubDay === null ? null : {
    net: series.actual[scrubDay] ?? 0,
    date: dayLabel(range.start, scrubDay),
  };
  const headline = scrubbed ? scrubbed.net : series.netToDate;
  const ahead = series.planToDate !== null && series.netToDate >= series.planToDate;

  return (
    <View style={styles.shell}>
      <ExpoGradient
        colors={mode === 'dark' ? Gradients.machinedDark : Gradients.machined}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.head}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          {periodWord(period).toUpperCase()} VELOCITY
        </Text>
        <PeriodPills value={period} onChange={onChangePeriod} />
      </View>

      <Text
        style={styles.figure}
        accessibilityLabel={
          `Net ${headline < 0 ? 'minus ' : ''}$${money(Math.abs(headline))} ` +
          (scrubbed ? `on ${scrubbed.date}` : `so far this ${periodWord(period).toLowerCase()}`)
        }
      >
        {headline < 0 ? '−' : '+'}${money(Math.abs(headline))}
      </Text>

      <Text style={styles.sub}>
        {scrubbed
          ? `${scrubbed.date} · running total`
          : series.measured
            ? `${range.rangeLabel}${range.inProgress ? ' · in progress' : ''}`
            : 'Nothing measured in this window'}
      </Text>

      <GestureDetector gesture={pan}>
        <View
          style={styles.chartWrap}
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            !series.measured
              ? 'No measured cash flow in this window'
              : series.planToDate === null
                ? `Net ${money(series.netToDate)} dollars so far`
                : `Net ${money(series.netToDate)} dollars so far, against a planned pace of ` +
                  `${money(series.planToDate)}. Running ${ahead ? 'ahead of' : 'behind'} plan.`
          }
        >
          {width > 0 && ready && (
            <Canvas style={{ width, height: CHART_H }}>
              {/* The plan. Dotted because it did not happen — a solid second
                  line reads as a second measurement. */}
              <Path
                path={planPath}
                style="stroke"
                strokeWidth={1.5}
                strokeCap="round"
                color={colors.textMuted}
                opacity={planOpacity}
              >
                <DashPathEffect intervals={[3, 5]} />
              </Path>

              {/* Reality. */}
              <Path
                path={actualPath}
                style="stroke"
                strokeWidth={2.5}
                strokeCap="round"
                strokeJoin="round"
                color={colors.accentInk}
                opacity={actualOpacity}
              />

              {/* The head of the scrub, riding the measured line. */}
              <Circle
                cx={crossX}
                cy={crossY}
                r={4.5}
                color={colors.accentInk}
                opacity={crossOpacity}
              />
            </Canvas>
          )}

          {/* Both rules are Views rather than Skia nodes: each sits at an
              animated coordinate, and an absolutely-positioned hairline driven
              by a transform is one node against a Group plus a matrix. */}
          <Rule style={styles.zeroRule} y={zeroY} />
          <Rule style={styles.crosshair} x={crossX} opacity={crossOpacity} />

          <Animated.View style={[styles.tip, tipStyle]} pointerEvents="none">
            <View style={styles.tipInner}>
              <Text style={styles.tipText}>
                {scrubbed
                  ? `${scrubbed.date} · ${scrubbed.net < 0 ? '−' : '+'}$${money(Math.abs(scrubbed.net))}`
                  : ''}
              </Text>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSolid, { backgroundColor: colors.accentInk }]} />
          <Text style={styles.legendText}>What cleared</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDashed}>
            <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
            <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
            <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
          </View>
          <Text style={styles.legendText}>Your plan, at an even pace</Text>
        </View>
      </View>

      {/* The basis, on the card making the claim. See lib/velocity.ts. */}
      <Text style={styles.basis}>
        Money in minus money out, before your mortgage payment — the strategy
        models that separately.
      </Text>
    </View>
  );
}

/**
 * A hairline pinned to an animated coordinate — the $0 baseline and the
 * crosshair are the same thing at ninety degrees to each other.
 */
function Rule({ style: base, x, y, opacity }: {
  style: StyleProp<ViewStyle>;
  x?: SharedValue<number>;
  y?: SharedValue<number>;
  opacity?: SharedValue<number>;
}) {
  const animated = useAnimatedStyle(() => ({
    opacity: opacity ? opacity.value : 1,
    transform: [
      { translateX: x ? x.value : 0 },
      { translateY: y ? y.value : 0 },
    ],
  }));
  return <Animated.View style={[base, animated]} pointerEvents="none" />;
}

// ─── The timeframe control ────────────────────────────────────────────────────

/**
 * Sits in this card's header rather than above it, because this card is the top
 * of the screen — a control floating above the hero would have nothing to
 * belong to. It still governs every card below, which is safe because each of
 * those states its own range: the breakdown and the summary print `rangeLabel`,
 * and the budget card names its month precisely because it does NOT follow this.
 */
function PeriodPills({ value, onChange }: {
  value: PeriodId;
  onChange: (p: PeriodId) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.pills} accessibilityRole="tablist">
      {PERIODS.map(p => {
        const active = p.id === value;
        return (
          <Touchable
            key={p.id}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(p.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show this ${p.label.toLowerCase()}`}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {SHORT[p.id]}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const SHORT: Record<PeriodId, string> = {
  week: 'Wk', month: 'Mo', quarter: 'Qtr', year: 'Yr',
};

// ─── Geometry ─────────────────────────────────────────────────────────────────

/**
 * A period's two series, resampled to a fixed length and normalised together.
 *
 * Normalised against a SHARED domain — the union of both lines and $0 — because
 * the entire point of the chart is which line is above the other. Scaling them
 * independently would make them cross wherever the maths happened to put them.
 */
function buildFrame(s: VelocitySeries): Frame {
  const hasPlan = s.projected.length > 0;
  const pool = [0, ...s.actual, ...(hasPlan ? s.projected : [])];
  let lo = Math.min(...pool);
  let hi = Math.max(...pool);
  // A flat series would divide by zero, and it genuinely happens — a linked
  // account with no activity yet. Opened out around the value so it draws as a
  // level line through the middle rather than pinned to an edge.
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
  const norm = (v: number) => (v - lo) / (hi - lo);

  const zero = norm(0);
  return {
    actual: resample(s.actual.length > 0 ? s.actual.map(norm) : [zero, zero], SAMPLES),
    plan:   resample(hasPlan ? s.projected.map(norm) : [zero, zero], SAMPLES),
    zero,
    // A one-day period would divide by zero; it also draws nothing useful, so
    // the measured line spans the full width and is a single point.
    actualEnd: s.days <= 1 ? 1 : Math.max(0.02, Math.min(1, s.elapsed / s.days)),
    hasPlan: hasPlan ? 1 : 0,
    hasActual: s.measured ? 1 : 0,
  };
}

/** Linear resample to exactly `n` points. */
function resample(values: number[], n: number): number[] {
  const m = values.length;
  if (m === 0) return new Array(n).fill(0);
  if (m === 1) return new Array(n).fill(values[0]);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (m - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(m - 1, lo + 1);
    out.push(values[lo] + (values[hi] - values[lo]) * (pos - lo));
  }
  return out;
}

/** Two frames, mixed. Runs on the UI thread during a morph. */
function blend(a: Frame, b: Frame, t: number): Frame {
  'worklet';
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    actual: blendArr(a.actual, b.actual, t),
    plan:   blendArr(a.plan, b.plan, t),
    zero:   mix(a.zero, b.zero),
    actualEnd: mix(a.actualEnd, b.actualEnd),
    hasPlan: mix(a.hasPlan, b.hasPlan),
    hasActual: mix(a.hasActual, b.hasActual),
  };
}

function blendArr(a: number[], b: number[], t: number): number[] {
  'worklet';
  if (t >= 1) return b;
  if (t <= 0) return a;
  const out: number[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) out.push(a[i] + (b[i] - a[i]) * t);
  return out;
}

/**
 * Normalised samples → a polyline path.
 *
 * `xEnd` is how much of the width the line spans, which is what draws a running
 * period short rather than flat to the end of the month.
 */
function linePath(vals: number[], w: number, h: number, xEnd: number) {
  'worklet';
  const p = Skia.Path.Make();
  const n = vals.length;
  if (n < 2 || w <= 0) return p;
  const innerW = (w - PAD * 2) * Math.max(0.001, xEnd);
  const innerH = h - PAD * 2;
  const x = (i: number) => PAD + (i / (n - 1)) * innerW;
  const y = (v: number) => PAD + (1 - v) * innerH;
  p.moveTo(x(0), y(vals[0]));
  for (let i = 1; i < n; i++) p.lineTo(x(i), y(vals[i]));
  return p;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function money(n: number) { return Math.round(n).toLocaleString('en-US'); }

function periodWord(p: PeriodId): string {
  return p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly'
    : p === 'quarter' ? 'Quarterly' : 'Yearly';
}

function dayLabel(start: Date, offset: number): string {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles(t => ({
  shell: {
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
    paddingBottom: Spacing[4],
    borderWidth: 1,
    borderColor: t.colors.machinedEdge,
    ...t.shadows.ambient,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
  },
  eyebrow: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: Typography.extrabold,
    letterSpacing: Tracking.eyebrow,
    // 4.95:1 on `machinedNear`, 4.52 on `machinedFar` — the tightest pairing in
    // the app. See the Machined Silver note in lib/theme.ts before darkening it.
    color: t.colors.textMuted,
  },
  figure: {
    fontSize: 42,
    lineHeight: 50,
    fontWeight: Typography.extrabold,
    letterSpacing: Tracking.display,
    // NOT `neon`, which measures 2.18–2.28 on these surfaces however good it
    // looks on the dashboard's dark hero.
    color: t.colors.accentInk,
    marginTop: Spacing[3],
    ...Typography.tabular,
  },
  sub: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    marginTop: 2,
  },

  chartWrap: {
    marginTop: Spacing[4],
    height: CHART_H,
    justifyContent: 'flex-start',
  },
  zeroRule: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    top: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.machinedEdge,
  },
  crosshair: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: StyleSheet.hairlineWidth,
    height: CHART_H,
    backgroundColor: t.colors.textMuted,
  },
  tip: {
    position: 'absolute',
    top: 0,
    left: -44,
    width: 88,
    alignItems: 'center',
  },
  tipInner: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: t.colors.machinedNear,
    borderWidth: 1,
    borderColor: t.colors.machinedEdge,
  },
  tipText: {
    fontSize: 11,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[4],
    marginTop: Spacing[3],
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSolid: { width: 14, height: 2.5, borderRadius: 2 },
  legendDashed: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  dash: { width: 3, height: 1.5, borderRadius: 1 },
  legendText: { fontSize: 11, color: t.colors.textMuted },

  basis: {
    fontSize: 11,
    color: t.colors.textMuted,
    lineHeight: 16,
    marginTop: Spacing[3],
  },

  pills: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.full,
    backgroundColor: t.colors.machinedFar,
    borderWidth: 1,
    borderColor: t.colors.machinedEdge,
  },
  pill: {
    minWidth: 34,
    // 44pt is the floor for a touch target; these are inside a header, so the
    // hit box is extended by padding rather than by making the pill taller than
    // the label needs.
    minHeight: 30,
    paddingHorizontal: Spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  pillActive: { backgroundColor: t.colors.mint600 },
  pillText: {
    fontSize: 11,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
  },
  // `onAccent`, never white — white on a mint600 fill measures 2.62:1 light and
  // 2.02:1 dark.
  pillTextActive: { color: t.colors.onAccent, fontWeight: Typography.bold },
}));
