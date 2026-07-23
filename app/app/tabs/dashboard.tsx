// app/tabs/dashboard.tsx
//
// One number owns this screen: the Payoff Clock. Everything else is context.
//
// Design constraints it is built to satisfy:
//  · Exactly one accent element (Von Restorff). The payoff figure and its
//    progress bar are mint; every other datum is grey or secondary. This screen
//    previously carried EIGHT hero-scale numbers — two at 56pt, one at 52pt,
//    plus 3xl/2xl figures for utilization, credit and interest saved — most of
//    them mint. Nothing stood out because everything did.
//  · Hierarchy by de-emphasising, not emphasising. The payoff number is a
//    restrained 30pt; the separation comes from muting its surroundings.
//  · Five data elements (Miller's Law): payoff clock, this cycle, your
//    position, readiness score, pinned action. Related metrics are chunked into
//    one card instead of each claiming a tile — this screen used to carry ~16
//    sections, several of them duplicates (two payoff comparisons, two budget
//    bars, two "interest saved" figures).
//  · Progress states its own conclusion and carries 25/50/75 milestone marks,
//    so someone years from payoff still has a near-term goal (Zeigarnik and
//    goal-gradient).
//  · The primary action is pinned in the thumb zone (Fitts's Law) rather than
//    stranded at the bottom of a long scroll.
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useIsPro } from '../../hooks/useIsPro';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { hapticLight } from '../../lib/haptics';
import { useAccounts } from '../../hooks/useAccounts';
import { useStreak } from '../../hooks/useStreak';
import NotificationPrimer from '../../components/NotificationPrimer';
import { computeHelocScore, genericHelocScore } from '../../lib/helocScore';
import { computeProjection, genericProjection, formatMonths } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';
import type { LinkedAccount } from '../../lib/types';

const ASSUMED_HELOC_RATE = 0.085;
const MILESTONES = [25, 50, 75];

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { isPro } = useIsPro();
  const { streak } = useStreak(profile?.id);
  const { accounts, refreshing, refresh, mortgageAccount, helocAccount, savingsAccount } =
    useAccounts(profile?.id ?? null);

  const mortgageBalance   = firstBalance(mortgageAccount);
  const helocBalance      = firstBalance(helocAccount);
  const helocLimit        = firstLimit(helocAccount);
  const savingsBalance    = firstBalance(savingsAccount);
  const hasLinkedAccounts = accounts.length > 0;

  const income          = profile?.monthly_income   ?? 0;
  const livingExpenses  = profile?.monthly_expenses ?? 0;
  const mortgagePayment = profile?.monthly_payment  ?? 0;
  const surplus         = income - livingExpenses - mortgagePayment;

  const homeValue  = profile?.home_value ?? 0;
  const liveDebt   = (mortgageBalance ?? profile?.mortgage_balance ?? 0) + (helocBalance ?? 0);
  const homeEquity = Math.max(0, homeValue - liveDebt);

  // Ownership is the progress metric because it means something on day one.
  // Principal-paid-since-signup sits at 0% for every new user — exactly when a
  // progress bar most needs to show them something.
  const ownedPct = homeValue > 0
    ? Math.min(Math.max((homeEquity / homeValue) * 100, 0), 100)
    : 0;
  const underwater = homeValue > 0 && liveDebt > homeValue;

  const hasRealData = tier !== 'free' && mortgageBalance !== null;

  // Without Plaid, fall back to a surplus-derived estimate so the cycle card is
  // populated. Always labelled as an estimate.
  const fallbackHelocLimit  = Math.max(25_000, Math.min(Math.max(0, surplus) * 12, 150_000)) || 50_000;
  const displayHelocBalance = helocBalance ?? 0;
  const displayHelocLimit   = helocLimit   ?? fallbackHelocLimit;
  const effectiveDump       = displayHelocLimit > 0
    ? Math.min(displayHelocLimit, Math.max(0, surplus * 12))
    : Math.max(0, surplus * 12);

  const score = hasRealData
    ? computeHelocScore({
        monthlyIncome:   income,
        monthlyExpenses: livingExpenses,
        helocBalance:    helocBalance  ?? 0,
        helocLimit:      helocLimit    ?? 0,
        creditScore:     profile?.credit_score ?? 700,
        homeValue,
        mortgageBalance: mortgageBalance ?? 0,
      })
    : genericHelocScore();

  const projection = hasRealData && mortgageBalance
    ? computeProjection({
        mortgageBalance,
        mortgageRate:   profile?.mortgage_rate   ?? 0.065,
        monthlyPayment: profile?.monthly_payment ?? 2_000,
        monthlySurplus: Math.max(0, surplus),
        helocRate:      ASSUMED_HELOC_RATE,
      })
    : genericProjection();

  // ── DEV-ONLY: restart / reset onboarding flow ─────────────────────────────
  // __DEV__ is false in production — Metro dead-strips this function entirely.
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
  // ── END DEV TOOLS ──────────────────────────────────────────────────────────

  const cycleReady   = displayHelocBalance <= 0 && effectiveDump > 0;
  const monthsToDump = displayHelocBalance > 0 && surplus > 0
    ? Math.max(1, Math.ceil(displayHelocBalance / surplus))
    : 0;

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <NotificationPrimer triggerKey={profile?.id ?? null} />

      <View style={styles.header}>
        <Text style={styles.greeting}>
          {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}` : 'Dashboard'}
        </Text>
        <View style={styles.headerRight}>
          {__DEV__ && (
            <TouchableOpacity
              style={styles.devBadge}
              onPress={handleDevTools}
              accessibilityLabel="DEV tools"
            >
              <Text style={styles.devBadgeText}>DEV</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/modals/settings')}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.mint600} />
        }
      >
        {/* ── 1. THE PAYOFF CLOCK — the only accent on this screen ────────── */}
        <View style={styles.clockCard}>
          {!hasRealData && (
            <View style={styles.exampleBadge}>
              <Text style={styles.exampleBadgeText}>Example</Text>
            </View>
          )}

          <Text style={styles.eyebrow}>MORTGAGE-FREE IN</Text>
          <Text style={styles.clockValue}>{formatMonths(projection.acceleratedMonths)}</Text>
          <Text style={styles.clockDate}>
            around {fmtPayoffDate(projection.acceleratedPayoffDate)}
          </Text>

          {/* The conclusion, stated outright — not a legend to decode */}
          {projection.monthsSaved > 0 && (
            <Text style={styles.clockConclusion}>
              {formatMonths(projection.monthsSaved)} sooner than your current schedule,
              saving about ${fmtK(projection.interestSaved)} in interest
            </Text>
          )}

          {/* Progress toward owning the home outright, with near-term goals */}
          {homeValue > 0 && (
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${ownedPct}%` }]} />
                {MILESTONES.map(m => (
                  <View key={m} style={[styles.milestone, { left: `${m}%` }]} />
                ))}
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressText}>
                  {underwater
                    ? 'Owe more than the home is currently worth'
                    : `You own ${ownedPct.toFixed(0)}% of your home`}
                </Text>
                <Text style={styles.progressGoal}>{nextMilestone(ownedPct)}</Text>
              </View>
            </View>
          )}

          <Text style={styles.clockDisclaimer}>Projected estimate, not a guarantee.</Text>
        </View>

        {streak > 0 && (
          <Text style={styles.streakLine}>
            {streak}-month cycling streak — keep it going
          </Text>
        )}

        {/* ── 2. THIS CYCLE — utilization and next dump are one story ─────── */}
        <TouchableOpacity
          style={CommonStyles.card}
          onPress={() => { hapticLight(); router.push('/modals/move-money' as never); }}
          activeOpacity={0.85}
          accessibilityLabel="Cycle details"
        >
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>This cycle</Text>
            <Text style={styles.cardStatus}>
              {cycleReady ? 'Ready to dump' : monthsToDump > 0 ? `~${monthsToDump} mo to go` : 'Not started'}
            </Text>
          </View>

          <View style={styles.utilTrack}>
            <View
              style={[styles.utilFill, { width: `${pct(displayHelocBalance, displayHelocLimit)}%` }]}
            />
          </View>

          <Text style={styles.cardConclusion}>
            {cycleReady
              ? `HELOC is replenished — you can dump about $${fmt(effectiveDump)} onto your principal.`
              : `$${fmt(displayHelocBalance)} drawn of $${fmt(displayHelocLimit)} · ` +
                `$${fmt(Math.max(0, displayHelocLimit - displayHelocBalance))} available`}
          </Text>

          {helocBalance === null && (
            <Text style={styles.estimateNote}>Estimated · link accounts for live balances</Text>
          )}
        </TouchableOpacity>

        {/* ── 3. YOUR POSITION — balances chunked into one card ───────────── */}
        {hasLinkedAccounts ? (
          <TouchableOpacity
            style={CommonStyles.card}
            onPress={() => { hapticLight(); router.push('/tabs/accounts' as never); }}
            activeOpacity={0.85}
            accessibilityLabel="Account balances"
          >
            <Text style={styles.cardTitle}>Your position</Text>
            <View style={styles.positionRow}>
              <PositionStat label="Mortgage" value={mortgageBalance !== null ? `$${fmtK(mortgageBalance)}` : '—'} />
              <PositionStat label="HELOC"    value={helocBalance    !== null ? `$${fmtK(helocBalance)}`    : '—'} />
              <PositionStat label="Savings"  value={savingsBalance  !== null ? `$${fmtK(savingsBalance)}`  : '—'} />
            </View>
            <View style={styles.positionFooter}>
              <Text style={styles.cardConclusion}>
                {homeValue > 0 ? `$${fmtK(homeEquity)} home equity` : 'Add home value to see equity'}
              </Text>
              <Text style={[styles.positionSurplus, surplus < 0 && styles.positionSurplusNeg]}>
                {surplus >= 0 ? '+' : '−'}${fmt(Math.abs(surplus))}/mo
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.linkCta}
            onPress={() => router.push(isPro ? '/modals/link-account' : '/modals/upgrade')}
            accessibilityLabel="Link your bank accounts"
          >
            <View style={styles.linkIcon}>
              <Ionicons name="link-outline" size={20} color={Colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>Link your accounts</Text>
              <Text style={styles.linkSub}>Track real balances instead of estimates</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
          </TouchableOpacity>
        )}

        {/* ── 4. READINESS SCORE — context, deliberately not a second hero ── */}
        <View style={CommonStyles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Strategy readiness</Text>
            <Text style={styles.scoreInline}>
              {score.total}<Text style={styles.scoreOutOf}>/100</Text>
            </Text>
          </View>
          <Text style={styles.cardConclusion}>{score.label}</Text>

          <View style={styles.scoreBars}>
            <ScoreBar label="Monthly surplus"   value={score.surplusScore}     max={55} />
            <ScoreBar label="HELOC utilization" value={score.utilizationScore} max={25} />
            <ScoreBar label="Credit score"      value={score.creditPoints}     max={20} />
          </View>

          {!hasRealData && (
            <Text style={styles.estimateNote}>Estimated · link accounts for a live score</Text>
          )}
        </View>

        {tier === 'free' && (
          <TouchableOpacity
            style={styles.upgradeRow}
            onPress={() => { hapticLight(); router.push('/modals/upgrade'); }}
            accessibilityLabel="See Pro plans"
          >
            <Text style={styles.upgradeText}>
              Connect accounts for live balances and automatic cycle tracking
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.mint600} />
          </TouchableOpacity>
        )}

        {tier === 'full' && (
          <View style={CommonStyles.card}>
            <Text style={styles.cardTitle}>Automation</Text>
            <AutomationRow label="Safe Sweep™" subtitle="Auto-move surplus to HELOC" active />
            <AutomationRow label="Safe Dump™"  subtitle="Auto-dump HELOC to mortgage" active={false} />
            <TouchableOpacity style={styles.manageBtn} onPress={() => router.push('/modals/settings')}>
              <Text style={styles.manageText}>Manage automation</Text>
            </TouchableOpacity>
          </View>
        )}

        {!helocAccount && (
          <TouchableOpacity
            style={styles.stepRow}
            onPress={() => router.push('/modals/get-heloc')}
            accessibilityLabel="Open HELOC guide"
          >
            <Text style={styles.stepText}>First step: open an interest-only HELOC</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── 5. PRIMARY ACTION — pinned inside the thumb zone ──────────────── */}
      <View style={styles.footer}>
        {/* Opens the decision, which weighs the move — it does not perform one. */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => { hapticLight(); router.push('/modals/move-money' as never); }}
          accessibilityLabel="Consider moving money to your mortgage"
        >
          <Text style={styles.primaryBtnText}>
            {cycleReady ? 'Consider a move' : 'Plan your next move'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PositionStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.positionStat}>
      <Text style={styles.positionValue}>{value}</Text>
      <Text style={styles.positionLabel}>{label}</Text>
    </View>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={styles.scoreBarRow}>
      <Text style={styles.scoreBarLabel}>{label}</Text>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${Math.min((value / max) * 100, 100)}%` }]} />
      </View>
      <Text style={styles.scoreBarValue}>{value}/{max}</Text>
    </View>
  );
}

function AutomationRow({ label, subtitle, active }: {
  label: string; subtitle: string; active: boolean;
}) {
  return (
    <View style={styles.automationRow}>
      <View style={[styles.automationDot, { backgroundColor: active ? Colors.mint600 : Colors.gray300 }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.automationLabel}>{label}</Text>
        <Text style={styles.automationSub}>{subtitle}</Text>
      </View>
      <Text style={styles.automationStatus}>{active ? 'Active' : 'Off'}</Text>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function firstBalance(account: LinkedAccount | null): number | null {
  if (!account || account.accounts.length === 0) return null;
  return account.accounts[0].balances.current;
}
function firstLimit(account: LinkedAccount | null): number | null {
  if (!account || account.accounts.length === 0) return null;
  return account.accounts[0].balances.limit ?? null;
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(Math.max((part / whole) * 100, 0), 100) : 0;
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtPayoffDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return Math.round(n).toLocaleString('en-US');
}
/** Near-term goal, so someone years from payoff still has something close by. */
function nextMilestone(ownedPct: number): string {
  const next = MILESTONES.find(m => ownedPct < m);
  return next === undefined ? 'Final stretch' : `Next: ${next}%`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  greeting: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  devBadge: {
    backgroundColor: '#7C3AED',   // purple — unmistakably not production UI
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
  },
  devBadgeText: { fontSize: 10, fontWeight: Typography.extrabold, color: '#fff', letterSpacing: 1 },
  settingsBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[8] },

  // ── 1. Payoff clock ────────────────────────────────────────────────────────
  clockCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingVertical: Spacing[6],
    paddingHorizontal: Spacing[5],
    alignItems: 'center',
    gap: Spacing[1],
    ...Shadows.card,
  },
  exampleBadge: {
    position: 'absolute',
    top: Spacing[3],
    right: Spacing[3],
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 2,
  },
  exampleBadgeText: { fontSize: Typography.xs, color: Colors.textMuted },
  eyebrow: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: Colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: Spacing[1],
  },
  // The one accent element. Restrained in size — the hierarchy comes from
  // everything around it being muted, not from this being large.
  clockValue: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: Colors.mint600,
    letterSpacing: -0.6,
  },
  clockDate: { fontSize: Typography.sm, color: Colors.textSecondary },
  clockConclusion: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing[2],
    maxWidth: 300,
  },
  clockDisclaimer: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[2] },

  progressBlock: { width: '100%', marginTop: Spacing[4], gap: Spacing[2] },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.gray100,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: Colors.mint600 },
  // Milestone ticks read as gaps in the bar rather than as extra chrome.
  milestone: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 8,
    backgroundColor: Colors.surface,
  },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { fontSize: Typography.xs, color: Colors.textSecondary },
  progressGoal: { fontSize: Typography.xs, color: Colors.textMuted },

  streakLine: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing[2],
  },

  // ── Shared card furniture ──────────────────────────────────────────────────
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
  },
  cardStatus: { fontSize: Typography.xs, color: Colors.textMuted },
  cardConclusion: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  estimateNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[2] },

  // ── 2. This cycle ──────────────────────────────────────────────────────────
  utilTrack: {
    height: 8,
    backgroundColor: Colors.gray100,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing[3],
  },
  utilFill: { height: 8, borderRadius: 4, backgroundColor: Colors.gray400 },

  // ── 3. Your position ───────────────────────────────────────────────────────
  positionRow: { flexDirection: 'row', gap: Spacing[3] },
  positionStat: { flex: 1, gap: 2 },
  positionValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  positionLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  positionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[4],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  positionSurplus: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  // Negative numbers use muted grey, never red.
  positionSurplusNeg: { color: Colors.gray400 },

  linkCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    ...Shadows.card,
  },
  linkIcon: {
    width: 44, height: 44, borderRadius: Radius.lg,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  linkTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  linkSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

  // ── 4. Readiness score ─────────────────────────────────────────────────────
  scoreInline: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  scoreOutOf: { fontSize: Typography.xs, fontWeight: Typography.regular, color: Colors.textMuted },
  scoreBars: { marginTop: Spacing[4], gap: Spacing[3] },
  scoreBarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  scoreBarLabel: { width: 118, fontSize: Typography.xs, color: Colors.textSecondary },
  scoreBarTrack: { flex: 1, height: 6, backgroundColor: Colors.gray100, borderRadius: 3 },
  scoreBarFill: { height: 6, borderRadius: 3, backgroundColor: Colors.gray400 },
  scoreBarValue: {
    width: 40, textAlign: 'right',
    fontSize: Typography.xs, color: Colors.textMuted,
  },

  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  upgradeText: { flex: 1, fontSize: Typography.sm, color: Colors.mint700, lineHeight: 18 },

  automationRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingVertical: Spacing[2],
  },
  automationDot: { width: 8, height: 8, borderRadius: 4 },
  automationLabel: {
    fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary,
  },
  automationSub: { fontSize: Typography.xs, color: Colors.textMuted },
  automationStatus: { fontSize: Typography.xs, color: Colors.textMuted },
  manageBtn: { paddingTop: Spacing[3], minHeight: 44, justifyContent: 'center' },
  manageText: { color: Colors.mint600, fontSize: Typography.sm, fontWeight: Typography.medium },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    minHeight: 44,
  },
  stepText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },

  // ── 5. Pinned primary action ───────────────────────────────────────────────
  footer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[3],
    backgroundColor: Colors.surface,
  },
  primaryBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    paddingVertical: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    minHeight: 44,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
});
