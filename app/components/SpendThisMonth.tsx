// components/SpendThisMonth.tsx — the period's spending, as a curve or as a grid.
//
// One card, two renderings of the same total, switched by a control cluster in
// the header. The header and the total are the anchor and never move; only the
// body below them swaps. That is deliberate — the two views answer different
// questions about one figure, and re-rendering the figure alongside them would
// make it look like the number changed when the view did.
//
//   curve  — "am I going to end up where I usually do?" Cumulative, against the
//            same period one step back. The only shape that can be compared to
//            a period that has already finished.
//   grid   — "which days did it happen on?" Per-day, where the curve's slope is
//            the thing you were squinting at.
//
// ── The reference line is not a budget ─────────────────────────────────────
// The dashed level is whatever the caller passes as `reference` and is labelled
// as what it is. When the user has set category budgets it is their total; when
// they have not, it is their own stated monthly spend, scaled. Calling an
// unset figure "Budget" would invent a commitment they never made.
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui/primitives';
import LineChart from './ui/LineChart';
import { Typography, Spacing, Radius } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';
import { hapticLight, hapticSelection } from '../lib/haptics';
import type { DayCell, SpendSeries, PeriodId } from '../lib/spending';

type ViewMode = 'chart' | 'grid';

export interface SpendThisMonthProps {
  /** Cumulative spend for the period on screen. */
  cur: SpendSeries;
  /** The same period, one step back. Drawn dashed behind the current curve. */
  prev: SpendSeries;
  /** One cell per day of the period. */
  days: DayCell[];
  period: PeriodId;
  /** "Jul 1–28" — what was actually summed. */
  rangeLabel: string;
  /** The dashed level, and what to call it. Null draws no line. */
  reference: { amount: number; label: string } | null;
  onSelectDay: (day: DayCell) => void;
}

export default function SpendThisMonth({
  cur, prev, days, period, rangeLabel, reference, onSelectDay,
}: SpendThisMonthProps) {
  const { common } = useTheme();
  const styles = useStyles();
  const [mode, setMode] = useState<ViewMode>('chart');
  const word = periodWord(period);

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.headBody}>
          <Text style={common.eyebrow}>SPEND THIS {word.toUpperCase()}</Text>
          <Text style={styles.total}>${fmt(cur.total)}</Text>
          <Text style={styles.rangeLabel}>{rangeLabel}</Text>
        </View>

        {/* Two views of one figure, so this is a segmented control rather than
            navigation. The active button is filled; both keep a 44pt target. */}
        <View style={styles.cluster} accessibilityRole="tablist">
          <ModeButton
            icon="trending-up-outline"
            label="Show the spending curve"
            active={mode === 'chart'}
            onPress={() => { hapticSelection(); setMode('chart'); }}
          />
          <ModeButton
            icon="calendar-outline"
            label="Show spending day by day"
            active={mode === 'grid'}
            onPress={() => { hapticSelection(); setMode('grid'); }}
          />
        </View>
      </View>

      {mode === 'chart'
        ? <SpendCurve cur={cur} prev={prev} word={word} reference={reference} />
        : <SpendGrid days={days} onSelectDay={onSelectDay} />}
    </Card>
  );
}

function ModeButton({ icon, label, active, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[styles.modeBtn, active && styles.modeBtnActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={17}
        color={active ? colors.white : colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

// ─── The curve ────────────────────────────────────────────────────────────────

/**
 * Cumulative spend against the same period one step back.
 *
 * The comparison is made at the SAME DAY, not the same total. A running period
 * measured against a finished one is not a comparison, it is an arithmetic
 * guarantee that you are "under" — so the delta is read at the current day index
 * in both series, and the current line stops at today via `widthFraction` rather
 * than being stretched across the axis.
 */
function SpendCurve({ cur, prev, word, reference }: {
  cur: SpendSeries;
  prev: SpendSeries;
  word: string;
  reference: { amount: number; label: string } | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const curValues = cur.values.slice(0, cur.elapsed);
  // Clipped to the current period's length so the two share an x-domain. A
  // 31-day previous month plotted against a 30-day current one would run off
  // the axis and misalign every day before it.
  const prevValues = prev.values.slice(0, cur.days);
  const hasPrev = prev.total > 0 && prevValues.length >= 2;

  const prevAtSameDay = hasPrev
    ? prevValues[Math.min(cur.elapsed, prevValues.length) - 1] ?? 0
    : 0;
  const delta = cur.total - prevAtSameDay;
  // Under 2% of the baseline is noise, not a trend worth naming.
  const same = hasPrev && Math.abs(delta) < Math.max(25, prevAtSameDay * 0.02);

  const max = Math.max(cur.total, hasPrev ? prev.total : 0, reference?.amount ?? 0) * 1.12 || 1;

  if (cur.elapsed < 2) {
    return (
      <Text style={styles.empty}>
        One day in — there is not a line to draw yet. Check back in a day or two.
      </Text>
    );
  }

  return (
    <>
      <Text style={styles.headline}>
        {!hasPrev
          ? `No ${word} before this one to compare against yet.`
          : same
            ? `About the same as last ${word} at this point.`
            : `$${fmt(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} than last ${word} at this point.`}
      </Text>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          `Spending curve. $${fmt(cur.total)} spent so far, day ${cur.elapsed} of ${cur.days}.` +
          (hasPrev ? ` Last ${word} at the same point: $${fmt(prevAtSameDay)}.` : '') +
          (reference ? ` ${reference.label}: $${fmt(reference.amount)}.` : '')
        }
      >
        <LineChart
          height={148}
          min={0}
          max={max}
          series={[
            ...(reference
              ? [{
                  values: [reference.amount, reference.amount],
                  color: colors.gray300,
                  width: 1,
                  dash: [4, 4] as [number, number],
                }]
              : []),
            ...(hasPrev
              ? [{
                  values: prevValues,
                  color: colors.gray400,
                  width: 2,
                  dash: [4, 4] as [number, number],
                  widthFraction: prevValues.length / cur.days,
                }]
              : []),
            {
              values: curValues,
              color: colors.mint600,
              width: 2.5,
              fillColor: colors.mint50,
              widthFraction: cur.elapsed / cur.days,
            },
          ]}
        />
      </View>

      <View style={styles.axis}>
        {axisDays(cur.days).map(d => (
          <Text key={d} style={styles.axisLabel}>{d}</Text>
        ))}
      </View>

      <View style={styles.legend}>
        <LegendItem label={`This ${word}`} color={colors.mint600} />
        {hasPrev && <LegendItem label={`Last ${word}`} color={colors.gray400} dashed />}
        {reference && <LegendItem label={reference.label} color={colors.gray300} dashed />}
      </View>
    </>
  );
}

/**
 * Dashed swatches are discrete ticks, not `borderStyle: 'dashed'`, which React
 * Native renders inconsistently on a single-sided border. A key that silently
 * drew solid would defeat the only thing separating the two grey series.
 */
function LegendItem({ label, color, dashed }: {
  label: string;
  color: string;
  dashed?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      {dashed ? (
        <View style={styles.legendSwatch}>
          {[0, 1, 2].map(i => <View key={i} style={[styles.legendTick, { backgroundColor: color }]} />)}
        </View>
      ) : (
        <View style={[styles.legendSwatch, styles.legendSolid, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

// ─── The grid ─────────────────────────────────────────────────────────────────

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * One cell per day, shaded by how much went out on it.
 *
 * ── Why a lightness ramp and not a colour ramp ─────────────────────────────
 * Intensity is carried by how much mint the cell is tinted with, computed from
 * the day's share of the busiest day. A sequential single-hue scale is the
 * correct encoding for a magnitude anyway, so the palette constraint and the
 * charting rule agree here.
 *
 * The floor matters: a cell at 0% tint is indistinguishable from the card
 * behind it, so a $3 day would vanish rather than read as a quiet day. Cells
 * with real spend start at 12% and climb; cells with none stay flat.
 *
 * Every cell also prints its amount. The shade is a second channel for
 * scanning, never the only one — which is what keeps the grid readable to
 * someone who cannot distinguish the steps.
 */
function SpendGrid({ days, onSelectDay }: {
  days: DayCell[];
  onSelectDay: (day: DayCell) => void;
}) {
  const styles = useStyles();
  // Scaled against the busiest day rather than a fixed dollar figure, so the
  // grid is legible for a $200 month and a $20,000 one alike.
  const peak = useMemo(
    () => Math.max(...days.map(d => d.spend), 1),
    [days],
  );

  // Blank cells before the 1st, so the month starts on its real weekday.
  const lead = days.length > 0 ? days[0].weekday : 0;

  return (
    <View style={styles.grid}>
      <View style={styles.weekHead}>
        {WEEKDAYS.map((w, i) => (
          <View key={i} style={styles.cellSlot}>
            <Text style={styles.weekLabel}>{w}</Text>
          </View>
        ))}
      </View>

      <View style={styles.cells}>
        {Array.from({ length: lead }).map((_, i) => (
          <View key={`lead-${i}`} style={styles.cellSlot} />
        ))}

        {days.map(d => {
          const intensity = d.spend > 0 ? 0.12 + (d.spend / peak) * 0.88 : 0;
          const busy = intensity > 0.55;
          return (
            <View key={d.date} style={styles.cellSlot}>
              <TouchableOpacity
                style={[
                  styles.cell,
                  d.future && styles.cellFuture,
                  d.spend > 0 && { backgroundColor: tint(intensity) },
                ]}
                // A day that has not happened is not a target. Tapping it would
                // open a sheet that can only say "nothing here yet".
                disabled={d.future || (d.spend === 0 && d.credit === 0)}
                onPress={() => { hapticLight(); onSelectDay(d); }}
                accessibilityRole="button"
                accessibilityLabel={
                  d.future
                    ? `Day ${d.day}, not yet`
                    : `Day ${d.day}, $${fmt(d.spend)} spent` +
                      (d.credit > 0 ? `, $${fmt(d.credit)} back` : '')
                }
              >
                <Text style={[
                  styles.cellDay,
                  busy && styles.cellDayBusy,
                  d.future && styles.cellDayFuture,
                ]}>
                  {d.day}
                </Text>
                {d.future ? (
                  <Text style={styles.cellDash}>–</Text>
                ) : d.credit > 0 && d.spend === 0 ? (
                  // A refund-only day. The plus is the signal, not the colour.
                  <Text style={styles.cellCredit}>+{compact(d.credit)}</Text>
                ) : (
                  <Text style={[
                    styles.cellAmount,
                    busy && styles.cellAmountBusy,
                    d.spend === 0 && styles.cellAmountZero,
                  ]}>
                    {d.spend > 0 ? compact(d.spend) : '0'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <Text style={styles.gridNote}>
        Darker days are bigger days. Tap one to see what went out.
      </Text>
    </View>
  );
}

/** mint600 at a given alpha, for the heat cells. */
function tint(alpha: number): string {
  return `rgba(18,183,106,${Math.min(1, alpha).toFixed(3)})`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

/** "1.2k" past a thousand — these sit in ~44px cells. */
function compact(n: number): string {
  const v = Math.round(n);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function periodWord(p: PeriodId): string {
  return p === 'week' ? 'week' : p === 'month' ? 'month' : p === 'quarter' ? 'quarter' : 'year';
}

/** Four evenly spaced day numbers, always including the first and last. */
function axisDays(days: number): number[] {
  if (days <= 4) return Array.from({ length: days }, (_, i) => i + 1);
  return [1, Math.round(days / 3), Math.round((days * 2) / 3), days];
}

const useStyles = createThemedStyles(t => ({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  headBody: { flex: 1, gap: 2 },
  total: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: -1,
  },
  rangeLabel: { fontSize: Typography.xs, color: t.colors.textMuted },

  cluster: { flexDirection: 'row', gap: Spacing[2] },
  modeBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: { backgroundColor: t.colors.mint600, borderColor: t.colors.mint600 },

  headline: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    lineHeight: 22,
    marginBottom: Spacing[3],
  },
  empty: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },

  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing[2] },
  axisLabel: { fontSize: 10, color: t.colors.textMuted },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3], marginTop: Spacing[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: {
    width: 14, height: 3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  legendSolid: { borderRadius: 2 },
  legendTick: { width: 4, height: 2, borderRadius: 1 },
  legendText: { fontSize: 11, color: t.colors.textSecondary },

  grid: { gap: Spacing[2] },
  weekHead: { flexDirection: 'row' },
  weekLabel: { fontSize: 10, fontWeight: Typography.semibold, color: t.colors.textMuted },
  cells: { flexDirection: 'row', flexWrap: 'wrap' },
  // Seven per row, sized by percentage so the grid fits any card width. The
  // padding is on the slot rather than the cell, so the gutters stay even.
  cellSlot: { width: `${100 / 7}%`, padding: 2, alignItems: 'center' },
  cell: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.sm,
    backgroundColor: t.colors.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  cellFuture: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.colors.borderSubtle },
  cellDay: { fontSize: 10, fontWeight: Typography.semibold, color: t.colors.textSecondary },
  // Past roughly half tint the cell is dark enough that dark text fails
  // contrast, so the type inverts rather than the ramp being cut short.
  cellDayBusy: { color: t.colors.white },
  cellDayFuture: { color: t.colors.textMuted, fontWeight: Typography.regular },
  cellAmount: { fontSize: 9, color: t.colors.textSecondary },
  cellAmountBusy: { color: t.colors.white, fontWeight: Typography.semibold },
  cellAmountZero: { color: t.colors.textMuted },
  cellCredit: { fontSize: 9, fontWeight: Typography.semibold, color: t.colors.mint600 },
  cellDash: { fontSize: 9, color: t.colors.textMuted },

  gridNote: { fontSize: 11, color: t.colors.textMuted, marginTop: Spacing[1] },
}));
