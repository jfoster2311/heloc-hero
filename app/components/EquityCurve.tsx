// components/EquityCurve.tsx — the projected equity curve on the Accounts hero.
//
// The reference apps all lead with a big number over a curve, and that pattern
// is worth borrowing. What is NOT worth borrowing is the implication that the
// curve is history: nothing in this app stores a balance time series, so a line
// showing where equity HAS been would be invented. This draws forward only, and
// says so — which is what the reference is actually doing too (its axis runs
// "Today → Age 80").
//
// Two things are drawn:
//   · the solid area — equity under the strategy, which DIPS at every draw,
//     because money borrowed against the house is not equity
//   · the faint line — equity if nothing changes, over the same span
//
// Built from Views rather than SVG on purpose. react-native-svg is a native
// module, and pulling one in for a single chart costs a fresh EAS build on
// every machine that touches this repo. Sixty-four thin columns read as an area
// chart at this size and cost nothing.
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Aurora, OnDark } from '../lib/theme';
import type { EquitySeries } from '../lib/projections';

const COLUMNS = 64;
const CHART_H = 104;

interface Props {
  series: EquitySeries;
  /** Labelled on the right edge, where the curve lands. */
  payoffDate: Date;
  /** False when the figures are illustrative rather than the user's own. */
  hasRealData?: boolean;
}

export default function EquityCurve({ series, payoffDate, hasRealData = true }: Props) {
  const acc = sample(series.accelerated.map(p => p.equity), COLUMNS);
  const base = sample(series.baseline.map(p => p.equity), COLUMNS);
  if (acc.length < 2) return null;

  // "Mortgage-free" and "owns it outright" are different months. The curve's
  // right edge is the second one; payoffDate is the first.
  const settleMonths = series.debtFreeMonth - series.payoffMonth;
  const debtFreeDate = addMonths(payoffDate, settleMonths);

  // Domain floor sits at zero unless the user is underwater, in which case
  // clipping the negative part would hide the only thing worth seeing.
  const lo = Math.min(0, ...acc, ...base);
  const hi = Math.max(series.finalEquity, ...acc, ...base);
  const span = hi - lo || 1;
  const y = (v: number) => clamp01((v - lo) / span) * CHART_H;

  return (
    <View style={styles.wrap}>
      <View
        style={styles.chart}
        accessibilityRole="image"
        accessibilityLabel={
          `Projected equity, rising to ${money(series.finalEquity)} by ` +
          `${fmtMonthYear(debtFreeDate)}, when nothing is owed against the house.`
        }
      >
        {acc.map((v, i) => {
          const hA = y(v);
          const hB = y(base[i] ?? v);
          return (
            <View key={i} style={styles.col}>
              {/* Equity if nothing changes — a reference, kept quiet. */}
              <View style={[styles.baseCap, { bottom: Math.max(0, hB - 1) }]} />
              {/* Equity under the strategy. */}
              <View style={[styles.area, { height: hA }]} />
              <View style={[styles.cap, { bottom: Math.max(0, hA - 2) }]} />
            </View>
          );
        })}

        {/* Where the line lands: the whole house, no debt against it. */}
        <View style={styles.finish}>
          <View style={styles.finishDot} />
        </View>
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisText}>Today</Text>
        <View style={styles.axisRight}>
          <Ionicons name="home" size={11} color={OnDark.accent} />
          <Text style={styles.axisTextStrong}>
            {fmtMonthYear(debtFreeDate)} · {money(series.finalEquity)}
          </Text>
        </View>
      </View>

      <Text style={styles.note}>
        {hasRealData ? '' : 'Example figures. '}
        Projected, not a guarantee. Holds today&apos;s home value flat and nets out both the
        mortgage and anything drawn on the line.
        {settleMonths > 0
          ? ` The mortgage clears in ${fmtMonthYear(payoffDate)} with about ` +
            `${money(series.helocOutstandingAtPayoff)} still on the line; the curve runs on to ` +
            `${fmtMonthYear(debtFreeDate)}, when nothing is owed against the house.`
          : ''}
      </Text>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Evenly picks `n` values across the series, always keeping first and last. */
function sample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(values[Math.round((i / (n - 1)) * (values.length - 1))]);
  }
  return out;
}
function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function money(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing[3] },
  chart: {
    height: CHART_H,
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
  },
  col: { flex: 1, height: CHART_H, position: 'relative' },
  area: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,183,106,0.20)',
  },
  cap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Aurora.glowSoft,
  },
  baseCap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  finish: {
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: Aurora.glow,
  },

  axis: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  axisRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  axisText: { fontSize: Typography.xs, color: OnDark.muted },
  axisTextStrong: { fontSize: Typography.xs, color: OnDark.secondary, fontWeight: Typography.semibold },

  note: { fontSize: 11, color: OnDark.faint, lineHeight: 16 },
});
