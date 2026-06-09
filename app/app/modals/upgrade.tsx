// app/modals/upgrade.tsx
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useIsPro } from '../../hooks/useIsPro';
import {
  getOfferings, purchasePackage, restorePurchases, purchasesAvailable,
} from '../../lib/purchases';
import { SUBSCRIPTION_PLANS } from '../../lib/types';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';

const STATIC_PRICES: Record<string, string> = {
  monthly: '$19.99/mo',
  annual:  '$179/yr · ~$14.92/mo',
};

export default function UpgradeModal() {
  const router = useRouter();
  const { tier } = useAuth();
  const { isPro, refresh: refreshPro } = useIsPro();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [offerings, setOfferings] = useState<any>(null);
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (purchasesAvailable()) {
      getOfferings().then(o => setOfferings(o));
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function packagesFor(identifier: string): any[] {
    if (!offerings?.current?.availablePackages) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return offerings.current.availablePackages.filter((p: any) =>
      p.identifier.toLowerCase().includes(identifier),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handlePurchase(pkg: any) {
    setLoadingPkg(pkg.identifier);
    setError('');
    try {
      const success = await purchasePackage(pkg);
      if (success) {
        await refreshPro();
        router.back();
      }
    } catch {
      setError('Purchase failed. Please try again.');
    } finally {
      setLoadingPkg(null);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    setError('');
    try {
      const restored = await restorePurchases();
      if (restored) {
        await refreshPro();
        Alert.alert('Purchases Restored', 'Your Pro access has been restored.');
        router.back();
      } else {
        Alert.alert('No Purchases Found', 'No active subscriptions were found for this Apple ID.');
      }
    } catch {
      setError('Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  const nonFreePlans = SUBSCRIPTION_PLANS.filter(
    (p): p is (typeof SUBSCRIPTION_PLANS)[number] => p.tier !== ('free' as string),
  );

  const rcAvailable = purchasesAvailable();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={Gradients.primary} style={styles.hero}>
          <Text style={styles.heroTitle}>Unlock Your Full Strategy</Text>
          <Text style={styles.heroSubtitle}>
            Connect real accounts and let HELOC Hero do the work for you.
          </Text>
        </LinearGradient>

        {/* 7-day trial banner */}
        <View style={styles.trialBanner}>
          <Ionicons name="gift-outline" size={20} color={Colors.mint600} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trialTitle}>7-Day Free Trial Included</Text>
            <Text style={styles.trialSubtitle}>Try any paid plan free for 7 days. Cancel anytime, no charge.</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Plan cards */}
        {nonFreePlans.map((plan, idx) => {
          const isRecommended = idx === 0;
          const isCurrent = tier === plan.tier || isPro;
          const pkgKey = plan.tier === 'full' ? 'annual' : 'monthly';
          const rcPkgs = packagesFor(pkgKey);
          const staticPrice = STATIC_PRICES[pkgKey];

          return (
            <View
              key={plan.tier}
              style={[
                styles.planCard,
                isRecommended && styles.planCardHighlighted,
                isCurrent && styles.planCardCurrent,
              ]}
            >
              {isRecommended && (
                <View style={styles.popularBadge}>
                  <Ionicons name="star" size={11} color={Colors.white} />
                  <Text style={styles.popularBadgeText}>Most Popular</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>
                    {rcPkgs[0]?.product?.priceString ?? staticPrice}
                  </Text>
                </View>
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Current Plan</Text>
                  </View>
                )}
              </View>

              <View style={styles.featureList}>
                {plan.features.map((feat, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.mint600} />
                    <Text style={styles.featureText}>{feat}</Text>
                  </View>
                ))}
              </View>

              {!isCurrent && (
                rcAvailable && rcPkgs.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.upgradeBtn, isRecommended && styles.upgradeBtnPrimary]}
                    onPress={() => handlePurchase(rcPkgs[0])}
                    disabled={!!loadingPkg}
                    accessibilityLabel={`Start ${plan.name} free trial`}
                  >
                    {loadingPkg === rcPkgs[0]?.identifier ? (
                      <ActivityIndicator color={isRecommended ? Colors.white : Colors.mint600} size="small" />
                    ) : (
                      <Text style={[styles.upgradeBtnText, isRecommended && styles.upgradeBtnTextPrimary]}>
                        Start {plan.name} — Free for 7 Days
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.upgradeBtn, isRecommended && styles.upgradeBtnPrimary, styles.upgradeBtnDisabled]}>
                    <Text style={[styles.upgradeBtnText, isRecommended && styles.upgradeBtnTextPrimary]}>
                      {staticPrice} — Available in app
                    </Text>
                  </View>
                )
              )}
            </View>
          );
        })}

        {/* Restore + Manage */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleRestore}
            disabled={restoring || !rcAvailable}
            accessibilityLabel="Restore purchases"
          >
            {restoring ? (
              <ActivityIndicator size="small" color={Colors.mint600} />
            ) : (
              <Text style={styles.actionBtnText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
            accessibilityLabel="Manage subscription in App Store"
          >
            <Text style={styles.actionBtnText}>Manage Subscription</Text>
          </TouchableOpacity>
        </View>

        {/* Free tier reminder */}
        <View style={styles.freeTier}>
          <View style={styles.freeTierHeading}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.mint600} />
            <Text style={styles.freeTierTitle}>Free Plan Always Available</Text>
          </View>
          <Text style={styles.freeTierText}>
            Calculator, projections, and educational content are always free —
            no credit card required.
          </Text>
        </View>

        <Text style={styles.legal}>
          Payment will be charged to your Apple ID account at confirmation of purchase. Subscription
          automatically renews unless auto-renew is turned off at least 24 hours before the end of
          the current period. Manage or cancel in App Store settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing[6],
    gap: Spacing[2],
  },
  heroTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.white },
  heroSubtitle: { fontSize: Typography.sm, color: Colors.mint100, lineHeight: 20 },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1.5,
    borderColor: Colors.mint200,
  },
  trialTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.mint700 },
  trialSubtitle: { fontSize: Typography.xs, color: Colors.mint600, lineHeight: 16, marginTop: 2 },
  errorBanner: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: Colors.gray300,
  },
  errorText: { color: Colors.textSecondary, fontSize: Typography.sm },
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: Spacing[4],
    ...Shadows.card,
  },
  planCardHighlighted: { borderColor: Colors.mint600, borderWidth: 2 },
  planCardCurrent: { borderColor: Colors.mint400 },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.mint600,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  popularBadgeText: { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.semibold },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  planName: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  planPrice: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.mint600, marginTop: 2 },
  currentBadge: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  currentBadgeText: { fontSize: Typography.xs, color: Colors.mint700, fontWeight: Typography.medium },
  featureList: { gap: Spacing[2] },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] },
  featureText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  upgradeBtn: {
    borderWidth: 1.5,
    borderColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    alignItems: 'center',
  },
  upgradeBtnPrimary: {
    backgroundColor: Colors.mint600,
    borderColor: Colors.mint600,
    ...Shadows.glow,
  },
  upgradeBtnDisabled: { opacity: 0.6 },
  upgradeBtnText: { color: Colors.mint600, fontSize: Typography.base, fontWeight: Typography.semibold },
  upgradeBtnTextPrimary: { color: Colors.white },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[4],
  },
  actionBtn: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  actionBtnText: {
    fontSize: Typography.sm,
    color: Colors.mint600,
    fontWeight: Typography.medium,
    textDecorationLine: 'underline',
  },
  freeTier: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  freeTierHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  freeTierTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  freeTierText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  legal: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing[2],
  },
});
