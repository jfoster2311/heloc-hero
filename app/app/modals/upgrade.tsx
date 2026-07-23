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
//  · A "7-Day Free Trial" promised unconditionally. The trial claim is now
//    gated on StoreKit actually returning an introductory offer, so it can
//    never promise a trial the App Store will not honour.
//
// Prices come from StoreKit. When StoreKit is unavailable the purchase button
// is disabled and US list pricing is shown, labelled as such — the price
// displayed must be the price charged, in the buyer's own currency.
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useIsPro } from '../../hooks/useIsPro';
import {
  getOfferings, purchasePackage, restorePurchases, purchasesAvailable,
} from '../../lib/purchases';
import {
  US_LIST_PRICE, US_LIST_ANNUAL_PER_MONTH, ANNUAL_SAVING_PCT,
  PACKAGE_MATCH, PRO_FEATURES, FREE_FEATURES,
} from '../../lib/pricing';
import { hapticLight } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
import type { BillingPeriod } from '../../lib/types';

export default function UpgradeModal() {
  const router = useRouter();
  const { isPro, refresh: refreshPro } = useIsPro();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [offerings, setOfferings] = useState<any>(null);
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  const rcAvailable = purchasesAvailable();

  useEffect(() => {
    if (rcAvailable) getOfferings().then(setOfferings);
  }, [rcAvailable]);

  /** The StoreKit package for the selected period, if the store returned one. */
  const pkg = useMemo(() => {
    const all = offerings?.current?.availablePackages;
    if (!Array.isArray(all)) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return all.find((p: any) =>
      String(p?.identifier ?? '').toLowerCase().includes(PACKAGE_MATCH[period]),
    ) ?? null;
  }, [offerings, period]);

  // Real price from the store, in the buyer's currency, or null.
  const storePrice: string | null = pkg?.product?.priceString ?? null;
  // Only claim a trial when the store actually carries an introductory offer.
  const introPeriod = pkg?.product?.introPrice?.periodNumberOfUnits ?? null;
  const introUnit   = pkg?.product?.introPrice?.periodUnit ?? null;
  const hasTrial    = introPeriod != null && Number(introPeriod) > 0;
  const canPurchase = rcAvailable && !!pkg && !isPro;

  async function handlePurchase() {
    if (!pkg) return;
    setPurchasing(true);
    setError('');
    try {
      const success = await purchasePackage(pkg);
      if (success) {
        await refreshPro();
        router.back();
      }
    } catch {
      setError('That purchase didn’t go through. You have not been charged.');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    setError('');
    try {
      const restored = await restorePurchases();
      if (restored) {
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HELOC Hero Pro</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lede}>
          Connect your accounts and HELOC Hero watches your balances, then tells you the moment
          it&apos;s worth moving money.
        </Text>

        {isPro && (
          <View style={styles.currentBanner}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.mint700} />
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
            badge={ANNUAL_SAVING_PCT > 0 ? `Save ${ANNUAL_SAVING_PCT}%` : undefined}
            active={period === 'annual'}
            onPress={() => { hapticLight(); setPeriod('annual'); }}
          />
        </View>

        <View style={styles.priceCard}>
          <Text style={styles.price}>
            {storePrice ?? US_LIST_PRICE[period]}
            <Text style={styles.pricePer}>{period === 'monthly' ? ' / month' : ' / year'}</Text>
          </Text>

          {period === 'annual' && !storePrice && (
            <Text style={styles.priceSub}>
              Works out to about {US_LIST_ANNUAL_PER_MONTH} a month
            </Text>
          )}

          {!storePrice && (
            <Text style={styles.priceNote}>
              US pricing. Your App Store shows the exact price in your own currency.
            </Text>
          )}

          {hasTrial && (
            <Text style={styles.trialNote}>
              Includes a {introPeriod}-{String(introUnit ?? 'day').toLowerCase()} free trial.
            </Text>
          )}
        </View>

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
              <Ionicons name="checkmark" size={16} color={Colors.mint600} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
          <Text style={styles.noAutomation}>
            HELOC Hero never moves money. Only you can pay your mortgage or draw your HELOC —
            we tell you when and how much, and keep the score.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.cta, !canPurchase && styles.ctaDisabled]}
          onPress={handlePurchase}
          disabled={!canPurchase || purchasing}
          accessibilityLabel={hasTrial ? 'Start free trial' : 'Subscribe to Pro'}
        >
          {purchasing
            ? <ActivityIndicator color={Colors.white} />
            : (
              <Text style={styles.ctaText}>
                {isPro ? 'Pro is active' : hasTrial ? 'Start free trial' : 'Subscribe'}
              </Text>
            )}
        </TouchableOpacity>

        {!rcAvailable && (
          <Text style={styles.unavailableNote}>
            Purchases aren&apos;t available in this build. Open HELOC Hero from the App Store to
            subscribe.
          </Text>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleRestore}
            disabled={restoring || !rcAvailable}
            accessibilityLabel="Restore purchases"
          >
            {restoring
              ? <ActivityIndicator size="small" color={Colors.mint600} />
              : <Text style={styles.actionBtnText}>Restore purchases</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
            accessibilityLabel="Manage subscription in App Store"
          >
            <Text style={styles.actionBtnText}>Manage subscription</Text>
          </TouchableOpacity>
        </View>

        {/* ── Free tier, stated plainly rather than as a downgrade ────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Free, always</Text>
          {FREE_FEATURES.map(f => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark" size={16} color={Colors.gray400} />
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
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PeriodBtn({ label, badge, active, onPress }: {
  label: string; badge?: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.periodBtn, active && styles.periodBtnActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
    >
      <Text style={[styles.periodText, active && styles.periodTextActive]}>{label}</Text>
      {badge && <Text style={[styles.periodBadge, active && styles.periodBadgeActive]}>{badge}</Text>}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  headerTitle: { flex: 1, fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[8] },

  lede: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    lineHeight: 23,
    paddingHorizontal: Spacing[1],
  },

  currentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  currentText: { flex: 1, fontSize: Typography.sm, color: Colors.mint700 },

  periodToggle: {
    flexDirection: 'row',
    gap: Spacing[2],
    backgroundColor: Colors.gray50,
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
  periodBtnActive: { backgroundColor: Colors.surface, ...Shadows.card },
  periodText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  periodTextActive: { color: Colors.textPrimary, fontWeight: Typography.semibold },
  periodBadge: { fontSize: 10, color: Colors.textMuted },
  periodBadgeActive: { color: Colors.mint600 },

  priceCard: { alignItems: 'center', gap: Spacing[1], paddingVertical: Spacing[2] },
  price: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
  },
  pricePer: { fontSize: Typography.base, fontWeight: Typography.regular, color: Colors.textMuted },
  priceSub: { fontSize: Typography.sm, color: Colors.textSecondary },
  priceNote: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing[1] },
  trialNote: { fontSize: Typography.sm, color: Colors.mint600, marginTop: Spacing[1] },

  errorBanner: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing[4] },
  errorText: { color: Colors.textSecondary, fontSize: Typography.sm },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    gap: Spacing[3],
    ...Shadows.card,
  },
  cardTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  featureText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  featureTextMuted: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 20 },
  noAutomation: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  freeNote: { fontSize: Typography.xs, color: Colors.textMuted },

  cta: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.semibold },
  unavailableNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
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
    borderColor: Colors.border,
  },
  actionBtnText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },

  legal: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    paddingHorizontal: Spacing[1],
  },
});
