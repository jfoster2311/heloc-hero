// app/modals/budget.tsx — every ceiling, and what they add up to.
//
// Reached from the Budget widget's header chevron. The widget shows the total
// and the three biggest categories; this shows all of them, plus the one thing
// a per-category view cannot: whether the ceilings together fit inside the
// income they are being set against.
//
// ── The line this screen must not cross ────────────────────────────────────
// Nothing here is an input to the payoff projection. A budget is the user's own
// plan for their spending; the projection runs on what they actually earn and
// spend (lib/cashflow.ts) plus the figures they entered. If a ceiling ever fed
// a payoff date, someone tightening a grocery budget would watch their mortgage
// payoff jump forward by two years, which is a lie the arithmetic would tell
// with total confidence. The closing note on this screen says so out loud.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, useCallback } from 'react';
import ModalScreen from '../../components/ui/ModalScreen';
import GaugeArc from '../../components/ui/GaugeArc';
import CategoryDetailSheet, {
  type CategoryDetailTarget,
} from '../../components/sheets/CategoryDetailSheet';
import TransactionDetailSheet from '../../components/sheets/TransactionDetailSheet';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { useBudgets } from '../../hooks/useBudgets';
import { hapticLight } from '../../lib/haptics';
import {
  periodRange, summarizePeriod, categoryHistory, trailingAverage,
  type SpendCategory, type CategorizedTxn,
} from '../../lib/spending';
import { getBarColor, budgetStatus, allocate } from '../../lib/budget';
import { Colors, Typography, Spacing, Radius, Semantic, CommonStyles } from '../../lib/theme';

const TREND_MONTHS = 6;

export default function BudgetScreen() {
  const { profile } = useAuth();
  const f = useFinancials();
  const overrides = useCategoryOverrides(profile?.id);
  // One instance for the whole app — see the note in useFinancials.
  const txnMeta = f.transactionMeta;

  const [openCategory, setOpenCategory] = useState<CategoryDetailTarget | null>(null);
  const [openTxn, setOpenTxn] = useState<CategorizedTxn | null>(null);

  const range = useMemo(() => periodRange('month'), []);
  const monthKey = useMemo(
    () => `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, '0')}`,
    [range],
  );
  const monthLabel = useMemo(
    () => range.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [range],
  );
  const monthShort = useMemo(
    () => range.start.toLocaleDateString('en-US', { month: 'long' }),
    [range],
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

  const totalCeiling = useMemo(() => {
    const sum = Object.values(budgets.budgets).reduce((s, b) => s + (b?.ceiling ?? 0), 0);
    return sum > 0 ? sum : null;
  }, [budgets.budgets]);

  const total = budgetStatus(summary.spend, totalCeiling);

  const allocation = useMemo(
    () => allocate({
      income: summary.income > 0 ? summary.income : f.income,
      budgets: budgets.budgets,
      mortgagePayment: f.payment,
    }),
    [summary.income, f.income, budgets.budgets, f.payment],
  );

  // Every category, budgeted or not — including ones with no spend this month,
  // so a ceiling can be set before the spending starts rather than only after.
  const rows = useMemo(() => {
    const spentBy = new Map(summary.categories.map(c => [c.id, c]));
    return f.categories.all.map(meta => ({
      meta,
      amount: spentBy.get(meta.id)?.amount ?? 0,
      count:  spentBy.get(meta.id)?.count ?? 0,
      ceiling: budgets.budgets[meta.id]?.ceiling ?? null,
    })).sort((a, b) => {
      // Budgeted categories first (they are the ones being tracked), then by
      // spend. A category the user has committed to should not sink below one
      // they have never thought about just because it had a quiet month.
      if ((a.ceiling !== null) !== (b.ceiling !== null)) return a.ceiling !== null ? -1 : 1;
      return b.amount - a.amount;
    });
  }, [summary.categories, budgets.budgets, f.categories.all]);

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

  const openAmount = openCategory?.category
    ? summary.categories.find(c => c.id === openCategory.category)?.amount ?? 0
    : 0;

  return (
    <>
      <ModalScreen
        title="Budget"
        footnote={
          'A budget is yours alone. It does not change your payoff projection or the surplus ' +
          'your plan is sized on — those come from what you actually earn and spend.'
        }
      >
        <Text style={styles.month}>{monthLabel}</Text>

        {summary.basis !== 'live' ? (
          <View style={styles.stateBlock}>
            <Text style={styles.stateBody}>
              {f.hasLinkedAccounts
                ? 'No transactions this month yet. Budgets fill in as your bank sends them.'
                : 'Link an account and your spending is measured against these budgets ' +
                  'automatically. Until then there is nothing to measure.'}
            </Text>
          </View>
        ) : (
          <>
            {/* ── The one aggregate ──────────────────────────────────────── */}
            <View style={styles.gaugeBlock}>
              <GaugeArc
                pct={totalCeiling !== null ? total.pct : 0}
                color={getBarColor(summary.spend, totalCeiling)}
                label="Spent"
                value={`$${fmt(summary.spend)}`}
                sub={totalCeiling !== null
                  ? `of a $${fmt(totalCeiling)} budget`
                  : 'no budget set yet'}
                accessibilityLabel={
                  totalCeiling !== null
                    ? `$${fmt(summary.spend)} spent of a $${fmt(totalCeiling)} budget` +
                      (total.over ? `, $${fmt(total.overBy)} over` : '')
                    : `$${fmt(summary.spend)} spent, no budget set`
                }
              />
              {total.over && (
                <Text style={styles.overLine}>
                  ${fmt(total.overBy)} over your {monthShort} budget
                </Text>
              )}
            </View>

            {/* ── Does it fit? ───────────────────────────────────────────────
                The question a per-category list cannot answer. Someone setting
                thirteen ceilings independently has no idea whether they add up
                to more than they earn until something says so. */}
            <View style={styles.allocation}>
              <AllocRow
                label="Monthly income"
                value={allocation.income}
                hint={summary.income > 0 ? 'measured this month' : 'the figure you entered'}
              />
              <AllocRow label="Budgeted" value={-allocation.budgeted} />
              {allocation.mortgage > 0 && (
                <AllocRow label="Mortgage payment" value={-allocation.mortgage} />
              )}
              <View style={styles.allocRule} />
              <AllocRow
                label="Left for your plan"
                value={allocation.unallocated}
                emphasis
              />
              {allocation.overCommitted && (
                <Text style={styles.overCommitted}>
                  Your budgets and mortgage payment come to more than your income. Something
                  here has to give before there is a surplus to cycle.
                </Text>
              )}
            </View>

            {/* ── Every category ─────────────────────────────────────────── */}
            <Text style={[CommonStyles.eyebrow, styles.listLabel]}>ALL CATEGORIES</Text>
            <View style={styles.list}>
              {rows.map(r => {
                const status = budgetStatus(r.amount, r.ceiling);
                return (
                  <TouchableOpacity
                    key={r.meta.id}
                    style={styles.row}
                    onPress={() => { hapticLight(); openById(r.meta.id); }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={
                      `${r.meta.label}, $${fmt(r.amount)} spent` +
                      (r.ceiling !== null
                        ? ` of a $${fmt(r.ceiling)} budget${status.over ? ', over budget' : ''}`
                        : ', no budget set')
                    }
                    accessibilityHint="Opens this category to set a budget"
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name={r.meta.icon} size={17} color={Colors.mint700} />
                    </View>

                    <View style={styles.rowBody}>
                      <View style={styles.rowHead}>
                        <Text style={styles.rowLabel} numberOfLines={1}>{r.meta.label}</Text>
                        <View style={styles.rowFigures}>
                          {status.over && <Text style={styles.overWord}>over</Text>}
                          <Text style={styles.rowValue}>
                            ${fmt(r.amount)}
                            <Text style={styles.rowOf}>
                              {r.ceiling !== null ? ` of $${fmt(r.ceiling)}` : ' · set one'}
                            </Text>
                          </Text>
                        </View>
                      </View>

                      <View style={styles.track}>
                        <View
                          style={[
                            styles.fill,
                            {
                              width: `${status.pct > 0 ? Math.max(1.5, status.pct) : 0}%`,
                              backgroundColor: getBarColor(r.amount, r.ceiling),
                            },
                          ]}
                        />
                      </View>
                    </View>

                    <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {budgets.error && <Text style={styles.errorNote}>{budgets.error}</Text>}
          </>
        )}
      </ModalScreen>

      <CategoryDetailSheet
        target={openCategory}
        monthLabel={monthShort}
        amount={openAmount}
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

      <TransactionDetailSheet
        row={openTxn}
        categories={f.categories.all}
        categoryFor={f.categories.metaFor}
        onCreateCategory={f.categories.create}
        categorySaving={f.categories.saving}
        categoryError={f.categories.error}
        meta={openTxn ? txnMeta.get(openTxn.txn.transaction_id) : { hidden: false, note: null, recurring: false }}
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

/** One line of the income allocation. Negative values are grey, never red. */
function AllocRow({ label, value, hint, emphasis }: {
  label: string;
  value: number;
  hint?: string;
  emphasis?: boolean;
}) {
  const negative = value < 0;
  return (
    <View style={styles.allocRow}>
      <View style={styles.allocBody}>
        <Text style={[styles.allocLabel, emphasis && styles.allocLabelEmphasis]}>{label}</Text>
        {hint ? <Text style={styles.allocHint}>{hint}</Text> : null}
      </View>
      <Text
        style={[
          styles.allocValue,
          emphasis && styles.allocValueEmphasis,
          emphasis && negative && styles.allocValueNeg,
          !emphasis && negative && styles.allocValueMuted,
        ]}
      >
        {negative ? '−' : ''}${fmt(Math.abs(value))}
      </Text>
    </View>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const styles = StyleSheet.create({
  month: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  gaugeBlock: { alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2] },
  overLine: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Semantic.overCeiling,
  },

  allocation: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 48,
  },
  allocBody: { flex: 1, gap: 1 },
  allocLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  allocLabelEmphasis: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  allocHint: { fontSize: 11, color: Colors.textMuted },
  allocValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  allocValueMuted: { color: Colors.gray500 },
  allocValueEmphasis: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: Colors.mint600,
  },
  allocValueNeg: { color: Colors.gray500 },
  allocRule: { height: 1, backgroundColor: Colors.borderSubtle, marginVertical: Spacing[1] },
  overCommitted: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    paddingBottom: Spacing[3],
  },

  listLabel: { marginTop: Spacing[2] },
  list: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 64,
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.mint50,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 6 },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  rowLabel: { flexShrink: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  rowFigures: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  overWord: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: Semantic.overCeiling,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  rowValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  rowOf: { fontWeight: Typography.regular, color: Colors.textMuted },

  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Semantic.ceilingTrack,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },

  stateBlock: { gap: Spacing[3], paddingVertical: Spacing[6] },
  stateBody: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  errorNote: { fontSize: Typography.xs, color: Colors.textSecondary },
});
