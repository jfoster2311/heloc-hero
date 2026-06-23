// app/tabs/dashboard.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
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

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
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

  // ── Card data: HELOC utilization + next-dump ────────────────────────────
  // When Plaid isn't linked, fall back to a surplus-derived estimate so cards
  // look populated (per CLAUDE.md: use demo seed values where live data absent).
  const fallbackHelocLimit  = Math.max(25_000, Math.min(Math.max(0, surplus) * 12, 150_000)) || 50_000;
  const displayHelocBalance = helocBalance ?? 0;
  const displayHelocLimit   = helocLimit   ?? fallbackHelocLimit;
  const effectiveDump       = displayHelocLimit > 0
    ? Math.min(displayHelocLimit, Math.max(0, surplus * 12))
    : Math.max(0, surplus * 12);

  // ── DEV-ONLY: restart / reset onboarding flow ─────────────────────────────
  // __DEV__ is false in production — Metro dead-strips this function entirely.
  function handleDevTools() {
    if (!__DEV__) return;
    Alert.alert('DEV Tools', 'Onboarding flow', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Preview (keep data)',
        onPress: () => router.replace('/onboarding/welcome' as never),
      },
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
      <NotificationPrimer triggerKey={profile?.id ?? null} />
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}` : 'Dashboard'}
          </Text>
          <Text style={styles.headerSub}>Your mortgage payoff dashboard</Text>
        </View>
        <View style={styles.headerRight}>
          {/* DEV-ONLY badge — never visible in production builds */}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.devBadge}
              onPress={handleDevTools}
              accessibilityLabel="DEV tools"
            >
              <Text style={styles.devBadgeText}>DEV</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/modals/settings')}>
            <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.mint600} />}
      >
        {/* Payoff headline — screen focal point */}
        <View style={styles.payoffHeroCard}>
          {!hasRealData && (
            <View style={styles.payoffHeroBadge}>
              <Text style={styles.payoffHeroBadgeText}>Example</Text>
            </View>
          )}
          <Text style={styles.payoffHeroEyebrow}>PROJECTED MORTGAGE-FREE DATE</Text>
          <Text style={styles.payoffHeroValue}>
            {formatMonths(projection.acceleratedMonths)}
          </Text>
          <Text style={styles.payoffHeroDate}>
            {fmtPayoffDate(projection.acceleratedPayoffDate)}
          </Text>
          {projection.monthsSaved > 0 && (
            <View style={styles.payoffHeroSavingsRow}>
              <Ionicons name="flash" size={13} color={Colors.mint600} />
              <Text style={styles.payoffHeroSavingsSub}>
                {formatMonths(projection.monthsSaved)} sooner than without HELOC Hero
              </Text>
            </View>
          )}
        </View>

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

        {/* ── Interest Saved Hero ─────────────────────────────────────────── */}
        <InterestHeroCard
          interestSaved={projection.interestSaved}
          monthsSaved={projection.monthsSaved}
          hasDumped={streak > 0}
          onCTA={() => { hapticLight(); router.push('/tabs/cashflow' as never); }}
        />

        {/* Upgrade prompt — free tier */}
        {tier === 'free' && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            onPress={() => { hapticLight(); router.push('/modals/upgrade'); }}
          >
            <Ionicons name="star-outline" size={18} color={Colors.mint600} />
            <Text style={styles.upgradeText}>
              Connect real accounts for a live score, projections & budget tracking
            </Text>
            <Text style={styles.upgradeLink}>Upgrade →</Text>
          </TouchableOpacity>
        )}

        {/* Streak strip */}
        {streak > 0 && (
          <View style={styles.streakStrip}>
            <Ionicons name="flame-outline" size={16} color={Colors.mint600} />
            <Text style={styles.streakText}>
              {streak}-month cycling streak — keep it going
            </Text>
          </View>
        )}

        {/* ── HELOC Utilization ───────────────────────────────────────────── */}
        <HelocUtilCard
          balance={displayHelocBalance}
          limit={displayHelocLimit}
          hasLiveData={helocBalance !== null}
          onPress={() => { hapticLight(); router.push('/tabs/accounts' as never); }}
        />

        {/* ── Next Dump ───────────────────────────────────────────────────── */}
        <NextDumpCard
          surplus={surplus}
          helocDrawn={displayHelocBalance}
          dumpAmount={effectiveDump}
          hasLiveData={helocBalance !== null}
          onPress={() => { hapticLight(); router.push('/tabs/cashflow' as never); }}
        />

        {/* Account stats */}
        {hasLinkedAccounts ? (
          <View style={styles.statsRow}>
            <StatCard label="Mortgage"  value={mortgageBalance !== null ? `$${fmt(mortgageBalance)}` : '—'} icon="home-outline"   color={Colors.mint600}    onPress={() => router.push('/tabs/accounts')} />
            <StatCard label="HELOC"     value={helocBalance    !== null ? `$${fmt(helocBalance)}`    : '—'} icon="card-outline"   color={Colors.mint400} onPress={() => router.push('/tabs/accounts')} />
            <StatCard label="Savings"   value={savingsBalance  !== null ? `$${fmt(savingsBalance)}`  : '—'} icon="wallet-outline" color={Colors.mint600} onPress={() => router.push('/tabs/accounts')} />
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
                color={savingsRate >= 20 ? Colors.mint600 : savingsRate >= 10 ? Colors.mint400 : Colors.gray400}
                icon="flash-outline"
              />
              <View style={styles.snapshotDivider} />
              <SnapshotStat
                label="Debt Ratio"
                value={income > 0 ? `${debtRatio.toFixed(0)}%` : '—'}
                sub={debtRatio <= 36 ? 'Healthy' : debtRatio <= 50 ? 'Moderate' : 'High'}
                color={debtRatio <= 36 ? Colors.mint600 : debtRatio <= 50 ? Colors.mint400 : Colors.gray400}
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
                          budgetPct > 95 ? Colors.gray400 :
                          budgetPct > 80 ? Colors.gray400 :
                          Colors.mint600,
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
          <ScoreBar label="HELOC Utilization" value={score.utilizationScore} max={25} color={Colors.mint400} />
          <ScoreBar label="Credit Score"      value={score.creditPoints}     max={20} color={Colors.mint600} />
          <View style={styles.mteRow}>
            <Text style={styles.mteLabel}>Home Equity Modifier</Text>
            <Text style={[styles.mteValue, { color: score.mteModifier >= 0 ? Colors.mint600 : Colors.gray400 }]}>
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
      <View style={[styles.automationDot, { backgroundColor: active ? Colors.mint600 : Colors.gray300 }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.automationLabel}>{label}</Text>
        <Text style={styles.automationSub}>{subtitle}</Text>
      </View>
      <Text style={[styles.automationStatus, { color: active ? Colors.mint600 : Colors.textMuted }]}>{active ? 'Active' : 'Off'}</Text>
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

// ─── New card sub-components ───────────────────────────────────────────────────────────

function InterestHeroCard({
  interestSaved, monthsSaved, hasDumped, onCTA,
}: {
  interestSaved: number; monthsSaved: number; hasDumped: boolean; onCTA: () => void;
}) {
  const savedK   = Math.round(interestSaved / 1_000);
  const savedFmt = '$' + Math.round(interestSaved).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const yearsFmt = formatMonths(monthsSaved);

  if (!hasDumped) {
    return (
      <View style={styles.interestCard}>
        <Text style={styles.cardEyebrow}>YOUR POTENTIAL SAVINGS</Text>

        <View style={styles.interestColdStats}>
          <View style={styles.interestColdStat}>
            <Text style={styles.interestColdStatNum}>
              {savedK > 0 ? `~$${savedK}k` : '—'}
            </Text>
            <Text style={styles.interestColdStatLabel}>projected interest saved</Text>
          </View>
          <View style={styles.interestColdStatDivider} />
          <View style={styles.interestColdStat}>
            <Text style={styles.interestColdStatNum}>~{yearsFmt}</Text>
            <Text style={styles.interestColdStatLabel}>off your payoff date</Text>
          </View>
        </View>

        <Text style={styles.interestColdBody}>
          One dump changes everything. Start cycling to watch these estimates become real savings.
        </Text>

        <TouchableOpacity style={styles.interestCTA} onPress={onCTA} activeOpacity={0.82}>
          <Text style={styles.interestCTAText}>Start your first cycle</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.white} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1a9e7a', '#0d7a5e']} style={styles.interestCardHot}>
      <View style={styles.interestHotBadge}>
        <Ionicons name="flash" size={14} color={Colors.mint100} />
        <Text style={styles.interestHotEyebrow}>PROJECTED INTEREST SAVED</Text>
      </View>
      <Text style={styles.interestHotNum}>{savedFmt}</Text>
      <View style={styles.interestHotSubRow}>
        <Ionicons name="trending-up-outline" size={14} color="rgba(255,255,255,0.8)" />
        <Text style={styles.interestHotSub}>
          {yearsFmt} sooner · your strategy is working
        </Text>
      </View>
    </LinearGradient>
  );
}

function HelocUtilCard({
  balance, limit, hasLiveData, onPress,
}: {
  balance: number; limit: number; hasLiveData: boolean; onPress: () => void;
}) {
  const pct       = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0;
  const available = Math.max(0, limit - balance);
  const barColor  = pct > 80 ? Colors.gray400 : Colors.mint600;
  const insight   = pct > 80 ? 'High utilization — consider replenishing soon'
                  : pct > 40 ? 'Moderate — keep adding surplus to prep for your next dump'
                  : pct > 0  ? 'Replenishing well — keep the surplus flowing'
                  : 'HELOC fully replenished — ready to dump';

  return (
    <TouchableOpacity style={styles.utilCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.utilHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardEyebrow}>HELOC UTILIZATION</Text>
          {!hasLiveData && (
            <Text style={styles.utilNote}>Estimated · link accounts for live data</Text>
          )}
        </View>
        <Text style={styles.utilPct}>{pct.toFixed(0)}%</Text>
      </View>

      <View style={styles.utilAmountRow}>
        <Text style={styles.utilDrawnAmt}>${fmt(balance)}</Text>
        <Text style={styles.utilAmtSep}> drawn  ·  </Text>
        <Text style={styles.utilAvailAmt}>${fmt(available)}</Text>
        <Text style={styles.utilAmtSep}> available</Text>
      </View>

      <View style={styles.utilTrack}>
        <View style={[styles.utilFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>

      <View style={styles.utilRangeRow}>
        <Text style={styles.utilRangeLabel}>$0</Text>
        <Text style={styles.utilRangeLabel}>${fmt(limit)} limit</Text>
      </View>

      <View style={styles.utilFooterRow}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.utilFooterText}>{insight}</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.gray300} />
      </View>
    </TouchableOpacity>
  );
}

function NextDumpCard({
  surplus, helocDrawn, dumpAmount, hasLiveData, onPress,
}: {
  surplus: number; helocDrawn: number; dumpAmount: number;
  hasLiveData: boolean; onPress: () => void;
}) {
  const monthsUntil = surplus > 0 && helocDrawn > 0
    ? Math.max(1, Math.ceil(helocDrawn / surplus))
    : 0;
  const readyNow  = monthsUntil === 0;
  const dumpFmt   = '$' + fmt(Math.round(dumpAmount));
  const replenPct = dumpAmount > 0 && helocDrawn <= dumpAmount
    ? Math.round((1 - helocDrawn / dumpAmount) * 100)
    : 0;

  return (
    <TouchableOpacity
      style={[styles.dumpCard, readyNow && styles.dumpCardReady]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.dumpHeader}>
        <Text style={styles.cardEyebrow}>NEXT DUMP</Text>
        <View style={[styles.dumpBadge, { backgroundColor: readyNow ? Colors.mint600 : Colors.mint100 }]}>
          <Text style={[styles.dumpBadgeText, { color: readyNow ? Colors.white : Colors.mint700 }]}>
            {readyNow ? 'Ready now' : `~${monthsUntil} mo`}
          </Text>
        </View>
      </View>

      {readyNow ? (
        <>
          <Text style={styles.dumpTitle}>Your HELOC is replenished.</Text>
          <Text style={styles.dumpBody}>
            Dump{' '}
            <Text style={styles.dumpAmount}>{dumpFmt}</Text>
            {' '}onto your mortgage principal to accelerate your payoff.
          </Text>

          <View style={styles.dumpImpactRow}>
            <Ionicons name="flash" size={15} color={Colors.mint600} />
            <Text style={styles.dumpImpactText}>
              Reduces your principal by{' '}
              <Text style={styles.dumpImpactBold}>{dumpFmt}</Text>
              {' '}immediately
            </Text>
          </View>

          <View style={styles.dumpActionBtn}>
            <Text style={styles.dumpActionBtnText}>Execute dump</Text>
            <Ionicons name="arrow-forward" size={15} color={Colors.white} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.dumpTitle}>Replenishing HELOC…</Text>
          <Text style={styles.dumpBody}>
            On track to dump{' '}
            <Text style={styles.dumpAmount}>{dumpFmt}</Text>
            {' '}in ~{monthsUntil} month{monthsUntil !== 1 ? 's' : ''}.
          </Text>

          <View style={styles.dumpReplenTrack}>
            <View style={[styles.dumpReplenFill, { width: `${replenPct}%` as any }]} />
          </View>
          <View style={styles.dumpReplenRow}>
            <Text style={styles.dumpReplenLabel}>{replenPct}% replenished</Text>
            <Text style={styles.dumpReplenLabel}>{dumpFmt} target</Text>
          </View>

          <View style={styles.dumpCTARow}>
            <Text style={styles.dumpCTAText}>View cycle details</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.mint600} />
          </View>
        </>
      )}

      {!hasLiveData && (
        <Text style={styles.utilNote}>Estimated · link accounts for live data</Text>
      )}
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
function fmtPayoffDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
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
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  devBadge: {
    backgroundColor: '#7C3AED',   // purple — unmistakably not production UI
    borderRadius:    Radius.sm,
    paddingHorizontal: Spacing[2],
    paddingVertical:   3,
  },
  devBadgeText: {
    fontSize:      10,
    fontWeight:    Typography.extrabold,
    color:         '#fff',
    letterSpacing: 1,
  },
  greeting:  { fontSize: Typography.xl,  fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  settingsBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  payoffHeroCard: {
    backgroundColor: Colors.mint50,
    borderRadius:    Radius.xl,
    padding:         Spacing[5],
    borderWidth:     1,
    borderColor:     Colors.mint200,
    alignItems:      'center',
    gap:             Spacing[1],
    ...Shadows.card,
  },
  payoffHeroBadge: {
    position:          'absolute',
    top:               Spacing[3],
    right:             Spacing[3],
    backgroundColor:   Colors.gray100,
    borderRadius:      Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical:   2,
  },
  payoffHeroBadgeText: { fontSize: Typography.xs, color: Colors.textMuted },
  payoffHeroEyebrow: {
    fontSize:      10,
    fontWeight:    Typography.extrabold,
    color:         Colors.mint400,
    letterSpacing: 1.4,
    marginBottom:  Spacing[1],
  },
  payoffHeroValue: {
    fontSize:   Typography['3xl'],
    fontWeight: Typography.extrabold,
    color:      Colors.mint700,
  },
  payoffHeroDate: {
    fontSize:   Typography.base,
    fontWeight: Typography.semibold,
    color:      Colors.mint600,
  },
  payoffHeroSavingsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    marginTop:     Spacing[1],
  },
  payoffHeroSavingsSub: {
    fontSize: Typography.sm,
    color:    Colors.mint600,
  },

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
  streakStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2] + 2,
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  streakText: { fontSize: Typography.sm, color: Colors.mint700, fontWeight: Typography.medium },

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

  // ── Shared eyebrow ──────────────────────────────────────────────────────────
  cardEyebrow: {
    fontSize:      10,
    fontWeight:    Typography.extrabold,
    color:         Colors.mint400,
    letterSpacing: 1.4,
    marginBottom:  Spacing[1],
  },

  // ── Interest Saved Hero card ────────────────────────────────────────────────
  interestCard: {
    backgroundColor: Colors.mint50,
    borderRadius:    Radius.xl,
    padding:         Spacing[6],
    borderWidth:     1,
    borderColor:     Colors.mint200,
    gap:             Spacing[4],
    ...Shadows.card,
  },
  interestCardHot: {
    borderRadius: Radius.xl,
    padding:      Spacing[6],
    gap:          Spacing[2],
    ...Shadows.glow,
  },
  interestHotBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[1] + 2,
  },
  interestHotEyebrow: {
    fontSize:      10,
    fontWeight:    Typography.extrabold,
    color:         'rgba(255,255,255,0.75)',
    letterSpacing: 1.4,
  },
  interestHotNum: {
    fontSize:   56,
    fontWeight: Typography.extrabold,
    color:      Colors.white,
    lineHeight: 64,
    marginTop:  Spacing[1],
  },
  interestHotSubRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[1] + 2,
    marginTop:     Spacing[1],
  },
  interestHotSub: {
    fontSize:   Typography.sm,
    color:      'rgba(255,255,255,0.85)',
    fontWeight: Typography.medium,
  },
  interestColdStats: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[3],
  },
  interestColdStat: {
    flex:       1,
    alignItems: 'center',
    gap:        Spacing[1],
  },
  interestColdStatDivider: {
    width:           1,
    height:          44,
    backgroundColor: Colors.mint200,
  },
  interestColdStatNum: {
    fontSize:   Typography['2xl'],
    fontWeight: Typography.extrabold,
    color:      Colors.mint700,
    lineHeight: 30,
  },
  interestColdStatLabel: {
    fontSize:  Typography.xs,
    color:     Colors.textMuted,
    textAlign: 'center',
  },
  interestColdBody: {
    fontSize:   Typography.sm,
    color:      Colors.textSecondary,
    lineHeight: 21,
  },
  interestCTA: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.mint600,
    borderRadius:    Radius.md,
    paddingVertical: Spacing[4],
    gap:             Spacing[2],
    ...Shadows.glow,
  },
  interestCTAText: {
    color:      Colors.white,
    fontWeight: Typography.semibold,
    fontSize:   Typography.base,
  },

  // ── HELOC Utilization card ──────────────────────────────────────────────────
  utilCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.xl,
    padding:         Spacing[5],
    gap:             Spacing[3],
    ...Shadows.card,
  },
  utilHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  utilPct: {
    fontSize:   Typography['3xl'],
    fontWeight: Typography.extrabold,
    color:      Colors.mint600,
    lineHeight: 38,
  },
  utilAmountRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    flexWrap:      'wrap',
  },
  utilDrawnAmt: {
    fontSize:   Typography.xl,
    fontWeight: Typography.bold,
    color:      Colors.textPrimary,
  },
  utilAmtSep: {
    fontSize: Typography.base,
    color:    Colors.textMuted,
  },
  utilAvailAmt: {
    fontSize:   Typography.xl,
    fontWeight: Typography.bold,
    color:      Colors.mint600,
  },
  utilNote: {
    fontSize:  Typography.xs,
    color:     Colors.textMuted,
    marginTop: 2,
  },
  utilTrack: {
    height:          14,
    backgroundColor: Colors.gray100,
    borderRadius:    7,
    overflow:        'hidden',
  },
  utilFill: {
    height:       14,
    borderRadius: 7,
  },
  utilRangeRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      -Spacing[1],
  },
  utilRangeLabel: {
    fontSize: Typography.xs,
    color:    Colors.textMuted,
  },
  utilFooterRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing[1] + 2,
    paddingTop:     Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  utilFooterText: {
    flex:     1,
    fontSize: Typography.sm,
    color:    Colors.textSecondary,
  },

  // ── Next Dump card ──────────────────────────────────────────────────────────
  dumpCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.xl,
    padding:         Spacing[5],
    gap:             Spacing[3],
    borderWidth:     1.5,
    borderColor:     Colors.mint200,
    ...Shadows.card,
  },
  dumpCardReady: {
    borderColor:     Colors.mint600,
    backgroundColor: Colors.mint50,
  },
  dumpHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  dumpBadge: {
    borderRadius:      Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical:   4,
  },
  dumpBadgeText: {
    fontSize:   Typography.xs,
    fontWeight: Typography.bold,
  },
  dumpTitle: {
    fontSize:   Typography.base,
    fontWeight: Typography.semibold,
    color:      Colors.textPrimary,
  },
  dumpAmount: {
    color:      Colors.mint600,
    fontWeight: Typography.bold,
  },
  dumpBody: {
    fontSize:   Typography.sm,
    color:      Colors.textSecondary,
    lineHeight: 20,
  },
  dumpImpactRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing[2],
    backgroundColor: Colors.mint100,
    borderRadius:    Radius.md,
    padding:         Spacing[3],
  },
  dumpImpactText: {
    flex:       1,
    fontSize:   Typography.sm,
    color:      Colors.mint700,
    lineHeight: 20,
  },
  dumpImpactBold: {
    fontWeight: Typography.bold,
    color:      Colors.mint700,
  },
  dumpActionBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.mint600,
    borderRadius:    Radius.md,
    paddingVertical: Spacing[3] + 2,
    gap:             Spacing[2],
    ...Shadows.glow,
  },
  dumpActionBtnText: {
    fontSize:   Typography.base,
    fontWeight: Typography.semibold,
    color:      Colors.white,
  },
  dumpReplenTrack: {
    height:          10,
    backgroundColor: Colors.gray100,
    borderRadius:    5,
    overflow:        'hidden',
  },
  dumpReplenFill: {
    height:          10,
    borderRadius:    5,
    backgroundColor: Colors.mint400,
  },
  dumpReplenRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      -Spacing[1],
  },
  dumpReplenLabel: {
    fontSize: Typography.xs,
    color:    Colors.textMuted,
  },
  dumpCTARow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing[1],
    paddingTop:     Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  dumpCTAText: {
    fontSize:   Typography.sm,
    fontWeight: Typography.semibold,
    color:      Colors.mint600,
  },
});
