// app/tabs/cashflow.tsx — cash flow and cycle history.
//
// This screen used to render eight hardcoded budget categories and a fabricated
// six-month income/expense chart. The disclosure was also inverted: the
// "Example" chip and badge only rendered for FREE users, so a PAYING user saw
// invented categories labelled "This month" and an invented trend chart with no
// caveat at all. In a finance app that is a claim the product cannot back up.
//
// Transactions ARE stored now (see lib/cashflow.ts), but only to derive one
// number: what the user actually earns and spends each month, so the surplus
// every projection rests on can be checked rather than trusted. That is the
// whole remit. Per-category spending is still not shown and is not coming —
// this is a strategy engine, not a budgeting app, and the moment it grows a
// category breakdown it is competing in a category it deliberately isn't in.
// What IS real here:
//   · the figures in force, labelled as entered or transaction-derived
//   · the trailing monthly series behind the derived figure
//   · live HELOC/mortgage balances when accounts are linked
//   · dumps they have logged, from automation_log
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import UpcomingMoney, { buildUpcoming } from '../../components/UpcomingMoney';
import { parseDate } from '../../lib/mortgage';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useDumpHistory } from '../../hooks/useDumpHistory';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, OnDark, CommonStyles, TAB_BAR_CLEARANCE } from '../../lib/theme';

export default function CashFlowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const f = useFinancials();
  const {
    buckets, totalDumped, count, lastDumpAt, loading: historyLoading,
    error: historyError, refresh: refreshHistory,
  } = useDumpHistory(profile?.id);

  // Everything below comes from useFinancials, which exists precisely so two
  // screens cannot disagree about the same figure. This one was reading income,
  // expenses, the payment and the HELOC rate straight off the profile instead —
  // and the payment is the one that bites: useFinancials resolves it as
  // `mortgage.nextPayment.value ?? profile.monthly_payment`, so a servicer
  // reporting an escrow-adjusted payment made the dashboard and this screen
  // print different surpluses from the same data. It also mounted its OWN
  // useAccounts alongside the one inside useFinancials: two fetches, two
  // realtime channels, two copies of the same rows that could differ mid-flight.
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

  // Recurring income is a pattern extended; the mortgage date is reported.
  // buildUpcoming keeps the two labelled apart. Recomputed on the minute-ish
  // rather than memoised on a Date, which would never invalidate.
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

  // Awaited, and both halves. It used to fire the two calls without waiting, so
  // RefreshControl — which only tracks the accounts half — stopped spinning
  // while the dump history was still in flight, and the chart then changed
  // under a screen that had just told the user it was done.
  const onRefresh = useCallback(async () => {
    const [ok] = await Promise.all([f.refresh(), refreshHistory()]);
    if (ok) hapticSuccess();
    else hapticError();
  }, [f.refresh, refreshHistory]);

  const maxBucket = Math.max(...buckets.map(b => b.total), 0);

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
              reads HIGH — the flattering direction again, on the figure the
              whole strategy is sized from. */}
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
        {/* Same contract as the dashboard: a failed balance read is stated, not
            absorbed. Everything on this screen is downstream of it. */}
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

        {/* ── Monthly cash flow, from the user's own figures ──────────────── */}
        {hasFigures ? (
          <Card>
            <Text style={styles.cardTitle}>Every month</Text>

            {/* Bars, not a ledger. Two lengths side by side answer "how much
                of what I earn is already spoken for" at a glance; four
                right-aligned numbers make the reader do the subtraction. The
                committed bar is drawn to the same scale as income, so the gap
                between them IS the surplus. */}
            <FlowBar label="Income" amount={income} max={income} tone="accent" />
            <FlowBar label="Committed" amount={committed} max={income} tone="muted" />

            <View style={styles.committedDetail}>
              <Text style={styles.committedText}>
                Mortgage ${fmt(payment)} · living ${fmt(expenses)}
                {helocInterest > 1
                  ? ` · HELOC interest ${'$'}${fmt(helocInterest)}${helocRateAssumed ? ' (assumed 8.5% APR)' : ''}`
                  : ''}
              </Text>
            </View>

            <Text style={styles.sourceNote}>
              {f.surplusBasis === 'trailing'
                ? `Averaged from ${f.derivedCashflow?.coverageMonths ?? 0} months of your own transactions`
                : 'Based on the figures you entered'}
              {helocInterest > 1 ? ', plus interest estimated from your linked HELOC balance' : ''}.
              Update them under Assumptions.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/modals/assumptions' as never)}
              accessibilityLabel="Edit your figures"
            >
              <Text style={styles.emptyBtnText}>Edit these figures</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card>
            <Text style={styles.cardTitle}>Every month</Text>
            <Text style={styles.emptyBody}>
              Add your income and expenses to see what you have available to cycle.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/modals/assumptions' as never)}
              accessibilityLabel="Add your figures"
            >
              <Text style={styles.emptyBtnText}>Add your figures</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* ── The next two weeks ──────────────────────────────────────────
            Answers the question that actually precedes a dump: is there room
            this month, or is payday still a week out with the mortgage due
            first? Only rendered when at least one dated thing exists — an
            empty calendar filled with plausible-looking rows would be the
            dishonest version of this feature. */}
        {upcoming.length > 0 && (
          <Card>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Next 14 days</Text>
            </View>
            <UpcomingMoney items={upcoming} />
          </Card>
        )}

        {/* ── The trailing series behind the derived figure ───────────────
            Not a spending breakdown: one bar per month of surplus, which is the
            single quantity the strategy runs on. It earns its place by showing
            how steady — or not — the number in the hero actually is. */}
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
            /* Was the bare string "Loading…", which is both the least
               informative possible placeholder and a layout jump waiting to
               happen — the card grows by ~110pt when the chart arrives. */
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
              {/* The totals above are all-time; the chart is a 6-month window.
                  Say so, rather than leaving two different numbers unexplained. */}
              <Text style={styles.chartNote}>
                Last 6 months
                {lastDumpAt
                  ? ` · most recent ${lastDumpAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ''}
              </Text>
            </>
          )}
        </Card>

        {/* Kept as a line, not a card: this screen reads your transactions for one
            figure — what you have left each month — and shows no spending categories. */}
        <Text style={styles.footnote}>
          No spending categories here on purpose — your transactions are read for one figure,
          what you have left each month, and nothing else.
        </Text>
        </View>
      </ScrollView>
    </View>
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

/** A labelled bar drawn against a shared maximum, so two can be compared. */
function FlowBar({ label, amount, max, tone }: {
  label: string;
  amount: number;
  max: number;
  tone: 'accent' | 'muted';
}) {
  const pct = max > 0 ? Math.min(100, (amount / max) * 100) : 0;
  return (
    <View style={styles.flowBar}>
      <View style={styles.flowHead}>
        <Text style={styles.flowLabel}>{label}</Text>
        <Text style={styles.flowAmount}>${fmt(amount)}</Text>
      </View>
      <View style={styles.flowTrack}>
        <View
          style={[
            styles.flowFill,
            { width: `${pct}%` },
            tone === 'muted' && styles.flowFillMuted,
          ]}
        />
      </View>
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

  flowBar: { gap: Spacing[2], marginBottom: Spacing[3] },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flowLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  flowAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  flowTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gray100,
    overflow: 'hidden',
  },
  flowFill: { height: 10, borderRadius: 5, backgroundColor: Colors.mint600 },
  flowFillMuted: { backgroundColor: Colors.gray300 },

  committedDetail: { marginBottom: Spacing[1] },
  committedText: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },

  sourceNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },

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

  footnote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
    paddingTop: Spacing[1],
  },
});
