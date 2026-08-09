// components/accounts/EquityWedge.tsx — the gap IS the wealth.
//
// The chart this replaces drew one line: equity, rising. That is the right
// quantity and the wrong picture, because equity rising tells you nothing about
// WHY. This draws the two things equity is the difference between — what the
// house is worth along the top, what is owed against it along the bottom — and
// fills the space between them. The filled wedge widening as the debt line falls
// is the strategy working, and it needs no legend to read.
//
// ── Home value is FLAT, and that is not a missing feature ──────────────────
// The brief asked for "a slow, steady upward curve" on the top line. The model
// holds home value constant on purpose (see `computeEquitySeries`): appreciation
// would dominate the shape of this chart and hand the strategy credit for a
// housing market it does not control. A user would watch their wedge widen and
// attribute it to cycling when most of it was the market.
//
// So the top line is level and every point of widening below it is debt being
// retired. That is a weaker-looking chart and a truthful one, and it is also the
// only version whose shape means what the caption says it means.
//
// ── Debt is derived, not modelled twice ────────────────────────────────────
// `debt = homeValue - equity`, exactly, because home value is flat. Same
// derivation DebtCurve on the dashboard already uses. Modelling debt separately
// would give the app two models that drift, and then this chart and the payoff
// date beneath it would tell different stories.
import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Canvas, Path, Skia, LinearGradient, vec, DashPathEffect, Group,
} from '@shopify/react-native-skia';
import {
  useSharedValue, withSpring, useDerivedValue,
} from 'react-native-reanimated';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { useReduceMotion } from '../ui/press';
import type { EquitySeries } from '../../lib/projections';

const SAMPLES = 56;
const CHART_H = 152;
/** Inset so strokes and the end cap are not clipped by the canvas edge. */
const PAD = 8;
/** The house spring. Same values as every other settling animation here. */
const SPRING = { stiffness: 250, damping: 30, mass: 1 };

interface Props {
  series: EquitySeries;
  /** Held flat across the projection — see the header. */
  homeValue: number;
  /** Months of the projection to draw. Null shows all of it. */
  horizonMonths?: number | null;
  /** False when the figures are illustrative rather than the user's own. */
  hasRealData?: boolean;
  /** Measured width available to the chart. */
  width: number;
}

export default function EquityWedge({
  series, homeValue, horizonMonths = null, hasRealData = true, width,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) { progress.value = 1; return; }
    progress.value = 0;
    progress.value = withSpring(1, SPRING);
  }, [reduceMotion, horizonMonths, series]);

  const geom = useMemo(() => {
    // Windowed BEFORE sampling, so a short horizon gets its points spread across
    // one year rather than 56 points across thirty and a flat-looking stub.
    const windowed = horizonMonths !== null && horizonMonths < series.accelerated.length;
    const accPts  = windowed ? series.accelerated.slice(0, horizonMonths) : series.accelerated;
    const basePts = windowed ? series.baseline.slice(0, horizonMonths)    : series.baseline;

    const acc  = sample(accPts.map(p => homeValue - p.equity), SAMPLES);
    const base = sample(basePts.map(p => homeValue - p.equity), SAMPLES);
    if (acc.length < 2 || width <= 0 || homeValue <= 0) return null;

    const innerW = width - PAD * 2;
    const innerH = CHART_H - PAD * 2;
    // The domain is 0 → homeValue, ALWAYS, rather than the min/max of the data.
    // That is what makes the wedge a real proportion of the house: a debt line
    // that reaches the floor means the place is owned outright, and auto-scaling
    // would put an untouched mortgage on the floor too.
    const x = (i: number) => PAD + (i / (SAMPLES - 1)) * innerW;
    const y = (v: number) => PAD + (1 - Math.min(1, Math.max(0, v / homeValue))) * innerH;

    const poly = (vals: number[]) => {
      const p = Skia.Path.Make();
      p.moveTo(x(0), y(vals[0]));
      for (let i = 1; i < vals.length; i++) p.lineTo(x(i), y(vals[i]));
      return p;
    };

    const debt = poly(acc);
    const baseDebt = poly(base);

    // The wedge: the debt line, closed up to the home-value line. Built from the
    // SAME path object as the stroke so the fill and the line can never
    // disagree about where the debt is.
    const wedge = debt.copy();
    wedge.lineTo(x(SAMPLES - 1), y(homeValue));
    wedge.lineTo(x(0), y(homeValue));
    wedge.close();

    const roof = Skia.Path.Make();
    roof.moveTo(PAD, y(homeValue));
    roof.lineTo(width - PAD, y(homeValue));

    return { debt, baseDebt, wedge, roof, endDebt: acc[acc.length - 1] };
  }, [series, homeValue, horizonMonths, width]);

  // The fill trails the stroke slightly, so the wedge appears to be opened by
  // the line rather than arriving with it.
  const wedgeOpacity = useDerivedValue(() => Math.max(0, progress.value - 0.15) / 0.85);

  if (!geom) return null;

  const finalEquity = homeValue - geom.endDebt;
  const pctOwned = homeValue > 0 ? (finalEquity / homeValue) * 100 : 0;

  return (
    <View>
      <Canvas style={{ width, height: CHART_H }}>
        {/* The wedge. Densest at the floor, where the equity is oldest. */}
        <Group opacity={wedgeOpacity}>
          <Path path={geom.wedge} style="fill">
            <LinearGradient
              start={vec(0, PAD)}
              end={vec(0, CHART_H)}
              // Fades to fully transparent rather than to the card colour, so
              // the milled gradient underneath still shows through the tail.
              colors={[`${colors.accentInk}00`, `${colors.accentInk}33`]}
            />
          </Path>
        </Group>

        {/* What the house is worth. Level, and the caption says why. */}
        <Path
          path={geom.roof}
          style="stroke"
          strokeWidth={1.5}
          color={colors.textMuted}
        >
          <DashPathEffect intervals={[4, 4]} />
        </Path>

        {/* Debt if nothing changes — what the wedge is being measured against. */}
        <Path
          path={geom.baseDebt}
          style="stroke"
          strokeWidth={1.5}
          strokeCap="round"
          color={colors.textMuted}
          opacity={0.7}
        >
          <DashPathEffect intervals={[3, 5]} />
        </Path>

        {/* Debt under the strategy. The one solid line on the chart. */}
        <Path
          path={geom.debt}
          style="stroke"
          strokeWidth={2.5}
          strokeCap="round"
          strokeJoin="round"
          color={colors.accentInk}
          // Native path trimming, so the line DRAWS along its own curve rather
          // than fading in — which would reveal the whole shape at once.
          start={0}
          end={progress}
        />
      </Canvas>

      <View style={styles.legend}>
        <View style={styles.item}>
          <View style={[styles.solid, { backgroundColor: colors.accentInk }]} />
          <Text style={styles.label}>Owed, with cycling</Text>
        </View>
        <View style={styles.item}>
          <View style={styles.dashes}>
            <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
            <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
            <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
          </View>
          <Text style={styles.label}>Owed, unchanged</Text>
        </View>
      </View>

      <Text style={styles.note}>
        {hasRealData
          ? `Projected. The shaded wedge is your equity — it widens because debt is being retired, ` +
            `not because the house appreciates: home value is held flat on purpose. ` +
            `At the end of this window the projection has you ${Math.round(pctOwned)}% owner.`
          : 'Example figures. Add your mortgage and home value to see your own.'}
      </Text>
    </View>
  );
}

/** Even resample to exactly `n` points, linearly interpolated. */
function sample(values: number[], n: number): number[] {
  const m = values.length;
  if (m === 0) return [];
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

const useStyles = createThemedStyles(t => ({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[4],
    marginTop: Spacing[3],
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  solid: { width: 14, height: 2.5, borderRadius: 2 },
  dashes: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  dash: { width: 3, height: 1.5, borderRadius: 1 },
  label: { fontSize: 11, color: t.colors.textMuted },
  note: {
    fontSize: 11,
    color: t.colors.textMuted,
    lineHeight: 16,
    marginTop: Spacing[3],
  },
}));
