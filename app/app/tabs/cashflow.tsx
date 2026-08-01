// app/tabs/cashflow.tsx — real budgeting, subordinate to the strategy.
//
// This screen used to refuse a category breakdown on principle: transactions
// were read for exactly one number — what the user has left each month — and
// showing where the money went was called a different product. That call has
// been reversed deliberately, and the reasoning it was protecting still holds,
// so it is enforced structurally instead of by omission:
//
//   · The hero is still the strategy's number, not a budget total. The payoff
//     and HELOC cards on the Dashboard remain the app's hero; this is a tool
//     that explains the surplus feeding them.
//   · Every exclusion comes from lib/cashflow.ts (`classifyTransactions`), so
//     the categories below always sum to the spending the projection was
//     computed from. That now includes rows the user hid as duplicates, which
//     enter through the same door in useFinancials — a screen applying hides on
//     its own would print a total that no longer reconciled with the surplus.
//   · Live and estimated figures are labelled as such, everywhere. A period
//     total scaled from a typed monthly figure is not a measurement.
//   · The mortgage payment is NOT in the breakdown — the strategy models it
//     directly — and the screen says so rather than leaving a hole.
//   · Budgets are the user's own and touch nothing. lib/budget.ts is not read by
//     projections.ts, so a payoff date cannot move because a grocery ceiling did.
//
// ── Shape ──────────────────────────────────────────────────────────────────
// Hub and spoke. Four widgets — spend, activity, budget, breakdown — each a
// summary that opens the full thing, and every transaction anywhere on the
// screen opens the SAME detail sheet. That is why the rows, the sheets and the
// bars live in components/ rather than here: six surfaces render a transaction,
// and they have to render it identically or the app looks assembled from parts.
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import UpcomingMoney, { buildUpcoming } from '../../components/UpcomingMoney';
import { parseDate } from '../../lib/mortgage';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/primitives';
import DonutRing, { buildSegments } from '../../components/ui/DonutRing';
import SpendThisMonth from '../../components/SpendThisMonth';
import LatestActivity from '../../components/cashflow/LatestActivity';
import BudgetWidget from '../../components/cashflow/BudgetWidget';
import DayDetailSheet from '../../components/cashflow/DayDetailSheet';
import TransactionDetailSheet from '../../components/sheets/TransactionDetailSheet';
import CategoryDetailSheet, {
  type CategoryDetailTarget,
} from '../../components/sheets/CategoryDetailSheet';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useCycleHistory } from '../../hooks/useCycleHistory';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { useBudgets } from '../../hooks/useBudgets';
import { EMPTY_TRANSACTION_META } from '../../hooks/useTransactionMeta';
import { hapticLight, hapticSuccess, hapticError, hapticSelection } from '../../lib/haptics';
import {
  PERIODS, periodRange, summarizePeriod, summarizableRows, rowsInRange,
  previousRange, cumulativeSpend, dailyBreakdown, categoryHistory, trailingAverage,
  type PeriodId, type SpendCategory, type CategorizedTxn, type DayCell,
} from '../../lib/spending';
import { Typography, Spacing, Radius, OnDark, CATEGORY_RAMP_MAX, TAB_BAR_CLEARANCE } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

/** How many months the category trend charts look back over. */
const TREND_MONTHS = 6;
/**
 * Category rows shown before "Show more".
 *
 * Six, not four: the ring above folds to four arcs plus a tail, so a list cut
 * to four would hide the very rows the tail is asking about.
 */
const COLLAPSED_CATS = 6;

export default function CashFlowScreen() {
  const { categoryRamp, common, colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const f = useFinancials();
  const {
    buckets, totalDumped, count, lastDumpAt, loading: historyLoading,
    totalSwept, sweepCount, lastSweepAt,
    error: historyError, refresh: refreshHistory,
  } = useCycleHistory(profile?.id);
  const overrides = useCategoryOverrides(profile?.id);
  // One instance for the whole app, from useFinancials. Mounting the hook again
  // here would give this screen its own copy of "what is hidden", and the totals
  // above the list would go on counting a row the list had already dimmed.
  const txnMeta = f.transactionMeta;

  const [period, setPeriod] = useState<PeriodId>('month');
  const [openCategory, setOpenCategory] = useState<CategoryDetailTarget | null>(null);
  const [openTxn, setOpenTxn] = useState<CategorizedTxn | null>(null);
  const [openDay, setOpenDay] = useState<DayCell | null>(null);
  const [catsExpanded, setCatsExpanded] = useState(false);
  /**
   * The arc the user has tapped, if any.
   *
   * A key rather than a category id, because the ring's folded tail (`__rest`)
   * is a selectable arc that is not a category. Selecting is deliberately NOT
   * the same gesture as drilling in: a tap on the ring re-points the centre
   * figure at one category and highlights its row, which is a question about
   * proportion; opening the sheet is a question about transactions, and it
   * still belongs to the rows.
   */
  const [selectedArc, setSelectedArc] = useState<string | null>(null);

  // Everything below comes from useFinancials, which exists precisely so two
  // screens cannot disagree about the same figure.
  const income    = f.income;
  const expenses  = f.expenses;
  const payment   = f.payment;
  const helocRate = f.helocRate;
  const refreshing = f.refreshing;
  // Zero when the balance is unknown, and the caption below has to say so. This
  // figure is part of `committed`, so an absent balance shrinks what is
  // committed and inflates the surplus this screen leads with — the flattering
  // direction, on the number the whole strategy is sized from.
  const helocInterest = (f.helocDrawn ?? 0) * helocRate / 12;

  const hasFigures = income > 0;
  const committed  = expenses + payment + (helocInterest > 1 ? helocInterest : 0);
  const surplus    = income - committed;
  const committedPct = income > 0 ? Math.min((committed / income) * 100, 100) : 0;

  // Recomputed when the period changes, not on a Date that would never
  // invalidate. `now` is read at render so a session left open overnight rolls
  // into the new day rather than summing yesterday's window.
  const range = useMemo(() => periodRange(period), [period]);

  // Budgets are monthly by nature, so they are ALWAYS keyed to the calendar
  // month regardless of what the period toggle above is showing. A "quarter
  // budget" derived by tripling a monthly ceiling is a figure the user never
  // set, and a budget card that changed its numbers when you tapped "Year"
  // would be reporting on a commitment nobody made.
  const monthRange = useMemo(() => periodRange('month'), []);
  const monthKey = useMemo(
    () => `${monthRange.start.getFullYear()}-${String(monthRange.start.getMonth() + 1).padStart(2, '0')}`,
    [monthRange],
  );
  const monthLabel = useMemo(
    () => monthRange.start.toLocaleDateString('en-US', { month: 'long' }),
    [monthRange],
  );
  const budgets = useBudgets(profile?.id, monthKey);

  // ── Is there anything to measure, ever? ──────────────────────────────────
  // Distinct from "did this window have transactions", and the distinction is
  // the whole reason this screen used to collapse. Every widget below was gated
  // on `summary.basis === 'live'`, which is a fact about the SELECTED PERIOD —
  // so picking Week, or opening the app on the 2nd of the month, silently
  // deleted the chart, the activity list and the category rows. Year looked
  // like a richer screen when it was only a wider window.
  //
  // The gate is now "does this account have spending we can total", and each
  // widget carries its own empty state for a window that happens to be quiet.
  // A section that disappears teaches the user the app is broken; a section
  // that says "nothing in July" teaches them about July.
  const allRows = useMemo(
    () => summarizableRows(f.transactions, f.transactionClassification),
    [f.transactions, f.transactionClassification],
  );
  const hasSpendData = allRows.length > 0;

  // Which periods actually hold something, so an empty window can offer the
  // nearest one that does not. This is what makes "Year shows more" a fact the
  // user can act on from Week rather than something they have to discover.
  const periodCounts = useMemo(() => {
    const out = {} as Record<PeriodId, number>;
    for (const p of PERIODS) out[p.id] = rowsInRange(allRows, periodRange(p.id)).length;
    return out;
  }, [allRows]);

  // The next window OUT with something in it. Never a shorter one: offering to
  // narrow a search that already found nothing is not help.
  const widerWithData = useMemo(() => {
    const from = PERIODS.findIndex(p => p.id === period);
    return PERIODS.slice(from + 1).find(p => periodCounts[p.id] > 0) ?? null;
  }, [period, periodCounts]);

  const summarizeArgs = {
    transactions: f.transactions,
    classification: f.transactionClassification,
    overrides: overrides.overrides,
    entered: { monthlyIncome: income, monthlyExpenses: expenses },
  };

  const summary = useMemo(
    () => summarizePeriod({ ...summarizeArgs, range }),
    [f.transactions, f.transactionClassification, overrides.overrides, range, income, expenses],
  );

  // The month's own figures, for the budget card. Separate from `summary`
  // because that one follows the period toggle and this one must not.
  const monthSummary = useMemo(
    () => summarizePeriod({ ...summarizeArgs, range: monthRange }),
    [f.transactions, f.transactionClassification, overrides.overrides, monthRange, income, expenses],
  );

  const upcoming = useMemo(
    () => buildUpcoming(
      f.derivedCashflow?.recurringIncome ?? [],
      {
        amount:   f.mortgage.nextPayment.value ?? payment,
        dueDate:  f.mortgage.nextPaymentDueDate.value
          ? parseDate(f.mortgage.nextPaymentDueDate.value)
          : null,
        reported: f.mortgage.nextPaymentDueDate.source === 'liability',
      },
    ),
    [f.derivedCashflow, f.mortgage.nextPayment, f.mortgage.nextPaymentDueDate, payment],
  );

  const onRefresh = useCallback(async () => {
    const [ok] = await Promise.all([f.refresh(), refreshHistory()]);
    if (ok) hapticSuccess();
    else hapticError();
  }, [f.refresh, refreshHistory]);

  const maxBucket = Math.max(...buckets.map(b => b.total), 0);

  // Ranked arcs plus a folded tail, and the colour each category is painted in
  // — shared with the list below so a swatch there means the same arc here.
  const ring = useMemo(
    () => buildSegments(summary.categories, CATEGORY_RAMP_MAX, categoryRamp),
    [summary.categories, categoryRamp],
  );

  // ── What the ring is currently pointed at ────────────────────────────────
  // Resolved by looking the key up in the CURRENT segments rather than trusting
  // the stored string. Change the period and a category with no spend in the
  // new window simply stops resolving, so the centre falls back to the total
  // instead of captioning a figure that is no longer on the chart.
  const selectedSeg = useMemo(
    () => ring.segments.find(s => s.key === selectedArc) ?? null,
    [ring.segments, selectedArc],
  );
  const selectedCat = selectedSeg && selectedSeg.key !== '__rest'
    ? summary.categories.find(c => c.id === selectedSeg.key) ?? null
    : null;
  const foldedTotal = useMemo(
    () => ring.folded.reduce((s, c) => s + c.amount, 0),
    [ring.folded],
  );

  /** The three lines inside the ring, which is the whole point of selecting. */
  const center = selectedCat
    ? {
        label: selectedCat.label.toUpperCase(),
        value: `$${fmt(selectedCat.amount)}`,
        sub: `${selectedCat.pct.toFixed(0)}% of spend · ${selectedCat.count} ` +
             `transaction${selectedCat.count === 1 ? '' : 's'}`,
      }
    : selectedSeg
      ? {
          label: 'SMALLER CATEGORIES',
          value: `$${fmt(foldedTotal)}`,
          sub: `${ring.folded.length} categories · ${selectedSeg.pct.toFixed(0)}% of spend`,
        }
      : {
          label: 'TOTAL SPEND',
          value: `$${fmt(summary.spend)}`,
          sub: `this ${periodWord(period)}`,
        };

  const handleSelectArc = useCallback((key: string | null) => {
    hapticSelection();
    setSelectedArc(key);
    // Selecting the folded tail opens the rows it stands for. On its own the
    // arc can only say "12% went somewhere else", which is the question rather
    // than the answer — the categories it folded are already on the screen,
    // just below the fold.
    if (key === '__rest') setCatsExpanded(true);
  }, []);

  // The mortgage payment scaled to the period. It is deliberately absent from
  // the ring (the projection models it, and counting it twice would understate
  // the surplus) but it cannot be absent from the summary: without it "net"
  // would be the figure before the largest committed payment of the month, and
  // the cycling line beneath it would be wrong by exactly that amount.
  const mortgageForPeriod = payment * range.months;
  const netAfterMortgage  = summary.net - mortgageForPeriod;
  const monthlyEquivalent = range.months > 0 ? netAfterMortgage / range.months : netAfterMortgage;

  // Each outflow as a share of what came in, for the bars on the summary rows.
  // Null with no income on file rather than 0: a bar measured against nothing
  // is not an empty bar, it is a comparison that cannot be drawn, and every row
  // would sit at 100% or 0% and imply a proportion nobody computed.
  const shareOfIncome = summary.income > 0
    ? (v: number) => Math.min(100, (Math.abs(v) / summary.income) * 100)
    : null;

  // Spending pace and the day grid. Estimated basis is excluded outright —
  // there is no day-by-day shape in a single typed monthly total, and drawing
  // one would be inventing a measurement.
  const spend = useMemo(() => {
    // Keyed to whether there is spending data at all, NOT to whether this
    // window has any. A quiet month draws a real curve that is flat at zero and
    // a real grid of empty days, which is the answer to "what did I spend in
    // August" — the card vanishing is not.
    if (!hasSpendData) return null;
    const args = {
      transactions: f.transactions,
      classification: f.transactionClassification,
    };
    return {
      cur:  cumulativeSpend({ ...args, range }),
      prev: cumulativeSpend({ ...args, range: previousRange(range) }),
      days: dailyBreakdown({ ...args, overrides: overrides.overrides, range }),
    };
  }, [summary.basis, f.transactions, f.transactionClassification, overrides.overrides, range]);

  // Newest first, for the activity widget and the full list behind it. Inflows
  // are merged back in here: they are held out of `rows` so a paycheck cannot
  // land in the category breakdown, but a list of recent activity missing the
  // largest deposit of the month would look broken to the one person who can
  // check it against their statement.
  const recent = useMemo(
    () => [...summary.rows, ...summary.inflows]
      .sort((a, b) => b.txn.date.localeCompare(a.txn.date)),
    [summary.rows, summary.inflows],
  );

  const totalCeiling = useMemo(() => {
    const sum = Object.values(budgets.budgets).reduce((s, b) => s + (b?.ceiling ?? 0), 0);
    return sum > 0 ? sum : null;
  }, [budgets.budgets]);

  // ── What the open category sheet needs ──────────────────────────────────
  const openCategoryRows = useMemo(
    () => openCategory?.category
      ? monthSummary.rows
          .filter(r => r.category === openCategory.category)
          .sort((a, b) => b.txn.amount - a.txn.amount)
      : [],
    [monthSummary.rows, openCategory],
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

  const openCategoryAmount = openCategory?.category
    ? monthSummary.categories.find(c => c.id === openCategory.category)?.amount ?? 0
    : 0;

  const openCategoryCeiling = openCategory?.category
    ? budgets.budgets[openCategory.category]?.ceiling ?? null
    : null;

  /** Opens a category sheet from an id, used by both the ring list and budget. */
  const openCategoryById = useCallback((id: SpendCategory) => {
    const meta = f.categories.metaFor(id);
    setOpenCategory({ type: 'expense', category: id, label: meta.label, icon: meta.icon });
  }, [f.categories]);

  return (
    <View style={common.screenContainer}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mint600} />
        }
      >
        <Hero
          intensity={0.75}
          topBar={<Text style={styles.topTitle}>Cash flow</Text>}
        >
          <Text style={styles.heroEyebrow}>
            {surplus >= 0 ? 'AVAILABLE TO CYCLE EACH MONTH' : 'SHORT EACH MONTH'}
          </Text>

          {/* Committed includes interest on the linked HELOC balance, so while
              that balance is loading it is missing and the surplus above it
              reads HIGH — the flattering direction, on the figure the whole
              strategy is sized from. */}
          {f.loading ? (
            <SkeletonGroup label="Working out what you have left each month" style={styles.heroSkeleton}>
              <Skeleton onDark width={170} height={40} radius={Radius.sm} />
              <Skeleton onDark width={230} height={13} />
            </SkeletonGroup>
          ) : (
            <>
              <HeroValue>
                {hasFigures ? `${surplus < 0 ? '−' : ''}$${fmt(Math.abs(surplus))}` : '—'}
              </HeroValue>
              <HeroCaption>
                {hasFigures
                  ? `${committedPct.toFixed(0)}% of your income is already committed` +
                    (surplus < 0
                      ? ' — there is nothing left to cycle'
                      : f.helocBalanceUnknown
                        ? ', before what your line charges — add its balance to include that'
                        : '')
                  : 'Add your income and expenses to see what the strategy has to work with'}
              </HeroCaption>
            </>
          )}
        </Hero>

        <View style={styles.content}>
        {!f.loading && f.error && (
          <TouchableOpacity
            style={styles.staleBanner}
            onPress={() => { hapticLight(); onRefresh(); }}
            accessibilityRole="button"
            accessibilityLabel="Balances may be out of date. Tap to retry."
          >
            <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.staleText}>
              Couldn&apos;t reach your balances — HELOC interest below may be out of date.
            </Text>
            <Text style={styles.staleAction}>Retry</Text>
          </TouchableOpacity>
        )}

        {/* ── Period toggle ────────────────────────────────────────────────
            Sits above the cards rather than inside one: it governs everything
            below it, and burying it in the first card would imply it only
            drives that card's figures. The budget card is the one exception,
            and it says which month it is reporting on. */}
        <PeriodToggle
          value={period}
          onChange={p => {
            hapticSelection();
            setPeriod(p);
            // The window changed, so the arc that was selected is describing a
            // share of a total that no longer exists. Cleared rather than
            // re-resolved: "Groceries, 22%" silently becoming a different 22%
            // is worse than the centre going back to the total.
            setSelectedArc(null);
          }}
        />

        {/* ── Spend, as a curve or a grid ────────────────────────────────── */}
        {!f.loading && spend && spend.cur.days > 0 && (
          <SpendThisMonth
            cur={spend.cur}
            prev={spend.prev}
            days={spend.days}
            period={period}
            // "· nothing measured" earns its place now that this card survives
            // a quiet window. Its total is measured and reads $0; the summary
            // card further down falls back to the ENTERED monthly figures and
            // reads $2,400. Both are correct and they are answering different
            // questions, but two spend totals on one screen with no explanation
            // is a screen nobody can trust. This is the explanation, and it sits
            // on the figure that would otherwise look wrong.
            rangeLabel={
              range.rangeLabel +
              (range.inProgress ? ' · in progress' : '') +
              (summary.basis === 'live' ? '' : ' · nothing measured')
            }
            // The dashed level is the user's total budget once they have set
            // ceilings, and their own stated spend before that. Both are named
            // for what they are — calling an unset figure "Budget" would invent
            // a commitment they never made.
            reference={
              totalCeiling !== null && period === 'month'
                ? { amount: totalCeiling, label: 'Your budget' }
                : expenses > 0
                  ? { amount: expenses * range.months, label: 'What you said you spend' }
                  : null
            }
            onSelectDay={setOpenDay}
          />
        )}

        {/* ── Latest activity ───────────────────────────────────────────── */}
        {!f.loading && !overrides.loading && hasSpendData && (
          <LatestActivity
            rows={recent}
            metaFor={txnMeta.get}
            categoryFor={f.categories.metaFor}
            onOpenRow={setOpenTxn}
            onOpenAll={() => router.push('/modals/activity' as never)}
          />
        )}

        {/* ── Budget ────────────────────────────────────────────────────── */}
        {/* Deliberately NOT gated on having transactions. Deciding what you
            mean to spend is a plan, and a plan does not need a bank connection
            to be worth writing down — gating it meant the one screen that could
            have given a free, unlinked user something to do showed them nothing.
            `spentMeasured` is what keeps that honest: with nothing measured the
            widget states the ceilings and says so, rather than dressing the
            user's own entered expense figure up as spending we observed. */}
        {!f.loading && !budgets.loading && (
          <BudgetWidget
            categories={monthSummary.categories}
            budgets={budgets.budgets}
            totalCeiling={totalCeiling}
            totalSpent={monthSummary.spend}
            spentMeasured={monthSummary.basis === 'live'}
            monthLabel={monthLabel}
            categoryFor={f.categories.metaFor}
            onOpenCategory={openCategoryById}
            onOpenAll={() => router.push('/modals/budget' as never)}
            onStartBudget={() => router.push('/modals/budget' as never)}
          />
        )}

        {/* ── The breakdown ────────────────────────────────────────────────
            Only ever drawn from real transactions. With nothing linked there is
            nothing to break down, and a ring invented from one typed expense
            total would be a picture of a measurement that never happened. */}
        <Card style={styles.ringCard}>
          <TouchableOpacity
            style={styles.ringHead}
            onPress={() => { hapticLight(); router.push('/modals/breakdown' as never); }}
            accessibilityRole="button"
            accessibilityLabel="Breakdown"
            accessibilityHint="Opens the full breakdown by category and merchant"
          >
            <Text style={common.eyebrow}>BREAKDOWN</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>{range.rangeLabel}</Text>
            {range.inProgress && <Text style={styles.rangeNote}>· in progress</Text>}
          </View>

          {f.loading || overrides.loading ? (
            <SkeletonGroup label="Loading your spending by category" style={styles.ringSkeleton}>
              <Skeleton width={216} height={216} radius={108} />
              <Skeleton width={150} height={13} />
            </SkeletonGroup>
          ) : summary.categories.length === 0 ? (
            /* Three different emptinesses, and only one of them is the user's
               to fix. "Nothing linked" needs an account; "still arriving" needs
               patience; "quiet window" needs a wider window — and that last one
               is the case that used to read as a broken screen, because every
               other card vanished at the same time and left this one alone
               apologising. Where a longer period does hold something, the pill
               that would show it is offered directly. */
            <View style={styles.stateBlock}>
              <View style={styles.emptyRing}>
                <Ionicons name="pie-chart-outline" size={26} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyBody}>
                {!f.hasLinkedAccounts
                  ? 'Link an account and your spending is broken down here automatically. ' +
                    'Until then this screen runs on the figures you entered.'
                  : f.awaitingTransactions
                    ? 'Your bank is still sending its history. Your breakdown appears here once ' +
                      'it lands — usually within a few minutes of linking.'
                    : widerWithData
                      ? `Nothing went out in this ${periodWord(period)}. ` +
                        `Your ${widerWithData.label.toLowerCase()} has ` +
                        `${periodCounts[widerWithData.id]} transactions in it.`
                      : `Nothing went out in this ${periodWord(period)}. ` +
                        'Pull down to refresh if you were expecting something.'}
              </Text>

              {!f.hasLinkedAccounts ? (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => { hapticLight(); router.push('/modals/link-account' as never); }}
                  accessibilityRole="button"
                  accessibilityLabel="Link an account"
                >
                  <Text style={styles.emptyBtnText}>Link an account</Text>
                </TouchableOpacity>
              ) : widerWithData ? (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => {
                    hapticSelection();
                    setPeriod(widerWithData.id);
                    setSelectedArc(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Show this ${widerWithData.label.toLowerCase()} instead`}
                >
                  <Text style={styles.emptyBtnText}>
                    Show the {widerWithData.label.toLowerCase()}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <DonutRing
              segments={ring.segments}
              centerLabel={center.label}
              centerValue={center.value}
              centerSub={center.sub}
              selectedKey={selectedSeg?.key ?? null}
              onSelect={handleSelectArc}
            />
          )}
        </Card>

        {/* ── Category rows ────────────────────────────────────────────────
            Each its own surface, so a row is a target rather than a line in a
            table. The swatch repeats the arc colour and the name repeats the
            icon: identity survives with the colour removed entirely. */}
        {!f.loading && !overrides.loading && summary.categories.length > 0 && (
          <View style={styles.catList}>
            {(catsExpanded ? summary.categories : summary.categories.slice(0, COLLAPSED_CATS)).map(c => {
              const isSelected = selectedCat?.id === c.id;
              return (
              <TouchableOpacity
                key={c.id}
                // Marked, never dimmed-out. The ring is where selection changes
                // what you are looking at; down here it only says WHICH row the
                // arc belongs to, so the other rows stay fully legible.
                style={[styles.catCard, isSelected && styles.catCardSelected]}
                onPress={() => { hapticLight(); openCategoryById(c.id); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  `${c.label}, $${fmt(c.amount)}, ${c.pct.toFixed(0)} percent of spending, ` +
                  `${c.count} transaction${c.count === 1 ? '' : 's'}`
                }
                accessibilityHint="Shows the transactions in this category"
              >
                <View style={styles.catIcon}>
                  <Ionicons name={c.icon} size={18} color={colors.mint700} />
                  {/* The swatch ties the row to its arc. It is a second cue,
                      never the only one — the icon and name carry identity. */}
                  <View
                    style={[
                      styles.catSwatch,
                      { backgroundColor: ring.colorFor[c.id] ?? categoryRamp.neutral },
                    ]}
                  />
                </View>

                <View style={styles.catBody}>
                  <Text style={styles.catLabel} numberOfLines={1}>{c.label}</Text>
                  <Text style={styles.catMeta}>
                    {c.pct.toFixed(0)}% · {c.count} transaction{c.count === 1 ? '' : 's'}
                  </Text>
                </View>

                <Text style={styles.catAmount}>${fmt(c.amount)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              );
            })}

            {/* Progressive disclosure. The count is stated rather than a bare
                "See more", because four more rows and forty more rows are
                different decisions and only the number distinguishes them. */}
            {summary.categories.length > COLLAPSED_CATS && (
              <TouchableOpacity
                style={styles.seeMore}
                onPress={() => { hapticLight(); setCatsExpanded(e => !e); }}
                accessibilityRole="button"
                accessibilityState={{ expanded: catsExpanded }}
                accessibilityLabel={
                  catsExpanded
                    ? 'Show fewer categories'
                    : `Show ${summary.categories.length - COLLAPSED_CATS} more categories`
                }
              >
                <Text style={styles.seeMoreText}>
                  {catsExpanded
                    ? 'Show fewer'
                    : `Show ${summary.categories.length - COLLAPSED_CATS} more`}
                </Text>
                <Ionicons
                  name={catsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={colors.mint700}
                />
              </TouchableOpacity>
            )}

            {summary.untaggedCount > 0 && (
              <Text style={styles.untagged}>
                {summary.untaggedCount} transaction{summary.untaggedCount === 1 ? '' : 's'} your
                bank didn&apos;t label {summary.untaggedCount === 1 ? 'is' : 'are'} sitting in
                Other. Open it to retag {summary.untaggedCount === 1 ? 'it' : 'them'}.
              </Text>
            )}
            {overrides.error && <Text style={styles.errorNote}>{overrides.error}</Text>}
            {txnMeta.error && <Text style={styles.errorNote}>{txnMeta.error}</Text>}
          </View>
        )}

        {/* ── Income · spend · net ─────────────────────────────────────────
            The mortgage row is not decoration. Transaction spending excludes
            the payment by design, so a net computed without it is the figure
            BEFORE the largest committed outflow of the month — and the cycling
            line beneath would then be wrong by exactly that payment. Showing
            the subtraction keeps the closing sentence true. */}
        {!f.loading && (
          <Card>
            <SummaryRow
              icon="cash-outline"
              label={`Income this ${periodWord(period)}`}
              value={summary.income}
              barPct={shareOfIncome === null ? undefined : 100}
            />
            <SummaryRow
              icon="card-outline"
              label="Total spend"
              value={-summary.spend}
              barPct={shareOfIncome?.(summary.spend)}
            />
            {payment > 0 && (
              <SummaryRow
                icon="home-outline"
                label="Mortgage payment"
                value={-mortgageForPeriod}
                barPct={shareOfIncome?.(mortgageForPeriod)}
                hint={summary.basis === 'live'
                  ? 'modelled by the strategy, so it is not in the ring above'
                  : 'modelled by the strategy, so it is not in the spend above'}
                // Only offered with transactions to search. Without them there
                // is nothing to detect and the row would promise a screen that
                // can only say so. Keyed to whether any exist rather than to
                // this window: that screen searches the whole history, so a
                // quiet August is no reason to withdraw it.
                onPress={hasSpendData
                  ? () => { hapticLight(); router.push('/modals/mortgage-payment' as never); }
                  : undefined}
                action="Check"
              />
            )}

            <View style={styles.summaryRule} />

            <SummaryRow
              icon="wallet-outline"
              label={summary.basis === 'live' ? 'Net, measured' : 'Net surplus'}
              value={netAfterMortgage}
              total
            />

            <BasisNote basis={summary.basis} period={period} hasFigures={hasFigures} />

            {hasFigures && (
              <CyclingNote
                measuredMonthly={monthlyEquivalent}
                plannedMonthly={surplus}
                basis={summary.basis}
              />
            )}

            {/* ── Begin ─────────────────────────────────────────────────────
                Sits directly under the four figures, aligned with the amounts
                above it, because this is the moment it answers: the user has
                just read what came in, what went out and what is left, and the
                next question is what to do about it. The Budget widget below
                carries the same destination — a card someone may have already
                scrolled past by the time they have finished reading this one. */}
            {totalCeiling === null && (
              <TouchableOpacity
                style={styles.beginRow}
                onPress={() => { hapticLight(); router.push('/modals/budget' as never); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Start a budget — control your spend"
              >
                <View style={styles.beginBody}>
                  <Text style={styles.beginTitle}>Start a budget</Text>
                  <Text style={styles.beginSub}>Control your spend</Text>
                </View>
                <View style={styles.beginGo}>
                  <Text style={styles.beginGoText}>Begin</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.onAccent} />
                </View>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* ── The next two weeks ─────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <Card>
            <TouchableOpacity
              style={styles.linkHead}
              onPress={() => { hapticLight(); router.push('/modals/recurring' as never); }}
              accessibilityRole="button"
              accessibilityLabel="Next 14 days"
              accessibilityHint="Opens everything that repeats, in and out"
            >
              <Text style={styles.cardTitleInline}>Next 14 days</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <UpcomingMoney items={upcoming} />
          </Card>
        )}

        {/* ── The trailing series behind the derived figure ───────────────
            One bar per month of surplus — the single quantity the strategy
            runs on. It earns its place by showing how steady that number is. */}
        {f.derivedCashflow?.usable && f.derivedCashflow.months.length > 0 && (
          <Card>
            <TouchableOpacity
              style={styles.linkHead}
              onPress={() => { hapticLight(); router.push('/modals/reports' as never); }}
              accessibilityRole="button"
              accessibilityLabel={
                `Surplus by month, ${f.derivedCashflow.coverageMonths} months from your accounts`
              }
              accessibilityHint="Opens the six-month trend report"
            >
              <View style={styles.linkHeadBody}>
                <Text style={styles.cardTitleInline}>Surplus by month</Text>
                <Text style={styles.cardStatusInline}>
                  {f.derivedCashflow.coverageMonths} months from your accounts
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <SurplusChart months={f.derivedCashflow.months} />
            <Text style={styles.chartNote}>
              Income minus spending, before your mortgage payment. Transfers between your own
              accounts are excluded.
            </Text>
          </Card>
        )}

        {/* ── Cycle history — both halves of the loop ──────────────────────
            "Your cycles", not "Your dumps". A cycle is a sweep onto the line and
            a dump off it, and this card showed only the second one — so the
            monthly habit the strategy actually runs on was recorded by the app
            and then never shown back to the user anywhere.

            The chart stays dumps-only on purpose. Dumps are the thing that
            retires principal, they are lumpy and a few months apart, and a bar
            per month reads. Sweeps are near-monthly and roughly level, so a
            second series would say nothing the ledger rows below do not say
            better while halving the width of the bars that matter. */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your cycles</Text>
            {(count > 0 || sweepCount > 0) && (
              <Text style={styles.cardStatus}>
                {count + sweepCount} move{count + sweepCount === 1 ? '' : 's'} logged
              </Text>
            )}
          </View>

          {historyError ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                Couldn&apos;t load your history: {historyError}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={refreshHistory}
                accessibilityLabel="Try loading history again"
              >
                <Text style={styles.emptyBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : historyLoading ? (
            <SkeletonGroup label="Loading your cycle history">
              <View style={styles.chart}>
                {[38, 64, 22, 80, 50, 70].map((h, i) => (
                  <View key={i} style={styles.barGroup}>
                    <View style={styles.barSlot}>
                      <Skeleton width={18} height={h} radius={4} />
                    </View>
                    <Skeleton width={22} height={9} />
                  </View>
                ))}
              </View>
            </SkeletonGroup>
          ) : count === 0 && sweepCount === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                Nothing logged yet. Record the money you move — surplus onto your line, and
                lump sums off it onto your principal — and this fills in with your real
                history rather than a projection.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => { hapticLight(); router.push('/modals/move-money' as never); }}
                accessibilityLabel="Plan a move"
              >
                <Text style={styles.emptyBtnText}>Plan a move</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Only once there is a dump to chart. A user who has swept for two
                  months without reaching a dump would otherwise get six empty
                  bars, which reads as "nothing you did counted". */}
              {count > 0 && (
                <>
                  <View style={styles.chart}>
                    {buckets.map((b, i) => (
                      <View key={i} style={styles.barGroup}>
                        <View style={styles.barSlot}>
                          <View
                            style={[
                              styles.bar,
                              {
                                height: maxBucket > 0 ? Math.max(3, (b.total / maxBucket) * 88) : 3,
                                backgroundColor: b.total > 0 ? colors.mint600 : colors.gray100,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.barLabel}>{b.label}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.chartNote}>Dumps, last 6 months</Text>
                </>
              )}

              {/* The ledger. Two directions, never summed: one retires mortgage
                  principal, the other repays the line that funded it, and adding
                  them would double-count the same dollars going round the loop. */}
              <View style={[styles.ledger, count > 0 && styles.ledgerRuled]}>
                <LedgerRow
                  label="Dumped onto your principal"
                  amount={totalDumped}
                  count={count}
                  at={lastDumpAt}
                />
                <LedgerRow
                  label="Swept back onto your line"
                  amount={totalSwept}
                  count={sweepCount}
                  at={lastSweepAt}
                />
              </View>
              <Text style={styles.chartNote}>
                Your own record of transfers you made. These are two directions round the same
                loop, so they are not added together.
              </Text>
            </>
          )}
        </Card>

        <TouchableOpacity
          style={styles.editRow}
          onPress={() => { hapticLight(); router.push('/modals/assumptions' as never); }}
          accessibilityRole="button"
          accessibilityLabel="Edit your income and expense figures"
        >
          <Text style={styles.editRowText}>
            {f.surplusBasis === 'trailing'
              ? `Figures averaged from ${f.derivedCashflow?.coverageMonths ?? 0} months of your transactions`
              : 'Figures you entered'}
          </Text>
          <Text style={styles.editRowAction}>Edit</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── The shared sheets ─────────────────────────────────────────────
          One of each, for the whole screen. Every entry point above sets the
          same piece of state, which is what guarantees a transaction opened
          from the calendar looks identical to one opened from a category. */}
      <CategoryDetailSheet
        target={openCategory}
        monthLabel={monthLabel}
        amount={openCategoryAmount}
        // The sheet's figures are the MONTH's, not the selected period's — see
        // monthSummary — so its measured flag has to come from the same place.
        measured={monthSummary.basis === 'live'}
        history={openCategoryHistory}
        trailingAverage={trailingAverage(openCategoryHistory)}
        ceiling={openCategoryCeiling}
        inherited={openCategory?.category ? budgets.isInherited(openCategory.category) : false}
        rows={openCategoryRows}
        metaFor={txnMeta.get}
        categoryFor={f.categories.metaFor}
        inProgress={monthRange.inProgress}
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

      <DayDetailSheet
        day={openDay}
        metaFor={txnMeta.get}
        categoryFor={f.categories.metaFor}
        onClose={() => setOpenDay(null)}
        onOpenTransaction={row => { setOpenDay(null); setOpenTxn(row); }}
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
    </View>
  );
}

// ─── Period controls ──────────────────────────────────────────────────────────

/** Pill segmented control. Active pill filled solid; the rest sit outlined. */
function PeriodToggle({ value, onChange }: {
  value: PeriodId;
  onChange: (p: PeriodId) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.toggle} accessibilityRole="tablist">
      {PERIODS.map(p => {
        const active = p.id === value;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(p.id)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show this ${p.label.toLowerCase()}`}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * One line of the income/spend/net summary.
 *
 * A negative value is drawn in muted grey and never red: severity reads as
 * saturation in this palette, and money leaving on schedule is not an error.
 *
 * `barPct` draws the row's share of income beneath it. Three figures stacked as
 * text make you do the division yourself; the bars make "spending ate most of
 * what came in" a shape you read in one look. Income is the reference and
 * always draws full width — every other bar is measured against it, which is
 * the only reason the comparison means anything.
 *
 * The outflow fill is the same muted grey the negative values wear, for the
 * same reason: it is the largest mark on the card, and a mint one would read as
 * approval of the spending rather than a measurement of it.
 */
function SummaryRow({ icon, label, value, hint, total, barPct, onPress, action }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  hint?: string;
  total?: boolean;
  /** Share of income, 0–100. Omitted where there is no income to divide by. */
  barPct?: number;
  /** Makes the row a target. The label beside it says what it opens. */
  onPress?: () => void;
  action?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const negative = value < 0;
  const Row = onPress ? TouchableOpacity : View;
  return (
    <Row
      style={styles.sumRow}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress
        ? `${label}, ${negative ? 'minus ' : ''}$${fmt(Math.abs(value))}. ${action ?? ''}`
        : undefined}
    >
      <View style={[styles.sumIcon, total && styles.sumIconTotal]}>
        <Ionicons
          name={icon}
          size={16}
          color={total ? colors.mint700 : colors.textSecondary}
        />
      </View>

      <View style={styles.sumBody}>
        <View style={styles.sumHead}>
          <Text style={[styles.sumLabel, total && styles.sumLabelTotal]} numberOfLines={1}>
            {label}
          </Text>
          <Text
            style={[
              styles.sumValue,
              total && (negative ? styles.sumValueTotalNeg : styles.sumValueTotal),
              !total && negative && styles.sumValueMuted,
            ]}
          >
            {negative ? '−' : ''}${fmt(Math.abs(value))}
          </Text>
        </View>

        {barPct !== undefined && (
          // A hair of width on a non-zero share, so a small-but-real outflow
          // still reads as a bar rather than as nothing at all.
          <View style={styles.sumTrack}>
            <View
              style={[
                styles.sumFill,
                negative ? styles.sumFillOut : styles.sumFillIn,
                { width: `${barPct > 0 ? Math.max(1.5, barPct) : 0}%` },
              ]}
            />
          </View>
        )}

        {hint ? <Text style={styles.sumHint}>{hint}</Text> : null}
      </View>

      {onPress && (
        <View style={styles.sumAction}>
          {action ? <Text style={styles.sumActionText}>{action}</Text> : null}
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </View>
      )}
    </Row>
  );
}

/** Which of the two claims the figures above are making. Never omitted. */
function BasisNote({ basis, period, hasFigures }: {
  basis: 'live' | 'estimated';
  period: PeriodId;
  hasFigures: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const live = basis === 'live';
  if (!live && !hasFigures) {
    return (
      <View style={styles.basis}>
        <Ionicons name="help-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.basisText}>
          Nothing on file yet — add your income and expenses, or link an account.
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.basis, live && styles.basisLive]}>
      <Ionicons
        name={live ? 'pulse-outline' : 'create-outline'}
        size={14}
        color={live ? colors.mint700 : colors.textMuted}
      />
      <Text style={[styles.basisText, live && styles.basisTextLive]}>
        {live
          ? 'Summed from your own transactions'
          : `Estimated — your monthly figures scaled to a ${periodWord(period)}, not measured`}
      </Text>
    </View>
  );
}

/**
 * The bridge from this period back to the strategy — and the one place on this
 * screen where two surpluses meet.
 *
 * They are not the same number and must never be written as if they were. The
 * hero figure is PLANNED: income minus expenses, the mortgage payment and any
 * HELOC interest, taken from what the user entered, and it is the figure the
 * projection is actually sized from. The figure in this card is MEASURED: what
 * the linked accounts really cleared over the window, minus the payment. With
 * accounts linked the two diverge routinely, and whichever one this card called
 * "the number that powers your cycling" would be a claim about the other.
 *
 * So it compares them and names which one drives the schedule, rather than
 * silently substituting the measured figure for the planned one. When they
 * disagree the honest move is to show the gap and hand the user the decision.
 */
function CyclingNote({ measuredMonthly, plannedMonthly, basis }: {
  measuredMonthly: number;
  plannedMonthly: number;
  basis: 'live' | 'estimated';
}) {
  const styles = useStyles();
  // Estimated means this card is the entered figures scaled back out again, so
  // there is no second measurement to compare against — only one claim exists.
  if (basis === 'estimated') {
    return (
      <Text style={styles.tieBackText}>
        {plannedMonthly > 0
          ? `Your projection is sized on ${signedMoney(plannedMonthly)} a month. ` +
            'Link an account and this becomes measured rather than estimated.'
          : 'After your mortgage payment these figures leave nothing over — ' +
            'that surplus is what HELOC cycling runs on.'}
      </Text>
    );
  }

  // Close enough that naming a gap would be noise rather than information. The
  // floor keeps small absolute differences on a small surplus from reading as a
  // disagreement; the percentage keeps large ones from being waved through.
  const gap = measuredMonthly - plannedMonthly;
  const inLine = Math.abs(gap) <= Math.max(50, Math.abs(plannedMonthly) * 0.1);

  return (
    <Text style={styles.tieBackText}>
      {`Measured, that is ${signedMoney(measuredMonthly)} a month. `}
      {inLine
        ? `That is in line with the ${signedMoney(plannedMonthly)} a month your projection is ` +
          'sized on.'
        : `Your projection is still sized on ${signedMoney(plannedMonthly)} a month from the ` +
          `figures you entered, so this period ran ${gap > 0 ? 'ahead of' : 'behind'} it. ` +
          'Update those figures if the measured number is the truer one.'}
    </Text>
  );
}

/** Money with an explicit minus, never parentheses and never red. */
function signedMoney(v: number): string {
  return `${v < 0 ? '−' : ''}$${fmt(Math.abs(v))}`;
}

function periodWord(p: PeriodId): string {
  return p === 'week' ? 'week' : p === 'month' ? 'month' : p === 'quarter' ? 'quarter' : 'year';
}

/**
 * One bar per month of surplus.
 *
 * Months where spending exceeded income get a muted bar hanging below the
 * baseline rather than a red one — a negative month is information, not an
 * error, and this palette carries severity as saturation.
 */
function SurplusChart({ months }: { months: { key: string; label: string; surplus: number }[] }) {
  const styles = useStyles();
  const peak = Math.max(...months.map(m => Math.abs(m.surplus)), 1);
  return (
    <View style={styles.surplusChart}>
      {months.map(m => {
        const height = Math.max(3, (Math.abs(m.surplus) / peak) * 56);
        const negative = m.surplus < 0;
        return (
          <View key={m.key} style={styles.surplusCol}>
            <View style={styles.surplusUpper}>
              {!negative && <View style={[styles.surplusBar, { height }]} />}
            </View>
            <View style={styles.surplusBaseline} />
            <View style={styles.surplusLower}>
              {negative && <View style={[styles.surplusBar, styles.surplusBarNeg, { height }]} />}
            </View>
            <Text style={styles.barLabel}>{m.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One direction of the cycle ledger.
 *
 * A zero is rendered rather than hidden. "Swept back onto your line · none yet"
 * is the row most likely to prompt the habit this whole strategy runs on, and
 * dropping it would leave the card silently describing dumps again.
 */
function LedgerRow({ label, amount, count, at }: {
  label: string;
  amount: number;
  count: number;
  at: Date | null;
}) {
  const styles = useStyles();
  return (
    <View style={styles.ledgerRow}>
      <View style={styles.ledgerText}>
        <Text style={styles.ledgerLabel}>{label}</Text>
        <Text style={styles.ledgerMeta}>
          {count === 0
            ? 'none logged yet'
            : `${count} logged${at ? ` · most recent ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`}
        </Text>
      </View>
      <Text style={[styles.ledgerAmount, count === 0 && styles.ledgerAmountEmpty]}>
        ${fmt(amount)}
      </Text>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles(t => ({
  topTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: OnDark.secondary,
    marginBottom: Spacing[5],
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: OnDark.muted,
    letterSpacing: 1.4,
  },
  content: { paddingHorizontal: Spacing[4], gap: Spacing[4], paddingTop: Spacing[1] },
  heroSkeleton: { gap: Spacing[3], paddingVertical: Spacing[2] },

  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: t.colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    minHeight: 44,
  },
  staleText: { flex: 1, fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },
  staleAction: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: t.colors.mint700 },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    marginBottom: Spacing[3],
  },
  cardStatus: { fontSize: Typography.xs, color: t.colors.textMuted, marginBottom: Spacing[3] },

  /** Card header that is itself the way into the full screen. */
  linkHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
    minHeight: 44,
    marginBottom: Spacing[2],
  },
  linkHeadBody: { flex: 1, gap: 1 },
  cardTitleInline: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  cardStatusInline: { fontSize: Typography.xs, color: t.colors.textMuted },
  ringHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    minHeight: 44,
  },

  // ── Period toggle ────────────────────────────────────────────────────────
  toggle: { flexDirection: 'row', gap: Spacing[2] },
  pill: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[2],
  },
  pillActive: {
    backgroundColor: t.colors.mint800,
    borderColor: t.colors.mint800,
    ...t.shadows.card,
  },
  pillText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary },
  pillTextActive: { color: t.colors.white, fontWeight: Typography.semibold },

  // ── Ring card ────────────────────────────────────────────────────────────
  ringCard: { alignItems: 'center', gap: Spacing[4] },
  ringSkeleton: { alignItems: 'center', gap: Spacing[4] },
  emptyRing: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 6, borderColor: t.categoryRamp.track,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },

  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  rangeLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: t.colors.textSecondary },
  rangeNote: { fontSize: Typography.xs, color: t.colors.textMuted },

  // ── Summary card ─────────────────────────────────────────────────────────
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
  },
  sumIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: t.colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  sumIconTotal: { backgroundColor: t.colors.mint50 },
  sumBody: { flex: 1, gap: 4 },
  sumHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  sumTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: t.colors.gray100,
    overflow: 'hidden',
  },
  sumFill: { height: 5, borderRadius: 3 },
  sumFillIn:  { backgroundColor: t.colors.mint600 },
  sumFillOut: { backgroundColor: t.colors.gray400 },
  sumLabel: { fontSize: Typography.sm, color: t.colors.textSecondary },
  sumLabelTotal: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  sumHint: { fontSize: 11, color: t.colors.textMuted, lineHeight: 15 },
  sumAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sumActionText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },
  sumValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  sumValueMuted: { color: t.colors.gray500 },
  sumValueTotal: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: t.colors.accentInk,
  },
  sumValueTotalNeg: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: t.colors.gray500,
  },
  summaryRule: {
    height: 1,
    backgroundColor: t.colors.borderSubtle,
    marginVertical: Spacing[2],
  },

  basis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[3],
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: t.colors.gray100,
  },
  basisLive: { backgroundColor: t.colors.mint50 },
  basisText: { flex: 1, fontSize: 11, color: t.colors.textMuted, lineHeight: 16 },
  basisTextLive: { color: t.colors.mint700 },

  beginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 60,
    marginTop: Spacing[4],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  beginBody: { flex: 1, gap: 2 },
  beginTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: t.colors.mint700,
  },
  beginSub: { fontSize: Typography.xs, color: t.colors.textSecondary },
  beginGo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.full,
    backgroundColor: t.colors.mint600,
  },
  beginGoText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: t.colors.onAccent },

  tieBackText: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },

  // ── Category list ────────────────────────────────────────────────────────
  catList: { gap: Spacing[2] },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 68,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    ...t.shadows.card,
  },
  // borderField, not border: this is the one card whose outline has to be
  // legible as a state rather than read as decoration.
  catCardSelected: { borderColor: t.colors.borderField, backgroundColor: t.colors.mint50 },
  catIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catSwatch: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: t.colors.surface,
  },
  catBody: { flex: 1, gap: 2 },
  catLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  catAmount: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  catMeta: { fontSize: 11, color: t.colors.textMuted },

  untagged: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: t.colors.mint50,
  },
  errorNote: { fontSize: Typography.xs, color: t.colors.textSecondary, marginTop: Spacing[3] },

  seeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    marginTop: Spacing[1],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    backgroundColor: t.colors.mint50,
  },
  seeMoreText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },

  stateBlock: { gap: Spacing[3] },
  emptyBody: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  emptyBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    backgroundColor: t.colors.mint50,
  },
  emptyBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },

  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 44,
    paddingHorizontal: Spacing[1],
  },
  editRowText: { flex: 1, fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 17 },
  editRowAction: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: t.colors.mint700 },

  surplusChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  surplusCol: { flex: 1, alignItems: 'center' },
  surplusUpper: { height: 60, justifyContent: 'flex-end' },
  surplusLower: { height: 24, justifyContent: 'flex-start' },
  surplusBaseline: { height: 1, alignSelf: 'stretch', backgroundColor: t.colors.borderSubtle },
  surplusBar: { width: 14, borderRadius: 3, backgroundColor: t.colors.mint600 },
  surplusBarNeg: { backgroundColor: t.colors.gray300 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing[2], height: 112 },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing[2] },
  barSlot: { height: 88, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 4 },
  barLabel: { fontSize: 11, color: t.colors.textMuted },
  chartNote: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: Spacing[3] },

  ledger: { gap: Spacing[1] },
  // Only when it follows the chart. Standing alone it is the card's whole
  // content and a rule at the top would be dividing it from the title.
  ledgerRuled: {
    marginTop: Spacing[4],
    paddingTop: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 44,
  },
  ledgerText: { flex: 1, gap: 1 },
  ledgerLabel: { fontSize: Typography.sm, color: t.colors.textPrimary },
  ledgerMeta: { fontSize: Typography.xs, color: t.colors.textMuted },
  ledgerAmount: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  ledgerAmountEmpty: { color: t.colors.textMuted, fontWeight: Typography.medium },
}));
