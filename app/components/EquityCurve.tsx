// components/EquityCurve.tsx — the projected equity curve on the Accounts hero.
//
// The reference apps all lead with a big number over a curve, and that pattern
// is worth borrowing. What is NOT worth borrowing is the implication that the
// curve is history: nothing in this app stores a balance time series, so a line
// showing where equity HAS been would be invented. This draws forward only, and
// says so — which is what the reference is actually doing too (its axis runs
// "Today → Age 80").
//
// Two lines:
//   · the solid, filled curve — equity under the strategy
//   · the faint line — equity if nothing changes, over the same span
//
// A dump moves debt from the mortgage to the line one-for-one, so it leaves
// equity flat rather than dipping. The curve rises because surplus is retiring
// debt. See computeEquitySeries.
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LineChart from './ui/LineChart';
import { Typography, Spacing, Aurora, OnDark } from '../lib/theme';
import type { EquitySeries } from '../lib/projections';

const SAMPLES = 40;
const CHART_H = 112;

interface Props {
  series: EquitySeries;
  /** The month the mortgage clears. The line runs past it to debt-free. */
  payoffDate: Date;
  /** False when the figures are illustrative rather than the user's own. */
  hasRealData?: boolean;
}

export default function EquityCurve({ series, payoffDate, hasRealData = true }: Props) {
  const acc = sample(series.accelerated.map(p => p.equity), SAMPLES);
  const base = sample(series.baseline.map(p => p.equity), SAMPLES);
  if (acc.length < 2) return null;

  // "Mortgage-free" and "owns it outright" are different months.
  const settleMonths = series.debtFreeMonth - series.payoffMonth;
  const debtFreeDate = addMonths(payoffDate, settleMonths);

  // Floor sits at zero unless the user is underwater, in which case clipping
  // the negative part would hide the only thing worth seeing.
  const min = Math.min(0, ...acc, ...base);
  const max = Math.max(series.finalEquity, ...acc, ...base);

  return (
    <View style={styles.wrap}>
      <View
        accessibilityRole="image"
        accessibilityLabel={
          `Projected equity, rising to ${money(series.finalEquity)} by ` +
          `${fmtMonthYear(debtFreeDate)}, when nothing is owed against the house.`
        }
      >
        <LineChart
          height={CHART_H}
          min={min}
          max={max}
          series={[
            { values: base, color: 'rgba(255,255,255,0.22)', width: 1.5 },
            {
              values: acc,
              color: Aurora.glowSoft,
              width: 2.5,
              fillColor: 'rgba(18,183,106,0.16)',
              glow: true,
            },
          ]}
        />
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

  axis: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  axisRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  axisText: { fontSize: Typography.xs, color: OnDark.muted },
  axisTextStrong: { fontSize: Typography.xs, color: OnDark.secondary, fontWeight: Typography.semibold },

  note: { fontSize: 11, color: OnDark.faint, lineHeight: 16 },
});
