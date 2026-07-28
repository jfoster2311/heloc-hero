// app/modals/reports.tsx — six months, and whether any of this is working.
//
// Every other screen answers a question about now. This is the only one that
// answers "is it getting better", which is the question someone three months
// into a strategy actually has, and the one the app is otherwise silent on.
//
// ── Two views of the same two series ───────────────────────────────────────
// Spread puts income above a baseline and spending below it, so the gap between
// them IS the net and a bad month is visible as a shape. Grouped puts them side
// by side, which is the better read when the question is "which is moving".
// They plot identical data; the toggle is about what you are looking for.
//
// ── Whole months only, and the screen says so ──────────────────────────────
// lib/reports.ts ends its series at the last complete month. Including a
// part-month would draw a final bar that reads as a collapse in spending — the
// most flattering possible misreading on the one screen meant to tell someone
// the truth about their trend. The date range is printed so the omission is
// visible rather than silent.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import ModalScreen from '../../components/ui/ModalScreen';
import ReportDetailSheet from '../../components/sheets/ReportDetailSheet';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import {
  buildReportSeries, buildCategorySeries, buildChangeRows,
  type ReportMonth,
} from '../../lib/reports';
import { CategoryRamp, CATEGORY_RAMP_MAX } from '../../lib/theme';
import { Colors, Typography, Spacing, Radius, CommonStyles } from '../../lib/theme';
import type { MonthPoint } from '../../lib/spending';

const MONTHS = 6;
type Mode = 'spread' | 'grouped';

export default function ReportsScreen() {
  const { profile } = useAuth();
  const f = useFinancials();
  const overrides = useCategoryOverrides(profile?.id);

  const [mode, setMode] = useState<Mode>('spread');
  const [openMonth, setOpenMonth] = useState<ReportMonth | null>(null);

  const series = useMemo(
    () => buildReportSeries({
      transactions: f.transactions,
      classification: f.transactionClassification,
      months: MONTHS,
    }),
    [f.transactions, f.transactionClassification],
  );

  const categorySeries = useMemo(
    () => buildCategorySeries({
      transactions: f.transactions,
      classification: f.transactionClassification,
      overrides: overrides.overrides,
      months: series.months,
      metaFor: f.categories.metaFor,
    }),
    [f.transactions, f.transactionClassification, overrides.overrides, series.months, f.categories],
  );

  const selectedIndex = openMonth
    ? series.months.findIndex(m => m.key === openMonth.key)
    : -1;

  const changeRows = useMemo(
    () => (selectedIndex >= 0
      ? buildChangeRows({ months: series.months, categorySeries, selected: selectedIndex })
      : null),
    [series.months, categorySeries, selectedIndex],
  );

  /** Net by month, for the mini chart in the sheet. */
  const netHistory: MonthPoint[] = useMemo(
    () => series.months.map(m => ({
      key: m.key,
      label: m.label,
      // The mini chart plots magnitude; a negative month would otherwise draw
      // nothing at all and read as a month with no activity.
      amount: Math.max(0, m.net),
      current: false,
    })),
    [series.months],
  );

  if (!series.usable) {
    return (
      <ModalScreen title="Reports">
        <Text style={styles.empty}>
          {f.hasLinkedAccounts
            ? 'Not enough complete months yet. Trends need at least three, and this only ' +
              'counts months that have finished — a part-month would read as a drop in ' +
              'spending rather than a month still running.'
            : 'Link an account and six months of trend appear here.'}
        </Text>
      </ModalScreen>
    );
  }

  return (
    <>
      <ModalScreen
        title="Reports"
        footnote={
          'Complete months only — the current month is left out because it is always ' +
          'partial. Transfers between your own accounts and your mortgage payment are ' +
          'excluded, the same as everywhere else.'
        }
      >
        <View style={styles.head}>
          <View style={styles.headBody}>
            <Text style={styles.headTitle}>Last {series.months.length} months</Text>
            <Text style={styles.headRange}>{series.rangeLabel}</Text>
          </View>
          <View style={styles.cluster}>
            <ModeButton
              icon="git-compare-outline"
              label="Show income against spending"
              active={mode === 'spread'}
              onPress={() => { hapticSelection(); setMode('spread'); }}
            />
            <ModeButton
              icon="stats-chart-outline"
              label="Show them side by side"
              active={mode === 'grouped'}
              onPress={() => { hapticSelection(); setMode('grouped'); }}
            />
          </View>
        </View>

        {mode === 'spread'
          ? <SpreadChart months={series.months} onSelect={setOpenMonth} />
          : <GroupedChart months={series.months} onSelect={setOpenMonth} />}

        <View style={styles.legend}>
          <LegendItem label="In" color={Colors.mint600} />
          <LegendItem label="Out" color={Colors.gray400} />
          <Text style={styles.legendHint}>Tap a month for the detail</Text>
        </View>

        {/* ── Totals ─────────────────────────────────────────────────────── */}
        <View style={styles.stats}>
          <Stat label="Total in" value={`$${fmt(series.totalIncome)}`} />
          <Stat label="Total out" value={`$${fmt(series.totalSpend)}`} muted />
          <Stat
            label="Net"
            value={`${series.totalNet < 0 ? '−' : ''}$${fmt(Math.abs(series.totalNet))}`}
            emphasis={series.totalNet >= 0}
            muted={series.totalNet < 0}
          />
        </View>
        <View style={styles.avgRow}>
          <Text style={styles.avgLabel}>Average a month</Text>
          <Text style={[styles.avgValue, series.avgNet < 0 && styles.avgValueNeg]}>
            {series.avgNet < 0 ? '−' : ''}${fmt(Math.abs(series.avgNet))}
          </Text>
        </View>

        {/* ── Spending, by category, month over month ──────────────────────
            Stacked so the question "which category is growing" is answerable,
            which a single spend line cannot do. The ramp folds past four
            categories for the same reason the donut does — a single hue cannot
            carry more legible steps than that. */}
        <View style={styles.section}>
          <Text style={CommonStyles.eyebrow}>SPENDING BY CATEGORY</Text>
          <StackedChart months={series.months} series={categorySeries} />
          <View style={styles.stackLegend}>
            {categorySeries.slice(0, CATEGORY_RAMP_MAX).map((s, i) => (
              <View key={s.category} style={styles.stackKey}>
                <View style={[styles.stackSwatch, { backgroundColor: rampColor(i) }]} />
                <Text style={styles.stackKeyText} numberOfLines={1}>{s.label}</Text>
              </View>
            ))}
            {categorySeries.length > CATEGORY_RAMP_MAX && (
              <View style={styles.stackKey}>
                <View style={[styles.stackSwatch, { backgroundColor: CategoryRamp.neutral }]} />
                <Text style={styles.stackKeyText}>
                  {categorySeries.length - CATEGORY_RAMP_MAX} more
                </Text>
              </View>
            )}
          </View>
        </View>
      </ModalScreen>

      <ReportDetailSheet
        month={openMonth}
        rows={changeRows}
        history={netHistory}
        onClose={() => setOpenMonth(null)}
      />
    </>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

const PLOT = 120;

/**
 * Income above the line, spending below it.
 *
 * The baseline is shared and both sides are scaled by the same peak, so the two
 * halves of a month are directly comparable by eye — scaling them independently
 * would make a month with $500 income and $5,000 spending look balanced.
 */
function SpreadChart({ months, onSelect }: {
  months: ReportMonth[];
  onSelect: (m: ReportMonth) => void;
}) {
  const peak = Math.max(...months.map(m => Math.max(m.income, m.spend)), 1);

  return (
    <View style={styles.chart}>
      {months.map(m => (
        <TouchableOpacity
          key={m.key}
          style={styles.col}
          onPress={() => { hapticLight(); onSelect(m); }}
          accessibilityRole="button"
          accessibilityLabel={
            `${m.label}: $${fmt(m.income)} in, $${fmt(m.spend)} out, ` +
            `net ${m.net < 0 ? 'minus ' : ''}$${fmt(Math.abs(m.net))}`
          }
        >
          <View style={styles.spreadUpper}>
            <View
              style={[
                styles.bar,
                styles.barIn,
                { height: Math.max(2, (m.income / peak) * (PLOT / 2)) },
              ]}
            />
          </View>
          <View style={styles.baseline} />
          <View style={styles.spreadLower}>
            <View
              style={[
                styles.bar,
                styles.barOut,
                { height: Math.max(2, (m.spend / peak) * (PLOT / 2)) },
              ]}
            />
          </View>
          <Text style={styles.colLabel}>{m.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** The same two series, side by side. */
function GroupedChart({ months, onSelect }: {
  months: ReportMonth[];
  onSelect: (m: ReportMonth) => void;
}) {
  const peak = Math.max(...months.map(m => Math.max(m.income, m.spend)), 1);

  return (
    <View style={styles.chart}>
      {months.map(m => (
        <TouchableOpacity
          key={m.key}
          style={styles.col}
          onPress={() => { hapticLight(); onSelect(m); }}
          accessibilityRole="button"
          accessibilityLabel={
            `${m.label}: $${fmt(m.income)} in, $${fmt(m.spend)} out`
          }
        >
          <View style={styles.groupSlot}>
            <View style={styles.pair}>
              <View
                style={[styles.pairBar, styles.barIn, { height: Math.max(2, (m.income / peak) * PLOT) }]}
              />
              <View
                style={[styles.pairBar, styles.barOut, { height: Math.max(2, (m.spend / peak) * PLOT) }]}
              />
            </View>
          </View>
          <Text style={styles.colLabel}>{m.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Spending split by category, stacked, one column per month. */
function StackedChart({ months, series }: {
  months: ReportMonth[];
  series: { category: string; label: string; values: number[] }[];
}) {
  const peak = Math.max(...months.map(m => m.spend), 1);

  return (
    <View
      style={styles.chart}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        'Spending by category, stacked per month. ' +
        months.map(m => `${m.label}: $${fmt(m.spend)}`).join('. ')
      }
    >
      {months.map((m, mi) => (
        <View key={m.key} style={styles.col}>
          <View style={styles.stackSlot}>
            {series.map((s, si) => {
              const v = s.values[mi] ?? 0;
              if (v <= 0) return null;
              return (
                <View
                  key={s.category}
                  style={[
                    styles.stackSeg,
                    {
                      height: Math.max(1, (v / peak) * PLOT),
                      backgroundColor: rampColor(si),
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={styles.colLabel}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Ramp step by rank, folding to neutral past the legible ceiling. */
function rampColor(index: number): string {
  return index < CATEGORY_RAMP_MAX
    ? CategoryRamp.steps[index]
    : CategoryRamp.neutral;
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function ModeButton({ icon, label, active, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.modeBtn, active && styles.modeBtnActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={17} color={active ? Colors.white : Colors.textSecondary} />
    </TouchableOpacity>
  );
}

function Stat({ label, value, emphasis, muted }: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          emphasis && styles.statValueEmphasis,
          muted && styles.statValueMuted,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function LegendItem({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[3],
  },
  headBody: { flex: 1, gap: 2 },
  headTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  headRange: { fontSize: Typography.xs, color: Colors.textMuted },
  cluster: { flexDirection: 'row', gap: Spacing[2] },
  modeBtn: {
    width: 44, height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  modeBtnActive: { backgroundColor: Colors.mint600, borderColor: Colors.mint600 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing[2] },
  col: { flex: 1, alignItems: 'center' },
  colLabel: { fontSize: 10, color: Colors.textMuted, marginTop: Spacing[2] },

  spreadUpper: { height: PLOT / 2, justifyContent: 'flex-end' },
  spreadLower: { height: PLOT / 2, justifyContent: 'flex-start' },
  baseline: { height: 1, alignSelf: 'stretch', backgroundColor: Colors.border },
  bar: { width: 16, borderRadius: 3 },
  barIn:  { backgroundColor: Colors.mint600 },
  barOut: { backgroundColor: Colors.gray400 },

  groupSlot: { height: PLOT, justifyContent: 'flex-end' },
  pair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  pairBar: { width: 11, borderRadius: 3 },

  stackSlot: { height: PLOT, justifyContent: 'flex-end', width: '100%', maxWidth: 34 },
  stackSeg: { width: '100%' },

  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  legendHint: { flex: 1, textAlign: 'right', fontSize: 11, color: Colors.textMuted },

  stats: { flexDirection: 'row', gap: Spacing[2] },
  stat: {
    flex: 1,
    gap: 2,
    padding: Spacing[3],
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  statLabel: { fontSize: 10, color: Colors.textMuted },
  statValue: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  statValueEmphasis: { color: Colors.mint600 },
  statValueMuted: { color: Colors.gray500 },

  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  avgLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  avgValue: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.mint600 },
  avgValueNeg: { color: Colors.gray500 },

  section: { gap: Spacing[3] },
  stackLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  stackKey: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '46%' },
  stackSwatch: { width: 10, height: 10, borderRadius: 3 },
  stackKeyText: { flexShrink: 1, fontSize: 11, color: Colors.textSecondary },

  empty: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    paddingVertical: Spacing[8],
  },
});
