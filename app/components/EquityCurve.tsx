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
  /**
   * Months of the projection to show. Null or undefined shows all of it.
   *
   * ── This window runs FORWARD, and that is not a limitation to work around ──
   * The obvious version of a range control on a chart like this is 1M / 6M / 1Y
   * of HISTORY. This app cannot draw that and should not pretend to: no balance
   * time series is stored anywhere (`plaid_accounts` holds current balances and
   * nothing else), so a line showing where equity HAS been would be invented
   * from the one point we have. See the note at the top of this file.
   *
   * So the control zooms the projection instead. That is a real thing the user
   * can steer — "what does the next year look like" versus "show me all of it"
   * — and every point in it is output from the same model as the payoff date.
   */
  horizonMonths?: number | null;
}

export default function EquityCurve({
  series, payoffDate, hasRealData = true, horizonMonths = null,
}: Props) {
  // Windowed BEFORE sampling, so a short horizon gets 40 points across one year
  // rather than 40 points across thirty and a flat-looking stub.
  const windowed = horizonMonths !== null && horizonMonths < series.accelerated.length;
  const accPts  = windowed ? series.accelerated.slice(0, horizonMonths!) : series.accelerated;
  const basePts = windowed ? series.baseline.slice(0, horizonMonths!)    : series.baseline;

  const acc = sample(accPts.map(p => p.equity), SAMPLES);
  const base = sample(basePts.map(p => p.equity), SAMPLES);
  if (acc.length < 2) return null;

  // "Mortgage-free" and "owns it outright" are different months.
  const settleMonths = series.debtFreeMonth - series.payoffMonth;
  const debtFreeDate = addMonths(payoffDate, settleMonths);

  // What the right-hand end of the drawn line actually is. On a window it is a
  // waypoint, NOT the debt-free date and NOT `finalEquity` — labelling a
  // one-year view with the figure from year thirty is the single way this
  // control could lie, and it would lie in the flattering direction.
  const endEquity = accPts.length > 0 ? accPts[accPts.length - 1].equity : series.finalEquity;
  const endDate   = windowed ? addMonths(new Date(), accPts.length) : debtFreeDate;

  // Floor sits at zero unless the user is underwater, in which case clipping
  // the negative part would hide the only thing worth seeing.
  const min = Math.min(0, ...acc, ...base);
  const max = Math.max(series.finalEquity, ...acc, ...base);

  return (
    <View style={styles.wrap}>
      <View
        accessibilityRole="image"
        accessibilityLabel={
          windowed
            ? `Projected equity over the next ${accPts.length} months, reaching ` +
              `${money(endEquity)} by ${fmtMonthYear(endDate)}.`
            : `Projected equity, rising to ${money(series.finalEquity)} by ` +
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
          {/* The house icon means "owns it outright", so it only appears on the
              view that actually runs that far. */}
          {!windowed && <Ionicons name="home" size={11} color={OnDark.accent} />}
          <Text style={styles.axisTextStrong}>
            {fmtMonthYear(endDate)} · {money(endEquity)}
          </Text>
        </View>
      </View>

      <Text style={styles.note}>
        {hasRealData ? '' : 'Example figures. '}
        Projected, not a guarantee. Holds today&apos;s home value flat and nets out both the
        mortgage and anything drawn on the line.
        {windowed
          ? ' This is a window on the projection ahead, not a record of where your' +
            ' equity has been — no balance history is stored.'
          : settleMonths > 0
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
