// app/tabs/dashboard.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { computeHelocScore, genericHelocScore } from '../../lib/helocScore';
import { computeProjection, genericProjection, formatMonths } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';
import type { LinkedAccount } from '../../lib/types';

const ASSUMED_HELOC_RATE = 0.085;

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
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

  const surplus          = income - livingExpenses - mortgagePayment;
  const savingsRate      = income > 0 ? Math.max(0, surplus / income) * 100 : 0;
  const totalObligations = livingExpenses + mortgagePayment;
  const budgetPct        = income > 0 ? Math.min((totalObligations / income) * 100, 100) : 0;

  const homeValue       = profile?.home_value ?? 0;
  const liveDebt        = (mortgageBalance ?? profile?.mortgage_balance ?? 0) + (helocBalance ?? 0);
  const homeEquity      = Math.max(0, homeValue - liveDebt);
  const totalNetWorth   = homeEquity + (savingsBalance ?? 0);
  const hasNetWorthData = homeValue > 0;

  const helocInterestMin = (helocBalance ?? 0) * ASSUMED_HELOC_RATE / 12;
  const debtRatio = income > 0
    ? ((mortgagePayment + helocInterestMin) / income) * 100
    : 0;

  // Mortgage payoff progress: compare original balance to live (or profile) balance
  const originalMortgage = profile?.mortgage_balance ?? 0;
  const liveMortgage     = mortgageBalance ?? originalMortgage;
  const paidDown         = Math.max(0, originalMortgage - liveMortgage);
  const payoffProgressPct = originalMortgage > 0
    ? Math.min((paidDown / originalMortgage) * 100, 100)
    : 0;

  const hasRealData = tier !== 'free' && mortgageBalance !== null;

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

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}` : 'Dashboard'}
          </Text>
          <Text style={styles.headerSub}>Your mortgage payoff dashboard</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/modals/settings')}>
          <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.mint600} />}
      >
        {/* Score card */}
        <LinearGradient colors={['#1a9e7a', '#0d7a5e']} style={styles.scoreCard}>
          <View style={styles.scoreLeft}>
            <Text style={styles.scoreLabel}>HELOC Hero Score™</Text>
            {!hasRealData && <Text style={styles.scoreEstimate}>Estimated — connect accounts</Text>}
            <Text style={styles.scoreNumber}>{score.total}</Text>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreBadgeText}>{score.label}</Text>
            </View>
          </View>
          <View style={styles.scoreGauge}><ScoreRing score={score.total} /></View>
        </LinearGradient>

        {/* Upgrade prompt — free tier */}
        {tier === 'free' && (
          <TouchableOpacity style={styles.upgradeBanner} onPress={() => router.push('/modals/upgrade')}>
            <Ionicons name="star-outline" size={18} color={Colors.mint600} />
            <Text style={styles.upgradeText}>
              Connect real accounts for a live score, projections & budget tracking
            </Text>
            <Text style={styles.upgradeLink}>Upgrade →</Text>
          </TouchableOpacity>
        )}

        {/* Account stats */}
        {hasLinkedAccounts ? (
          <View style={styles.statsRow}>
            <StatCard label="Mortgage"  value={mortgageBalance !== null ? `$${fmt(mortgageBalance)}` : '—'} icon="home-outline"   color={Colors.info}    onPress={() => router.push('/tabs/accounts')} />
            <StatCard label="HELOC"     value={helocBalance    !== null ? `$${fmt(helocBalance)}`    : '—'} icon="card-outline"   color={Colors.warning} onPress={() => router.push('/tabs/accounts')} />
            <StatCard label="Savings"   value={savingsBalance  !== null ? `$${fmt(savingsBalance)}`  : '—'} icon="wallet-outline" color={Colors.success} onPress={() => router.push('/tabs/accounts')} />
          </View>
        ) : (
          <TouchableOpacity style={styles.linkAccountsCta} onPress={() => router.push('/tabs/accounts')}>
            <View style={styles.linkAccountsIcon}><Ionicons name="link-outline" size={22} color={Colors.mint600} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkAccountsTitle}>Link Your Bank Accounts</Text>
              <Text style={styles.linkAccountsSub}>Connect mortgage, HELOC & savings for live balances</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.mint600} />
          </TouchableOpacity>
        )}

        {/* ─── Financial Snapshot ─── */}
        {(hasNetWorthData || income > 0) && (
          <View style={CommonStyles.card}>
            <Text style={styles.cardTitle}>Financial Snapshot</Text>

            <View style={styles.snapshotRow}>
              <SnapshotStat
                label="Net Worth"
                value={hasNetWorthData ? `$${fmtK(totalNetWorth)}` : '—'}
                sub={hasNetWorthData ? 'Home equity + savings' : 'Add home value in onboarding'}
                color={Colors.mint600}
                icon="trending-up-outline"
              />
              <View style={styles.snapshotDivider} />
              <SnapshotStat
                label="Savings Rate"
                value={income > 0 ? `${savingsRate.toFixed(1)}%` : '—'}
                sub={savingsRate >= 20 ? 'Excellent' : savingsRate >= 10 ? 'On track' : 'Build it up'}
                color={savingsRate >= 20 ? Colors.success : savingsRate >= 10 ? Colors.warning : Colors.error}
                icon="flash-outline"
              />
              <View style={styles.snapshotDivider} />
              <SnapshotStat
                label="Debt Ratio"
                value={income > 0 ? `${debtRatio.toFixed(0)}%` : '—'}
                sub={debtRatio <= 36 ? 'Healthy' : debtRatio <= 50 ? 'Moderate' : 'High'}
                color={debtRatio <= 36 ? Colors.success : debtRatio <= 50 ? Colors.warning : Colors.error}
                icon="speedometer-outline"
              />
            </View>

            {/* Monthly budget bar */}
            {income > 0 && (
              <View style={styles.budgetSection}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetLabel}>Monthly Budget</Text>
                  <Text style={styles.budgetNumbers}>
                    <Text style={styles.budgetSpent}>${fmt(totalObligations)}</Text>
                    <Text style={styles.budgetOf}> of ${fmt(income)}</Text>
                  </Text>
                </View>
                <View style={styles.budgetTrack}>
                  <View
                    style={[
                      styles.budgetFill,
                      {
                        width: `${budgetPct}%`,
                        backgroundColor:
                          budgetPct > 95 ? Colors.error :
                          budgetPct > 80 ? Colors.warning :
                          Colors.success,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.budgetNote}>
                  {surplus >= 0
                    ? `$${fmt(surplus)}/mo available for HELOC`
                    : `$${fmt(Math.abs(surplus))}/mo over budget — reduce expenses to use HELOC strategy`}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Payoff projection */}
        <View style={[CommonStyles.card, styles.projectionCard]}>
          <View style={styles.projectionHeader}>
            <Text style={styles.cardTitle}>Payoff Projection</Text>
            {!hasRealData && <View style={styles.exampleBadge}><Text style={styles.exampleBadgeText}>Example</Text></View>}
          </View>
          <View style={styles.projectionRow}>
            <View style={styles.projectionItem}>
              <Text style={styles.projectionValue}>{formatMonths(projection.originalMonths)}</Text>
              <Text style={styles.projectionLabel}>Without HELOC</Text>
            </View>
            <View style={styles.projectionDivider}><Ionicons name="arrow-forward" size={20} color={Colors.mint600} /></View>
            <View style={styles.projectionItem}>
              <Text style={[styles.projectionValue, styles.projectionValueAccel]}>
                {formatMonths(projection.acceleratedMonths)}
              </Text>
              <Text style={styles.projectionLabel}>With HELOC</Text>
            </View>
          </View>
          <View style={styles.savingsBanner}>
            <Ionicons name="flash" size={16} color={Colors.mint600} />
            <Text style={styles.savingsBannerText}>
              Save {formatMonths(projection.monthsSaved)} and{' '}
              <Text style={styles.savingsBannerBold}>${projection.interestSaved.toLocaleString()}</Text>{' '}in interest
            </Text>
          </View>

          {/* First milestone: open HELOC when none linked */}
          {!helocAccount && (
            <TouchableOpacity
              style={styles.helocMilestone}
              onPress={() => router.push('/modals/get-heloc')}
              accessibilityLabel="Open HELOC guide"
            >
              <View style={styles.helocMilestoneIcon}>
                <Ionicons name="home-outline" size={18} color={Colors.mint600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.helocMilestoneTitle}>Step 1: Open your HELOC</Text>
                <Text style={styles.helocMilestoneSub}>Tap to see what to look for →</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.mint400} />
            </TouchableOpacity>
          )}

          {/* Payoff progress milestone */}
          {originalMortgage > 0 && (
            <View style={styles.payoffProgress}>
              <View style={styles.payoffProgressHeader}>
                <Text style={styles.payoffProgressLabel}>Principal Paid Off</Text>
                <Text style={styles.payoffProgressPct}>{payoffProgressPct.toFixed(1)}%</Text>
              </View>
              <View style={styles.payoffTrack}>
                <View style={[styles.payoffFill, { width: `${payoffProgressPct}%` }]} />
              </View>
              <Text style={styles.payoffSub}>
                ${fmt(paidDown)} paid • ${fmt(liveMortgage)} remaining
              </Text>
            </View>
          )}
        </View>

        {/* Score breakdown */}
        <View style={CommonStyles.card}>
          <Text style={styles.cardTitle}>Score Breakdown</Text>
          <ScoreBar label="Monthly Surplus"   value={score.surplusScore}     max={55} color={Colors.mint600} />
          <ScoreBar label="HELOC Utilization" value={score.utilizationScore} max={25} color={Colors.info} />
          <ScoreBar label="Credit Score"      value={score.creditPoints}     max={20} color={Colors.success} />
          <View style={styles.mteRow}>
            <Text style={styles.mteLabel}>Home Equity Modifier</Text>
            <Text style={[styles.mteValue, { color: score.mteModifier >= 0 ? Colors.success : Colors.error }]}>
              {score.mteModifier >= 0 ? '+' : ''}{score.mteModifier} pts
            </Text>
          </View>
        </View>

        {/* Automation — Full tier */}
        {tier === 'full' && (
          <View style={[CommonStyles.card, styles.automationCard]}>
            <Text style={styles.cardTitle}>Automation</Text>
            <AutomationRow label="Safe Sweep™" subtitle="Auto-move surplus to HELOC" active />
            <AutomationRow label="Safe Dump™"  subtitle="Auto-dump HELOC to mortgage" active={false} />
            <TouchableOpacity style={styles.automationManageBtn} onPress={() => router.push('/modals/settings')}>
              <Text style={styles.automationManageText}>Manage Automation →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick actions */}
        <View style={styles.quickActionsRow}>
          <QuickAction icon="calculator-outline" label="Calculator" onPress={() => router.push('/tabs/calculator')} />
          <QuickAction icon="wallet-outline"     label="Accounts"   onPress={() => router.push('/tabs/accounts')} />
          <QuickAction icon="bar-chart-outline"  label="Budget"     onPress={() => router.push('/tabs/cashflow')} />
          <QuickAction icon="book-outline"       label="Learn"      onPress={() => router.push('/tabs/learn')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const SIZE = 90, STROKE = 8;
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: STROKE, borderColor: 'rgba(255,255,255,0.2)' }} />
      <Text style={{ color: Colors.white, fontSize: Typography['2xl'], fontWeight: Typography.extrabold }}>{score}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: Typography.xs }}>/ 100</Text>
    </View>
  );
}

function SnapshotStat({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: string;
}) {
  return (
    <View style={styles.snapshotStat}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[styles.snapshotValue, { color }]}>{value}</Text>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotSub}>{sub}</Text>
    </View>
  );
}

function StatCard({ label, value, icon, color, onPress }: {
  label: string; value: string; icon: string; color: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.statCard, Shadows.card]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={styles.scoreBarRow}>
      <Text style={styles.scoreBarLabel}>{label}</Text>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${(value / max) * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.scoreBarValue}>{value}/{max}</Text>
    </View>
  );
}

function AutomationRow({ label, subtitle, active }: { label: string; subtitle: string; active: boolean }) {
  return (
    <View style={styles.automationRow}>
      <View style={[styles.automationDot, { backgroundColor: active ? Colors.success : Colors.gray300 }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.automationLabel}>{label}</Text>
        <Text style={styles.automationSub}>{subtitle}</Text>
      </View>
      <Text style={[styles.automationStatus, { color: active ? Colors.success : Colors.textMuted }]}>{active ? 'Active' : 'Off'}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickActionIcon}><Ionicons name={icon as any} size={22} color={Colors.mint600} /></View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Utilities ─────────────────────────────────────────────────────────────────────────

function firstBalance(account: LinkedAccount | null): number | null {
  if (!account || account.accounts.length === 0) return null;
  return account.accounts[0].balances.current;
}
function firstLimit(account: LinkedAccount | null): number | null {
  if (!account || account.accounts.length === 0) return null;
  return account.accounts[0].balances.limit ?? null;
}
function fmt(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ─── Styles ──────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting:  { fontSize: Typography.xl,  fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  settingsBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  scoreCard:     { borderRadius: Radius.lg, padding: Spacing[5], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...Shadows.glow },
  scoreLeft:     { flex: 1 },
  scoreLabel:    { fontSize: Typography.sm, color: 'rgba(255,255,255,0.8)', fontWeight: Typography.medium },
  scoreEstimate: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2, marginBottom: 4 },
  scoreNumber:   { fontSize: 52, fontWeight: Typography.extrabold, color: Colors.white, lineHeight: 60, marginTop: Spacing[1] },
  scoreBadge:    { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 3, marginTop: Spacing[2], backgroundColor: 'rgba(255,255,255,0.2)' },
  scoreBadgeText:{ fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.white },
  scoreGauge:    { marginLeft: Spacing[4] },

  upgradeBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.mint50, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1, borderColor: Colors.mint200 },
  upgradeText:   { flex: 1, fontSize: Typography.sm, color: Colors.mint700, lineHeight: 18 },
  upgradeLink:   { color: Colors.mint600, fontWeight: Typography.semibold, fontSize: Typography.sm },

  statsRow:  { flexDirection: 'row', gap: Spacing[3] },
  statCard:  { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing[3], gap: Spacing[2], alignItems: 'flex-start' },
  statIcon:  { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  statLabel: { fontSize: Typography.xs, color: Colors.textMuted },

  linkAccountsCta:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing[4], borderWidth: 1.5, borderColor: Colors.mint200, borderStyle: 'dashed', ...Shadows.card },
  linkAccountsIcon: { width: 44, height: 44, borderRadius: Radius.lg, backgroundColor: Colors.mint50, alignItems: 'center', justifyContent: 'center' },
  linkAccountsTitle:{ fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  linkAccountsSub:  { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

  cardTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: Spacing[4] },

  snapshotRow:    { flexDirection: 'row', marginBottom: Spacing[4] },
  snapshotDivider:{ width: 1, backgroundColor: Colors.gray100, marginHorizontal: Spacing[2] },
  snapshotStat:   { flex: 1, alignItems: 'center', gap: 3 },
  snapshotValue:  { fontSize: Typography.lg, fontWeight: Typography.bold },
  snapshotLabel:  { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  snapshotSub:    { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },

  budgetSection: { borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: Spacing[4], gap: Spacing[2] },
  budgetHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetLabel:   { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  budgetNumbers: { fontSize: Typography.sm },
  budgetSpent:   { color: Colors.textPrimary, fontWeight: Typography.semibold },
  budgetOf:      { color: Colors.textMuted },
  budgetTrack:   { height: 8, backgroundColor: Colors.gray100, borderRadius: 4 },
  budgetFill:    { height: 8, borderRadius: 4 },
  budgetNote:    { fontSize: Typography.xs, color: Colors.textMuted },

  projectionCard:       { gap: Spacing[3] },
  projectionHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exampleBadge:         { backgroundColor: Colors.gray100, borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 2 },
  exampleBadgeText:     { fontSize: Typography.xs, color: Colors.textMuted },
  projectionRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: Spacing[3] },
  projectionItem:       { alignItems: 'center', gap: Spacing[1] },
  projectionValue:      { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  projectionValueAccel: { color: Colors.mint600 },
  projectionLabel:      { fontSize: Typography.xs, color: Colors.textMuted },
  projectionDivider:    { paddingHorizontal: Spacing[3] },
  savingsBanner:        { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.mint50, borderRadius: Radius.md, padding: Spacing[3] },
  savingsBannerText:    { fontSize: Typography.sm, color: Colors.mint700, flex: 1, lineHeight: 18 },
  savingsBannerBold:    { fontWeight: Typography.bold },

  payoffProgress:       { borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: Spacing[3], gap: Spacing[2] },
  payoffProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payoffProgressLabel:  { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  payoffProgressPct:    { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.mint600 },
  payoffTrack:          { height: 6, backgroundColor: Colors.gray100, borderRadius: 3 },
  payoffFill:           { height: 6, borderRadius: 3, backgroundColor: Colors.mint600 },
  payoffSub:            { fontSize: Typography.xs, color: Colors.textMuted },
  helocMilestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  helocMilestoneIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: Colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helocMilestoneTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },
  helocMilestoneSub: { fontSize: Typography.xs, color: Colors.mint600 },

  scoreBarRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  scoreBarLabel: { width: 120, fontSize: Typography.sm, color: Colors.textSecondary },
  scoreBarTrack: { flex: 1, height: 6, backgroundColor: Colors.gray100, borderRadius: 3 },
  scoreBarFill:  { height: 6, borderRadius: 3 },
  scoreBarValue: { width: 36, textAlign: 'right', fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textMuted },
  mteRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing[3] },
  mteLabel:      { fontSize: Typography.sm, color: Colors.textSecondary },
  mteValue:      { fontSize: Typography.sm, fontWeight: Typography.bold },

  automationCard:       { gap: Spacing[3] },
  automationRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2] },
  automationDot:        { width: 10, height: 10, borderRadius: 5 },
  automationLabel:      { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  automationSub:        { fontSize: Typography.xs, color: Colors.textMuted },
  automationStatus:     { fontSize: Typography.sm, fontWeight: Typography.medium },
  automationManageBtn:  { paddingTop: Spacing[2] },
  automationManageText: { color: Colors.mint600, fontSize: Typography.sm, fontWeight: Typography.medium },

  quickActionsRow:  { flexDirection: 'row', gap: Spacing[3] },
  quickAction:      { flex: 1, alignItems: 'center', gap: Spacing[2] },
  quickActionIcon:  { width: 52, height: 52, borderRadius: Radius.lg, backgroundColor: Colors.mint50, borderWidth: 1, borderColor: Colors.mint200, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: Typography.xs, color: Colors.textSecondary, textAlign: 'center' },
});
