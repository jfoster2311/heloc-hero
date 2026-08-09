// app/tabs/dashboard.tsx — a glance, one decision, and doors. Everything else a tap away.
//
// The hero is a date, not a countdown. "March 2037" is a thing a person can
// picture and check against their own plans; "13 yrs 2 mo" is an abstraction
// they have to convert before it means anything. The conclusion is annotated
// directly beneath it, because a bare number is homework.
//
// Below the hero, in this order and no other:
//   1. Your next dump  — how far the replenishment has to go, and what it costs
//   2. Safe to Move    — the decision, in the thumb zone, reasoning always visible
//   3. Safe to Sweep   — what is actually free to spend
//   4. Needs attention — the watch feed, sat with the action rather than below it
//   5. What you owe    — both debts as the one figure that is falling
//   6. Interest        — the realized reward, its live ticker, and it in months
//   7. Door tiles      — equity, surplus, line, saved: each hands off to its tab
//
// 1 and 5 exist for the same reason, and it is a motivational one rather than an
// informational one: this strategy spends most of its life in the quiet months
// between dumps, where the only visible movement is a HELOC balance going the
// "wrong" way. The meter makes waiting legible, and the unified figure moves the
// anchor off the balance that rises and onto the total that falls. Neither
// invents a number — see lib/strike.ts, which is the threshold math that already
// gated the cards below.
//
// ── The ranking is in the type, not only in the order ─────────────────────
// Below the hero there is exactly ONE display-size figure: the Safe to move
// amount. Every other card reports a position — what is owed, how far the
// replenishment has to go, what has been saved — and sits a step under it, with
// the nested InterestTicker a step under the figure it annotates. Four cards
// each leading with a 30pt extrabold number is a list, not a ranking, and the
// eye had nowhere to land first. Adding a card here means deciding which tier it
// is in; if the answer is tier 1, it is competing with the decision and probably
// belongs on another screen.
//
// The dashboard ranks; it does not hold everything. The dense multi-stat cards
// that used to sit here — a full line-of-credit breakdown that only duplicated
// the Accounts tab, a stack of interest figures — are gone. Amortization tables,
// transaction lists, rate history, per-account balances: every one is a real
// thing a user might want, and none is what this screen is for. Ranking is the
// feature.
import { useState, useMemo, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, useWindowDimensions } from 'react-native';
import { Touchable } from '../../components/ui/press';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card, CardHead, Chip, StatusPill, ActionPair, LinkRow, NavTile,
} from '../../components/ui/primitives';
import { Skeleton, SkeletonGroup, SkeletonLines } from '../../components/ui/Skeleton';
import WatchRow from '../../components/ui/WatchRow';
import NotificationPrimer from '../../components/NotificationPrimer';
import FreedomBoard from '../../components/FreedomBoard';
import InterestTicker from '../../components/InterestTicker';
import GettingStarted from '../../components/GettingStarted';
import NextStrike from '../../components/NextStrike';
import NetDebt from '../../components/NetDebt';
import MonolithHero from '../../components/dashboard/MonolithHero';
import SweepSlider from '../../components/dashboard/SweepSlider';
import TwinEngines from '../../components/dashboard/TwinEngines';
import { computeEquitySeries } from '../../lib/projections';
import { computeStrike, computeNetDebt } from '../../lib/strike';
import { calcRemainingBalance } from '../../lib/projections';
import { useAuth } from '../../hooks/useAuth';
import { useIsPro } from '../../hooks/useIsPro';
import { useFinancials } from '../../hooks/useFinancials';
import { useCycleHistory } from '../../hooks/useCycleHistory';
import { useCycleReminders } from '../../hooks/useCycleReminders';
import { useInterestToday } from '../../hooks/useInterestToday';
import { useBudgets } from '../../hooks/useBudgets';
import { computeHelocScore } from '../../lib/helocScore';
import { buildChecklist } from '../../lib/onboardingChecklist';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { computeRealized } from '../../lib/realized';
import { computeSafeToSweep } from '../../lib/sweep';
import { paydayIsExpected } from '../../lib/payday';
import { formatMonths } from '../../lib/projections';
import { monthsBetween, parseDate } from '../../lib/mortgage';
import { MILESTONES } from '../../lib/config';
import { isPaidTier } from '../../lib/pricing';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Typography, Spacing, Radius, Tracking, TAB_BAR_CLEARANCE } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { useStatusBarStyle } from '../../hooks/useStatusBarStyle';

export default function DashboardScreen() {
  // The monolith hero replaced this screen's aurora, which left a LIGHT status
  // bar over a near-white canvas — white-on-#ECF7EF, so the clock and the
  // battery were invisible. See hooks/useStatusBarStyle.
  useStatusBarStyle('dark');

  /**
   * Re-tapping the active tab scrolls back to the top.
   *
   * A reflex on iOS, and every tab here is long enough to need it — the
   * dashboard runs seven cards past the fold. Without it the tab bar was the
   * one control that did nothing when you pressed it a second time, which
   * reads as the tap having missed.
   */
  const scrollRef = useRef<ScrollView>(null);
  // Skia needs pixel dimensions up front — a Canvas cannot lay itself out from
  // flex the way a View does, so the hero's width is measured rather than
  // inherited. Spacing[4] each side matches `heroWrap`'s padding.
  const { width: screenW } = useWindowDimensions();
  const heroWidth = screenW - Spacing[4] * 2;
  useScrollToTop(scrollRef);

  const { colors, common } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tier } = useAuth();
  const { isPro } = useIsPro();
  const f = useFinancials();
  const { totalDumped, count: dumpCount, entries: dumpEntries } = useCycleHistory(profile?.id);
  const [moveDismissed, setMoveDismissed] = useState(false);

  // Both read straight off state that already exists. Nothing about progress is
  // stored — see lib/onboardingChecklist.ts for why a `completed_steps` column
  // would be the app lying about the user's own progress.
  const budgetMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const budgets = useBudgets(profile?.id, budgetMonth);

  const score = useMemo(
    () => computeHelocScore({
      monthlyIncome:   f.income,
      monthlyExpenses: f.expenses,
      monthlyPayment:  f.payment,
      helocBalance:    f.helocDrawn,
      helocLimit:      f.helocLimit,
      creditScore:     profile?.credit_score ?? null,
      homeValue:       f.homeValue,
      mortgageBalance: f.mortgageBalance,
    }),
    [f.income, f.expenses, f.payment, f.helocDrawn, f.helocLimit,
     profile?.credit_score, f.homeValue, f.mortgageBalance],
  );

  const checklist = useMemo(
    () => buildChecklist({
      hasProjection:     f.hasRealData,
      hasLinkedAccounts: f.hasLinkedAccounts,
      hasBudget:         budgets.hasAny,
      score:             score.total,
      hasHeloc:          (f.helocLimit ?? 0) > 0,
      dumpCount,
    }),
    [f.hasRealData, f.hasLinkedAccounts, budgets.hasAny, score.total, f.helocLimit, dumpCount],
  );

  const realized = computeRealized({
    totalMoved:      totalDumped,
    mortgageBalance: f.mortgageBalance ?? 0,
    mortgageRate:    f.mortgage.rate.value ?? 0.065,
    monthlyPayment:  f.payment,
    helocRate:       f.helocRate,
    monthlySurplus:  Math.max(0, f.surplus),
    helocLimit:      f.helocLimit ?? 0,
  });

  // Reads the same threshold gate the Safe to Move card above it is decided by,
  // so the two cards cannot contradict each other about whether a dump is open.
  const sweep = computeSafeToSweep({
    helocDrawn:         f.helocDrawn,
    helocLimit:         f.helocLimit,
    monthlySurplus:     f.surplus,
    helocRate:          f.helocRate,
    replenishThreshold: f.replenishThreshold,
    // Only the structural blockers. `utilization_maxed` is deliberately absent:
    // that is the ordinary mid-cycle state this card exists to explain, and
    // treating it as a blocker would replace the useful "$X has to come off the
    // line first" with a dead end.
    dumpAvailable: !f.safeToMove.blockers.some(b =>
      b === 'amortizing_heloc' || b === 'draw_ended' ||
      b === 'prepayment_penalty' || b === 'buffer_too_thin'),
  });

  // The replenishment phase, off the same threshold `safeToMove` and
  // `computeSafeToSweep` gate on — so the meter cannot claim a dump is close
  // while the card below it says HOLD.
  const strike = useMemo(
    () => computeStrike({
      helocDrawn:         f.helocDrawn,
      helocLimit:         f.helocLimit,
      monthlySurplus:     Math.max(0, f.surplus),
      helocRate:          f.helocRate,
      replenishThreshold: f.replenishThreshold,
    }),
    [f.helocDrawn, f.helocLimit, f.surplus, f.helocRate, f.replenishThreshold],
  );

  // Both debts as one figure, and where the ORIGINAL note says they would be
  // today. That last part needs origination principal, term and date; a manually
  // entered mortgage usually has none of them, so it resolves to null and the
  // comparison line is dropped rather than guessed at.
  const netDebt = useMemo(() => {
    const principal = f.mortgage.originationPrincipal.value;
    const term      = f.mortgage.termMonths.value;
    const origin    = f.mortgage.originationDate.value;
    const rate      = f.mortgage.rate.value;
    const originDate = origin ? parseDate(origin) : null;

    const scheduledBalance =
      principal && term && originDate && rate
        ? calcRemainingBalance(
            principal, rate, term,
            Math.max(0, monthsBetween(originDate, new Date())),
          )
        : null;

    return computeNetDebt({
      mortgageBalance: f.mortgageBalance,
      helocDrawn:      f.helocDrawn,
      scheduledBalance,
    });
  }, [
    f.mortgage.originationPrincipal.value, f.mortgage.termMonths.value,
    f.mortgage.originationDate.value, f.mortgage.rate.value,
    f.mortgageBalance, f.helocDrawn,
  ]);

  // The hero's falling line.
  //
  // Derived from the equity projection rather than modelled separately: that
  // model holds home value flat, so `debt = homeValue - equity` exactly. Two
  // models would drift, and the curve would start disagreeing with the payoff
  // date printed on top of it.
  //
  // Forward-only, and the hero says so. There is no stored balance history in
  // this app, so a line showing where debt HAS been would be invented from the
  // single point we have.
  const debtCurve = useMemo<number[]>(() => {
    if (f.homeValue === null || f.mortgageBalance === null || f.mortgageBalance <= 0) return [];
    const series = computeEquitySeries(
      {
        mortgageBalance: f.mortgageBalance,
        mortgageRate:    f.mortgage.rate.value ?? 0.065,
        monthlyPayment:  f.payment,
        monthlySurplus:  Math.max(0, f.surplus),
        helocRate:       f.helocRate,
        helocLimit:      f.helocLimit ?? undefined,
      },
      f.homeValue,
    );
    // Null when the model cannot run at all — no curve rather than a flat line,
    // which would read as "your debt never moves".
    if (!series) return [];
    const pts = series.accelerated;
    if (pts.length < 2) return [];

    // ~48 samples is past the point where more of them change the drawn shape
    // at this width, and the path is rebuilt on every layout.
    const step = Math.max(1, Math.floor(pts.length / 48));
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += step) out.push(f.homeValue - pts[i].equity);
    // Always end on the true final point; the stride can skip it.
    const last = f.homeValue - pts[pts.length - 1].equity;
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }, [
    f.homeValue, f.mortgageBalance, f.mortgage.rate.value, f.payment,
    f.surplus, f.helocRate, f.helocLimit,
  ]);

  // What the slider offers, or null when it should not appear at all.
  //
  // Two independent limits, and the SMALLER wins:
  //   · what the line is owed this month (`sweep.committed`)
  //   · what is actually in the cash account
  // Offering the first without checking the second is how an app tells someone
  // to move $1,200 they do not have. Where no cash account is linked there is
  // no second limit to apply, so the committed figure stands on its own — the
  // user can still see whether it is affordable, which is the state the app was
  // in before any of this.
  //
  // The states excluded below are the ones where the sweep card deliberately
  // refuses to name a number: no line, an unknown drawn balance, no surplus, a
  // surplus that does not cover interest, or a structural blocker. A slider
  // offering an amount there would contradict the card directly under it.
  const sweepMove = useMemo<number | null>(() => {
    const refuses: typeof sweep.state[] = [
      'no_line', 'unknown_balance', 'no_surplus', 'under_water', 'dump_blocked',
    ];
    if (refuses.includes(sweep.state)) return null;
    if (sweep.committed <= 0) return null;
    const cap = f.hasCashAccount ? Math.min(sweep.committed, f.liquidCash) : sweep.committed;
    // Below a dollar there is nothing worth a gesture.
    return cap >= 1 ? Math.floor(cap) : null;
  }, [sweep.state, sweep.committed, f.hasCashAccount, f.liquidCash]);

  // The Cash Shield's figure. Same hook the Interest card's ticker uses, so the
  // two report one number rather than two computations of it.
  const shield = useInterestToday(
    totalDumped,
    f.mortgage.rate.value ?? 0.065,
    f.helocDrawn,
    f.helocRate,
  );

  // A projection, never an observation — see lib/payday.ts. Drives a label only.
  const paydayExpected = useMemo(
    () => paydayIsExpected(f.derivedCashflow?.recurringIncome),
    [f.derivedCashflow],
  );

  // The board's first tile is this calendar year, and it is the only tile that
  // can carry logged activity — see the header note in components/FreedomBoard.
  const thisYearDumps = useMemo(() => {
    const y = new Date().getFullYear();
    const rows = dumpEntries.filter(e => new Date(e.created_at).getFullYear() === y);
    return {
      count: rows.length,
      total: rows.reduce((sum, e) => sum + Number(e.amount ?? 0), 0),
    };
  }, [dumpEntries]);

  const remindersEnabled = isPaidTier(tier);

  useCycleReminders(profile?.id, {
    // Not coerced. The dump reminder's date is computed from this, and it is
    // delivered when the user is not in the app to sanity-check it.
    helocDrawn:          f.helocDrawn,
    // The same target the meter above counts down to — `strike` is computed
    // from f.helocLimit and f.replenishThreshold a few lines up, so passing its
    // own target back is what keeps the notification and the meter in step.
    replenishTarget:     strike.state === 'no_line' ? null : strike.target,
    helocRate:           f.helocRate,
    monthlySurplus:      Math.max(0, f.surplus),
    dumpAmount:          f.safeToMove.recommendedAmount ?? 0,
    // The Safe to Sweep card's own figure, so the notification cannot name a
    // number the screen it links to disagrees with.
    sweepAmount:         sweep.state === 'no_line' || sweep.state === 'unknown_balance'
                           ? null : sweep.committed,
    // Drives the threshold alert. Null when no cash account is linked — there
    // is no balance to have crossed anything, and f.liquidCash floors to 0,
    // which would read as a genuinely empty account.
    cashBalance:         f.hasCashAccount ? f.liquidCash : null,
    enabled:             remindersEnabled,
    // A set (non-assumed) rate is the signal that terms exist to re-confirm.
    hasHelocTerms:       !f.helocRateAssumed,
    helocTermsUpdatedAt: f.profile?.heloc_terms_updated_at ?? null,
  });

  // Only ask for notification permission once there is a reminder to deliver.
  // syncCycleReminders schedules nothing without a surplus to sweep or a
  // balance to clear, so asking earlier spends the one iOS prompt on silence.
  const canPrimeNotifications =
    !!profile?.id &&
    remindersEnabled &&
    !f.loading &&
    (f.surplus > 0 || (f.helocDrawn ?? 0) > 0);

  // ── The two dates the hero compares ──────────────────────────────────────
  // Baseline comes from the note's own terms when the servicer reports them, so
  // the comparison isn't the app grading its own homework against a schedule
  // the user is already ahead of.
  const payoffDate = f.projection.acceleratedPayoffDate;
  const baselineDate = f.baseline.payoffDate ?? f.projection.originalPayoffDate;
  const baselineIsReported = f.baseline.payoffDate !== null;
  const monthsAhead = Math.max(0, monthsBetween(payoffDate, baselineDate));

  // Percent complete prefers principal retired against the original note. Home
  // ownership is the fallback, because principal-since-signup is 0% on day one
  // — precisely when a progress bar most needs to show something.
  const pct = f.baseline.percentComplete !== null
    ? f.baseline.percentComplete * 100
    : f.homeValue && f.equity !== null
      ? clamp(0, (f.equity / f.homeValue) * 100, 100)
      : null;
  const nextMs = pct !== null ? MILESTONES.find(m => pct < m) : undefined;

  /**
   * Pull-to-refresh, with feedback that tells the truth about the outcome.
   * A success buzz on a failed refresh would be worse than silence — the whole
   * point of the gesture is to answer "are these numbers current?".
   */
  async function handleRefresh() {
    const ok = await f.refresh();
    if (ok) hapticSuccess();
    else hapticError();
  }

  function handleDevTools() {
    if (!__DEV__) return;
    Alert.alert('DEV Tools', 'Onboarding flow', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Preview (keep data)', onPress: () => router.replace('/onboarding/welcome' as never) },
      {
        text: 'Reset + Preview',
        style: 'destructive',
        onPress: () => {
          useOnboardingStore.getState().reset();
          router.replace('/onboarding/welcome' as never);
        },
      },
    ]);
  }

  return (
    <View style={common.screenContainer}>
      <NotificationPrimer eligible={canPrimeNotifications} userId={profile?.id ?? null} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={f.refreshing} onRefresh={handleRefresh} tintColor={colors.mint600} />
        }
      >
        {/* ── HERO — the monolith ───────────────────────────────────────────
            The aurora Hero this replaced led with the payoff DATE. The date is
            an outcome; the debt is the thing the user acts on, and it is the
            only figure that moves when they do. So the date keeps its place as
            the pill inside, and the board moved down to the content below —
            it is still the one object here no competitor can draw. */}
        <View style={styles.heroWrap}>
          <View style={styles.topBar}>
            <Text style={styles.greeting}>
              {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}` : 'HELOC Hero'}
            </Text>
            <View style={styles.topBarRight}>
              {__DEV__ && (
                <Touchable style={styles.devBadge} onPress={handleDevTools} accessibilityLabel="DEV tools">
                  <Text style={styles.devBadgeText}>DEV</Text>
                </Touchable>
              )}
              <Touchable
                style={styles.iconBtn}
                onPress={() => { router.push('/modals/settings'); }}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
              </Touchable>
            </View>
          </View>

          <MonolithHero
            debt={netDebt}
            helocBalanceUnknown={f.helocBalanceUnknown}
            curve={debtCurve}
            payoffDate={payoffDate}
            hasRealData={f.hasRealData}
            width={heroWidth}
          />
        </View>

        <View style={styles.content}>
          {/* The board, and the schedule comparison the old hero carried. */}
          <View style={styles.boardBlock}>
            <FreedomBoard
              originalMonths={f.projection.originalMonths}
              acceleratedMonths={f.projection.acceleratedMonths}
              hasRealData={f.hasRealData}
              payoffLabel={fmtMonthYear(payoffDate)}
              thisYear={thisYearDumps}
            />
            <Text style={styles.boardNote}>
              {monthsAhead > 0
                ? `${formatMonths(monthsAhead)} ahead of ${baselineIsReported ? 'your original schedule' : 'your current schedule'}`
                : 'On your current schedule — no acceleration projected yet'}
              {pct !== null
                ? ` · ${f.baseline.percentComplete !== null
                    ? `${pct.toFixed(0)}% of the original loan retired`
                    : `you own ${pct.toFixed(0)}% of your home`}`
                : ''}
            </Text>
            <Text style={styles.boardDisclaimer}>
              Projected estimate, not a guarantee.
              {f.helocRateAssumed ? ' Assumes an 8.5% HELOC APR.' : ''}
            </Text>
          </View>

          {/* Manual indicator + a connect affordance that never blocks. Manual
              users are a large early share and the screen has to be complete
              for them, not a nag with a number behind it. */}
          <View style={styles.asOfRow}>
            {/* isManual is derived from accounts.length, which is 0 until the
                read returns — so a linked user was told "Your figures" before
                being told "Synced 3h ago". A provenance label that changes is
                worse than none, since provenance is the thing it exists to
                settle. */}
            {f.loading ? (
              <Skeleton width={116} height={26} radius={Radius.full} />
            ) : (
              <Chip
                icon={f.isManual ? 'create-outline' : 'sync-outline'}
                label={
                  f.isManual
                    ? 'Your figures'
                    : `Synced ${relativeTime(f.lastSyncedAt)}`
                }
                tone={f.isManual ? 'neutral' : 'accent'}
              />
            )}
            {!f.loading && f.balanceAsOfDate && (
              <Text style={styles.asOfText}>as of {fmtDayMonth(f.balanceAsOfDate)}</Text>
            )}
            <View style={{ flex: 1 }} />
            <Chip
              label={f.hasLinkedAccounts ? 'Accounts' : 'Connect'}
              icon="link-outline"
              onPress={() => {
                router.push(
                  f.hasLinkedAccounts ? '/tabs/accounts' : isPro ? '/modals/link-account' : '/modals/upgrade',
                );
              }}
            />
          </View>

          {/* A failed read used to be silent: the balances simply stayed at
              their last values, or at nothing, with the screen still presenting
              them as current. Every figure below is only as good as this. */}
          {!f.loading && f.error && (
            <Touchable
              style={styles.staleBanner}
              onPress={() => { f.refresh(); }}
              accessibilityRole="button"
              accessibilityLabel="Balances may be out of date. Tap to retry."
            >
              <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.staleText}>
                Couldn't reach your balances{f.hasLinkedAccounts ? ' — showing the last we have' : ''}.
              </Text>
              <Text style={styles.staleAction}>Retry</Text>
            </Touchable>
          )}

          {/* ── CARD 0 — Getting started ────────────────────────────────
              Above Safe to Move, and only until it is finished. Someone who
              has not yet run a scenario or opened a line has no use for a
              recommendation about how much to move; the ordering follows what
              the user can actually act on. It returns null once all six steps
              are done, so the steady state of this screen is unchanged. */}
          {!f.loading && (
            <GettingStarted
              checklist={checklist}
              score={score.total}
              scoreHeadline={score.headline}
              scoreIncomplete={score.incomplete}
            />
          )}

          {/* ── CARD 0.5 — Your next dump ───────────────────────────────
              Above Safe to Move and NOT instead of it. The two answer different
              questions: this one is "how far off is the next dump", which is
              the only thing happening during the months after one, and Safe to
              Move is "should I, and how much" — the decision, with its
              reasoning and its liquidity cost. Replacing the second with the
              first would delete the card that carries the reasoning, on the one
              screen whose output is a decision about a house. */}
          {!f.loading && (
            <NextStrike
              strike={strike}
              replenishThreshold={f.replenishThreshold}
              onPress={() => { hapticLight(); router.push('/tabs/accounts' as never); }}
              onEnterBalance={() => { hapticLight(); router.push('/modals/heloc-terms' as never); }}
            />
          )}

          {/* ── CARD 1 — Safe to Move ──────────────────────────────────── */}
          {/* The one card that must never speak early. Its inputs are the HELOC
              balance and the savings balance, both of which arrive with the
              linked accounts — so before they land, safeToMove reasons from a
              line it believes is undrawn and cash it believes is zero. That
              produced a confident CLEAR with a dollar figure, on the screen
              whose entire output is a decision about a house. A recommendation
              is not a thing to guess at and correct. */}
          {f.loading ? (
            <Card>
              <SkeletonGroup label="Working out whether it is safe to move money">
                <View style={styles.safeHead}>
                  <Skeleton width={124} height={14} />
                  <Skeleton width={78} height={22} radius={Radius.full} />
                </View>
                <Skeleton width={172} height={34} radius={Radius.sm} style={{ marginTop: Spacing[3] }} />
                <SkeletonLines count={3} last="72%" />
                <Skeleton height={44} radius={Radius.md} />
              </SkeletonGroup>
            </Card>
          ) : (
          <Card>
            {/* The one tier-1 figure below the hero. Every other card on this
                screen steps down a size, because this is the card the screen
                exists to produce: the others describe a position, this one is a
                decision. The status pill rides in the head rather than beside
                the number — a CLEAR/CAUTION/HOLD chip set next to the amount was
                two focal points arguing at the same weight. */}
            <CardHead
              title="Safe to move"
              icon="shield-checkmark-outline"
              right={
                <StatusPill
                  status={f.safeToMove.status === 'CLEAR' ? 'clear' : f.safeToMove.status === 'CAUTION' ? 'caution' : 'hold'}
                  label={f.safeToMove.status}
                />
              }
            />

            {f.safeToMove.recommendedAmount !== null ? (
              <View style={styles.safeFigure}>
                <Text style={styles.safeAmount}>${fmt(f.safeToMove.recommendedAmount)}</Text>
                <Text style={styles.safeAmountSub}>the most it is safe to move right now</Text>
              </View>
            ) : (
              <Text style={styles.safeNone}>No move recommended right now</Text>
            )}

            {/* Reasoning is never collapsed. The screen should build the user's
                judgment about their own cash flow, not issue a verdict. */}
            {f.safeToMove.reasons.map((r, i) => (
              <Text key={i} style={styles.reason}>{r}</Text>
            ))}

            {/* Non-negotiable: the liquidity consumed, shown as plainly as the
                interest saved. Otherwise this card is selling, not advising. */}
            {f.safeToMove.bufferMonthsAfter !== null && (
              <View style={styles.bufferRow}>
                <Ionicons name="water-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.bufferText}>
                  {bufferSentence(
                    f.safeToMove.bufferMonthsBefore,
                    f.safeToMove.bufferMonthsAfter,
                  )}
                </Text>
              </View>
            )}

            {/* Equal weight, deliberately. The recommended path is not styled as
                the only affordance when the collateral is a primary residence. */}
            {!moveDismissed && (
              <ActionPair
                primary={{
                  label: 'Log this move',
                  onPress: () => { router.push('/modals/move-money' as never); },
                  disabled: f.safeToMove.status === 'HOLD',
                }}
                secondary={{ label: 'Not now', onPress: () => { setMoveDismissed(true); } }}
              />
            )}
            {moveDismissed && (
              <Touchable
                style={styles.undoBtn}
                onPress={() => setMoveDismissed(false)}
                accessibilityRole="button"
                accessibilityLabel="Show move actions"
              >
                <Text style={styles.undoText}>Show actions</Text>
              </Touchable>
            )}
          </Card>
          )}

          {/* ── CARD 2 — Safe to Sweep ─────────────────────────────────────
              The counterpart to the card above. Safe to Move answers "how much
              should I put on the mortgage"; this answers "what can I actually
              spend" — the question the strategy otherwise leaves a user to
              guess at, since "send every spare dollar at the line" is correct
              and unlivable.

              Gated on f.loading for the same reason Safe to Move is: the
              commitment is computed from the HELOC balance, which arrives with
              the linked accounts. Before it lands the line looks undrawn, so
              nothing looks committed and the whole surplus reads as free — the
              flattering direction, on a number the user might go and spend. */}
          {/* The two figures that move between dumps. Above the slider because
              they are the reason to act; the slider is the acting. Hidden until
              a move has been logged — a shield reading $0.00 with "interest not
              paid" under it is an empty promise, not an empty state. */}
          {!f.loading && totalDumped > 0 && (
            <View style={styles.enginesBlock}>
              <TwinEngines
                shieldToday={shield.soFarToday}
                shieldPerDay={shield.netPerDay}
                shieldCostUnknown={shield.costUnknown}
                strike={strike}
              />
            </View>
          )}

          {/* The one-gesture path, above the card that explains it. The card
              below is the reasoning and stays exactly as it was; this is the
              decision, and it only appears when there is a real amount and the
              cash to cover it. */}
          {!f.loading && sweepMove !== null && (
            <SweepSlider
              amount={sweepMove}
              apr={f.helocRateAssumed ? null : f.helocRate}
              paydayExpected={paydayExpected}
              onConfirm={() => { router.push('/modals/move-money' as never); }}
            />
          )}

          {f.loading ? (
            <Card>
              <SkeletonGroup label="Working out how much is free to spend">
                <Skeleton width={132} height={13} />
                <Skeleton width={168} height={34} radius={Radius.sm} style={{ marginTop: Spacing[3] }} />
                <SkeletonLines count={2} last="64%" />
              </SkeletonGroup>
            </Card>
          ) : (
            <Card>
              <CardHead title="Safe to sweep" icon="wallet-outline" />

              {/* Every branch below ends in a way forward. Two of them used to
                  end in a full stop: `no_line` said "Add your HELOC" and
                  `no_surplus` said "Your figures are in Cash flow" — each naming
                  the exact thing to do next and then leaving the user to go and
                  find it. An empty state that can name its own fix should BE
                  the fix. */}
              {sweep.state === 'no_line' ? (
                <>
                  <Text style={styles.sweepEmpty}>
                    Add your HELOC to see how much of your surplus you can spend without
                    pushing back your next dump.
                  </Text>
                  <Touchable
                    style={styles.sweepAction}
                    onPress={() => { router.push('/modals/heloc-terms' as never); }}
                    accessibilityRole="button"
                    accessibilityLabel="Add your HELOC"
                  >
                    <Ionicons name="create-outline" size={17} color={colors.accentInk} />
                    <Text style={styles.sweepActionText}>Add your HELOC</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.accentInk} />
                  </Touchable>
                </>
              ) : sweep.state === 'unknown_balance' ? (
                // Everything this card commits is derived from the drawn
                // balance, so without one the subtraction below would run on
                // zeros and hand the user their whole surplus as spendable.
                <>
                  {/* Keeps both halves: WHAT is missing and WHY that stops the
                      figure. Cutting to "add your balance" would lose the reason
                      the app is refusing to guess — which is the whole point of
                      the unknown-is-not-zero rule this state exists to honour. */}
                  <Text style={styles.sweepEmpty}>
                    We have your limit but not what is drawn on it, so there is no figure here
                    we can stand behind.
                  </Text>
                  <Touchable
                    style={styles.sweepAction}
                    onPress={() => { router.push('/modals/heloc-terms' as never); }}
                    accessibilityRole="button"
                    accessibilityLabel="Add your HELOC balance"
                  >
                    <Ionicons name="create-outline" size={17} color={colors.accentInk} />
                    <Text style={styles.sweepActionText}>Add your balance</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.accentInk} />
                  </Touchable>
                </>
              ) : sweep.state === 'no_surplus' ? (
                <>
                  <Text style={styles.sweepEmpty}>
                    Nothing left over yet, so there is nothing to sweep.
                  </Text>
                  {/* The assumptions sheet rather than the Cash flow tab: this
                      state exists because income minus outgoings is zero or
                      less, and that sheet is where those two figures are
                      changed. Sending someone to a tab that reports the same
                      shortfall back at them is a longer route to the same
                      screen they are already on. */}
                  <Touchable
                    style={styles.sweepAction}
                    onPress={() => { router.push('/modals/assumptions' as never); }}
                    accessibilityRole="button"
                    accessibilityLabel="Review your income and expenses"
                  >
                    <Ionicons name="create-outline" size={17} color={colors.accentInk} />
                    <Text style={styles.sweepActionText}>Review your figures</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.accentInk} />
                  </Touchable>
                </>
              ) : sweep.state === 'under_water' ? (
                <>
                  <Text style={styles.sweepValue}>$0</Text>
                  <Text style={styles.sweepCaption}>
                    Your surplus does not cover the {fmtMoney(sweep.interestDue)} of interest
                    due this month, so the balance grows by {fmtMoney(sweep.shortfall)} even
                    if you spend nothing.
                  </Text>
                  {/* The worst state this card has, and until now the only one
                      that stated a problem and offered nothing to do about it.
                      Two figures decide it: the surplus and what the line
                      charges. This points at the surplus, because that is the
                      side the user can actually change — the APR belongs to
                      their bank, and heloc-terms only records what it already
                      is. Assumptions holds income and expenses and prints the
                      resulting surplus as you edit them. */}
                  <Touchable
                    style={styles.sweepAction}
                    onPress={() => { router.push('/modals/assumptions' as never); }}
                    accessibilityRole="button"
                    accessibilityLabel="Review the figures behind your surplus"
                  >
                    <Ionicons name="create-outline" size={17} color={colors.accentInk} />
                    <Text style={styles.sweepActionText}>Review your figures</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.accentInk} />
                  </Touchable>
                </>
              ) : (
                <>
                  {/* The subtraction, shown rather than asserted. A single
                      "safe to spend" figure is a number to be trusted; the
                      three lines are a number that can be checked. */}
                  <View style={styles.sweepMath}>
                    <SweepLine label="This month's surplus" amount={sweep.surplus} />
                    <SweepLine
                      label="Committed to replenishing"
                      amount={-sweep.committed}
                      muted
                    />
                    <View style={styles.sweepRule} />
                    <SweepLine label="Safe to spend" amount={sweep.safeToSpend} total />
                  </View>

                  {/* Every branch keeps its figures and its caveat; what came
                      out is the restatement around them. `fully_free` no longer
                      re-explains the threshold — the card directly above this
                      one has just said the line is back under it. */}
                  <Text style={styles.sweepCaption}>
                    {sweep.state === 'dump_blocked'
                      ? 'No dump is possible right now, so only the ' +
                        fmtMoney(sweep.interestDue) + ' of interest is committed. Sort out ' +
                        'the blocker above before treating this as spare.'
                      : sweep.state === 'fully_free'
                      ? 'Your next dump is already open. Spend this freely without slowing it.'
                      : sweep.state === 'all_committed'
                        ? `Every dollar is spoken for: ${fmtMoney(sweep.toThreshold)} off the ` +
                          `line before your next dump, plus ${fmtMoney(sweep.interestDue)} of interest.`
                        : `Spend this freely without slowing your next dump. The ` +
                          `${fmtMoney(sweep.committed)} above covers ${fmtMoney(sweep.interestDue)} ` +
                          `of interest and the ${fmtMoney(sweep.toThreshold)} that re-opens the dump.`}
                  </Text>

                  {/* The honest caveat. "Free to spend" is true and "free of
                      consequence" is not: repaying beyond the threshold lowers
                      the balance, and the next dump is sized off the headroom
                      that leaves. Not saying so would make this the one card on
                      the dashboard that sells rather than advises. */}
                  {sweep.safeToSpend > 0 && sweep.state !== 'dump_blocked' && (
                    <View style={styles.sweepNote}>
                      <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
                      <Text style={styles.sweepNoteText}>
                        Putting it on the line instead makes your next dump bigger, not sooner.
                      </Text>
                    </View>
                  )}

                  {/* The other half of the loop, and until now the half with no
                      screen: the dump was loggable, the sweep was not. This opens
                      the handoff — the app sizes the transfer against the bills
                      actually due, the user makes it at their bank, the app
                      records it. Hidden when there is no drawn balance to repay,
                      because then there is nothing to sweep toward. */}
                  {(f.helocDrawn ?? 0) > 0 && (
                    <Touchable
                      style={styles.sweepAction}
                      onPress={() => { router.push('/modals/log-sweep' as never); }}
                      accessibilityRole="button"
                      accessibilityLabel="Work out and record a sweep to your line"
                    >
                      <Ionicons name="arrow-up-circle-outline" size={17} color={colors.accentInk} />
                      <Text style={styles.sweepActionText}>Sweep to your line</Text>
                      <Ionicons name="chevron-forward" size={15} color={colors.accentInk} />
                    </Touchable>
                  )}
                </>
              )}
            </Card>
          )}

          {/* ── Needs attention ────────────────────────────────────────────
              The app's own watch feed — a rate to re-confirm, a draw period
              closing, spending drifting from the estimate. It sits with the
              decision it might change, not below the reward.

              It no longer disappears when the list is empty, and that is the
              whole point of it. lib/watchItems.ts is built on the rule that
              every item must be sourceable from data the app really holds,
              precisely so that SILENCE MEANS SOMETHING — but silence delivered
              as an absent card is indistinguishable from a check that never
              ran. Saying "nothing needs your attention" is the only version of
              this card that cashes in that design.

              Withheld while loading, though: an all-clear is a claim, and the
              inputs it is drawn from are still arriving. */}
          {!f.loading && (
            <Card>
              <CardHead
                title="Needs attention"
                icon="eye-outline"
                right={f.watchItems.length > 0
                  ? <Chip label={String(f.watchItems.length)} tone="neutral" />
                  : <Chip label="all clear" tone="accent" icon="checkmark-circle-outline" />}
              />
              {f.watchItems.length > 0 ? (
                f.watchItems.map((item, i) => (
                  <WatchRow
                    key={item.kind}
                    item={item}
                    last={i === f.watchItems.length - 1}
                    onPress={item.action ? () => { hapticLight(); router.push(item.action!.route as never); } : undefined}
                  />
                ))
              ) : (
                // Naming the checks is what makes an all-clear worth anything —
                // "nothing to report" from an unnamed process reports nothing.
                // The spending clause is conditional because it has to be:
                // cashflowGap is only computed from real transactions, so
                // promising a manual user we are watching their spending drift
                // would be describing a check that cannot run for them.
                <Text style={styles.allClearText}>
                  Nothing needs your attention. We watch your draw period, whether your
                  rate is still current, and how much of your line is used
                  {f.hasLinkedAccounts
                    ? ', plus whether your spending is drifting from the figures your plan is sized on'
                    : ''}.
                </Text>
              )}
            </Card>
          )}

          {/* ── Both debts as one figure ───────────────────────────────────
              Sits directly above the reward card, because the two are the same
              story from opposite ends: this is what is still owed, that is what
              has already been taken off it.

              It takes a destination now. NetDebt has always accepted `onPress`
              and this screen never passed one, so the one card on the dashboard
              built from two balances was the one card that could not be opened
              — surrounded by tiles and cards that all hand off. Accounts is
              where those two balances live side by side. */}
          {!f.loading && (
            <NetDebt
              debt={netDebt}
              onPress={() => { hapticLight(); router.push('/tabs/accounts' as never); }}
            />
          )}

          {/* ── Interest — the reward, and its live ticker ─────────────────
              Slimmed to the one figure worth a daily look: interest actually
              removed by logged moves, and the ticker that keeps moving between
              them. The servicer YTD figure and the projected-lifetime number
              moved off here — the latter to a door tile below, the former to the
              Accounts export where detail belongs. */}
          <Card>
            <CardHead title="Interest" />

            {/* Realized leads. Resist inverting this — the projection is the
                bigger number and the less trustworthy one. */}
            <View>
              <Text style={styles.bigValue}>
                {realized.net !== null ? `$${fmt(realized.net)}` : '—'}
              </Text>
              {/* Null has two meanings here and they need different sentences.
                  Nothing logged is the empty state; logged-but-no-net means the
                  surplus cannot repay what those moves drew, so the line's cost
                  runs indefinitely and no net figure exists. Printing the empty
                  state for the second would tell someone their recorded moves
                  had not registered. */}
              <Text style={styles.bigLabel}>
                {realized.net !== null
                  ? `interest removed by ${fmtMoney(realized.totalMoved)} of logged moves, net of HELOC interest`
                  : realized.totalMoved > 0
                    ? `${fmtMoney(realized.totalMoved)} logged, but your surplus does not cover what ` +
                      'the line charges to carry it — so there is no net saving to show'
                    : 'No moves logged yet — this fills in from what you actually do'}
              </Text>

              {/* The same saving in the unit the product is actually about.
                  Dollars of interest are abstract; months are the thing someone
                  came here for. Both are shown — the translation sits UNDER the
                  figure it is derived from rather than replacing it, so nobody
                  has to take the conversion on trust. `monthsOffPayoff` is the
                  projection's own output, not a rule of thumb applied to the
                  dollar figure above it. */}
              {realized.net !== null && realized.monthsOffPayoff > 0 && (
                <Text style={styles.bigTranslation}>
                  That is about {formatMonths(realized.monthsOffPayoff)} off your
                  mortgage — a projected estimate, not a guarantee.
                </Text>
              )}
            </View>

            {/* The live one. Between dumps this is the only figure on the
                screen that changes, which is the whole reason it is here. */}
            <InterestTicker
              totalMoved={realized.totalMoved}
              mortgageRate={f.mortgage.rate.value ?? 0.065}
              helocDrawn={f.helocBalanceUnknown ? null : f.helocDrawn ?? 0}
              helocRate={f.helocRate}
            />
          </Card>

          {/* ── Door tiles — each hands off to the tab that explains it ─────
              The dashboard ranks and hands off. "Home equity", not "net worth":
              the app sees a home value, two secured balances and one savings
              balance, so a net-worth tile would be a number it cannot stand
              behind. The equity tile alone waits for the balances — it subtracts
              helocDrawn, so before they land it overstates by the whole drawn
              amount. The others read off the profile and are right at once. */}
          <View style={styles.tileRow}>
            {f.loading ? (
              <View style={styles.tileSkeleton}>
                <SkeletonGroup label="Loading your home equity">
                  <Skeleton width={70} height={10} />
                  <Skeleton width={104} height={24} style={{ marginTop: Spacing[3] }} />
                  <Skeleton width={88} height={11} style={{ marginTop: Spacing[2] }} />
                </SkeletonGroup>
              </View>
            ) : (
              <NavTile
                eyebrow="HOME EQUITY"
                icon="home-outline"
                value={f.equity !== null ? `$${fmtK(f.equity)}` : '—'}
                // "Combined", because the figure includes the drawn line as well
                // as the mortgage. Plain "loan-to-value" conventionally means the
                // first mortgage alone, so mid-cycle — with the line drawn — this
                // tile was quoting a number a user would reasonably read as their
                // mortgage LTV while it was several points higher than that. It
                // is also the wording the Accounts hero uses for the same value.
                // Two different reasons this can be blank, and they need
                // different instructions. Equity is a COMBINED figure, so an
                // unknown line balance overstates it by exactly the drawn
                // amount — it is withheld rather than guessed, and the subtitle
                // says which missing input would fill it in.
                sub={f.combinedLTV !== null
                  ? `${Math.round(f.combinedLTV * 100)}% combined loan-to-value`
                  : f.helocBalanceUnknown
                    ? 'add your line balance'
                    : 'add your home value'}
                onPress={() => {
                  router.push(
                    f.combinedLTV === null && f.helocBalanceUnknown
                      ? '/modals/heloc-terms' as never
                      : '/tabs/accounts' as never,
                  );
                }}
                accessibilityHint={
                  f.combinedLTV === null && f.helocBalanceUnknown
                    ? 'Opens your HELOC details'
                    : 'Opens the Accounts tab'
                }
              />
            )}
            <NavTile
              eyebrow={f.surplus >= 0 ? 'FREE EACH MONTH' : 'SHORT EACH MONTH'}
              icon="swap-vertical-outline"
              value={`${f.surplus < 0 ? '−' : ''}$${fmt(Math.abs(f.surplus))}`}
              muted={f.surplus < 0}
              sub={f.surplusBasis === 'trailing'
                ? 'from your transactions'
                : 'from the figures you entered'}
              onPress={() => { router.push('/tabs/cashflow' as never); }}
              accessibilityHint="Opens the Cash flow tab"
            />
          </View>
          <View style={styles.tileRow}>
            {/* The subtitle used to be `$${fmtK(f.helocDrawn ?? 0)} of …`, which
                rendered "$0 of $150k drawn" for anyone whose balance the app
                does not have — a positive claim that their line is untouched,
                made on no evidence. Unknown says unknown, and points at the
                screen that fixes it. */}
            <NavTile
              eyebrow="YOUR LINE"
              icon="card-outline"
              value={f.helocLimit && f.helocLimit > 0 && f.utilization !== null
                ? `${Math.round(f.utilization * 100)}%`
                : '—'}
              muted={f.utilization !== null && f.utilization > f.replenishThreshold}
              sub={!f.helocLimit || f.helocLimit <= 0
                ? 'add your HELOC'
                : f.helocDrawn === null
                  ? `$${fmtK(f.helocLimit)} limit · add your balance`
                  : `$${fmtK(f.helocDrawn)} of $${fmtK(f.helocLimit)} drawn`}
              onPress={() => {
                router.push(
                  f.helocLimit && f.helocLimit > 0 && f.helocDrawn === null
                    ? '/modals/heloc-terms' as never
                    : '/tabs/accounts' as never,
                );
              }}
              accessibilityHint={
                f.helocLimit && f.helocLimit > 0 && f.helocDrawn === null
                  ? 'Opens your HELOC details'
                  : 'Opens the Accounts tab'
              }
            />
            {/* "PROJECTED SAVING", not "INTEREST SAVED". This tile sits a few
                inches below the Interest card, whose entire premise is that the
                realized figure leads because the projection is the bigger number
                and the less trustworthy one. Labelling the projection in the past
                tense undercut that: the two figures differ by an order of
                magnitude early on, and the larger one carried the more definite
                word. The caveat belongs in the eyebrow, which is the part of a
                tile that actually gets read. */}
            <NavTile
              eyebrow="PROJECTED SAVING"
              icon="trending-down-outline"
              value={`$${fmtK(f.projection.interestSaved)}`}
              sub="interest, over the whole plan"
              onPress={() => { router.push('/tabs/calculator' as never); }}
              accessibilityHint="Opens the Calculator tab"
            />
          </View>

          {/* The one thing that is not a card: the upgrade path, kept as a
              findable link rather than a fifth tile competing with the four. */}
          {!isPaidTier(tier) && (
            <LinkRow
              icon="sparkles-outline"
              label="Connect your accounts with Pro"
              sub="Live balances, servicer figures, and alerts when it is time to act"
              onPress={() => { router.push('/modals/upgrade'); }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * One line of the sweep subtraction.
 *
 * The committed line is drawn in muted grey with a leading minus, never red —
 * money doing exactly what the strategy asks of it is not an error state, and
 * this palette carries severity as saturation.
 */
function SweepLine({ label, amount, muted, total }: {
  label: string;
  amount: number;
  muted?: boolean;
  total?: boolean;
}) {
  const styles = useStyles();
  const negative = amount < 0;
  return (
    <View style={styles.sweepLine}>
      <Text style={[styles.sweepLabel, total && styles.sweepLabelTotal]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.sweepAmount,
          muted && styles.sweepAmountMuted,
          total && styles.sweepAmountTotal,
        ]}
      >
        {negative ? '−' : ''}${fmt(Math.abs(amount))}
      </Text>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtMoney(n: number) { return `$${fmt(n)}`; }
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return fmt(n);
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function fmtDayMonth(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
/**
 * How long ago, in words.
 *
 * The old version called anything under an hour "just now", so a balance synced
 * 59 minutes ago claimed to be current — on the one screen whose stated purpose
 * is that a stale balance is how a wrong recommendation gets made. Minutes are
 * cheap to say and the difference between 2 and 50 of them is exactly the thing
 * a user is trying to judge.
 *
 * A future timestamp means a clock disagreement, not a prediction, so it clamps
 * to "just now" rather than rendering "-3h ago".
 */
function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'never';

  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 90)      return 'just now';
  if (diff < 3600)    return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)  return `${Math.floor(diff / 86400)}d ago`;
  // Past a week, a date is more use than a count of days.
  return `on ${fmtDayMonth(new Date(then))}`;
}
function clamp(min: number, n: number, max: number) { return Math.min(max, Math.max(min, n)); }

/**
 * The liquidity line.
 *
 * On HOLD there is no move, so before and after are the same figure — printing
 * "2.4 months (from 2.4)" reads as a rounding bug and undermines the one number
 * on this card whose job is to be trusted.
 */
function bufferSentence(before: number | null, after: number): string {
  const moved = before !== null && Math.abs(before - after) >= 0.05;
  if (!moved) {
    return `Cash plus available credit covers ${after.toFixed(1)} months of expenses.`;
  }
  return `Buffer after the move: ${after.toFixed(1)} months of expenses, ` +
         `down from ${before!.toFixed(1)}.`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles(t => ({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[5],
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  greeting: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    // Page ink, not OnDark. This row used to sit on the aurora inside the hero;
    // it now sits above the monolith on the light canvas, where a translucent
    // white would be all but invisible.
    color: t.colors.textSecondary,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  devBadge: {
    backgroundColor: '#7C3AED',   // purple — unmistakably not production UI
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
  },
  devBadgeText: { fontSize: 10, fontWeight: Typography.extrabold, color: '#fff', letterSpacing: 1 },

  // The monolith sits on the page rather than on an aurora, so the bar above it
  // is on a light surface and its ink is page ink, not OnDark.
  heroWrap: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
  },
  boardBlock: { marginBottom: Spacing[5], gap: Spacing[3] },
  enginesBlock: { marginBottom: Spacing[4] },
  boardNote: { fontSize: Typography.xs, color: t.colors.textSecondary },
  boardDisclaimer: { fontSize: Typography.xs, color: t.colors.textMuted },

  content: {
    paddingHorizontal: Spacing[4],
    // Was 4pt, which put the provenance chip hard against the bottom of the
    // dissolve — the page began before the hero had finished ending.
    paddingTop: Spacing[4],
    gap: Spacing[4],
  },

  tileRow: { flexDirection: 'row', gap: Spacing[3] },
  // Mirrors NavTile's own box so the row does not resize when the value lands.
  tileSkeleton: {
    flex: 1,
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    padding: Spacing[4],
  },
  asOfRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  asOfText: { fontSize: Typography.xs, color: t.colors.textMuted },

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
  allClearText: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
  },
  staleText: { flex: 1, fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },
  staleAction: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: t.colors.mint700 },

  // Skeleton only — the real card's head is a CardHead, which lays itself out.
  // Kept mirroring it so the card does not jump a row when the figure lands.
  safeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  safeFigure: { gap: 2 },
  safeAmount: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  safeAmountSub: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  // HOLD has no figure, and setting "no move" at display size would give the
  // screen's loudest treatment to the absence of a decision.
  safeNone: {
    fontSize: Typography.xl,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
  },
  reason: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 21 },
  bufferRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  bufferText: { flex: 1, fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  // The only way back to the actions this card just hid, so it has to be a real
  // target rather than one line of 14pt text.
  undoBtn: { minHeight: 44, justifyContent: 'center' },
  undoText: { fontSize: Typography.sm, color: t.colors.accentInk, fontWeight: Typography.medium },

  sweepMath: { gap: Spacing[2] },
  sweepLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 26,
  },
  sweepLabel: { flex: 1, fontSize: Typography.sm, color: t.colors.textSecondary },
  sweepLabelTotal: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  sweepAmount: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textPrimary,
  },
  sweepAmountMuted: { color: t.colors.gray500 },
  sweepAmountTotal: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: Tracking.heading,
  },
  sweepRule: {
    height: 1,
    backgroundColor: t.colors.borderSubtle,
    marginVertical: Spacing[1],
  },
  sweepValue: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  sweepCaption: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    marginTop: Spacing[3],
  },
  sweepEmpty: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  sweepAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 44,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
  sweepActionText: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },
  sweepNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: Spacing[3],
  },
  sweepNoteText: { flex: 1, fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },

  // Tier 2, with every other card that reports a position rather than a
  // decision. See the note on the Safe to move figure.
  bigValue: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  bigLabel: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20, marginTop: 2 },
  bigTranslation: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
    lineHeight: 20,
    marginTop: Spacing[2],
  },
}));
