// app/tabs/accounts.tsx — the daily glance, not the terms ledger.
//
// This screen used to render every figure the app holds — mortgage rate type,
// maturity, escrow, HELOC index, margin, three separate fees — as read-only
// rows a user was meant to scan every day. Almost none of it changes, almost
// none of it is worth a daily look, and every one of those figures is already
// editable inside a modal. The screen was duplicating the editors as a ledger.
//
// So it answers three questions now and hands off for the rest:
//   1. What is my position?      → the hero: equity and combined LTV
//   2. Is anything wrong/stale?  → Needs attention, the app's own watch feed
//   3. What is connected?        → the account cards, freshness led
// Everything a user typed once — mortgage, HELOC terms, home value, the
// projection assumptions — collapses to one summary row that opens its editor.
// The detail lives one tap down, in the modal that owns it, not on this page.
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
  Card, Chip, DataRow, SectionLabel, SourceNote, EmptyState, LinkRow, Divider,
} from '../../components/ui/primitives';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import WatchRow from '../../components/ui/WatchRow';
import EquityCurve from '../../components/EquityCurve';
import Position, { type PositionRow } from '../../components/Position';
import InstitutionAvatar from '../../components/ui/InstitutionAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useIsPro } from '../../hooks/useIsPro';
import { useFinancials } from '../../hooks/useFinancials';
import { invokeFunction } from '../../lib/supabase';
import { computeEquitySeries } from '../../lib/projections';
import { daysSinceVerified } from '../../lib/helocTerms';
import { HOME_VALUE_SOURCE_LABEL, STALE_SYNC_HOURS } from '../../lib/config';
import { isPaidTier } from '../../lib/pricing';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, OnDark, CommonStyles, TAB_BAR_CLEARANCE } from '../../lib/theme';
import { parseDate } from '../../lib/mortgage';
import type { LinkedAccount, PlaidAccountType } from '../../lib/types';

/**
 * Spans of the PROJECTION, not ranges of history.
 *
 * A 1M / 6M / 1Y control on a chart like this normally means "the last year",
 * and that is the one thing this cannot mean: nothing in the app stores a
 * balance time series, so there is no past to draw. `null` is the full curve to
 * debt-free, which stays the default because it is the view that answers the
 * question the screen exists for.
 */
const HORIZONS: { label: string; months: number | null; a11y: string }[] = [
  { label: '1 yr',  months: 12,   a11y: 'Show the next year of the projection' },
  { label: '5 yr',  months: 60,   a11y: 'Show the next five years of the projection' },
  { label: '10 yr', months: 120,  a11y: 'Show the next ten years of the projection' },
  { label: 'All',   months: null, a11y: 'Show the whole projection to debt-free' },
];

export default function AccountsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tier } = useAuth();
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

  /** Same contract as the dashboard: the buzz reports what actually happened. */
  async function handleRefresh() {
    const ok = await f.refresh();
    if (ok) hapticSuccess();
    else hapticError();
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
  const sinceVerified = daysSinceVerified(profile?.heloc_terms_updated_at);

  // ── The projection window ─────────────────────────────────────────────────
  // Forward only. See the note on `horizonMonths` in EquityCurve — there is no
  // stored balance history to look back over, so the options are spans of the
  // projection rather than 1M/6M/1Y of the past.
  const [horizon, setHorizon] = useState<number | null>(null);

  // What the LTV is measured against. Every one of these values is user-entered,
  // so "a home value you entered" was never false — but naming the actual basis
  // is the difference between a caption a user can check and one they cannot.
  // An online estimate and a recent appraisal deserve different confidence, and
  // only the user knows which they gave us.
  const homeValueBasis = profile?.home_value_source
    ? HOME_VALUE_SOURCE_LABEL[profile.home_value_source].toLowerCase()
    : 'the home value you entered';

  // Spans that would render the same chart as "All" are not offered. When the
  // projection runs 8 years, a "10 yr" pill draws an identical curve to "All"
  // and the only thing the user learns from tapping it is that the control does
  // nothing. `null` always survives the filter — it is the whole curve.
  const horizons = useMemo(() => {
    const total = equitySeries?.accelerated.length ?? 0;
    return HORIZONS.filter(h => h.months === null || h.months < total);
  }, [equitySeries]);

  // A selection can outlive the pill that made it: pay the mortgage down and the
  // projection shortens, and a stored "10 yr" would window the chart with no
  // pill lit to explain why. Falling back to the full curve keeps the control
  // and the chart describing the same thing.
  const activeHorizon = horizons.some(h => h.months === horizon) ? horizon : null;

  // ── Setup summaries — one line each, the detail behind the editor ──────────
  const helocValue = (() => {
    if (f.helocLimit === null && f.helocRateAssumed) return 'Add your HELOC terms';
    const parts: string[] = [];
    if (f.helocLimit !== null) parts.push(`${money(f.helocLimit)} limit`);
    parts.push(f.helocRateAssumed ? 'rate not set' : rate(f.helocRate));
    return parts.join(' · ');
  })();

  // The two strategy-critical unknowns, flagged inline so they are not a surprise
  // in a projection. Amortizing defeats cycling outright; the interest-calc
  // method decides whether cycling saves anything at all.
  const helocFlag =
    profile?.heloc_payment_type === 'amortizing'
      ? 'Amortizing — cycling does not apply to this line'
      : !profile?.heloc_interest_calc_method
        ? 'Set how interest is charged — it decides whether cycling helps'
        : undefined;

  // ── The position rows ─────────────────────────────────────────────────────
  // Each taps through to the modal that owns the figure, so this block is a view
  // of the position AND the index of where to change it — the same handoff the
  // setup rows below use, not a second set of editors.
  const assetRows: PositionRow[] = [
    {
      key: 'home',
      icon: 'home-outline',
      label: 'Your home',
      sub: profile?.home_value_source
        ? HOME_VALUE_SOURCE_LABEL[profile.home_value_source]
        : 'estimated value',
      amount: f.homeValue,
      emptyLabel: 'Add value',
      onPress: () => { hapticLight(); router.push('/modals/home-value' as never); },
    },
  ];

  // Deliberately not an asset row. Savings are not home equity, and the figure
  // the hero and the net line both state is equity. See the note in Position.
  const cashAside: PositionRow = {
    key: 'cash',
    icon: 'wallet-outline',
    // Not "available to move". What is safe to move is a judgement that weighs
    // this against the buffer rules, and it is made on the dashboard.
    label: 'Cash on hand',
    sub: f.hasLinkedAccounts ? 'linked · not counted in equity' : 'not counted in equity',
    amount: f.liquidCash > 0 ? f.liquidCash : null,
    emptyLabel: '—',
  };

  const debtRows: PositionRow[] = [
    {
      key: 'mortgage',
      icon: 'business-outline',
      label: 'Mortgage',
      sub: f.mortgage.rate.value !== null
        ? `${rate(f.mortgage.rate.value)}${f.mortgage.isLive ? ' · live' : ''}`
        : 'rate not set',
      amount: f.mortgageBalance,
      emptyLabel: 'Add',
      onPress: () => { hapticLight(); router.push('/modals/mortgage-details' as never); },
    },
    {
      key: 'heloc',
      icon: 'card-outline',
      label: 'Drawn on your line',
      sub: f.helocLimit !== null
        ? `of ${money(f.helocLimit)} · ${f.helocRateAssumed ? 'rate not set' : rate(f.helocRate)}`
        : 'limit not set',
      amount: f.helocDrawn,
      emptyLabel: 'Add',
      onPress: () => { hapticLight(); router.push('/modals/heloc-terms' as never); },
    },
  ];

  return (
    <View style={CommonStyles.screenContainer}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={f.refreshing} onRefresh={handleRefresh} tintColor={Colors.mint600} />
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

          {f.loading ? (
            <SkeletonGroup label="Loading your home equity" style={styles.heroSkeleton}>
              <Skeleton onDark width={190} height={40} radius={Radius.sm} />
              <Skeleton onDark width={250} height={13} />
            </SkeletonGroup>
          ) : (
            <>
              <HeroValue>
                {f.equity !== null ? `$${fmt(f.equity)}` : '—'}
              </HeroValue>
              <HeroCaption>
                {f.equity !== null && f.combinedLTV !== null
                  ? `${Math.round(f.combinedLTV * 100)}% combined loan-to-value, against ${homeValueBasis}`
                  : 'Add your home value to see equity and combined LTV'}
              </HeroCaption>
            </>
          )}

          {equitySeries && (
            <View style={{ marginTop: Spacing[5] }}>
              <EquityCurve
                series={equitySeries}
                payoffDate={f.projection.acceleratedPayoffDate}
                hasRealData={f.hasRealData}
                horizonMonths={activeHorizon}
              />

              {/* Spans of the projection ahead, NOT ranges of history. The
                  labels say "1 yr" rather than "1M/6M/1Y" precisely so they
                  cannot be misread as a look back at where equity has been.

                  A lone "All" pill is no control at all, so the row waits until
                  there is a genuine choice to make. */}
              {horizons.length > 1 && (
              <View style={styles.horizonRow}>
                {horizons.map(h => {
                  const active = activeHorizon === h.months;
                  return (
                    <TouchableOpacity
                      key={h.label}
                      style={[styles.horizonPill, active && styles.horizonPillActive]}
                      onPress={() => { hapticLight(); setHorizon(h.months); }}
                      // The pill reads better at 32pt on the hero than at 44,
                      // and iOS ships its own segmented control at that height.
                      // Slop buys back the HIG target without the bulk.
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={h.a11y}
                    >
                      <Text style={[styles.horizonText, active && styles.horizonTextActive]}>
                        {h.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              )}
            </View>
          )}
        </Hero>

        <View style={styles.content}>
          {/* ── YOUR POSITION ──────────────────────────────────────────────
              Grouped by what each figure DOES in the strategy rather than by
              where it came from. The drawn line sits with the mortgage, not
              against the cash — see the note in components/Position.tsx, which
              is the same framing the dashboard's unified figure uses.

              `net` is f.equity — the SAME value the hero renders above. This
              block shows the arithmetic behind the headline; it must never
              compute a second version of it. */}
          {!f.loading && (
            <>
              <SectionLabel>YOUR POSITION</SectionLabel>
              <Position
                assets={assetRows}
                debts={debtRows}
                net={f.equity}
                netLabel="Your equity"
                netHint={f.homeValue === null
                  ? 'Add your home value and this becomes a real figure.'
                  : 'Your home value less everything secured against it. The same figure as above.'}
                aside={cashAside}
                // No "how this is worked out" link on purpose. The rows above
                // ARE the arithmetic and netHint states the rule, and there is
                // no modal that explains equity — /modals/assumptions is surplus
                // and rate stress, /modals/breakdown is spending. Pointing at
                // either would be a dead end dressed as an explanation.
              />
            </>
          )}

          {/* ── NEEDS ATTENTION ────────────────────────────────────────────
              The app already ranks what is wrong or stale — prepayment penalty,
              a rate to re-confirm, a draw period closing, spending drifting from
              the estimate. It leads the screen when there is anything to say, so
              the scattered inline warnings this page used to carry are gone. */}
          {f.watchItems.length > 0 && (
            <>
              <SectionLabel>NEEDS ATTENTION</SectionLabel>
              <Card>
                {f.watchItems.map((item, i) => (
                  <WatchRow
                    key={item.kind}
                    item={item}
                    last={i === f.watchItems.length - 1}
                    onPress={item.action ? () => { hapticLight(); router.push(item.action!.route as never); } : undefined}
                  />
                ))}
              </Card>
            </>
          )}

          {/* ── ACCOUNTS ───────────────────────────────────────────────────
              Three states, not two: loading, "we could not check", and "you
              genuinely have none" are all different, and telling a linked user
              their accounts are gone is not a default worth having. */}
          <SectionLabel>ACCOUNTS</SectionLabel>

          {f.loading && f.accounts.length === 0 ? (
            <Card>
              <SkeletonGroup label="Loading your connected accounts">
                <View style={styles.skeletonConnection}>
                  <Skeleton width={38} height={38} radius={Radius.md} />
                  <View style={styles.skeletonConnectionText}>
                    <Skeleton width="55%" height={14} />
                    <Skeleton width="35%" height={11} />
                  </View>
                </View>
                <Divider />
                <View style={styles.skeletonConnection}>
                  <Skeleton width={38} height={38} radius={Radius.md} />
                  <View style={styles.skeletonConnectionText}>
                    <Skeleton width="45%" height={14} />
                    <Skeleton width="40%" height={11} />
                  </View>
                </View>
              </SkeletonGroup>
            </Card>
          ) : f.error ? (
            <Card>
              <View style={styles.errorBlock}>
                <Ionicons name="cloud-offline-outline" size={20} color={Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.errorTitle}>Couldn't load your accounts</Text>
                  <Text style={styles.errorBody}>
                    {f.accounts.length > 0
                      ? 'Showing the last balances we have. They may be out of date.'
                      : 'This is a connection problem on our side of the glass, not a change ' +
                        'to your accounts. Nothing has been disconnected.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.errorRetry}
                    onPress={() => { hapticLight(); f.refresh(); }}
                    accessibilityRole="button"
                    accessibilityLabel="Try loading accounts again"
                  >
                    <Text style={styles.errorRetryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ) : null}

          {f.accounts.map(account => (
            <ConnectionCard
              key={account.id}
              account={account}
              busy={unlinking === account.account_type}
              onRefresh={f.refresh}
              onReconnect={() => router.push('/modals/link-account')}
              onDisconnect={() => handleDisconnect(account)}
            />
          ))}

          {!f.loading && !f.error && f.accounts.length === 0 && (
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

          {/* ── YOUR TERMS ─────────────────────────────────────────────────
              What is left once the position above carries the balances: the two
              rows that are about TERMS rather than amounts. Mortgage and home
              value moved up into Position — they were appearing twice, and the
              tap target was the same editor both times, which is duplication
              rather than reinforcement.

              The HELOC keeps a row here even though its balance is above,
              because this row's job is different: it opens re-confirmation of a
              variable rate nobody reports, which is a recurring action rather
              than a place to read a number. */}
          <SectionLabel>YOUR TERMS</SectionLabel>
          <Card>
            <SetupRow
              icon="card-outline"
              label="HELOC terms"
              value={helocValue}
              valueMuted={f.helocLimit === null && f.helocRateAssumed}
              flag={helocFlag}
              chip={{
                label: sinceVerified === null ? 'not confirmed' : `confirmed ${sinceVerified}d`,
                tone: f.helocTermsStale ? 'neutral' : 'accent',
              }}
              onPress={() => router.push(
                (profile?.heloc_terms_updated_at ? '/modals/confirm-terms' : '/modals/heloc-terms') as never,
              )}
            />
            <SetupRow
              icon="business-outline"
              label="Mortgage terms"
              value={f.mortgage.termMonths.value !== null
                ? `${Math.round(f.mortgage.termMonths.value / 12)}-year term`
                : 'Term, penalty and origination'}
              valueMuted={f.mortgage.termMonths.value === null}
              chip={{
                label: f.mortgage.isLive ? 'live' : 'entered',
                tone: f.mortgage.isLive ? 'accent' : 'neutral',
                icon: f.mortgage.isLive ? 'shield-checkmark-outline' : 'create-outline',
              }}
              onPress={() => router.push('/modals/mortgage-details' as never)}
            />
            <SetupRow
              icon="options-outline"
              label="Plan assumptions"
              value={`Surplus ${money(f.surplus)}/mo`}
              valueMuted={f.surplus <= 0}
              flag="Income, expenses, replenish threshold and rate stress"
              onPress={() => router.push('/modals/assumptions' as never)}
              last
            />
          </Card>

          {/* ── PLAN, DATA, PRIVACY ────────────────────────────────────────── */}
          <SectionLabel>PLAN, DATA & PRIVACY</SectionLabel>
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
 * One entered-once fact, summarised.
 *
 * A single figure and a status, with the editor one tap away. The value is
 * greyed when it is a prompt ("Add your mortgage") rather than a number, and a
 * flag line carries the rare thing that genuinely needs attention before a
 * projection is trusted.
 */
function SetupRow({ icon, label, value, valueMuted, flag, chip, onPress, last }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueMuted?: boolean;
  flag?: string;
  chip?: { label: string; tone: 'accent' | 'neutral'; icon?: keyof typeof Ionicons.glyphMap };
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.setupRow, !last && styles.setupRowBorder]}
      onPress={() => { hapticLight(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.setupIcon}>
        <Ionicons name={icon} size={18} color={Colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.setupLabel}>{label}</Text>
        <Text style={[styles.setupValue, valueMuted && styles.setupValueMuted]}>{value}</Text>
        {flag ? <Text style={styles.setupFlag}>{flag}</Text> : null}
      </View>
      {chip ? <Chip label={chip.label} tone={chip.tone} icon={chip.icon} /> : null}
      <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
    </TouchableOpacity>
  );
}

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
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function money(n: number) { return `$${fmt(n)}`; }
function rate(d: number) { return `${(d * 100).toFixed(2)}%`; }
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
/**
 * Long form of the dashboard's relativeTime, for the connection cards.
 *
 * Was vaguer than this screen can afford — "less than an hour ago" covered
 * everything from a second to 59 minutes, on the card whose own comment says a
 * stale balance is how a wrong recommendation gets made. Future timestamps clamp
 * rather than going negative.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'at an unknown time';

  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 90) return 'just now';
  if (diff < 3600) {
    const mins = Math.round(diff / 60);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
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
  horizonRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[4],
  },
  horizonPill: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: OnDark.hairline,
  },
  // Sits on the aurora, so the active state is a light fill rather than the
  // page's mint — the hero is the one surface where OnDark tokens rule.
  horizonPillActive: {
    backgroundColor: OnDark.fillStrong,
    borderColor: 'transparent',
  },
  horizonText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: OnDark.muted },
  horizonTextActive: { color: OnDark.primary, fontWeight: Typography.semibold },

  heroSkeleton: { gap: Spacing[3], paddingVertical: Spacing[2] },
  skeletonConnection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[2],
  },
  skeletonConnectionText: { flex: 1, gap: Spacing[2] },

  errorBlock: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  errorTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  errorBody: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  errorRetry: { minHeight: 44, justifyContent: 'center' },
  errorRetryText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },

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

  // Setup rows
  setupRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingVertical: Spacing[3], minHeight: 56,
  },
  setupRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  setupIcon: {
    width: 34, height: 34, borderRadius: Radius.sm,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  setupLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  setupValue: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 1 },
  setupValueMuted: { color: Colors.textMuted },
  setupFlag: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16, marginTop: 3 },

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

  disclaimer: {
    fontSize: Typography.xs, color: Colors.textMuted,
    lineHeight: 18, textAlign: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
  },
});
