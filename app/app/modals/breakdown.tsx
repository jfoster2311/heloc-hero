// app/modals/breakdown.tsx — where it all went, by category and by payee.
//
// The Cash flow tab shows the ring and the category rows for the period in
// view. This is the same data with the two things that did not fit there: a
// pivot to merchant, and the long tail — largest single charges and most
// frequent payees, both of which open the merchant sheet.
//
// ── Why income gets a tab and not a budget ─────────────────────────────────
// The Income tab exists because "where does my money come from" is a real
// question with a useful answer for someone whose surplus is the input to
// everything. It deliberately has no ceilings, no comparison to a target and
// no over/under state: there is nothing to cap on money coming in, and every
// mark that implies otherwise would be inventing a judgement.
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, useCallback } from 'react';
import ModalScreen, { Segmented } from '../../components/ui/ModalScreen';
import DonutRing, { buildSegments } from '../../components/ui/DonutRing';
import TransactionRow from '../../components/ui/TransactionRow';
import CategoryDetailSheet, {
  type CategoryDetailTarget,
} from '../../components/sheets/CategoryDetailSheet';
import MerchantDetailSheet from '../../components/sheets/MerchantDetailSheet';
import TransactionDetailSheet from '../../components/sheets/TransactionDetailSheet';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { useBudgets } from '../../hooks/useBudgets';
import { EMPTY_TRANSACTION_META } from '../../hooks/useTransactionMeta';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import {
  PERIODS, periodRange, summarizePeriod, categoryHistory, trailingAverage,
  merchantTotals, merchantDetail,
  type PeriodId, type SpendCategory, type CategorizedTxn,
} from '../../lib/spending';
import { Typography, Spacing, Radius, CategoryRamp, CATEGORY_RAMP_MAX } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

const TREND_MONTHS = 6;
/** Rows shown before "See more". Four is a card you can scan. */
const COLLAPSED_ROWS = 4;
/** Largest and most-frequent lists are a shortlist, not a second full list. */
const SHORTLIST = 5;

type Side = 'spending' | 'income';
type Pivot = 'category' | 'merchant';

export default function BreakdownScreen() {
  const { colors, common } = useTheme();
  const styles = useStyles();
  const { profile } = useAuth();
  const f = useFinancials();
  const overrides = useCategoryOverrides(profile?.id);
  const txnMeta = f.transactionMeta;

  const [period, setPeriod] = useState<PeriodId>('month');
  const [side, setSide] = useState<Side>('spending');
  const [pivot, setPivot] = useState<Pivot>('category');
  const [expanded, setExpanded] = useState(false);

  const [openCategory, setOpenCategory] = useState<CategoryDetailTarget | null>(null);
  const [openMerchant, setOpenMerchant] = useState<string | null>(null);
  const [openTxn, setOpenTxn] = useState<CategorizedTxn | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const monthRange = useMemo(() => periodRange('month'), []);
  const monthKey = useMemo(
    () => `${monthRange.start.getFullYear()}-${String(monthRange.start.getMonth() + 1).padStart(2, '0')}`,
    [monthRange],
  );
  const monthShort = useMemo(
    () => monthRange.start.toLocaleDateString('en-US', { month: 'long' }),
    [monthRange],
  );
  const budgets = useBudgets(profile?.id, monthKey);

  const summary = useMemo(
    () => summarizePeriod({
      transactions: f.transactions,
      classification: f.transactionClassification,
      overrides: overrides.overrides,
      range,
      entered: { monthlyIncome: f.income, monthlyExpenses: f.expenses },
    }),
    [f.transactions, f.transactionClassification, overrides.overrides, range, f.income, f.expenses],
  );

  const merchants = useMemo(
    () => merchantTotals(summary.rows),
    [summary.rows],
  );

  const frequent = useMemo(
    // By COUNT, not amount — that is the whole difference between this list and
    // the one above it, and it is where a small repeated charge shows up.
    () => [...merchants].sort((a, b) => b.count - a.count).filter(m => m.count > 1),
    [merchants],
  );

  const largest = useMemo(
    () => [...summary.rows].sort((a, b) => b.txn.amount - a.txn.amount).slice(0, SHORTLIST),
    [summary.rows],
  );

  // Branched rather than passing a union in: the two arrays are structurally
  // compatible but differ in their `id` type, and inferring over the union
  // widens it to `string` and fails. Calling per branch keeps each inference
  // clean, which is also the honest shape — one is categories, one is payers.
  const ring = useMemo(
    // This screen is not theme-aware yet, so it passes the light ramp
    // explicitly and renders exactly as it does today. It becomes one word when
    // the modals are converted.
    () => (side === 'spending'
      ? buildSegments(summary.categories, CATEGORY_RAMP_MAX, CategoryRamp)
      : buildSegments(incomeSegments(summary.inflows), CATEGORY_RAMP_MAX, CategoryRamp)),
    [side, summary.categories, summary.inflows],
  );

  const openMerchantDetail = useMemo(
    () => openMerchant
      ? merchantDetail({
          transactions: f.transactions,
          classification: f.transactionClassification,
          overrides: overrides.overrides,
          key: openMerchant,
          months: TREND_MONTHS,
        })
      : null,
    [openMerchant, f.transactions, f.transactionClassification, overrides.overrides],
  );

  // ── Category sheet plumbing, same as every other screen that opens it ──
  const openCategoryRows = useMemo(
    () => openCategory?.category
      ? summary.rows
          .filter(r => r.category === openCategory.category)
          .sort((a, b) => b.txn.amount - a.txn.amount)
      : [],
    [summary.rows, openCategory],
  );
  const openCategoryHistory = useMemo(
    () => openCategory
      ? categoryHistory({
          transactions: f.transactions,
          classification: f.transactionClassification,
          overrides: overrides.overrides,
          category: openCategory.category,
          months: TREND_MONTHS,
        })
      : [],
    [openCategory, f.transactions, f.transactionClassification, overrides.overrides],
  );

  const openById = useCallback((id: SpendCategory) => {
    const meta = f.categories.metaFor(id);
    setOpenCategory({ type: 'expense', category: id, label: meta.label, icon: meta.icon });
  }, [f.categories]);

  const rows = side === 'spending' ? summary.categories : incomeSegments(summary.inflows);
  const listTotal = side === 'spending' ? summary.spend : summary.income;
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <>
      <ModalScreen title="Breakdown">
        {/* Period governs everything below, so it sits above all of it. */}
        <View style={styles.periods}>
          {PERIODS.map(p => {
            const active = p.id === period;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.periodPill, active && styles.periodPillActive]}
                onPress={() => { hapticSelection(); setPeriod(p.id); setExpanded(false); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show this ${p.label.toLowerCase()}`}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.range}>
          {range.rangeLabel}{range.inProgress ? ' · in progress' : ''}
        </Text>

        {summary.basis !== 'live' ? (
          <Text style={styles.empty}>
            {f.hasLinkedAccounts
              ? 'No transactions in this period yet.'
              : 'Link an account and your spending is broken down here automatically.'}
          </Text>
        ) : (
          <>
            <Segmented
              options={[
                { value: 'spending', label: 'Spending' },
                { value: 'income',   label: 'Income' },
              ]}
              value={side}
              onChange={v => { hapticSelection(); setSide(v as Side); setExpanded(false); }}
            />

            {/* ── The ring ───────────────────────────────────────────────── */}
            <View style={styles.ringCard}>
              <DonutRing
                segments={ring.segments}
                centerLabel={side === 'spending' ? 'TOTAL SPEND' : 'TOTAL IN'}
                centerValue={`$${fmt(listTotal)}`}
                centerSub={range.rangeLabel}
              />
            </View>

            {/* ── Pivot ──────────────────────────────────────────────────── */}
            {side === 'spending' && (
              <View style={styles.pivotRow}>
                <Text style={styles.pivotLabel}>View by</Text>
                {(['category', 'merchant'] as Pivot[]).map(p => {
                  const active = p === pivot;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.pivotChip, active && styles.pivotChipActive]}
                      onPress={() => { hapticSelection(); setPivot(p); setExpanded(false); }}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`View by ${p}`}
                    >
                      <Text style={[styles.pivotText, active && styles.pivotTextActive]}>
                        {p === 'category' ? 'Category' : 'Merchant'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── The list ───────────────────────────────────────────────── */}
            {side === 'spending' && pivot === 'merchant' ? (
              <MerchantList
                merchants={expanded ? merchants : merchants.slice(0, COLLAPSED_ROWS)}
                total={summary.spend}
                onOpen={setOpenMerchant}
              />
            ) : (
              <View style={styles.list}>
                {visible.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.row}
                    onPress={() => {
                      // Income has no category sheet — there is no ceiling to
                      // set and no history worth charting per source yet.
                      if (side !== 'spending') return;
                      hapticLight();
                      openById(c.id as SpendCategory);
                    }}
                    disabled={side !== 'spending'}
                    activeOpacity={0.85}
                    accessibilityRole={side === 'spending' ? 'button' : undefined}
                    accessibilityLabel={
                      `${c.label}, $${fmt(c.amount)}, ${c.pct.toFixed(0)} percent`
                    }
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name={c.icon} size={17} color={colors.mint700} />
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: ring.colorFor[c.id] ?? CategoryRamp.neutral },
                        ]}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowLabel} numberOfLines={1}>{c.label}</Text>
                      <Text style={styles.rowMeta}>
                        {c.pct.toFixed(0)}% · {c.count} transaction{c.count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={styles.rowAmount}>${fmt(c.amount)}</Text>
                    {side === 'spending' && (
                      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <SeeMore
              expanded={expanded}
              hidden={
                (side === 'spending' && pivot === 'merchant' ? merchants.length : rows.length)
                - COLLAPSED_ROWS
              }
              onToggle={() => { hapticLight(); setExpanded(e => !e); }}
            />

            {/* ── The tail ───────────────────────────────────────────────── */}
            {side === 'spending' && largest.length > 0 && (
              <View style={styles.section}>
                <Text style={common.eyebrow}>LARGEST CHARGES</Text>
                <View style={styles.plainList}>
                  {largest.map(r => {
                    const m = txnMeta.get(r.txn.transaction_id);
                    return (
                      <TransactionRow
                        key={r.txn.transaction_id}
                        name={r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}
                        meta={f.categories.metaFor(r.category).label}
                        amount={r.txn.amount}
                        icon={f.categories.metaFor(r.category).icon}
                        hidden={m.hidden}
                        recurring={m.recurring}
                        overridden={r.overridden}
                        onPress={() => { hapticLight(); setOpenTxn(r); }}
                      />
                    );
                  })}
                </View>
              </View>
            )}

            {side === 'spending' && frequent.length > 0 && (
              <View style={styles.section}>
                <Text style={common.eyebrow}>MOST FREQUENT</Text>
                <Text style={styles.sectionNote}>
                  Small charges that repeat are the ones that quietly eat a surplus.
                </Text>
                <View style={styles.chips}>
                  {frequent.slice(0, 8).map(m => (
                    <TouchableOpacity
                      key={m.key}
                      style={styles.chip}
                      onPress={() => { hapticLight(); setOpenMerchant(m.key); }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        `${m.name}, ${m.count} times, $${fmt(m.amount)} total`
                      }
                    >
                      <Text style={styles.chipCount}>{m.count}×</Text>
                      <Text style={styles.chipName} numberOfLines={1}>{m.name}</Text>
                      <Text style={styles.chipAmount}>${fmt(m.amount)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ModalScreen>

      <CategoryDetailSheet
        target={openCategory}
        monthLabel={monthShort}
        amount={openCategory?.category
          ? summary.categories.find(c => c.id === openCategory.category)?.amount ?? 0
          : 0}
        // This screen only renders its breakdown on a live basis, so a sheet
        // can only be opened from it when something really was measured.
        measured={summary.basis === 'live'}
        history={openCategoryHistory}
        trailingAverage={trailingAverage(openCategoryHistory)}
        ceiling={openCategory?.category ? budgets.budgets[openCategory.category]?.ceiling ?? null : null}
        inherited={openCategory?.category ? budgets.isInherited(openCategory.category) : false}
        rows={openCategoryRows}
        metaFor={txnMeta.get}
        categoryFor={f.categories.metaFor}
        inProgress={range.inProgress}
        saving={budgets.saving !== null}
        onClose={() => setOpenCategory(null)}
        onSaveCeiling={(ceiling, applyToFuture) => {
          if (!openCategory?.category) return;
          return budgets.setCeiling(openCategory.category, ceiling, { applyToFuture });
        }}
        onClearCeiling={() => {
          if (!openCategory?.category) return;
          return budgets.clearCeiling(openCategory.category);
        }}
        onOpenTransaction={setOpenTxn}
      />

      <MerchantDetailSheet
        merchant={openMerchantDetail}
        metaFor={txnMeta.get}
        categoryFor={f.categories.metaFor}
        onClose={() => setOpenMerchant(null)}
        onOpenTransaction={row => { setOpenMerchant(null); setOpenTxn(row); }}
      />

      <TransactionDetailSheet
        row={openTxn}
        categories={f.categories.all}
        categoryFor={f.categories.metaFor}
        onCreateCategory={f.categories.create}
        categorySaving={f.categories.saving}
        categoryError={f.categories.error}
        meta={openTxn ? txnMeta.get(openTxn.txn.transaction_id) : EMPTY_TRANSACTION_META}
        saving={openTxn ? txnMeta.saving === openTxn.txn.transaction_id : false}
        onClose={() => setOpenTxn(null)}
        onRecategorize={overrides.setCategory}
        onSetHidden={txnMeta.setHidden}
        onSetNote={txnMeta.setNote}
        onSetRecurring={txnMeta.setRecurring}
      />
    </>
  );
}

/**
 * Progressive disclosure, shared by both pivots.
 *
 * States the count rather than saying "See more", because the number is what
 * tells someone whether it is worth the tap — four more rows and forty more
 * rows are different decisions.
 */
function SeeMore({ expanded, hidden, onToggle }: {
  expanded: boolean;
  hidden: number;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (hidden <= 0) return null;
  return (
    <TouchableOpacity
      style={styles.seeMore}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={expanded ? 'Show fewer' : `Show ${hidden} more`}
    >
      <Text style={styles.seeMoreText}>
        {expanded ? 'Show fewer' : `Show ${hidden} more`}
      </Text>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={15}
        color={colors.mint700}
      />
    </TouchableOpacity>
  );
}

function MerchantList({ merchants, total, onOpen }: {
  merchants: { key: string; name: string; amount: number; count: number }[];
  total: number;
  onOpen: (key: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {merchants.map(m => (
        <TouchableOpacity
          key={m.key}
          style={styles.row}
          onPress={() => { hapticLight(); onOpen(m.key); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${m.name}, $${fmt(m.amount)}, ${m.count} charges`}
        >
          <View style={styles.rowIcon}>
            <Text style={styles.merchantInitial}>
              {m.name.trim().charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel} numberOfLines={1}>{m.name}</Text>
            <Text style={styles.rowMeta}>
              {total > 0 ? `${((m.amount / total) * 100).toFixed(0)}% · ` : ''}
              {m.count} charge{m.count === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={styles.rowAmount}>${fmt(m.amount)}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * Income grouped by payer, shaped like a category list so the ring and rows can
 * be shared.
 *
 * These are NOT categories and carry no ids from the taxonomy — the ring is
 * being reused as a proportion chart, which is all it ever was.
 */
function incomeSegments(inflows: CategorizedTxn[]) {
  const groups = new Map<string, { amount: number; count: number; name: string }>();
  for (const r of inflows) {
    const raw = r.txn.merchant_name ?? r.txn.name ?? 'Income';
    const key = raw.toLowerCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || 'income';
    const g = groups.get(key);
    if (g) { g.amount += Math.abs(r.txn.amount); g.count += 1; }
    else groups.set(key, { amount: Math.abs(r.txn.amount), count: 1, name: raw });
  }
  const total = Array.from(groups.values()).reduce((s, g) => s + g.amount, 0);
  return Array.from(groups.entries())
    .map(([key, g]) => ({
      id: key,
      label: g.name,
      icon: 'arrow-down-circle-outline' as const,
      amount: g.amount,
      count: g.count,
      pct: total > 0 ? (g.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  periods: { flexDirection: 'row', gap: Spacing[2] },
  periodPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodPillActive: { backgroundColor: t.colors.mint800, borderColor: t.colors.mint800 },
  periodText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary },
  periodTextActive: { color: t.colors.white, fontWeight: Typography.semibold },
  range: { fontSize: Typography.xs, color: t.colors.textMuted, textAlign: 'center' },

  ringCard: { alignItems: 'center', paddingVertical: Spacing[2] },

  pivotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  pivotLabel: { fontSize: Typography.xs, color: t.colors.textMuted, marginRight: 2 },
  pivotChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  pivotChipActive: { backgroundColor: t.colors.mint50, borderColor: t.colors.mint600 },
  pivotText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: t.colors.textSecondary },
  pivotTextActive: { color: t.colors.mint700, fontWeight: Typography.semibold },

  list: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 64,
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: t.colors.mint50,
    alignItems: 'center', justifyContent: 'center',
  },
  merchantInitial: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: t.colors.mint700,
  },
  swatch: {
    position: 'absolute',
    right: -1, bottom: -1,
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: t.colors.surface,
  },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  rowMeta: { fontSize: 11, color: t.colors.textMuted },
  rowAmount: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },

  seeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    backgroundColor: t.colors.mint50,
  },
  seeMoreText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },

  section: { gap: Spacing[2] },
  sectionNote: { fontSize: 11, color: t.colors.textMuted, lineHeight: 16 },
  plainList: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  chip: {
    width: '48.5%',
    gap: 2,
    padding: Spacing[3],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    minHeight: 72,
    justifyContent: 'center',
  },
  chipCount: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: t.colors.mint700 },
  chipName: { fontSize: Typography.xs, color: t.colors.textPrimary },
  chipAmount: { fontSize: 11, color: t.colors.textMuted },

  empty: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: Spacing[8],
  },
}));
