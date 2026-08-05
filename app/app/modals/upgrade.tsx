// app/modals/upgrade.tsx — the paywall.
//
// Rebuilt after an audit found it selling things that do not exist. What it
// used to claim, and why each is gone:
//  · "Safe Sweep™ — auto-move surplus to HELOC" and "Safe Dump™ — auto-pay
//    HELOC to mortgage" on a $50/mo tier. HELOC Hero has no payment rail and
//    does not move money. Only the account holder can pay their mortgage.
//  · "Real-time account syncing", while balance refresh is deliberately
//    throttled to roughly twice a day to control Plaid cost.
//  · "Push alerts", with no delivery pipeline deployed. Alerts are scheduled
//    locally on the device, which is what the copy now says.
//  · "Most Popular", with no subscribers to base it on.
//  · Three contradictory prices across the app for the same plan.
//  · A "7-Day Free Trial" promised unconditionally. The trial claim is gated on
//    StoreKit, so it can never promise a trial the App Store will not honour.
//    That gate was itself wrong until recently — it fired on any introductory
//    offer, so a PAID one ("$4.99 for your first three months") would have been
//    sold as free. A free trial is `introPrice.price === 0`; anything else is a
//    discount and is now described as one.
//
// Prices come from StoreKit. When StoreKit is unavailable the purchase button
// is disabled and US list pricing is shown, labelled as such — the price
// displayed must be the price charged, in the buyer's own currency. While the
// store is still being asked, nothing stands in for the price at all: a
// placeholder shown as though it were settled is the failure worth avoiding.
import {
  View, Text, ScrollView, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Touchable } from '../../components/ui/press';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Hero, { HeroCaption } from '../../components/ui/Hero';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import { useIsPro } from '../../hooks/useIsPro';
import {
  getOfferings, purchasePackage, restorePurchases, purchasesAvailable,
} from '../../lib/purchases';
import {
  US_LIST_PRICE, US_LIST_ANNUAL_PER_MONTH, ANNUAL_SAVING_PCT,
  PACKAGE_MATCH, PRO_FEATURES, FREE_FEATURES,
} from '../../lib/pricing';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Typography, Spacing, Radius, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { BillingPeriod } from '../../lib/types';

export default function UpgradeModal() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { isPro, refresh: refreshPro } = useIsPro();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [offerings, setOfferings] = useState<any>(null);
  // Three states, not two: we have not asked yet, we asked and failed, we have
  // an answer. Collapsing the first two is what let a failed fetch sit forever
  // behind a price that was never real.
  const [offerStatus, setOfferStatus] = useState<'loading' | 'ready' | 'failed'>(
    () => (purchasesAvailable() ? 'loading' : 'ready'),
  );
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  const rcAvailable = purchasesAvailable();

  const loadOfferings = useCallback(() => {
    if (!rcAvailable) { setOfferStatus('ready'); return; }
    setOfferStatus('loading');
    getOfferings().then(result => {
      // getOfferings swallows its own errors and returns null, so null is the
      // only failure signal available here.
      setOfferings(result);
      setOfferStatus(result ? 'ready' : 'failed');
    });
  }, [rcAvailable]);

  useEffect(() => { loadOfferings(); }, [loadOfferings]);

  /** Both packages, so the two plans can be compared in the buyer's currency. */
  const packages = useMemo(() => {
    const all = offerings?.current?.availablePackages;
    if (!Array.isArray(all)) return { monthly: null, annual: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const find = (needle: string) => all.find((p: any) =>
      String(p?.identifier ?? '').toLowerCase().includes(needle),
    ) ?? null;
    return { monthly: find(PACKAGE_MATCH.monthly), annual: find(PACKAGE_MATCH.annual) };
  }, [offerings]);

  const pkg = packages[period];

  // Real price from the store, in the buyer's currency, or null.
  const storePrice: string | null = pkg?.product?.priceString ?? null;

  // ── The introductory offer, described as what it actually is ──────────────
  //
  // The gate used to be `periodNumberOfUnits > 0`, which is true of ANY
  // introductory offer — including a paid one. An App Store offer of "$4.99 for
  // your first three months" would therefore have been sold on this screen as a
  // free trial, with a CTA reading "Start free trial", and the user charged
  // $4.99 on confirmation. A free trial is `price === 0`; anything else is a
  // discount and has to say so.
  const intro = pkg?.product?.introPrice ?? null;
  const introUnits = intro?.periodNumberOfUnits ?? null;
  const introUnit  = intro?.periodUnit ?? null;
  const hasIntro   = intro != null && Number(introUnits) > 0;
  const hasTrial   = hasIntro && Number(intro?.price) === 0;
  const introLabel = hasIntro && introUnits != null
    ? `${introUnits}-${String(introUnit ?? 'day').toLowerCase()}`
    : null;

  const canPurchase = rcAvailable && !!pkg && !isPro;

  /**
   * What the annual plan actually saves, in this storefront.
   *
   * ANNUAL_SAVING_PCT is derived from US list prices, and was rendered on the
   * badge for every buyer everywhere. Apple sets each storefront's price tiers
   * independently, so the two plans do not keep a fixed ratio across
   * currencies — the badge could overstate the discount for a buyer whose local
   * pricing differs. When the store gives us both prices we compute it from
   * those; otherwise we fall back to the US figure, which is at least the one
   * the displayed US prices agree with.
   */
  const savingPct = useMemo(() => {
    const m = Number(packages.monthly?.product?.price);
    const a = Number(packages.annual?.product?.price);
    if (!Number.isFinite(m) || !Number.isFinite(a) || m <= 0 || a <= 0) {
      return ANNUAL_SAVING_PCT;
    }
    return Math.round((1 - a / (m * 12)) * 100);
  }, [packages]);

  async function handlePurchase() {
    if (!pkg) return;
    hapticLight();
    setPurchasing(true);
    setError('');
    try {
      const success = await purchasePackage(pkg);
      if (success) {
        hapticSuccess();
        await refreshPro();
        router.back();
      }
      // A false return is a user cancellation — purchasePackage swallows those
      // deliberately. No error, no buzz; they meant to do that.
    } catch {
      setError('That purchase didn’t go through. You have not been charged.');
      hapticError();
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    hapticLight();
    setRestoring(true);
    setError('');
    try {
      const restored = await restorePurchases();
      if (restored) {
        hapticSuccess();
        await refreshPro();
        Alert.alert('Purchases restored', 'Your Pro access is active again.');
        router.back();
      } else {
        Alert.alert('Nothing to restore', 'No active subscription was found for this Apple ID.');
      }
    } catch {
      setError('Restore didn’t complete. Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <View style={styles.safe} >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* The paywall opens on the same aurora as the reveal that sold it. */}
        <Hero
          intensity={0.95}
          topBar={
            <View style={styles.heroTop}>
              <Text style={styles.heroTitle}>HELOC Hero Pro</Text>
              <Touchable
                onPress={() => { router.back(); }}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={OnDark.secondary} />
              </Touchable>
            </View>
          }
        >
          <HeroCaption>
            Connect your accounts and HELOC Hero watches your balances, then tells you the
            moment it&apos;s worth moving money.
          </HeroCaption>
        </Hero>

      <View style={styles.content}>
        {isPro && (
          <View style={styles.currentBanner}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.mint700} />
            <Text style={styles.currentText}>Pro is active on this Apple ID.</Text>
          </View>
        )}

        {/* ── Billing period. A toggle, not two competing cards. ──────────── */}
        <View style={styles.periodToggle}>
          <PeriodBtn
            label="Monthly"
            active={period === 'monthly'}
            onPress={() => { hapticLight(); setPeriod('monthly'); }}
          />
          <PeriodBtn
            label="Annual"
            badge={savingPct > 0 ? `Save ${savingPct}%` : undefined}
            active={period === 'annual'}
            onPress={() => { hapticLight(); setPeriod('annual'); }}
          />
        </View>

        <View style={styles.priceCard}>
          {/* Nothing stands in for the price while we are still asking the
              store for it. US list pricing used to render here immediately, so
              a buyer in another storefront read "$19.99 / month · US pricing"
              as the answer, next to a button that silently did nothing, before
              both changed. Apple requires the price shown to be the price
              charged; showing a placeholder as though it were settled is the
              part worth avoiding, not the fallback itself. */}
          {offerStatus === 'loading' ? (
            <SkeletonGroup label="Checking the price with the App Store">
              <Skeleton width={168} height={34} radius={Radius.sm} />
              <Skeleton width={210} height={12} style={{ marginTop: Spacing[2] }} />
            </SkeletonGroup>
          ) : (
            <>
              <Text style={styles.price}>
                {storePrice ?? US_LIST_PRICE[period]}
                <Text style={styles.pricePer}>{period === 'monthly' ? ' / month' : ' / year'}</Text>
              </Text>

              {/* Kept when a real price is present too — RevenueCat formats
                  pricePerMonthString in the buyer's own currency, so the annual
                  plan no longer loses its per-month framing the moment the
                  store answers. */}
              {period === 'annual' && (
                <Text style={styles.priceSub}>
                  Works out to about{' '}
                  {pkg?.product?.pricePerMonthString ?? US_LIST_ANNUAL_PER_MONTH} a month
                </Text>
              )}

              {!storePrice && (
                <Text style={styles.priceNote}>
                  US pricing. Your App Store shows the exact price in your own currency.
                </Text>
              )}
            </>
          )}

          {hasTrial && (
            <Text style={styles.trialNote}>
              Includes a {introLabel} free trial.
            </Text>
          )}
          {hasIntro && !hasTrial && (
            <Text style={styles.trialNote}>{introSentence(intro)}</Text>
          )}
        </View>

        {/* A failed fetch used to be indistinguishable from a slow one, for as
            long as the screen stayed open: getOfferings swallows its error and
            returns null, so the paywall sat on US list pricing with a dead
            button and no way to try again. */}
        {offerStatus === 'failed' && (
          <Touchable
            style={styles.retryBanner}
            onPress={() => { loadOfferings(); }}
            accessibilityRole="button"
            accessibilityLabel="Could not reach the App Store. Tap to try again."
          >
            <Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.retryText}>
              We couldn&apos;t reach the App Store for current pricing. The figure above is
              US list pricing, not your final price.
            </Text>
            <Text style={styles.retryAction}>Retry</Text>
          </Touchable>
        )}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── What Pro actually does ─────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What you get</Text>
          {PRO_FEATURES.map(f => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark" size={16} color={colors.accentInk} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
          <Text style={styles.noAutomation}>
            HELOC Hero never moves money. Only you can pay your mortgage or draw your HELOC —
            we tell you when and how much, and keep the score.
          </Text>
        </View>

        <Touchable
          style={[styles.cta, !canPurchase && styles.ctaDisabled]}
          onPress={handlePurchase}
          disabled={!canPurchase || purchasing}
          accessibilityLabel={hasTrial ? 'Start free trial' : 'Subscribe to Pro'}
        >
          {/* Only a genuinely free intro offer earns the word "free" here. */}
          {purchasing
            ? <ActivityIndicator color={colors.onAccent} />
            : (
              <Text style={styles.ctaText}>
                {isPro ? 'Pro is active' : hasTrial ? 'Start free trial' : 'Subscribe'}
              </Text>
            )}
        </Touchable>

        {!rcAvailable && (
          <Text style={styles.unavailableNote}>
            Purchases aren&apos;t available in this build. Open HELOC Hero from the App Store to
            subscribe.
          </Text>
        )}

        <View style={styles.actionsRow}>
          <Touchable
            style={styles.actionBtn}
            onPress={handleRestore}
            disabled={restoring || !rcAvailable}
            accessibilityLabel="Restore purchases"
          >
            {restoring
              ? <ActivityIndicator size="small" color={colors.accentInk} />
              : <Text style={styles.actionBtnText}>Restore purchases</Text>}
          </Touchable>

          <Touchable
            style={styles.actionBtn}
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
            accessibilityLabel="Manage subscription in App Store"
          >
            <Text style={styles.actionBtnText}>Manage subscription</Text>
          </Touchable>
        </View>

        {/* ── Free tier, stated plainly rather than as a downgrade ────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Free, always</Text>
          {FREE_FEATURES.map(f => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark" size={16} color={colors.gray400} />
              <Text style={styles.featureTextMuted}>{f}</Text>
            </View>
          ))}
          <Text style={styles.freeNote}>No card needed. Pro adds live accounts and alerts.</Text>
        </View>

        <Text style={styles.legal}>
          Payment is charged to your Apple ID at confirmation of purchase. The subscription renews
          automatically unless auto-renew is switched off at least 24 hours before the end of the
          current period, and your account is charged for renewal within 24 hours of the period
          ending. Manage or cancel in your App Store subscription settings.
          {'\n\n'}
          Projections are estimates based on the figures you provide. HELOC Hero is not a lender,
          not a broker, and does not provide financial advice.
        </Text>
      </View>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * A paid introductory offer, in a sentence.
 *
 * The total span is `periodNumberOfUnits × cycles` — an offer of one month
 * repeated three times is three months, and saying "for your first 1 month, 3
 * times" makes the reader do that multiplication themselves. When it repeats,
 * the price is per period and says so.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function introSentence(intro: any): string {
  const units  = Math.max(1, Number(intro?.periodNumberOfUnits) || 1);
  const unit   = String(intro?.periodUnit ?? 'DAY').toLowerCase();
  const cycles = Math.max(1, Number(intro?.cycles) || 1);
  const total  = units * cycles;

  const span = total === 1 ? `your first ${unit}` : `your first ${total} ${unit}s`;
  const rate = cycles > 1 ? ` a ${unit}` : '';
  return `${intro?.priceString}${rate} for ${span}, then the price above.`;
}

function PeriodBtn({ label, badge, active, onPress }: {
  label: string; badge?: string; active: boolean; onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Touchable
      style={[styles.periodBtn, active && styles.periodBtnActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
    >
      <Text style={[styles.periodText, active && styles.periodTextActive]}>{label}</Text>
      {badge && <Text style={[styles.periodBadge, active && styles.periodBadgeActive]}>{badge}</Text>}
    </Touchable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles(t => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  scroll: { paddingBottom: Spacing[10] },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  heroTitle: { flex: 1, fontSize: Typography.xl, fontWeight: Typography.bold, color: OnDark.primary },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing[4], gap: Spacing[4], paddingTop: Spacing[1] },

  currentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: t.colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  currentText: { flex: 1, fontSize: Typography.sm, color: t.colors.mint700 },

  periodToggle: {
    flexDirection: 'row',
    gap: Spacing[2],
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[1],
  },
  periodBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  periodBtnActive: { backgroundColor: t.colors.surface, ...t.shadows.card },
  periodText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary },
  periodTextActive: { color: t.colors.textPrimary, fontWeight: Typography.semibold },
  periodBadge: { fontSize: 10, color: t.colors.textMuted },
  periodBadgeActive: { color: t.colors.accentInk },

  priceCard: { alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[2] },
  price: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: -0.6,
  },
  pricePer: { fontSize: Typography.base, fontWeight: Typography.regular, color: t.colors.textMuted },
  priceSub: { fontSize: Typography.sm, color: t.colors.textSecondary },
  priceNote: { fontSize: Typography.xs, color: t.colors.textMuted, textAlign: 'center', marginTop: Spacing[1] },
  trialNote: { fontSize: Typography.sm, color: t.colors.accentInk, marginTop: Spacing[1] },

  retryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: t.colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: t.colors.gray400,
  },
  retryText: { flex: 1, fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },
  retryAction: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },

  errorBanner: { backgroundColor: t.colors.gray50, borderRadius: Radius.md, padding: Spacing[4] },
  errorText: { color: t.colors.textSecondary, fontSize: Typography.sm },

  card: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    gap: Spacing[3],
    ...t.shadows.card,
  },
  cardTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  featureText: { flex: 1, fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  featureTextMuted: { flex: 1, fontSize: Typography.sm, color: t.colors.textMuted, lineHeight: 20 },
  noAutomation: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 18,
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.gray100,
  },
  freeNote: { fontSize: Typography.xs, color: t.colors.textMuted },

  cta: {
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: t.colors.onAccent, fontSize: Typography.base, fontWeight: Typography.semibold },
  unavailableNote: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: -Spacing[2],
  },

  actionsRow: { flexDirection: 'row', gap: Spacing[3] },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  actionBtnText: { fontSize: Typography.sm, color: t.colors.textSecondary, fontWeight: Typography.medium },

  legal: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 17,
    paddingHorizontal: Spacing[1],
  },
}));
