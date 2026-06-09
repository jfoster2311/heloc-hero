// app/modals/upgrade.tsx
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { invokeFunction } from '../../lib/supabase';
import { SUBSCRIPTION_PLANS } from '../../lib/types';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';
import type { SubscriptionTier } from '../../lib/types';

export default function UpgradeModal() {
  const router = useRouter();
  const { user, tier } = useAuth();
  const [loading, setLoading] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState('');

  async function handleUpgrade(selectedTier: SubscriptionTier) {
    if (!user) return;
    setLoading(selectedTier);
    setError('');

    try {
      const { url } = await invokeFunction<{ url: string }>('stripe-checkout', {
        userId: user.id,
        tier: selectedTier,
        successUrl: 'heloc-hero://upgrade-success',
        cancelUrl: 'heloc-hero://upgrade-cancel',
      });

      if (url) await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoading(null);
    }
  }

  const nonFreePlans = SUBSCRIPTION_PLANS.filter(p => p.tier !== 'free');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
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

        {/* 7-day trial — prominent banner */}
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

        {/* Plan cards — first non-free plan is the recommended one */}
        {nonFreePlans.map((plan, idx) => {
          const isRecommended = idx === 0;
          return (
            <View
              key={plan.tier}
              style={[
                styles.planCard,
                isRecommended && styles.planCardHighlighted,
                tier === plan.tier && styles.planCardCurrent,
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
                    ${plan.price}
                    <Text style={styles.planPricePer}>/mo</Text>
                  </Text>
                </View>
                {tier === plan.tier && (
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

              {tier !== plan.tier && (
                <TouchableOpacity
                  style={[
                    styles.upgradeBtn,
                    isRecommended && styles.upgradeBtnPrimary,
                  ]}
                  onPress={() => handleUpgrade(plan.tier)}
                  disabled={!!loading}
                >
                  {loading === plan.tier ? (
                    <ActivityIndicator
                      color={isRecommended ? Colors.white : Colors.mint600}
                      size="small"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.upgradeBtnText,
                        isRecommended && styles.upgradeBtnTextPrimary,
                      ]}
                    >
                      Start {plan.name} — Free for 7 Days →
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

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
          Cancel anytime. Billed monthly after trial ends.
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
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: { color: Colors.error, fontSize: Typography.sm },
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: Spacing[4],
    ...Shadows.card,
  },
  planCardHighlighted: {
    borderColor: Colors.mint600,
    borderWidth: 2,
  },
  planCardCurrent: {
    borderColor: Colors.success,
  },
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
  planPrice: { fontSize: Typography['2xl'], fontWeight: Typography.extrabold, color: Colors.mint600 },
  planPricePer: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.regular },
  currentBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  currentBadgeText: { fontSize: Typography.xs, color: Colors.success, fontWeight: Typography.medium },
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
  upgradeBtnText: { color: Colors.mint600, fontSize: Typography.base, fontWeight: Typography.semibold },
  upgradeBtnTextPrimary: { color: Colors.white },
  freeTier: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  freeTierHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  freeTierTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  freeTierText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  legal: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
