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
//     computed from. A breakdown that quietly disagreed with the payoff date
//     would discredit both numbers.
//   · Live and estimated figures are labelled as such, everywhere. A period
//     total scaled from a typed monthly figure is not a measurement.
//   · The mortgage payment is NOT in the breakdown — the strategy models it
//     directly — and the screen says so rather than leaving a hole.
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import UpcomingMoney, { buildUpcoming } from '../../components/UpcomingMoney';
import { parseDate } from '../../lib/mortgage';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/primitives';
import DonutRing, { buildSegments } from '../../components/ui/DonutRing';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useDumpHistory } from '../../hooks/useDumpHistory';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { hapticLight, hapticSuccess, hapticError, hapticSelection } from '../../lib/haptics';
import {
  PERIODS, SPEND_CATEGORIES, categoryMeta, periodRange, summarizePeriod,
  previousRange, cumulativeSpend,
  type PeriodId, type SpendCategory, type CategoryTotal, type CategorizedTxn,
  type SpendSeries,
} from '../../lib/spending';
import LineChart from '../../components/ui/LineChart';
import {
  Colors, Typography, Spacing, Radius, Shadows, OnDark, CommonStyles,
  CategoryRamp, CATEGORY_RAMP_MAX, TAB_BAR_CLEARANCE,
} from '../../lib/theme';

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

  const [period, setPeriod] = useState<PeriodId>('month');
  const [openCategory, setOpenCategory] = useState<SpendCategory | null>(null);

  // Everything below comes from useFinancials, which exists precisely so two
  // screens cannot disagree about the same figure.
  const income    = f.income;
  const expenses  = f.expenses;
  const payment   = f.payment;
  const helocRate = f.helocRate;
  const helocRateAssumed = f.helocRateAssumed;
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

  const summary = useMemo(
    () => summarizePeriod({
      transactions: f.transactions,
      classification: f.transactionClassification,
      overrides: overrides.overrides,
      range,
      entered: { monthlyIncome: income, monthlyExpenses: expenses },
    }),
    [f.transactions, f.transactionClassification, overrides.overrides, range, income, expenses],
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

  // Spending pace: this period's cumulative curve against the same period one
  // step back. Estimated basis is excluded outright — there is no day-by-day
  // shape in a single typed monthly total, and drawing one would be inventing
  // a measurement.
  const pace = useMemo(() => {
    if (summary.basis !== 'live') return null;
    const args = {
      transactions: f.transactions,
      classification: f.transactionClassification,
    };
    const cur = cumulativeSpend({ ...args, range });
    // One point is not a line. Early in a period there is nothing to plot yet.
    if (cur.elapsed < 2) return null;
    return { cur, prev: cumulativeSpend({ ...args, range: previousRange(range) }) };
  }, [summary.basis, f.transactions, f.transactionClassification, range]);

  const openRows = useMemo(
    () => openCategory
      ? summary.rows
          .filter(r => r.category === openCategory)
          .sort((a, b) => b.txn.amount - a.txn.amount)
      : [],
    [summary.rows, openCategory],
  );

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
            drives that card's figures. */}
        <PeriodToggle value={period} onChange={p => { hapticSelection(); setPeriod(p); }} />

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
            <>
              <DonutRing
                segments={ring.segments}
                centerLabel="TOTAL SPEND"
                centerValue={`$${fmt(summary.spend)}`}
                centerSub={`this ${periodWord(period)}`}
              />
            </>
          )}
        </Card>

        {/* ── Spending pace ────────────────────────────────────────────────
            The ring says what the total was; this says whether it is on its
            way somewhere good. Sits between the two because the pace is only
            interesting once you know the total, and the categories only matter
            once you know the pace is off. */}
        {!f.loading && pace && (
          <SpendTrendCard
            cur={pace.cur}
            prev={pace.prev}
            period={period}
            // Entered monthly expenses, scaled. On the same basis as the
            // measured spend: `expenses` excludes the mortgage payment, and so
            // does everything the ring and this curve are summed from.
            reference={expenses > 0 ? expenses * range.months : null}
          />
        )}

        {/* ── Category rows ────────────────────────────────────────────────
            Each its own surface, so a row is a target rather than a line in a
            table. The swatch repeats the arc colour and the name repeats the
            icon: identity survives with the colour removed entirely. */}
        {!f.loading && !overrides.loading && summary.basis === 'live' && (
          <View style={styles.catList}>
            {summary.categories.map(c => (
              <CategoryCard
                key={c.id}
                category={c}
                color={ring.colorFor[c.id] ?? CategoryRamp.neutral}
                onPress={() => { hapticLight(); setOpenCategory(c.id); }}
              />
            ))}

            {summary.untaggedCount > 0 && (
              <Text style={styles.untagged}>
                {summary.untaggedCount} transaction{summary.untaggedCount === 1 ? '' : 's'} your
                bank didn&apos;t label {summary.untaggedCount === 1 ? 'is' : 'are'} sitting in
                Other. Open it to retag {summary.untaggedCount === 1 ? 'it' : 'them'}.
              </Text>
            )}
            {overrides.error && <Text style={styles.errorNote}>{overrides.error}</Text>}
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
              icon="arrow-down-circle-outline"
              label={`Income this ${periodWord(period)}`}
              value={summary.income}
              barPct={shareOfIncome === null ? undefined : 100}
            />
            <SummaryRow
              icon="arrow-up-circle-outline"
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
              />
            )}

            <View style={styles.summaryRule} />

            <SummaryRow
              icon="repeat-outline"
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

      <CategorySheet
        category={openCategory}
        rows={openRows}
        saving={overrides.saving}
        onClose={() => setOpenCategory(null)}
        onRecategorize={overrides.setCategory}
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
function SummaryRow({ icon, label, value, hint, total, barPct }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  hint?: string;
  total?: boolean;
  /** Share of income, 0–100. Omitted where there is no income to divide by. */
  barPct?: number;
}) {
  const negative = value < 0;
  return (
    <View style={styles.sumRow}>
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
    </View>
  );
}

/**
 * Cumulative spend this period against the same period one step back.
 *
 * ── Why cumulative rather than per-day bars ────────────────────────────────
 * Daily spend is spiky and answers nothing: one $900 day tells you a bill went
 * out. The running total answers the question people actually have mid-period,
 * which is "am I going to end up where I usually do", and it is the only shape
 * that can be compared against a period that has already finished.
 *
 * ── The comparison is made at the same day, not the same total ─────────────
 * A running period compared against a finished one is not a comparison, it is
 * an arithmetic guarantee that you are "under". So the delta is measured at the
 * SAME day index in both, and the current line stops at today via
 * `widthFraction` rather than being stretched across the axis. Both curves
 * share one x-domain — day 1 of the period at the left — so vertical distance
 * between them at any point is a like-for-like difference.
 *
 * ── The reference line is not a budget ─────────────────────────────────────
 * This product has no budget-target feature, so there is no budget to draw. The
 * dashed horizontal line is the user's OWN stated monthly spend, scaled to the
 * period, and it is labelled as that. Dressing it up as "Budget" would invent a
 * commitment they never made.
 */
function SpendTrendCard({ cur, prev, period, reference }: {
  cur: SpendSeries;
  prev: SpendSeries;
  period: PeriodId;
  reference: number | null;
}) {
  const word = periodWord(period);

  const curValues = cur.values.slice(0, cur.elapsed);
  // Clipped to the current period's length so the two share an x-domain. A
  // 31-day previous month plotted against a 30-day current one would otherwise
  // run off the axis and misalign every day before it.
  const prevValues = prev.values.slice(0, cur.days);
  const hasPrev = prev.total > 0 && prevValues.length >= 2;

  // Where the previous period stood on the day the current one has reached.
  const prevAtSameDay = hasPrev
    ? prevValues[Math.min(cur.elapsed, prevValues.length) - 1] ?? 0
    : 0;
  const delta = cur.total - prevAtSameDay;
  // Under 2% of the baseline is noise, not a trend worth naming.
  const same = hasPrev && Math.abs(delta) < Math.max(25, prevAtSameDay * 0.02);

  const max = Math.max(cur.total, hasPrev ? prev.total : 0, reference ?? 0) * 1.12 || 1;

  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Spending pace</Text>
      </View>

      <Text style={styles.paceHeadline}>
        {!hasPrev
          ? `No ${word} before this one to compare against yet.`
          : same
            ? `About the same as last ${word} at this point.`
            : `${signedMoney(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} than last ${word} at this point.`}
      </Text>

      {/* The curves carry no information a screen reader can reach, so the
          chart is one labelled element describing what it plots. The headline
          above already states the comparison in words; this adds the levels. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          `Spending pace. ${signedMoney(cur.total)} spent so far this ${word}, ` +
          `day ${cur.elapsed} of ${cur.days}.` +
          (hasPrev ? ` Last ${word} at the same point: ${signedMoney(prevAtSameDay)}.` : '') +
          (reference !== null ? ` Your stated spend for a ${word}: ${signedMoney(reference)}.` : '')
        }
      >
      <LineChart
        height={CHART_H}
        min={0}
        max={max}
        series={[
          // The reference is drawn as a flat two-point series rather than a
          // bordered View: it goes through the same dash renderer as the
          // comparison curve, so the two read as the same kind of mark, and it
          // is positioned by the chart's own scale instead of by arithmetic
          // that could drift out of step with it.
          ...(reference !== null
            ? [{
                values: [reference, reference],
                color: Colors.gray300,
                width: 1,
                dash: [4, 4] as [number, number],
              }]
            : []),
          ...(hasPrev
            ? [{
                values: prevValues,
                color: Colors.gray400,
                width: 2,
                dash: [4, 4] as [number, number],
                widthFraction: prevValues.length / cur.days,
              }]
            : []),
          {
            values: curValues,
            color: Colors.mint600,
            width: 2.5,
            fillColor: Colors.mint50,
            widthFraction: cur.elapsed / cur.days,
          },
        ]}
      />
      </View>

      <View style={styles.axisRow}>
        {axisDays(cur.days).map(d => (
          <Text key={d} style={styles.axisLabel}>{d}</Text>
        ))}
      </View>

      <View style={styles.legend}>
        <LegendItem label={`This ${word}`} color={Colors.mint600} />
        {hasPrev && <LegendItem label={`Last ${word}`} color={Colors.gray400} dashed />}
        {reference !== null && (
          <LegendItem
            label={`You said ${signedMoney(reference)}`}
            color={Colors.gray300}
            dashed
          />
        )}
      </View>

      {reference !== null && (
        <Text style={styles.paceNote}>
          The dashed level is the spending you entered yourself, scaled to a {word} — not a
          budget you set here. {cur.total > reference
            ? 'You are over it already.'
            : 'You are under it so far.'}
        </Text>
      )}
    </Card>
  );
}

/** Chart body height. Shared by the plot and the reference-line placement. */
const CHART_H = 148;

/** Four evenly spaced day numbers, always including the first and last. */
function axisDays(days: number): number[] {
  if (days <= 4) return Array.from({ length: days }, (_, i) => i + 1);
  return [1, Math.round(days / 3), Math.round((days * 2) / 3), days];
}

/**
 * A key entry. Dashed swatches are drawn as discrete ticks rather than with
 * `borderStyle: 'dashed'`, which React Native renders inconsistently on a
 * single-sided border — a key that silently draws solid would defeat the only
 * thing separating the two grey series.
 */
function LegendItem({ label, color, dashed }: {
  label: string;
  color: string;
  dashed?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      {dashed ? (
        <View style={styles.legendSwatch}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.legendTick, { backgroundColor: color }]} />
          ))}
        </View>
      ) : (
        <View style={[styles.legendSwatch, styles.legendSolid, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendText}>{label}</Text>
    </View>
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

// ─── Categories ───────────────────────────────────────────────────────────────

function CategoryCard({ category, color, onPress }: {
  category: CategoryTotal;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.catCard}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={
        `${category.label}, $${fmt(category.amount)}, ${category.pct.toFixed(0)} percent ` +
        `of spending, ${category.count} transaction${category.count === 1 ? '' : 's'}`
      }
      accessibilityHint="Shows the transactions in this category"
    >
      <View style={styles.catIcon}>
        <Ionicons name={category.icon} size={18} color={Colors.mint700} />
        {/* The swatch ties the row to its arc. It is a second cue, never the
            only one — the icon and the name carry the same identity. */}
        <View style={[styles.catSwatch, { backgroundColor: color }]} />
      </View>

      <View style={styles.catBody}>
        <Text style={styles.catLabel} numberOfLines={1}>{category.label}</Text>
        <Text style={styles.catMeta}>
          {category.pct.toFixed(0)}% · {category.count} transaction{category.count === 1 ? '' : 's'}
        </Text>
      </View>

      <Text style={styles.catAmount}>${fmt(category.amount)}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

/**
 * The transactions behind one category, with a retag picker.
 *
 * A sheet rendered in place rather than a route: the modal would otherwise have
 * to re-fetch the transactions it is displaying, which means a second read and
 * two copies of the same rows that can differ mid-flight. This one reads the
 * rows the screen already has.
 */
function CategorySheet({ category, rows, saving, onClose, onRecategorize }: {
  category: SpendCategory | null;
  rows: CategorizedTxn[];
  saving: string | null;
  onClose: () => void;
  onRecategorize: (transactionId: string, next: SpendCategory) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const meta = category ? categoryMeta(category) : null;
  const total = rows.reduce((sum, r) => sum + r.txn.amount, 0);

  // onDismiss is iOS-only, so the picker is collapsed here too — otherwise
  // re-opening a category on Android shows a row still expanded from last time.
  const close = useCallback(() => { setExpanded(null); onClose(); }, [onClose]);

  return (
    <Modal
      visible={category !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
      onDismiss={() => setExpanded(null)}
    >
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleBlock}>
            <Text style={styles.sheetTitle}>{meta?.label ?? 'Category'}</Text>
            <Text style={styles.sheetSub}>
              ${fmt(total)} · {rows.length} transaction{rows.length === 1 ? '' : 's'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={close}
            style={styles.sheetClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {rows.map(r => {
            const isOpen = expanded === r.txn.transaction_id;
            return (
              <View key={r.txn.transaction_id} style={styles.txnBlock}>
                <TouchableOpacity
                  style={styles.txnRow}
                  onPress={() => {
                    hapticLight();
                    setExpanded(isOpen ? null : r.txn.transaction_id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `${r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}, ` +
                    `$${fmtCents(r.txn.amount)}, ${formatDay(r.txn.date)}`
                  }
                  accessibilityHint="Opens the category picker for this transaction"
                >
                  <View style={styles.txnBody}>
                    <Text style={styles.txnName} numberOfLines={1}>
                      {r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}
                    </Text>
                    <Text style={styles.txnMeta}>
                      {formatDay(r.txn.date)}
                      {r.overridden ? ' · you categorised this' : ''}
                    </Text>
                  </View>
                  {saving === r.txn.transaction_id ? (
                    <ActivityIndicator size="small" color={Colors.mint600} />
                  ) : (
                    <Text style={styles.txnAmount}>${fmtCents(r.txn.amount)}</Text>
                  )}
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.picker}>
                    <Text style={styles.pickerLabel}>Move to</Text>
                    <View style={styles.pickerGrid}>
                      {SPEND_CATEGORIES.map(c => {
                        const active = c.id === r.category;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.pickerChip, active && styles.pickerChipActive]}
                            disabled={active}
                            onPress={async () => {
                              hapticSelection();
                              setExpanded(null);
                              await onRecategorize(r.txn.transaction_id, c.id);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Categorise as ${c.label}`}
                          >
                            <Ionicons
                              name={c.icon}
                              size={14}
                              color={active ? Colors.mint700 : Colors.textSecondary}
                            />
                            <Text
                              style={[styles.pickerChipText, active && styles.pickerChipTextActive]}
                            >
                              {c.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <Text style={styles.sheetFootnote}>
            Categories you set are yours and stay put — they never change what your bank
            reported, and they do not alter your payoff projection.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
function fmtCents(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

  tieBackText: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },

  // ── Spending pace ────────────────────────────────────────────────────────
  paceHeadline: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    lineHeight: 22,
    marginBottom: Spacing[3],
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing[2],
  },
  axisLabel: { fontSize: 10, color: Colors.textMuted },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
    marginTop: Spacing[3],
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: {
    width: 14,
    height: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendSolid: { borderRadius: 2 },
  legendTick: { width: 4, height: 2, borderRadius: 1 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  paceNote: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: Spacing[3],
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

  // ── Category sheet ───────────────────────────────────────────────────────
  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  sheetTitleBlock: { flex: 1, gap: 2 },
  sheetTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  sheetSub: { fontSize: Typography.xs, color: Colors.textMuted },
  sheetClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { padding: Spacing[4], gap: Spacing[2], paddingBottom: Spacing[10] },

  txnBlock: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 60,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  txnBody: { flex: 1, gap: 3 },
  txnName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  txnMeta: { fontSize: 11, color: Colors.textMuted },
  txnAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },

  picker: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[4],
    paddingTop: Spacing[1],
    gap: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSunken,
  },
  pickerLabel: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing[3],
  },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pickerChipActive: { backgroundColor: Colors.mint50, borderColor: Colors.mint600 },
  pickerChipText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  pickerChipTextActive: { color: Colors.mint700, fontWeight: Typography.semibold },

  sheetFootnote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
    paddingTop: Spacing[4],
  },

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
