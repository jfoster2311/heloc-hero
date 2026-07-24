// app/tabs/accounts.tsx — where every number on the dashboard comes from.
//
// Six sections, in the order a doubt arrives: what is connected and how fresh
// it is, what the servicer says about the mortgage, what the user had to tell
// us about the HELOC, what the home is worth, what the projection assumes, and
// how to leave.
//
// The through-line is provenance. This screen mixes servicer-reported figures,
// bank balances, values the user typed months ago, and the app's own
// arithmetic, and the difference between those is exactly what someone needs
// before acting on a recommendation. So every value carries where it came
// from, and freshness is displayed as a feature rather than as debug detail —
// a stale balance is how a wrong recommendation gets made.
import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Share, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import {
  Card, CardHead, Chip, DataRow, Meter, SectionLabel, SourceNote,
  EmptyState, LinkRow, Divider, Disclosure,
} from '../../components/ui/primitives';
import EquityCurve from '../../components/EquityCurve';
import InstitutionAvatar from '../../components/ui/InstitutionAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useIsPro } from '../../hooks/useIsPro';
import { useFinancials } from '../../hooks/useFinancials';
import { invokeFunction } from '../../lib/supabase';
import { formatMonths, computeEquitySeries } from '../../lib/projections';
import { daysSinceVerified } from '../../lib/helocTerms';
import {
  INTEREST_CALC_LABEL, INTEREST_CALC_EXPLAINER, HOME_VALUE_SOURCE_LABEL,
  RATE_STRESS_STEPS_BPS, STALE_SYNC_HOURS,
} from '../../lib/config';
import { isPaidTier } from '../../lib/pricing';
import { hapticLight } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, OnDark, CommonStyles, TAB_BAR_CLEARANCE } from '../../lib/theme';
import { parseDate, type Sourced } from '../../lib/mortgage';
import type { LinkedAccount, PlaidAccountType } from '../../lib/types';

export default function AccountsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tier, updateProfile } = useAuth();
  const { isPro } = useIsPro();
  const f = useFinancials();
  const [unlinking, setUnlinking] = useState<PlaidAccountType | null>(null);

  const canLink = isPro;

  async function handleDisconnect(account: LinkedAccount) {
    Alert.alert(
      `Disconnect ${account.institution_name ?? 'this institution'}?`,
      'We will revoke our access at your bank and delete the balances we hold. ' +
      'Anything you entered by hand stays. You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (!profile?.id) return;
            setUnlinking(account.account_type);
            try {
              await invokeFunction('plaid-unlink', {
                userId: profile.id,
                accountType: account.account_type,
              });
              await f.refresh();
            } catch (err) {
              Alert.alert(
                'Could not disconnect',
                `${err instanceof Error ? err.message : 'Unknown error'}\n\n` +
                'Your account is still connected. Please try again.',
              );
            } finally {
              setUnlinking(null);
            }
          },
        },
      ],
    );
  }

  async function handleExport() {
    const rows = buildCsv(f);
    try {
      await Share.share({ title: 'HELOC Hero data export', message: rows });
    } catch {
      // User cancelled the share sheet. Nothing to report.
    }
  }

  // Same model as the payoff projection, so the curve and the date beneath it
  // can never tell different stories.
  const equitySeries = useMemo(() => {
    if (f.homeValue === null || f.mortgageBalance === null || f.mortgageBalance <= 0) return null;
    return computeEquitySeries(
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
  }, [f.homeValue, f.mortgageBalance, f.mortgage.rate.value, f.payment, f.surplus, f.helocRate, f.helocLimit]);

  const drawEnd = parseDate(profile?.heloc_draw_end_date);
  const drawEndLabel = drawEnd ? fmtMonthYear(drawEnd) : null;
  const sinceVerified = daysSinceVerified(profile?.heloc_terms_updated_at);

  return (
    <View style={CommonStyles.screenContainer}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={f.refreshing} onRefresh={f.refresh} tintColor={Colors.mint600} />
        }
      >
        {/* ── HERO — the position, summarised ───────────────────────────── */}
        <Hero
          intensity={0.7}
          topBar={
            <View style={styles.topBar}>
              <Text style={styles.topTitle}>Accounts</Text>
              {canLink && (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => router.push('/modals/link-account')}
                  accessibilityLabel="Link an account"
                >
                  <Ionicons name="add" size={16} color={OnDark.primary} />
                  <Text style={styles.addBtnText}>Link</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        >
          <Text style={styles.heroEyebrow}>ESTIMATED HOME EQUITY</Text>
          <HeroValue>
            {f.equity !== null ? `$${fmt(f.equity)}` : '—'}
          </HeroValue>
          <HeroCaption>
            {f.equity !== null && f.combinedLTV !== null
              ? `${Math.round(f.combinedLTV * 100)}% combined loan-to-value on a home value you entered`
              : 'Add your home value to see equity and combined LTV'}
          </HeroCaption>

          {/* Forward only. See components/EquityCurve for why there is no
              history here — the app stores two balance snapshots, not a series,
              and a chart of the past would be a chart of nothing. */}
          {equitySeries && (
            <View style={{ marginTop: Spacing[5] }}>
              <EquityCurve
                series={equitySeries}
                payoffDate={f.projection.acceleratedPayoffDate}
                hasRealData={f.hasRealData}
              />
            </View>
          )}
        </Hero>

        <View style={styles.content}>
          {/* ── 1. CONNECTED ACCOUNTS ──────────────────────────────────── */}
          <SectionLabel>CONNECTED ACCOUNTS</SectionLabel>

          {f.accounts.length > 0 ? (
            f.accounts.map(account => (
              <ConnectionCard
                key={account.id}
                account={account}
                busy={unlinking === account.account_type}
                onRefresh={f.refresh}
                onReconnect={() => router.push('/modals/link-account')}
                onDisconnect={() => handleDisconnect(account)}
              />
            ))
          ) : (
            <Card>
              <EmptyState
                icon="link-outline"
                title="Nothing connected yet"
                body={canLink
                  ? 'Everything below works from figures you enter. Connecting a bank replaces those with live balances and, for many servicers, your real mortgage terms.'
                  : 'Everything below works from figures you enter. Pro adds live balances and servicer-reported mortgage terms.'}
                action={{
                  label: canLink ? 'Connect an account' : 'See Pro',
                  onPress: () => router.push(canLink ? '/modals/link-account' : '/modals/upgrade'),
                }}
              />
            </Card>
          )}

          {/* ── 2. MORTGAGE ────────────────────────────────────────────── */}
          <SectionLabel>MORTGAGE</SectionLabel>
          <Card>
            <CardHead
              title={f.mortgage.isLive ? 'Reported by your servicer' : 'Your figures'}
              right={
                <Chip
                  label={f.mortgage.isLive ? 'live' : 'entered'}
                  icon={f.mortgage.isLive ? 'shield-checkmark-outline' : 'create-outline'}
                  tone={f.mortgage.isLive ? 'accent' : 'neutral'}
                />
              }
            />

            {/* A prepayment penalty gates the entire strategy, so it is stated
                before any of the numbers it would undermine. */}
            {f.mortgage.hasPrepaymentPenalty.value === true && (
              <View style={styles.warnBlock}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.textPrimary} />
                <Text style={styles.warnText}>
                  This mortgage carries a prepayment penalty. Paying principal ahead of
                  schedule may cost you a fee that offsets the interest saved — check the
                  terms before cycling.
                </Text>
              </View>
            )}

            {/* The four a person actually came here to check. */}
            <SourcedRow label="Balance"           v={f.mortgage.balance}         fmtV={money} />
            <SourcedRow label="Interest rate"     v={f.mortgage.rate}            fmtV={rate} />
            <SourcedRow label="Next payment"      v={f.mortgage.nextPayment}     fmtV={money} />
            <SourcedRow label="Interest paid YTD" v={f.mortgage.ytdInterestPaid} fmtV={money} last />

            <Disclosure count={8}>
              <SourcedRow label="Rate type"          v={f.mortgage.rateType}           fmtV={titleCase} />
              <SourcedRow label="Term"               v={f.mortgage.termMonths}         fmtV={months} />
              <SourcedRow label="Maturity"           v={f.mortgage.maturityDate}       fmtV={dateStr} />
              <SourcedRow label="Next due"           v={f.mortgage.nextPaymentDueDate} fmtV={dateStr} />
              <SourcedRow label="Escrow balance"     v={f.mortgage.escrowBalance}      fmtV={money} />
              <SourcedRow label="Principal paid YTD" v={f.mortgage.ytdPrincipalPaid}   fmtV={money} />
              <SourcedRow label="Originated"         v={f.mortgage.originationDate}    fmtV={dateStr} />
              <SourcedRow label="Original principal" v={f.mortgage.originationPrincipal} fmtV={money} last />
            </Disclosure>

            {!f.mortgage.isLive && (
              <SourceNote>
                Not every servicer shares loan terms through a bank connection. These are the
                figures you entered — keeping them current keeps the payoff date honest.
              </SourceNote>
            )}

            <LinkRow
              icon="create-outline"
              label="Edit mortgage details"
              sub="Origination, term, and prepayment penalty"
              onPress={() => router.push('/modals/mortgage-details' as never)}
            />
          </Card>

          {/* ── 3. HELOC TERMS ─────────────────────────────────────────── */}
          <SectionLabel>HELOC TERMS</SectionLabel>
          <Card>
            <CardHead
              title="You told us these"
              right={
                <Chip
                  label={sinceVerified === null
                    ? 'not confirmed'
                    : `confirmed ${sinceVerified}d ago`}
                  tone={f.helocTermsStale ? 'neutral' : 'accent'}
                />
              }
            />
            <SourceNote>
              No provider reports HELOC terms — not Plaid, not MX, not any of them. Every
              line here came from you, so it is only as current as the last statement you
              checked.
            </SourceNote>

            {/* The four terms that decide whether cycling works at all. The
                fees matter, but they are a question someone asks once. */}
            <DataRow label="Credit limit" value={f.helocLimit !== null ? money(f.helocLimit) : '—'}
              hint={limitSourceHint(f.helocLimitSource)} />
            <DataRow label="Current APR" value={f.helocRateAssumed ? 'not set' : rate(f.helocRate)}
              hint={f.helocRateAssumed ? 'Projections assume 8.5% until you set it' : undefined} />
            <DataRow label="Payments"
              value={profile?.heloc_payment_type === 'interest_only' ? 'Interest-only'
                : profile?.heloc_payment_type === 'amortizing' ? 'Amortizing' : '—'}
              hint={profile?.heloc_payment_type === 'amortizing'
                ? 'Cycling does not work on an amortizing line'
                : undefined} />
            <DataRow label="Draw period ends" value={drawEndLabel ?? '—'} last />

            <Disclosure count={5} label="terms and fees">
              <DataRow label="Rate index" value={profile?.heloc_rate_index || '—'} />
              <DataRow label="Margin over index"
                value={profile?.heloc_margin != null ? rate(profile.heloc_margin) : '—'} />
              <DataRow label="Draw fee"
                value={profile?.heloc_draw_fee != null ? money(profile.heloc_draw_fee) : '—'} />
              <DataRow label="Annual fee"
                value={profile?.heloc_annual_fee != null ? money(profile.heloc_annual_fee) : '—'} />
              <DataRow label="Early closure fee"
                value={profile?.heloc_early_closure_fee != null ? money(profile.heloc_early_closure_fee) : '—'}
                last />
            </Disclosure>

            {/* The one term that decides whether the strategy works at all, so
                it gets its own block and an explainer rather than a row. */}
            <View style={styles.calcBlock}>
              <Text style={styles.calcLabel}>How interest is calculated</Text>
              <Text style={styles.calcValue}>
                {profile?.heloc_interest_calc_method
                  ? INTEREST_CALC_LABEL[profile.heloc_interest_calc_method]
                  : 'Not set'}
              </Text>
              <Text style={styles.calcExplainer}>
                {profile?.heloc_interest_calc_method
                  ? INTEREST_CALC_EXPLAINER[profile.heloc_interest_calc_method]
                  : 'This one line decides whether cycling saves anything on your account. ' +
                    'Until you set it, projections here assume the strategy works as intended, ' +
                    'which may not be true of your line.'}
              </Text>
            </View>

            {/* Phrased as a question. "Re-verify your terms" is a chore; asking
                whether something is still true is a thing a person can answer. */}
            {f.helocTermsStale && (
              <View style={styles.nudge}>
                <Text style={styles.nudgeText}>
                  {sinceVerified === null
                    ? 'What does your HELOC statement say your rate is?'
                    : `It has been ${sinceVerified} days — is your rate still ${rate(f.helocRate)}?`}
                </Text>
              </View>
            )}

            <LinkRow
              icon="create-outline"
              label="Update HELOC terms"
              onPress={() => router.push('/modals/heloc-terms' as never)}
            />
          </Card>

          {/* ── 4. HOME EQUITY ─────────────────────────────────────────── */}
          <SectionLabel>HOME EQUITY</SectionLabel>
          <Card>
            <CardHead title="What the home is worth" />

            <DataRow label="Estimated value"
              value={f.homeValue !== null ? money(f.homeValue) : '—'}
              hint={profile?.home_value_source
                ? HOME_VALUE_SOURCE_LABEL[profile.home_value_source]
                : 'you entered this'} />
            <DataRow label="Estimated equity" value={f.equity !== null ? money(f.equity) : '—'} />
            <DataRow label="Combined LTV"
              value={f.combinedLTV !== null ? `${Math.round(f.combinedLTV * 100)}%` : '—'} last />

            <Disclosure count={4} label="details">
              <DataRow label="Property"
                value={f.mortgage.propertyAddress.value ?? '—'}
                hint={f.mortgage.propertyAddress.source === 'liability' ? 'from your servicer' : undefined} />
              <DataRow label="Value as of"
                value={f.homeValueAsOf
                  ? f.homeValueAsOf.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : '—'} />
              <DataRow label="Mortgage balance" value={f.mortgageBalance !== null ? money(f.mortgageBalance) : '—'} />
              <DataRow label="HELOC drawn" value={f.helocDrawn !== null ? money(f.helocDrawn) : '—'} last />
            </Disclosure>

            {f.combinedLTV !== null && (
              <Meter value={f.combinedLTV} tone={f.combinedLTV > 0.8 ? 'muted' : 'accent'} height={8} />
            )}

            <SourceNote>
              Equity here is an estimate built on a value you provided, not an appraisal or
              an automated valuation. Lenders will reach their own number.
            </SourceNote>

            <LinkRow
              icon="home-outline"
              label="Update home value"
              onPress={() => router.push('/modals/home-value' as never)}
            />
          </Card>

          {/* ── 5. ASSUMPTIONS ─────────────────────────────────────────── */}
          <SectionLabel>ASSUMPTIONS</SectionLabel>
          <Card>
            <CardHead title="What the projection assumes" />

            <DataRow label="Monthly income" value={money(f.income)}
              onPress={() => router.push('/modals/assumptions' as never)} />
            <DataRow label="Monthly expenses" value={money(f.expenses)}
              onPress={() => router.push('/modals/assumptions' as never)} />
            <DataRow label="Mortgage payment" value={money(f.payment)} />
            <DataRow label="Monthly surplus" value={money(f.surplus)}
              hint="Income minus expenses and your payment. Not derived from transactions." />
            <DataRow label="Replenish threshold"
              value={`${Math.round(f.replenishThreshold * 100)}%`}
              hint="How far the line may be drawn before surplus goes back to it"
              onPress={() => router.push('/modals/assumptions' as never)} last />

            <Divider />

            {/* Rate stress. Pure arithmetic, no external data, and the best
                answer to "what if rates spike" — which is the first question a
                skeptical spouse asks. It teaches the user to test the base case
                rather than trust it. */}
            <View style={styles.stressBlock}>
              <Text style={styles.stressTitle}>If your HELOC rate rose</Text>
              <View style={styles.stressRow}>
                {RATE_STRESS_STEPS_BPS.map(bps => {
                  const active = f.forwardRateDeltaBps === bps;
                  return (
                    <TouchableOpacity
                      key={bps}
                      style={[styles.stressChip, active && styles.stressChipActive]}
                      onPress={() => {
                        hapticLight();
                        updateProfile({ forward_rate_delta_bps: bps });
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={bps === 0 ? 'Today’s rate' : `Plus ${bps / 100} percent`}
                    >
                      <Text style={[styles.stressChipText, active && styles.stressChipTextActive]}>
                        {bps === 0 ? 'today' : `+${bps / 100}%`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.stressResult}>
                At {rate(f.helocRate + f.forwardRateDeltaBps / 10_000)} you would be
                mortgage-free in {formatMonths(f.projection.acceleratedMonths)}, saving about
                ${fmtK(f.projection.interestSaved)} in interest.
              </Text>
            </View>
          </Card>

          {/* ── 6. PLAN, DATA, PRIVACY ─────────────────────────────────── */}
          <SectionLabel>PLAN, DATA AND PRIVACY</SectionLabel>
          <Card>
            <DataRow
              label="Your plan"
              value={isPaidTier(tier) ? 'Pro' : 'Free'}
              hint={isPaidTier(tier)
                ? 'Live balances, servicer terms, and action alerts'
                : 'Calculator, projections and manual tracking'}
              onPress={() => router.push(isPaidTier(tier) ? '/modals/settings' : '/modals/upgrade')} />

            <LinkRow
              icon="download-outline"
              label="Export my data"
              sub="Shares a CSV of the balances, terms and assumptions held on this device"
              onPress={handleExport} />
            <LinkRow
              icon="mail-outline"
              label="Support"
              sub="Questions, corrections, or something that looks wrong"
              onPress={() => router.push('/modals/settings')} />
            <LinkRow
              icon="trash-outline"
              label="Delete my data"
              sub="Removes your account, balances and stored bank tokens"
              danger
              onPress={() => router.push('/modals/settings')} />

            {/* Destructive controls stay findable. Burying them costs exactly
                the trust required to ask someone for bank credentials. */}
            <SourceNote>
              Encrypted in transit and at rest. We never move money, and we never hold your
              bank login — connections are made through Plaid.
            </SourceNote>
          </Card>

          <Text style={styles.disclaimer}>
            Projections are estimates based on the figures above. Not financial advice, and
            HELOC Hero is not a lender.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * One connected institution.
 *
 * Freshness leads rather than hiding in a corner: where a stale balance
 * produces a wrong recommendation, "synced 4 days ago" is not a debug detail,
 * it is the caveat on everything else the app said today.
 */
function ConnectionCard({ account, busy, onRefresh, onReconnect, onDisconnect }: {
  account: LinkedAccount;
  busy: boolean;
  onRefresh: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const health = connectionHealth(account.accounts_updated_at);
  return (
    <Card>
      <View style={styles.connHead}>
        <InstitutionAvatar
          name={account.institution_name}
          accountType={account.account_type}
          size={40}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.connName}>
            {account.institution_name ?? typeLabel(account.account_type)}
          </Text>
          <Text style={styles.connType}>{typeLabel(account.account_type)}</Text>
        </View>
        <Chip label={health.label} tone={health.tone} />
      </View>

      {account.accounts.map(a => (
        <View key={a.account_id} style={styles.subAccount}>
          <View style={{ flex: 1 }}>
            <Text style={styles.subName}>{a.name}</Text>
            <Text style={styles.subMeta}>
              {a.mask ? `•••• ${a.mask} · ` : ''}{a.subtype}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.subBalance}>{money(a.balances.current)}</Text>
            {a.balances.available !== null && a.balances.available !== a.balances.current && (
              <Text style={styles.subAvail}>{money(a.balances.available)} available</Text>
            )}
          </View>
        </View>
      ))}

      <Text style={styles.syncLine}>{health.detail}</Text>

      <View style={styles.connActions}>
        <ConnAction label="Refresh"    icon="refresh-outline" onPress={onRefresh} />
        <ConnAction label="Reconnect"  icon="repeat-outline"  onPress={onReconnect} />
        {busy
          ? <View style={styles.connAction}><ActivityIndicator size="small" color={Colors.gray400} /></View>
          : <ConnAction label="Disconnect" icon="unlink-outline" onPress={onDisconnect} />}
      </View>
    </Card>
  );
}

function ConnAction({ label, icon, onPress }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.connAction}
      onPress={() => { hapticLight(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={15} color={Colors.textSecondary} />
      <Text style={styles.connActionText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A read-only mortgage row that says where its value came from. */
function SourcedRow<T>({ label, v, fmtV, last }: {
  label: string;
  v: Sourced<T>;
  fmtV: (value: T) => string;
  last?: boolean;
}) {
  return (
    <DataRow
      label={label}
      value={v.value !== null ? fmtV(v.value) : '—'}
      hint={v.source === 'user' ? 'you entered this' : undefined}
      last={last}
    />
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Connection health, derived from what we actually know.
 *
 * Deliberately not "NEEDS_REAUTH". Nothing in this app stores Plaid item error
 * state, so claiming to know a re-authentication is required would be a guess
 * with an official-looking label on it. What we can say for certain is when the
 * balances last arrived.
 */
function connectionHealth(syncedAt: string | null): {
  label: string; detail: string; tone: 'accent' | 'neutral';
} {
  if (!syncedAt) {
    return {
      label: 'never synced',
      detail: 'No balances have come through from this connection yet.',
      tone: 'neutral',
    };
  }
  const hours = (Date.now() - new Date(syncedAt).getTime()) / 3_600_000;
  if (hours > STALE_SYNC_HOURS) {
    return {
      label: 'out of date',
      detail: `Last synced ${relativeTime(syncedAt)}. Recommendations built on these ` +
              'balances may no longer hold — pull down to refresh, or reconnect.',
      tone: 'neutral',
    };
  }
  return {
    label: 'healthy',
    detail: `Last synced ${relativeTime(syncedAt)}. Balances refresh about twice a day.`,
    tone: 'accent',
  };
}

function typeLabel(t: PlaidAccountType): string {
  return t === 'home equity' ? 'HELOC' : t === 'mortgage' ? 'Mortgage' : 'Savings';
}
function limitSourceHint(s: 'plaid_limit' | 'derived' | 'user' | 'unknown'): string | undefined {
  return s === 'derived' ? 'drawn plus available, so it stays current'
    : s === 'plaid_limit' ? 'reported by your bank'
    : s === 'user' ? 'you entered this'
    : undefined;
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function money(n: number) { return `$${fmt(n)}`; }
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return fmt(n);
}
function rate(d: number) { return `${(d * 100).toFixed(2)}%`; }
function months(m: number) {
  return m % 12 === 0 ? `${m / 12} years` : `${m} months`;
}
function dateStr(s: string) {
  // parseDate, not new Date: a bare YYYY-MM-DD is a calendar date, and reading
  // it as UTC shows the previous day for most US users.
  const d = parseDate(s);
  return d === null ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 3600)  return 'less than an hour ago';
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  const days = Math.floor(diff / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** A real export of what the app holds — not a promise of one. */
function buildCsv(f: ReturnType<typeof useFinancials>): string {
  const rows: [string, string][] = [
    ['Exported', new Date().toISOString()],
    ['Mortgage balance', str(f.mortgageBalance)],
    ['Mortgage rate', f.mortgage.rate.value !== null ? rate(f.mortgage.rate.value) : ''],
    ['Mortgage source', f.mortgage.isLive ? 'servicer' : 'entered'],
    ['Interest paid YTD', str(f.mortgage.ytdInterestPaid.value)],
    ['HELOC drawn', str(f.helocDrawn)],
    ['HELOC available', str(f.helocAvailable)],
    ['HELOC limit', str(f.helocLimit)],
    ['HELOC APR', f.helocRateAssumed ? 'not set (8.5% assumed)' : rate(f.helocRate)],
    ['Home value', str(f.homeValue)],
    ['Estimated equity', str(f.equity)],
    ['Combined LTV', f.combinedLTV !== null ? `${Math.round(f.combinedLTV * 100)}%` : ''],
    ['Monthly income', str(f.income)],
    ['Monthly expenses', str(f.expenses)],
    ['Monthly surplus', str(f.surplus)],
    ['Projected payoff', f.projection.acceleratedPayoffDate.toISOString().slice(0, 10)],
    ['Projected interest saved', str(f.projection.interestSaved)],
    ['Last synced', f.lastSyncedAt ?? 'never'],
  ];
  return ['Field,Value', ...rows.map(([k, v]) => `${k},"${v}"`)].join('\n');
}
function str(n: number | null): string { return n === null ? '' : String(Math.round(n)); }

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[5],
  },
  topTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: OnDark.primary },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: 36, paddingHorizontal: Spacing[3],
    borderRadius: Radius.full,
    backgroundColor: OnDark.fillStrong,
    borderWidth: 1, borderColor: OnDark.hairline,
  },
  addBtnText: { color: OnDark.primary, fontSize: Typography.sm, fontWeight: Typography.semibold },
  heroEyebrow: {
    fontSize: 11, fontWeight: Typography.extrabold,
    color: OnDark.muted, letterSpacing: 1.4,
  },

  content: { paddingHorizontal: Spacing[4], gap: Spacing[3], paddingTop: Spacing[1] },

  connHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  connName: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  connType: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  subAccount: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
  },
  subName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  subMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  subBalance: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  subAvail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

  syncLine: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  connActions: {
    flexDirection: 'row', gap: Spacing[2],
    paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
  },
  connAction: {
    flex: 1, minHeight: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: Radius.md, backgroundColor: Colors.gray50,
  },
  connActionText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },

  warnBlock: {
    flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start',
    backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border,
  },
  warnText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  calcBlock: {
    backgroundColor: Colors.mint50, borderRadius: Radius.lg,
    padding: Spacing[4], gap: Spacing[1],
    borderWidth: 1, borderColor: Colors.mint200,
  },
  calcLabel: { fontSize: Typography.xs, color: Colors.mint700, fontWeight: Typography.semibold },
  calcValue: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.mint700 },
  calcExplainer: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18, marginTop: 2 },

  nudge: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing[3] },
  nudgeText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  stressBlock: { gap: Spacing[3] },
  stressTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  stressRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  stressChip: {
    minHeight: 40, minWidth: 60,
    paddingHorizontal: Spacing[3],
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  stressChipActive: { backgroundColor: Colors.mint600, borderColor: Colors.mint600 },
  stressChipText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  stressChipTextActive: { color: Colors.white },
  stressResult: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  disclaimer: {
    fontSize: Typography.xs, color: Colors.textMuted,
    lineHeight: 18, textAlign: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
  },
});
