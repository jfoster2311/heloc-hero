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
import { useDumpHistory } from '../../hooks/useDumpHistory';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { useBudgets } from '../../hooks/useBudgets';
import { EMPTY_TRANSACTION_META } from '../../hooks/useTransactionMeta';
import { hapticLight, hapticSuccess, hapticError, hapticSelection } from '../../lib/haptics';
import {
  PERIODS, periodRange, summarizePeriod,
  previousRange, cumulativeSpend, dailyBreakdown, categoryHistory, trailingAverage,
  type PeriodId, type SpendCategory, type CategorizedTxn, type DayCell,
} from '../../lib/spending';
import {
  Colors, Typography, Spacing, Radius, Shadows, OnDark, CommonStyles,
  CategoryRamp, CATEGORY_RAMP_MAX, TAB_BAR_CLEARANCE,
} from '../../lib/theme';

/** How many months the category trend charts look back over. */
const TREND_MONTHS = 6;

export default function CashFlowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const f = useFinancials();
  const {
    buckets, totalDumped, count, lastDumpAt, loading: historyLoading,
    error: historyError, refresh: refreshHistory,
  } = useDumpHistory(profile?.id);
  const overrides = useCategoryOverrides(profile?.id);
  // One instance for the whole app, from useFinancials. Mounting the hook again
  // here would give this screen its own copy of "what is hidden", and the totals
  // above the list would go on counting a row the list had already dimmed.
  const txnMeta = f.transactionMeta;

  const [period, setPeriod] = useState<PeriodId>('month');
  const [openCategory, setOpenCategory] = useState<CategoryDetailTarget | null>(null);
  const [openTxn, setOpenTxn] = useState<CategorizedTxn | null>(null);
  const [openDay, setOpenDay] = useState<DayCell | null>(null);

  // Everything below comes from useFinancials, which exists precisely so two
  // screens cannot disagree about the same figure.
  const income    = f.income;
  const expenses  = f.expenses;
  const payment   = f.payment;
  const helocRate = f.helocRate;
  const refreshing = f.refreshing;
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
    () => buildSegments(summary.categories, CATEGORY_RAMP_MAX),
    [summary.categories],
  );

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
    if (summary.basis !== 'live') return null;
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
    <View style={CommonStyles.screenContainer}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.mint600} />
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
                    (surplus < 0 ? ' — there is nothing left to cycle' : '')
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
            <Ionicons name="cloud-offline-outline" size={16} color={Colors.textSecondary} />
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
        <PeriodToggle value={period} onChange={p => { hapticSelection(); setPeriod(p); }} />

        {/* ── Spend, as a curve or a grid ────────────────────────────────── */}
        {!f.loading && spend && spend.cur.days > 0 && (
          <SpendThisMonth
            cur={spend.cur}
            prev={spend.prev}
            days={spend.days}
            period={period}
            rangeLabel={range.rangeLabel + (range.inProgress ? ' · in progress' : '')}
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
        {!f.loading && !overrides.loading && summary.basis === 'live' && (
          <LatestActivity
            rows={recent}
            metaFor={txnMeta.get}
            categoryFor={f.categories.metaFor}
            onOpenRow={setOpenTxn}
            onOpenAll={() => router.push('/modals/activity' as never)}
          />
        )}

        {/* ── Budget ────────────────────────────────────────────────────── */}
        {!f.loading && !budgets.loading && monthSummary.basis === 'live' && (
          <BudgetWidget
            categories={monthSummary.categories}
            budgets={budgets.budgets}
            totalCeiling={totalCeiling}
            totalSpent={monthSummary.spend}
            monthLabel={monthLabel}
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
          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>{range.rangeLabel}</Text>
            {range.inProgress && <Text style={styles.rangeNote}>· in progress</Text>}
          </View>

          {f.loading || overrides.loading ? (
            <SkeletonGroup label="Loading your spending by category" style={styles.ringSkeleton}>
              <Skeleton width={216} height={216} radius={108} />
              <Skeleton width={150} height={13} />
            </SkeletonGroup>
          ) : summary.basis === 'estimated' ? (
            <View style={styles.stateBlock}>
              <View style={styles.emptyRing}>
                <Ionicons name="pie-chart-outline" size={26} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyBody}>
                {f.hasLinkedAccounts
                  ? f.awaitingTransactions
                    ? 'Your bank is still sending its history. Your breakdown appears here once ' +
                      'it lands — usually within a few minutes of linking.'
                    : `No transactions in this ${periodWord(period)}. ` +
                      'Try a longer period, or pull down to refresh.'
                  : 'Link an account and your spending is broken down here automatically. ' +
                    'Until then this screen runs on the figures you entered.'}
              </Text>
              {!f.hasLinkedAccounts && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => { hapticLight(); router.push('/modals/link-account' as never); }}
                  accessibilityLabel="Link an account"
                >
                  <Text style={styles.emptyBtnText}>Link an account</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <DonutRing
              segments={ring.segments}
              centerLabel="TOTAL SPEND"
              centerValue={`$${fmt(summary.spend)}`}
              centerSub={`this ${periodWord(period)}`}
            />
          )}
        </Card>

        {/* ── Category rows ────────────────────────────────────────────────
            Each its own surface, so a row is a target rather than a line in a
            table. The swatch repeats the arc colour and the name repeats the
            icon: identity survives with the colour removed entirely. */}
        {!f.loading && !overrides.loading && summary.basis === 'live' && (
          <View style={styles.catList}>
            {summary.categories.map(c => (
              <TouchableOpacity
                key={c.id}
                style={styles.catCard}
                onPress={() => { hapticLight(); openCategoryById(c.id); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  `${c.label}, $${fmt(c.amount)}, ${c.pct.toFixed(0)} percent of spending, ` +
                  `${c.count} transaction${c.count === 1 ? '' : 's'}`
                }
                accessibilityHint="Shows the transactions in this category"
              >
                <View style={styles.catIcon}>
                  <Ionicons name={c.icon} size={18} color={Colors.mint700} />
                  {/* The swatch ties the row to its arc. It is a second cue,
                      never the only one — the icon and name carry identity. */}
                  <View
                    style={[
                      styles.catSwatch,
                      { backgroundColor: ring.colorFor[c.id] ?? CategoryRamp.neutral },
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
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}

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
                // can only say so.
                onPress={summary.basis === 'live'
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
            {summary.basis === 'live' && totalCeiling === null && (
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
                  <Ionicons name="arrow-forward" size={15} color={Colors.white} />
                </View>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* ── The next two weeks ─────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <Card>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Next 14 days</Text>
            </View>
            <UpcomingMoney items={upcoming} />
          </Card>
        )}

        {/* ── The trailing series behind the derived figure ───────────────
            One bar per month of surplus — the single quantity the strategy
            runs on. It earns its place by showing how steady that number is. */}
        {f.derivedCashflow?.usable && f.derivedCashflow.months.length > 0 && (
          <Card>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Surplus by month</Text>
              <Text style={styles.cardStatus}>
                {f.derivedCashflow.coverageMonths} months from your accounts
              </Text>
            </View>
            <SurplusChart months={f.derivedCashflow.months} />
            <Text style={styles.chartNote}>
              Income minus spending, before your mortgage payment. Transfers between your own
              accounts are excluded.
            </Text>
          </Card>
        )}

        {/* ── Cycle history — real logged dumps ───────────────────────────── */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your dumps</Text>
            {count > 0 && (
              <Text style={styles.cardStatus}>
                {count} logged · ${fmt(totalDumped)} total
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
            <SkeletonGroup label="Loading your dump history">
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
          ) : count === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                No dumps logged yet. When you move money onto your principal, record it here
                and this fills in with your real history.
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
              <View style={styles.chart}>
                {buckets.map((b, i) => (
                  <View key={i} style={styles.barGroup}>
                    <View style={styles.barSlot}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: maxBucket > 0 ? Math.max(3, (b.total / maxBucket) * 88) : 3,
                            backgroundColor: b.total > 0 ? Colors.mint600 : Colors.gray100,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{b.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.chartNote}>
                Last 6 months
                {lastDumpAt
                  ? ` · most recent ${lastDumpAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ''}
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
          color={total ? Colors.mint700 : Colors.textSecondary}
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
          <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
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
  const live = basis === 'live';
  if (!live && !hasFigures) {
    return (
      <View style={styles.basis}>
        <Ionicons name="help-circle-outline" size={14} color={Colors.textMuted} />
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
        color={live ? Colors.mint700 : Colors.textMuted}
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

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    minHeight: 44,
  },
  staleText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },
  staleAction: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.mint700 },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[3],
  },
  cardStatus: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing[3] },

  // ── Period toggle ────────────────────────────────────────────────────────
  toggle: { flexDirection: 'row', gap: Spacing[2] },
  pill: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[2],
  },
  pillActive: {
    backgroundColor: Colors.mint800,
    borderColor: Colors.mint800,
    ...Shadows.card,
  },
  pillText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  pillTextActive: { color: Colors.white, fontWeight: Typography.semibold },

  // ── Ring card ────────────────────────────────────────────────────────────
  ringCard: { alignItems: 'center', gap: Spacing[4] },
  ringSkeleton: { alignItems: 'center', gap: Spacing[4] },
  emptyRing: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 6, borderColor: CategoryRamp.track,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },

  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  rangeLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
  rangeNote: { fontSize: Typography.xs, color: Colors.textMuted },

  // ── Summary card ─────────────────────────────────────────────────────────
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
  },
  sumIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  sumIconTotal: { backgroundColor: Colors.mint50 },
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
    backgroundColor: Colors.gray100,
    overflow: 'hidden',
  },
  sumFill: { height: 5, borderRadius: 3 },
  sumFillIn:  { backgroundColor: Colors.mint600 },
  sumFillOut: { backgroundColor: Colors.gray400 },
  sumLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  sumLabelTotal: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  sumHint: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },
  sumAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sumActionText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },
  sumValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sumValueMuted: { color: Colors.gray500 },
  sumValueTotal: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: Colors.mint600,
  },
  sumValueTotalNeg: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: Colors.gray500,
  },
  summaryRule: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
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
    backgroundColor: Colors.gray100,
  },
  basisLive: { backgroundColor: Colors.mint50 },
  basisText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  basisTextLive: { color: Colors.mint700 },

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
    backgroundColor: Colors.mint50,
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  beginBody: { flex: 1, gap: 2 },
  beginTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.mint700,
  },
  beginSub: { fontSize: Typography.xs, color: Colors.textSecondary },
  beginGo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.full,
    backgroundColor: Colors.mint600,
  },
  beginGoText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.white },

  tieBackText: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Shadows.card,
  },
  catIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.mint50,
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
    borderColor: Colors.surface,
  },
  catBody: { flex: 1, gap: 2 },
  catLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  catAmount: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  catMeta: { fontSize: 11, color: Colors.textMuted },

  untagged: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.mint50,
  },
  errorNote: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: Spacing[3] },

  stateBlock: { gap: Spacing[3] },
  emptyBody: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  emptyBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.mint200,
    backgroundColor: Colors.mint50,
  },
  emptyBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },

  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 44,
    paddingHorizontal: Spacing[1],
  },
  editRowText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  editRowAction: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.mint700 },

  surplusChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  surplusCol: { flex: 1, alignItems: 'center' },
  surplusUpper: { height: 60, justifyContent: 'flex-end' },
  surplusLower: { height: 24, justifyContent: 'flex-start' },
  surplusBaseline: { height: 1, alignSelf: 'stretch', backgroundColor: Colors.borderSubtle },
  surplusBar: { width: 14, borderRadius: 3, backgroundColor: Colors.mint600 },
  surplusBarNeg: { backgroundColor: Colors.gray300 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing[2], height: 112 },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing[2] },
  barSlot: { height: 88, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 4 },
  barLabel: { fontSize: 11, color: Colors.textMuted },
  chartNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[3] },
});
