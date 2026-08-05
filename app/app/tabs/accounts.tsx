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
import { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView,
  RefreshControl, Share, ActivityIndicator,
} from 'react-native';
import { Touchable } from '../../components/ui/press';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
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
import { computeEquitySeries } from '../../lib/projections';
import { daysSinceVerified } from '../../lib/helocTerms';
import { HOME_VALUE_SOURCE_LABEL, STALE_SYNC_HOURS } from '../../lib/config';
import { isPaidTier } from '../../lib/pricing';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Typography, Spacing, Radius, OnDark, TAB_BAR_CLEARANCE } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
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
  /**
   * Re-tapping the active tab scrolls back to the top.
   *
   * A reflex on iOS, and every tab here is long enough to need it — the
   * dashboard runs seven cards past the fold. Without it the tab bar was the
   * one control that did nothing when you pressed it a second time, which
   * reads as the tap having missed.
   */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const { colors, common } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, tier } = useAuth();
  const { isPro } = useIsPro();
  const f = useFinancials();
  const canLink = isPro;

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

  // The draw-end date is deliberately NOT read here any more. It used to drive a
  // warning on this screen, and buildWatchItems now raises both cases it covered
  // — approaching and closed — into Needs attention above, where the rest of the
  // screen's warnings live. Two sources for one fact is how they drift apart.
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
    <View style={common.screenContainer}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={f.refreshing} onRefresh={handleRefresh} tintColor={colors.mint600} />
        }
      >
        {/* ── HERO — the position, summarised ───────────────────────────── */}
        <Hero
          intensity={0.7}
          topBar={
            <View style={styles.topBar}>
              <Text style={styles.topTitle}>Accounts</Text>
              {canLink && (
                <Touchable
                  style={styles.addBtn}
                  onPress={() => { router.push('/modals/link-account'); }}
                  // Same trade the horizon pills below make: a 36pt pill is the
                  // right weight for a hero action and 44 would read as a
                  // toolbar button, so slop buys the HIG target back without
                  // the bulk.
                  hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Link an account"
                >
                  <Ionicons name="add" size={16} color={OnDark.primary} />
                  <Text style={styles.addBtnText}>Link</Text>
                </Touchable>
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
                  // Both figures are COMBINED — the drawn line is part of the
                  // debt — so an unknown line balance does not blur them, it
                  // overstates equity by exactly the amount drawn. Different
                  // missing input, different instruction.
                  : f.helocBalanceUnknown
                    ? 'Add your line balance to see equity and combined LTV'
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
                    <Touchable
                      key={h.label}
                      style={[styles.horizonPill, active && styles.horizonPillActive]}
                      onPress={() => { setHorizon(h.months); }}
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
                    </Touchable>
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
                <Ionicons name="cloud-offline-outline" size={20} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.errorTitle}>Couldn't load your accounts</Text>
                  <Text style={styles.errorBody}>
                    {f.accounts.length > 0
                      ? 'Showing the last balances we have. They may be out of date.'
                      : 'This is a connection problem on our side of the glass, not a change ' +
                        'to your accounts. Nothing has been disconnected.'}
                  </Text>
                  <Touchable
                    style={styles.errorRetry}
                    onPress={() => { f.refresh(); }}
                    accessibilityRole="button"
                    accessibilityLabel="Try loading accounts again"
                  >
                    <Text style={styles.errorRetryText}>Try again</Text>
                  </Touchable>
                </View>
              </View>
            </Card>
          ) : null}

          {f.accounts.map(account => (
            <ConnectionCard
              key={account.id}
              account={account}
              onRefresh={handleRefresh}
              syncing={f.refreshing}
              onManage={() => router.push(
                `/modals/account-details?type=${encodeURIComponent(account.account_type)}` as never,
              )}
            />
          ))}

          {!f.loading && !f.error && f.accounts.length === 0 && (
            <Card>
              <EmptyState
                icon="link-outline"
                title="Nothing connected yet"
                body={canLink
                  ? 'Everything below works from figures you enter. Connect a bank for live balances.'
                  : 'Everything below works from figures you enter. Pro adds live balances.'}
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

          {/* ── PLAN, DATA, PRIVACY ──────────────────────────────────────────
              Each of these names something specific and then opens Settings, so
              each names the section it means: `?section=` lands the screen on
              the rows it promised rather than at the top of eight sections with
              the user left to go and find what they just asked for. */}
          <SectionLabel>PLAN, DATA & PRIVACY</SectionLabel>
          <Card>
            <DataRow
              label="Your plan"
              value={isPaidTier(tier) ? 'Pro' : 'Free'}
              hint={isPaidTier(tier)
                ? 'Live balances, servicer terms, and action alerts'
                : 'Calculator, projections and manual tracking'}
              onPress={() => router.push(
                isPaidTier(tier) ? '/modals/settings?section=account' : '/modals/upgrade',
              )} />

            <LinkRow
              icon="download-outline"
              label="Export my data"
              sub="A CSV of the balances, terms and assumptions on this device"
              onPress={handleExport} />
            <LinkRow
              icon="mail-outline"
              label="Support"
              sub="Questions, corrections, or something that looks wrong"
              onPress={() => router.push('/modals/settings?section=support')} />
            <LinkRow
              icon="trash-outline"
              label="Delete my data"
              sub="Removes your account, balances and stored bank tokens"
              danger
              // Delete My Account lives under Security & Privacy, not its own
              // section — this points at where the control actually is.
              onPress={() => router.push('/modals/settings?section=security')} />

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
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Touchable
      style={[styles.setupRow, !last && styles.setupRowBorder]}
      onPress={() => { onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.setupIcon}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.setupLabel}>{label}</Text>
        <Text style={[styles.setupValue, valueMuted && styles.setupValueMuted]}>{value}</Text>
        {flag ? <Text style={styles.setupFlag}>{flag}</Text> : null}
      </View>
      {chip ? <Chip label={chip.label} tone={chip.tone} icon={chip.icon} /> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
    </Touchable>
  );
}

/**
 * One connected institution.
 *
 * Freshness leads rather than hiding in a corner: where a stale balance
 * produces a wrong recommendation, "synced 4 days ago" is not a debug detail,
 * it is the caveat on everything else the app said today.
 */
function ConnectionCard({ account, onRefresh, syncing, onManage }: {
  account: LinkedAccount;
  onRefresh: () => void;
  /** Shared across every card on purpose — see the note on the action row. */
  syncing: boolean;
  onManage: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const health = connectionHealth(account.accounts_updated_at);
  return (
    <Card>
      {/* The header opens the connection's own screen. Reconnect and Disconnect
          used to sit in the action row below; they are mutations, so they moved
          to the modal, leaving the tab reading and Refresh — which changes
          nothing — where it was. */}
      <Touchable
        style={styles.connHead}
        onPress={() => { onManage(); }}
        accessibilityRole="button"
        accessibilityLabel={`Manage ${account.institution_name ?? typeLabel(account.account_type)}`}
        accessibilityHint="Opens balances, sync and disconnect for this connection"
      >
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
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Touchable>

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
        {/* Refresh keeps its place: it mutates nothing, and it is the one action
            someone wants without leaving the list. Disconnect's spinner went with
            it to the modal, which owns that call and its own pending state.

            Two corrections to what this button used to be. It said "Refresh",
            which reads as a pull on THIS connection — `plaid-get-balances` keys
            off userId and refreshes every linked account in one call, the same
            reason account-details labels its button "Sync all balances now". And
            it fired a promise into the void: no pending state, no outcome, so a
            failed sync left the card byte-identical and read as a broken tap.

            The busy state is therefore shared rather than per-card, and that is
            correct rather than a shortcut — every card really is syncing. The
            failure case is already on screen: `f.error` renders above these
            cards with the "last balances we have" caveat, so an Alert here would
            be a second telling of the same news. */}
        <ConnAction
          label={syncing ? 'Syncing…' : 'Sync all'}
          icon="refresh-outline"
          busy={syncing}
          onPress={onRefresh}
        />
        <ConnAction label="Manage" icon="settings-outline" onPress={onManage} />
      </View>
    </Card>
  );
}

function ConnAction({ label, icon, busy, onPress }: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Touchable
      style={[styles.connAction, busy && styles.connActionBusy]}
      onPress={() => { onPress(); }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
    >
      {busy
        ? <ActivityIndicator size="small" color={colors.textSecondary} />
        : <Ionicons name={icon} size={15} color={colors.textSecondary} />}
      <Text style={styles.connActionText}>{label}</Text>
    </Touchable>
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
  // Exhaustive rather than falling through to 'Savings'. The old default was
  // safe while savings was the only remaining role; with checking split out it
  // would have labelled a checking account as savings on the one screen whose
  // job is telling the user which account is which.
  switch (t) {
    case 'home equity': return 'HELOC';
    case 'mortgage':    return 'Mortgage';
    case 'checking':    return 'Checking';
    case 'savings':     return 'Savings';
  }
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function money(n: number) { return `$${fmt(n)}`; }
function rate(d: number) { return `${(d * 100).toFixed(2)}%`; }
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

const useStyles = createThemedStyles(t => ({
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
    color: t.colors.textPrimary,
  },
  errorBody: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  errorRetry: { minHeight: 44, justifyContent: 'center' },
  errorRetryText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
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
  setupRowBorder: { borderBottomWidth: 1, borderBottomColor: t.colors.borderSubtle },
  setupIcon: {
    width: 34, height: 34, borderRadius: Radius.sm,
    backgroundColor: t.colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  setupLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  setupValue: { fontSize: Typography.sm, color: t.colors.textSecondary, marginTop: 1 },
  setupValueMuted: { color: t.colors.textMuted },
  setupFlag: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 16, marginTop: 3 },

  connHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  connName: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  connType: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: 1 },

  subAccount: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: t.colors.borderSubtle,
  },
  subName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textPrimary },
  subMeta: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  subBalance: { fontSize: Typography.base, fontWeight: Typography.bold, color: t.colors.textPrimary },
  subAvail: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: 2 },

  syncLine: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },

  connActions: {
    flexDirection: 'row', gap: Spacing[2],
    paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: t.colors.borderSubtle,
  },
  connAction: {
    flex: 1, minHeight: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: Radius.md, backgroundColor: t.colors.gray50,
  },
  connActionBusy: { opacity: 0.7 },
  connActionText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: t.colors.textSecondary },

  disclaimer: {
    fontSize: Typography.xs, color: t.colors.textMuted,
    lineHeight: 18, textAlign: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
  },
}));
