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
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState, useCallback } from 'react';
import ModalScreen from '../../components/ui/ModalScreen';
import GaugeArc from '../../components/ui/GaugeArc';
import NewCategoryForm from '../../components/ui/NewCategoryForm';
import CategoryDetailSheet, {
  type CategoryDetailTarget,
} from '../../components/sheets/CategoryDetailSheet';
import TransactionDetailSheet from '../../components/sheets/TransactionDetailSheet';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { useBudgets } from '../../hooks/useBudgets';
import type { CustomCategoryId } from '../../lib/spending';
import { EMPTY_TRANSACTION_META } from '../../hooks/useTransactionMeta';
import { hapticLight } from '../../lib/haptics';
import {
  periodRange, summarizePeriod, categoryHistory, trailingAverage,
  type SpendCategory, type CategorizedTxn,
} from '../../lib/spending';
import { getBarColor, budgetStatus, allocate } from '../../lib/budget';
import { Typography, Spacing, Radius, Semantic } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

const TREND_MONTHS = 6;

export default function BudgetScreen() {
  const { colors, common } = useTheme();
  const styles = useStyles();
  const { profile } = useAuth();
  const f = useFinancials();
  const overrides = useCategoryOverrides(profile?.id);
  // One instance for the whole app — see the note in useFinancials.
  const txnMeta = f.transactionMeta;

  const [openCategory, setOpenCategory] = useState<CategoryDetailTarget | null>(null);
  const [openTxn, setOpenTxn] = useState<CategorizedTxn | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomCategoryId | null>(null);

  const [checking, setChecking] = useState(false);
  /**
   * True once a manual check has come back having found nothing.
   *
   * Without it the button is its own dead end: a sync that legitimately returns
   * no new rows leaves the screen byte-identical, so the tap reads as broken.
   * A successful one needs no message — the empty block it sits in is replaced
   * by the real breakdown.
   */
  const [checkedEmpty, setCheckedEmpty] = useState(false);
  /** The check itself failed — distinct from it finding nothing. */
  const [checkFailed, setCheckFailed] = useState(false);

  const checkForTransactions = useCallback(async () => {
    hapticLight();
    setChecking(true);
    setCheckedEmpty(false);
    setCheckFailed(false);
    try {
      // The RESULT matters. Saying "checked just now, nothing new" after a
      // request that never reached the server is a claim about the user's bank
      // made on no evidence.
      setCheckFailed(!(await f.refreshTransactions()));
      setCheckedEmpty(true);
    } finally {
      setChecking(false);
    }
  }, [f.refreshTransactions]);

  /**
   * Deleting a category leaves its transactions alone — they fall back to
   * "Other" (see the migration). That is the right behaviour and a surprising
   * one, so it is stated before the fact rather than discovered after.
   */
  const confirmDelete = useCallback((id: CustomCategoryId, label: string) => {
    Alert.alert(
      `Delete “${label}”?`,
      'Transactions you filed here stay where they are and show as Other. Any budget ' +
      'you set for it is removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => f.categories.remove(id),
        },
      ],
    );
  }, [f.categories]);

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

  // ── Measured, or merely planned ──────────────────────────────────────────
  // With no transactions in the month, `summary.spend` is the user's own
  // entered monthly expense figure scaled to the period — an estimate, not an
  // observation. Everything on this screen that says "spent" reads from
  // `spent`, which is zero in that case, so the word is never applied to a
  // number nobody measured. The ceilings themselves stay fully editable: a
  // budget is a plan, and this screen used to refuse to show one until a bank
  // was connected, which left an unlinked user with no way to make it at all.
  const measured = summary.basis === 'live';
  const spent = measured ? summary.spend : 0;
  const total = budgetStatus(spent, totalCeiling);

  const allocation = useMemo(
    () => allocate({
      // `measured &&` matters: unmeasured, summary.income is the entered figure
      // scaled by one month, so the ternary would pick the same number down the
      // branch that calls it observed.
      income: measured && summary.income > 0 ? summary.income : f.income,
      budgets: budgets.budgets,
      mortgagePayment: f.payment,
    }),
    // `measured` belongs here: it is read in the expression above, and without
    // it a basis flipping estimated → live while the income figure happened to
    // stay numerically equal would leave the allocation on the old branch.
    [measured, summary.income, f.income, budgets.budgets, f.payment],
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

        {!measured && (
          /* A notice now, not the whole screen. Three different situations, and
             each one gets the action that can actually change it — but none of
             them is a reason to withhold the budget editor below, which is the
             one thing here that works with nothing linked.

             The button offered is deliberately NOT f.refresh: that pulls
             balances and leaves the transaction cursor alone, so on a screen
             whose emptiness is "no transactions" it would be a control that
             cannot fix what it is offered for. */
          <View style={styles.stateBlock}>
            <Text style={styles.stateBody}>
              {!f.hasLinkedAccounts
                ? 'Link an account and your spending is measured against these budgets ' +
                  'automatically. Until then there is nothing to measure.'
                : f.awaitingTransactions
                  ? 'Your bank is still sending its history. Your spending appears against ' +
                    'these budgets once it lands — usually within a few minutes of linking.'
                  : 'No transactions this month yet. Budgets fill in as your bank sends them.'}
            </Text>

            {!f.hasLinkedAccounts ? (
              <TouchableOpacity
                style={styles.stateBtn}
                onPress={() => { hapticLight(); router.push('/modals/link-account' as never); }}
                accessibilityRole="button"
                accessibilityLabel="Link an account"
              >
                <Text style={styles.stateBtnText}>Link an account</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.stateBtn, checking && styles.stateBtnBusy]}
                onPress={checkForTransactions}
                disabled={checking}
                accessibilityRole="button"
                accessibilityState={{ disabled: checking, busy: checking }}
                accessibilityLabel="Check for new transactions"
              >
                <Text style={styles.stateBtnText}>
                  {checking ? 'Checking…' : 'Check for new transactions'}
                </Text>
              </TouchableOpacity>
            )}

            {checkedEmpty && !checking && (
              <Text style={styles.stateNote}>
                {checkFailed
                  ? 'We could not reach your bank just now, so nothing was checked. ' +
                    'Try again in a moment.'
                  : 'Checked just now — nothing new has arrived yet.'}
              </Text>
            )}
          </View>
        )}

        {/* Kept as a fragment rather than dedented into siblings: the contents
            are unchanged and re-indenting 190 lines would bury that fact. */}
        <>
            {/* ── The one aggregate ──────────────────────────────────────── */}
            <View style={styles.gaugeBlock}>
              {/* Unmeasured, the arc reports the PLAN rather than progress
                  through it. A gauge is a ratio and only one of its two figures
                  exists, so drawing any fill at all would be inventing the
                  other one. */}
              <GaugeArc
                pct={measured && totalCeiling !== null ? total.pct : 0}
                color={getBarColor(spent, totalCeiling)}
                label={measured ? 'Spent' : 'Budgeted'}
                value={measured ? `$${fmt(spent)}` : `$${fmt(totalCeiling ?? 0)}`}
                sub={measured
                  ? (totalCeiling !== null ? `of a $${fmt(totalCeiling)} budget` : 'no budget set yet')
                  : (totalCeiling !== null ? 'nothing measured against it yet' : 'no budget set yet')}
                accessibilityLabel={
                  !measured
                    ? (totalCeiling !== null
                        ? `$${fmt(totalCeiling)} budgeted, nothing measured against it yet`
                        : 'No budget set yet')
                    : totalCeiling !== null
                      ? `$${fmt(spent)} spent of a $${fmt(totalCeiling)} budget` +
                        (total.over ? `, $${fmt(total.overBy)} over` : '')
                      : `$${fmt(spent)} spent, no budget set`
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
                hint={measured && summary.income > 0 ? 'measured this month' : 'the figure you entered'}
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
            <Text style={[common.eyebrow, styles.listLabel]}>ALL CATEGORIES</Text>
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
                      measured
                        ? `${r.meta.label}, $${fmt(r.amount)} spent` +
                          (r.ceiling !== null
                            ? ` of a $${fmt(r.ceiling)} budget${status.over ? ', over budget' : ''}`
                            : ', no budget set')
                        : `${r.meta.label}, ` +
                          (r.ceiling !== null ? `$${fmt(r.ceiling)} budget` : 'no budget set')
                    }
                    accessibilityHint="Opens this category to set a budget"
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name={r.meta.icon} size={17} color={colors.mint700} />
                    </View>

                    <View style={styles.rowBody}>
                      <View style={styles.rowHead}>
                        <Text style={styles.rowLabel} numberOfLines={1}>{r.meta.label}</Text>
                        <View style={styles.rowFigures}>
                          {measured && status.over && <Text style={styles.overWord}>over</Text>}
                          {/* Unmeasured, the ceiling is the whole figure. A
                              leading "$0" would be read as "you have spent
                              nothing here", which is a measurement — what is
                              true is that nothing has been measured. */}
                          <Text style={styles.rowValue}>
                            {measured ? `$${fmt(r.amount)}` : ''}
                            <Text style={measured ? styles.rowOf : undefined}>
                              {r.ceiling !== null
                                ? measured ? ` of $${fmt(r.ceiling)}` : `$${fmt(r.ceiling)}`
                                : measured ? ' · set one' : 'Set one'}
                            </Text>
                          </Text>
                        </View>
                      </View>

                      {/* No track when there is nothing to fill it with. */}
                      {measured && (
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
                      )}
                    </View>

                    <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {budgets.error && <Text style={styles.errorNote}>{budgets.error}</Text>}

            {/* ── Your own categories ────────────────────────────────────────
                Lives here rather than in Settings because this is the screen
                where someone discovers the taxonomy does not fit their life —
                they are looking down a list of thirteen budgets and none of
                them is "Childcare". */}
            <View style={styles.manage}>
              <Text style={common.eyebrow}>YOUR OWN CATEGORIES</Text>

              {f.categories.custom.length === 0 && !creating && (
                <Text style={styles.manageEmpty}>
                  None yet. Add one for anything the list above does not cover.
                </Text>
              )}

              {f.categories.custom.map(c => (
                editing === c.id ? (
                  <NewCategoryForm
                    key={c.id}
                    title="Rename category"
                    submitLabel="Save"
                    initial={{ label: c.label, icon: c.icon }}
                    saving={f.categories.saving}
                    error={f.categories.error}
                    onCancel={() => setEditing(null)}
                    onCreate={async (label, icon) => {
                      const ok = await f.categories.rename(c.id, label, icon);
                      if (ok) setEditing(null);
                    }}
                  />
                ) : (
                  <View key={c.id} style={styles.manageRow}>
                    <View style={styles.rowIcon}>
                      <Ionicons name={c.icon} size={17} color={colors.mint700} />
                    </View>
                    <Text style={styles.manageLabel} numberOfLines={1}>{c.label}</Text>
                    <TouchableOpacity
                      style={styles.manageBtn}
                      onPress={() => { hapticLight(); setEditing(c.id); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${c.label}`}
                    >
                      <Text style={styles.manageBtnText}>Rename</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.manageBtn}
                      onPress={() => { hapticLight(); confirmDelete(c.id, c.label); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${c.label}`}
                    >
                      <Ionicons name="trash-outline" size={17} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )
              ))}

              {creating ? (
                <NewCategoryForm
                  saving={f.categories.saving}
                  error={f.categories.error}
                  onCancel={() => setCreating(false)}
                  onCreate={async (label, icon) => {
                    const id = await f.categories.create(label, icon);
                    if (id) setCreating(false);
                  }}
                />
              ) : (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => { hapticLight(); setCreating(true); }}
                  accessibilityRole="button"
                  accessibilityLabel="Add a category"
                >
                  <Ionicons name="add" size={17} color={colors.mint700} />
                  <Text style={styles.addBtnText}>Add a category</Text>
                </TouchableOpacity>
              )}

              {f.categories.error && !creating && editing === null && (
                <Text style={styles.errorNote}>{f.categories.error}</Text>
              )}
            </View>
        </>
      </ModalScreen>

      <CategoryDetailSheet
        target={openCategory}
        monthLabel={monthShort}
        amount={openAmount}
        measured={measured}
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

/** One line of the income allocation. Negative values are grey, never red. */
function AllocRow({ label, value, hint, emphasis }: {
  label: string;
  value: number;
  hint?: string;
  emphasis?: boolean;
}) {
  const styles = useStyles();
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

const useStyles = createThemedStyles(t => ({
  month: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },

  gaugeBlock: { alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2] },
  overLine: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Semantic.overCeiling,
  },

  allocation: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
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
  allocLabel: { fontSize: Typography.sm, color: t.colors.textSecondary },
  allocLabelEmphasis: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  allocHint: { fontSize: 11, color: t.colors.textMuted },
  allocValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  allocValueMuted: { color: t.colors.gray500 },
  allocValueEmphasis: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: t.colors.accentInk,
  },
  allocValueNeg: { color: t.colors.gray500 },
  allocRule: { height: 1, backgroundColor: t.colors.borderSubtle, marginVertical: Spacing[1] },
  overCommitted: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 18,
    paddingBottom: Spacing[3],
  },

  listLabel: { marginTop: Spacing[2] },
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
  rowBody: { flex: 1, gap: 6 },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  rowLabel: { flexShrink: 1, fontSize: Typography.sm, color: t.colors.textSecondary },
  rowFigures: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  overWord: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: Semantic.overCeiling,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  rowValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  rowOf: { fontWeight: Typography.regular, color: t.colors.textMuted },

  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Semantic.ceilingTrack,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },

  stateBlock: { gap: Spacing[3], paddingVertical: Spacing[6] },
  stateBody: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  // Same shape as the Cash flow tab's empty-state button, so the two screens
  // that can both be empty for the same reason offer the same-looking way out.
  stateBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    backgroundColor: t.colors.mint50,
  },
  stateBtnBusy: { opacity: 0.6 },
  stateBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },
  stateNote: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 18 },
  errorNote: { fontSize: Typography.xs, color: t.colors.textSecondary },

  manage: { gap: Spacing[2], marginTop: Spacing[2] },
  manageEmpty: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 18 },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 56,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
  },
  manageLabel: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  manageBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[2],
  },
  manageBtnText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 48,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.colors.mint600,
    backgroundColor: t.colors.mint50,
  },
  addBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },
}));
