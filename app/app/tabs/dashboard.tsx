// app/tabs/dashboard.tsx — one hero and four cards. Everything else behind a tap.
//
// The hero is a date, not a countdown. "March 2037" is a thing a person can
// picture and check against their own plans; "13 yrs 2 mo" is an abstraction
// they have to convert before it means anything. The conclusion is annotated
// directly beneath it, because a bare number is homework.
//
// The four cards, in this order and no other:
//   1. Safe to Move   — the decision, in the thumb zone, reasoning always visible
//   2. Interest       — realized first, projected second, servicer figure alongside
//   3. Line status    — balance, available, limit, and the threshold gauge
//   4. Watch items    — only when there is genuinely something to watch
//
// Explicitly not on this screen: amortization tables, transaction lists, rate
// history, per-account balances, month-by-month schedules. Every one of those
// is a real thing a user might want and none of them is what this screen is
// for. Ranking is the feature.
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import {
  Card, CardHead, Chip, StatusPill, Meter, Stat, SourceNote, ActionPair, LinkRow, NavTile,
} from '../../components/ui/primitives';
import NotificationPrimer from '../../components/NotificationPrimer';
import FreedomBoard from '../../components/FreedomBoard';
import { useAuth } from '../../hooks/useAuth';
import { useIsPro } from '../../hooks/useIsPro';
import { useFinancials } from '../../hooks/useFinancials';
import { useDumpHistory } from '../../hooks/useDumpHistory';
import { useCycleReminders } from '../../hooks/useCycleReminders';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { computeRealized } from '../../lib/realized';
import { formatMonths } from '../../lib/projections';
import { monthsBetween } from '../../lib/mortgage';
import { MILESTONES } from '../../lib/config';
import { isPaidTier } from '../../lib/pricing';
import { hapticLight } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Tracking, OnDark, CommonStyles, TAB_BAR_CLEARANCE } from '../../lib/theme';
import type { WatchItem } from '../../lib/watchItems';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tier } = useAuth();
  const { isPro } = useIsPro();
  const f = useFinancials();
  const { totalDumped } = useDumpHistory(profile?.id);
  const [moveDismissed, setMoveDismissed] = useState(false);

  const realized = computeRealized({
    totalMoved:      totalDumped,
    mortgageBalance: f.mortgageBalance ?? 0,
    mortgageRate:    f.mortgage.rate.value ?? 0.065,
    monthlyPayment:  f.payment,
    helocRate:       f.helocRate,
    monthlySurplus:  Math.max(0, f.surplus),
    helocLimit:      f.helocLimit ?? 0,
  });

  useCycleReminders(profile?.id, {
    helocDrawn:     f.helocDrawn ?? 0,
    monthlySurplus: Math.max(0, f.surplus),
    dumpAmount:     f.safeToMove.recommendedAmount ?? 0,
    enabled:        isPaidTier(tier),
  });

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
      <NotificationPrimer triggerKey={profile?.id ?? null} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={f.refreshing} onRefresh={f.refresh} tintColor={Colors.mint600} />
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
            <Chip
              icon={f.isManual ? 'create-outline' : 'sync-outline'}
              label={
                f.isManual
                  ? 'Your figures'
                  : `Synced ${relativeTime(f.lastSyncedAt)}`
              }
              tone={f.isManual ? 'neutral' : 'accent'}
            />
            {f.balanceAsOfDate && (
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

          {/* ── Summary tiles — each one a door to the tab that explains it ──
              The dashboard ranks; it does not hold everything. These two carry
              the figures people check most often and hand off rather than
              growing a breakdown here.

              "Home equity", not "net worth": the app knows a home value, two
              secured balances and one savings balance. It has no visibility of
              retirement, brokerage or anything else, so a tile labelled net
              worth would be a number the product cannot stand behind. */}
          <View style={styles.tileRow}>
            <NavTile
              eyebrow="HOME EQUITY"
              icon="home-outline"
              value={f.equity !== null ? `$${fmtK(f.equity)}` : '—'}
              sub={f.combinedLTV !== null
                ? `${Math.round(f.combinedLTV * 100)}% loan-to-value`
                : 'add your home value'}
              onPress={() => { hapticLight(); router.push('/tabs/accounts' as never); }}
              accessibilityHint="Opens the Accounts tab"
            />
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

          {/* ── CARD 1 — Safe to Move ──────────────────────────────────── */}
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

          {/* ── CARD 2 — Interest ──────────────────────────────────────── */}
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
            </View>

            <View style={styles.statRow}>
              <Stat
                label="Interest paid this year"
                value={f.mortgage.ytdInterestPaid.value !== null
                  ? `$${fmt(f.mortgage.ytdInterestPaid.value)}`
                  : '—'}
                sub={f.mortgage.ytdInterestPaid.source === 'liability'
                  ? 'from your servicer'
                  : 'link your mortgage'}
              />
              <Stat
                label="Projected lifetime"
                value={`$${fmtK(f.projection.interestSaved)}`}
                sub="projected, not guaranteed"
              />
            </View>

            {f.mortgage.ytdInterestPaid.source === 'liability' && (
              <SourceNote>
                Year-to-date interest comes straight from your servicer, so it should match
                your statement to the dollar.
              </SourceNote>
            )}
          </Card>

          {/* ── CARD 3 — Line status ───────────────────────────────────── */}
          <Card onPress={() => router.push('/tabs/accounts' as never)} accessibilityLabel="Line details">
            <CardHead
              title="Your line"
              right={<Chip label={limitSourceLabel(f.helocLimitSource)} />}
            />

            {f.helocLimit && f.helocLimit > 0 ? (
              <>
                <View style={styles.statRow}>
                  <Stat label="Drawn"     value={`$${fmt(f.helocDrawn ?? 0)}`} />
                  <Stat label="Available" value={`$${fmt(f.helocAvailable ?? 0)}`} />
                  <Stat label="Limit"     value={`$${fmt(f.helocLimit)}`} align="right" />
                </View>

                {/* The mark sits where the threshold actually is. */}
                <Meter
                  value={f.utilization ?? 0}
                  marks={[{ at: f.replenishThreshold, label: `replenish at ${Math.round(f.replenishThreshold * 100)}%` }]}
                  tone={(f.utilization ?? 0) > f.replenishThreshold ? 'muted' : 'accent'}
                />

                <Text style={styles.reason}>
                  {(f.utilization ?? 0) > f.replenishThreshold
                    ? `At ${Math.round((f.utilization ?? 0) * 100)}% you are above your replenish threshold — surplus goes to the line, not to principal.`
                    : `At ${Math.round((f.utilization ?? 0) * 100)}%, with room to draw before you reach your threshold.`}
                </Text>
              </>
            ) : (
              <Text style={styles.reason}>
                No credit limit on file yet. Link your HELOC, or enter the limit from your
                statement, and this card starts working.
              </Text>
            )}
          </Card>

          {/* ── CARD 4 — Watch items (only when non-empty) ─────────────── */}
          {f.watchItems.length > 0 && (
            <Card>
              <CardHead title="Worth a look" icon="eye-outline" />
              {f.watchItems.map((item, i) => (
                <WatchRow
                  key={item.kind}
                  item={item}
                  last={i === f.watchItems.length - 1}
                  onPress={item.action ? () => router.push(item.action!.route as never) : undefined}
                />
              ))}
            </Card>
          )}

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

function WatchRow({ item, last, onPress }: {
  item: WatchItem; last: boolean; onPress?: () => void;
}) {
  const body = (
    <View style={[styles.watchRow, !last && styles.watchRowBorder]}>
      <View style={styles.watchIcon}>
        <Ionicons name={item.icon as never} size={16} color={Colors.textSecondary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.watchTitle}>{item.title}</Text>
        <Text style={styles.watchDetail}>{item.detail}</Text>
        {item.action && <Text style={styles.watchAction}>{item.action.label} →</Text>}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
      {body}
    </TouchableOpacity>
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
function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 3600)  return 'just now';
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function limitSourceLabel(s: 'plaid_limit' | 'derived' | 'user' | 'unknown'): string {
  return s === 'plaid_limit' ? 'from your bank'
    : s === 'derived' ? 'from your balances'
    : s === 'user' ? 'you entered this'
    : 'not set';
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
  asOfRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  asOfText: { fontSize: Typography.xs, color: Colors.textMuted },

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

  bigValue: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: Colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  bigLabel: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: Spacing[4] },

  watchRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    alignItems: 'flex-start',
  },
  watchRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  watchIcon: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  watchTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  watchDetail: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
  watchAction: { fontSize: Typography.xs, color: Colors.mint600, fontWeight: Typography.semibold, marginTop: 2 },
});
