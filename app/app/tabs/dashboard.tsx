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
// The dashboard ranks; it does not hold everything. The dense multi-stat cards
// that used to sit here — a full line-of-credit breakdown that only duplicated
// the Accounts tab, a stack of interest figures — are gone. Amortization tables,
// transaction lists, rate history, per-account balances: every one is a real
// thing a user might want, and none is what this screen is for. Ranking is the
// feature.
import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
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
import { computeStrike, computeNetDebt } from '../../lib/strike';
import { calcRemainingBalance } from '../../lib/projections';
import { useAuth } from '../../hooks/useAuth';
import { useIsPro } from '../../hooks/useIsPro';
import { useFinancials } from '../../hooks/useFinancials';
import { useDumpHistory } from '../../hooks/useDumpHistory';
import { useCycleReminders } from '../../hooks/useCycleReminders';
import { useBudgets } from '../../hooks/useBudgets';
import { computeHelocScore } from '../../lib/helocScore';
import { buildChecklist } from '../../lib/onboardingChecklist';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { computeRealized } from '../../lib/realized';
import { computeSafeToSweep } from '../../lib/sweep';
import { formatMonths } from '../../lib/projections';
import { monthsBetween, parseDate } from '../../lib/mortgage';
import { MILESTONES } from '../../lib/config';
import { isPaidTier } from '../../lib/pricing';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Tracking, OnDark, CommonStyles, TAB_BAR_CLEARANCE } from '../../lib/theme';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tier } = useAuth();
  const { isPro } = useIsPro();
  const f = useFinancials();
  const { totalDumped, count: dumpCount } = useDumpHistory(profile?.id);
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

  const remindersEnabled = isPaidTier(tier);

  useCycleReminders(profile?.id, {
    helocDrawn:          f.helocDrawn ?? 0,
    monthlySurplus:      Math.max(0, f.surplus),
    dumpAmount:          f.safeToMove.recommendedAmount ?? 0,
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
    <View style={CommonStyles.screenContainer}>
      <NotificationPrimer eligible={canPrimeNotifications} userId={profile?.id ?? null} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={f.refreshing} onRefresh={handleRefresh} tintColor={Colors.mint600} />
        }
      >
        {/* ── HERO — the payoff clock ───────────────────────────────────── */}
        <Hero
          intensity={0.85}
          topBar={
            <View style={styles.topBar}>
              <Text style={styles.greeting}>
                {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}` : 'HELOC Hero'}
              </Text>
              <View style={styles.topBarRight}>
                {__DEV__ && (
                  <TouchableOpacity style={styles.devBadge} onPress={handleDevTools} accessibilityLabel="DEV tools">
                    <Text style={styles.devBadgeText}>DEV</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => router.push('/modals/settings')}
                  accessibilityLabel="Settings"
                >
                  <Ionicons name="settings-outline" size={20} color={OnDark.secondary} />
                </TouchableOpacity>
              </View>
            </View>
          }
        >
          <Text style={styles.heroEyebrow}>
            {f.hasRealData ? 'MORTGAGE-FREE' : 'EXAMPLE · MORTGAGE-FREE'}
          </Text>
          <HeroValue>{fmtMonthYear(payoffDate)}</HeroValue>
          <HeroCaption>
            {monthsAhead > 0
              ? `${formatMonths(monthsAhead)} ahead of ${baselineIsReported ? 'your original schedule' : 'your current schedule'}`
              : 'On your current schedule — no acceleration projected yet'}
          </HeroCaption>

          {/* The board. This replaced a progress meter with milestone marks —
              two rows of chrome that said "42%, next stop 50%". The board says
              the same thing in the product's own terms (years, not percent) and
              is the one object on this screen no competitor can draw. */}
          <View style={styles.boardBlock}>
            <FreedomBoard
              originalMonths={f.projection.originalMonths}
              acceleratedMonths={f.projection.acceleratedMonths}
              hasRealData={f.hasRealData}
            />
            {pct !== null && (
              <Text style={styles.progressText}>
                {f.baseline.percentComplete !== null
                  ? `${pct.toFixed(0)}% of the original loan retired`
                  : `You own ${pct.toFixed(0)}% of your home`}
                {nextMs !== undefined ? ` · next milestone ${nextMs}%` : ''}
              </Text>
            )}
          </View>

          <Text style={styles.heroDisclaimer}>
            Projected estimate, not a guarantee.
            {f.helocRateAssumed ? ' Assumes an 8.5% HELOC APR.' : ''}
          </Text>
        </Hero>

        <View style={styles.content}>
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
              onPress={() => router.push(
                f.hasLinkedAccounts ? '/tabs/accounts' : isPro ? '/modals/link-account' : '/modals/upgrade',
              )}
            />
          </View>

          {/* A failed read used to be silent: the balances simply stayed at
              their last values, or at nothing, with the screen still presenting
              them as current. Every figure below is only as good as this. */}
          {!f.loading && f.error && (
            <TouchableOpacity
              style={styles.staleBanner}
              onPress={() => { hapticLight(); f.refresh(); }}
              accessibilityRole="button"
              accessibilityLabel="Balances may be out of date. Tap to retry."
            >
              <Ionicons name="cloud-offline-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.staleText}>
                Couldn't reach your balances{f.hasLinkedAccounts ? ' — showing the last we have' : ''}.
              </Text>
              <Text style={styles.staleAction}>Retry</Text>
            </TouchableOpacity>
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
                  <Skeleton width={78} height={22} radius={Radius.full} />
                  <Skeleton width={150} height={13} />
                </View>
                <SkeletonLines count={3} last="72%" />
                <Skeleton height={44} radius={Radius.md} />
              </SkeletonGroup>
            </Card>
          ) : (
          <Card>
            <View style={styles.safeHead}>
              <StatusPill
                status={f.safeToMove.status === 'CLEAR' ? 'clear' : f.safeToMove.status === 'CAUTION' ? 'caution' : 'hold'}
                label={f.safeToMove.status}
              />
              <Text style={styles.safeAmount}>
                {f.safeToMove.recommendedAmount !== null
                  ? `move up to $${fmt(f.safeToMove.recommendedAmount)}`
                  : 'no move recommended'}
              </Text>
            </View>

            {/* Reasoning is never collapsed. The screen should build the user's
                judgment about their own cash flow, not issue a verdict. */}
            {f.safeToMove.reasons.map((r, i) => (
              <Text key={i} style={styles.reason}>{r}</Text>
            ))}

            {/* Non-negotiable: the liquidity consumed, shown as plainly as the
                interest saved. Otherwise this card is selling, not advising. */}
            {f.safeToMove.bufferMonthsAfter !== null && (
              <View style={styles.bufferRow}>
                <Ionicons name="water-outline" size={15} color={Colors.textSecondary} />
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
                  onPress: () => { hapticLight(); router.push('/modals/move-money' as never); },
                  disabled: f.safeToMove.status === 'HOLD',
                }}
                secondary={{ label: 'Not now', onPress: () => { hapticLight(); setMoveDismissed(true); } }}
              />
            )}
            {moveDismissed && (
              <TouchableOpacity onPress={() => setMoveDismissed(false)} accessibilityLabel="Show move actions">
                <Text style={styles.undoText}>Show actions</Text>
              </TouchableOpacity>
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

              {sweep.state === 'no_line' ? (
                <Text style={styles.sweepEmpty}>
                  Add your HELOC and this shows how much of your surplus you can spend
                  without pushing back your next dump.
                </Text>
              ) : sweep.state === 'no_surplus' ? (
                <Text style={styles.sweepEmpty}>
                  Nothing is left over each month yet, so there is nothing to divide up.
                  Your figures are in Cash flow.
                </Text>
              ) : sweep.state === 'under_water' ? (
                <>
                  <Text style={styles.sweepValue}>$0</Text>
                  <Text style={styles.sweepCaption}>
                    Your surplus does not cover the {fmtMoney(sweep.interestDue)} of interest your
                    line charges this month, so the balance grows by{' '}
                    {fmtMoney(sweep.shortfall)} even if you spend nothing.
                  </Text>
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

                  <Text style={styles.sweepCaption}>
                    {sweep.state === 'dump_blocked'
                      ? 'No dump is possible right now for the reason above, so nothing is ' +
                        'committed to replenishing beyond the ' + fmtMoney(sweep.interestDue) +
                        ' of interest your line charges. Sort that out before treating this ' +
                        'as spare.'
                      : sweep.state === 'fully_free'
                      ? 'Your line is already back under ' +
                        `${Math.round(f.replenishThreshold * 100)}%, so your next dump is open. ` +
                        'Spend this freely without slowing it.'
                      : sweep.state === 'all_committed'
                        ? `Every dollar is spoken for this month: ${fmtMoney(sweep.toThreshold)} has ` +
                          'to come off the line before your next dump is available, plus ' +
                          `${fmtMoney(sweep.interestDue)} of interest.`
                        : `Spend this freely without slowing your next dump. The ` +
                          `${fmtMoney(sweep.committed)} above it covers ${fmtMoney(sweep.interestDue)} ` +
                          `of interest and the ${fmtMoney(sweep.toThreshold)} that has to come off ` +
                          `the line to re-open the dump.`}
                  </Text>

                  {/* The honest caveat. "Free to spend" is true and "free of
                      consequence" is not: repaying beyond the threshold lowers
                      the balance, and the next dump is sized off the headroom
                      that leaves. Not saying so would make this the one card on
                      the dashboard that sells rather than advises. */}
                  {sweep.safeToSpend > 0 && sweep.state !== 'dump_blocked' && (
                    <View style={styles.sweepNote}>
                      <Ionicons name="information-circle-outline" size={15} color={Colors.textSecondary} />
                      <Text style={styles.sweepNoteText}>
                        Putting it on the line instead does not bring the next dump forward —
                        it makes that dump bigger.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </Card>
          )}

          {/* ── Needs attention (only when non-empty) ──────────────────────
              The app's own watch feed — a rate to re-confirm, a draw period
              closing, spending drifting from the estimate. It sits with the
              decision it might change, not below the reward. */}
          {f.watchItems.length > 0 && (
            <Card>
              <CardHead title="Needs attention" icon="eye-outline" />
              {f.watchItems.map((item, i) => (
                <WatchRow
                  key={item.kind}
                  item={item}
                  last={i === f.watchItems.length - 1}
                  onPress={item.action ? () => { hapticLight(); router.push(item.action!.route as never); } : undefined}
                />
              ))}
            </Card>
          )}

          {/* ── Both debts as one figure ───────────────────────────────────
              Sits directly above the reward card, because the two are the same
              story from opposite ends: this is what is still owed, that is what
              has already been taken off it. */}
          {!f.loading && <NetDebt debt={netDebt} />}

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
              <Text style={styles.bigLabel}>
                {realized.net !== null
                  ? `interest removed by ${fmtMoney(realized.totalMoved)} of logged moves, net of HELOC interest`
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
              helocDrawn={f.helocDrawn ?? 0}
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
                sub={f.combinedLTV !== null
                  ? `${Math.round(f.combinedLTV * 100)}% combined loan-to-value`
                  : 'add your home value'}
                onPress={() => { hapticLight(); router.push('/tabs/accounts' as never); }}
                accessibilityHint="Opens the Accounts tab"
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
              onPress={() => { hapticLight(); router.push('/tabs/cashflow' as never); }}
              accessibilityHint="Opens the Cash flow tab"
            />
          </View>
          <View style={styles.tileRow}>
            <NavTile
              eyebrow="YOUR LINE"
              icon="card-outline"
              value={f.helocLimit && f.helocLimit > 0 && f.utilization !== null
                ? `${Math.round(f.utilization * 100)}%`
                : '—'}
              muted={f.utilization !== null && f.utilization > f.replenishThreshold}
              sub={f.helocLimit && f.helocLimit > 0
                ? `$${fmtK(f.helocDrawn ?? 0)} of $${fmtK(f.helocLimit)} drawn`
                : 'add your HELOC'}
              onPress={() => { hapticLight(); router.push('/tabs/accounts' as never); }}
              accessibilityHint="Opens the Accounts tab"
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
              onPress={() => { hapticLight(); router.push('/tabs/calculator' as never); }}
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
              onPress={() => { hapticLight(); router.push('/modals/upgrade'); }}
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

const styles = StyleSheet.create({
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
    color: OnDark.secondary,
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

  heroEyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: OnDark.muted,
    letterSpacing: Tracking.eyebrow,
  },
  boardBlock: { marginTop: Spacing[5], gap: Spacing[3] },
  progressText: { fontSize: Typography.xs, color: OnDark.secondary },
  heroDisclaimer: { fontSize: Typography.xs, color: OnDark.faint, marginTop: Spacing[3] },

  content: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[1],
    gap: Spacing[4],
  },

  tileRow: { flexDirection: 'row', gap: Spacing[3] },
  // Mirrors NavTile's own box so the row does not resize when the value lands.
  tileSkeleton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing[4],
  },
  asOfRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  asOfText: { fontSize: Typography.xs, color: Colors.textMuted },

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

  safeHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap' },
  safeAmount: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
  },
  reason: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
  bufferRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  bufferText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  undoText: { fontSize: Typography.sm, color: Colors.mint600, fontWeight: Typography.medium },

  sweepMath: { gap: Spacing[2] },
  sweepLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 26,
  },
  sweepLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  sweepLabelTotal: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  sweepAmount: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textPrimary,
  },
  sweepAmountMuted: { color: Colors.gray500 },
  sweepAmountTotal: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: Colors.mint700,
    letterSpacing: Tracking.heading,
  },
  sweepRule: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: Spacing[1],
  },
  sweepValue: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: Colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  sweepCaption: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: Spacing[3],
  },
  sweepEmpty: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  sweepNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: Spacing[3],
  },
  sweepNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  bigValue: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: Colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  bigLabel: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: 2 },
  bigTranslation: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
    lineHeight: 20,
    marginTop: Spacing[2],
  },
});
