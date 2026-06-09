// app/onboarding/reveal.tsx — personalized projection reveal + conversion CTA
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { useAuth } from '../../hooks/useAuth';
import { computeProjection, genericProjection, formatMonths } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';

export default function RevealScreen() {
  const router = useRouter();
  const { data, submit, saving } = useOnboardingStore();
  const { user } = useAuth();

  const projection = (() => {
    const surplus = Math.max(0,
      (data.monthlyIncome ?? 0) - (data.monthlyExpenses ?? 0) - (data.monthlyPayment ?? 0),
    );
    if (data.mortgageBalance && data.mortgageRate && data.monthlyPayment) {
      return computeProjection({
        mortgageBalance: data.mortgageBalance,
        mortgageRate:    data.mortgageRate / 100,
        monthlyPayment:  data.monthlyPayment,
        monthlySurplus:  surplus || 600,
        helocRate:       (data.helocRate ?? 8.5) / 100,
      });
    }
    return genericProjection();
  })();

  const monthsSaved    = Math.max(0, projection.monthsSaved);
  const yearsSaved     = (monthsSaved / 12).toFixed(1);
  const interestSaved  = Math.round(projection.interestSaved);
  const hasRealNumbers = monthsSaved > 0;

  async function finishAndNavigate(goUpgrade: boolean) {
    if (user) {
      await submit(user.id);
    }
    if (goUpgrade) {
      const dest = user ? '/tabs/dashboard' : '/auth/signup';
      router.replace(dest as never);
      setTimeout(() => router.push('/modals/upgrade' as never), 300);
    } else {
      router.replace((user ? '/tabs/dashboard' : '/auth/signup') as never);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Projection hero */}
        <LinearGradient colors={Gradients.hero} style={styles.hero}>
          <Text style={styles.heroLabel}>YOUR ESTIMATED RESULTS</Text>
          <View style={styles.heroNumbers}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{yearsSaved} yrs</Text>
              <Text style={styles.heroStatLabel}>Projected sooner</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>
                {interestSaved > 0 ? `$${Math.round(interestSaved / 1000)}k` : '—'}
              </Text>
              <Text style={styles.heroStatLabel}>Est. interest saved</Text>
            </View>
          </View>
          {hasRealNumbers ? (
            <Text style={styles.heroDisclaimer}>
              Based on your numbers. Projected, not guaranteed.
            </Text>
          ) : (
            <Text style={styles.heroDisclaimer}>
              Enter your details to see personalized projections.
            </Text>
          )}
        </LinearGradient>

        {/* "Not a budgeting app" card */}
        <View style={styles.differentCard}>
          <Text style={styles.differentTitle}>Not a budgeting app.</Text>
          <Text style={styles.differentBody}>
            Apps like Mint and YNAB track spending — which is helpful, but passive.
            HELOC Hero is a strategy engine that does three things no budget app can:
          </Text>
          <View style={styles.thingsList}>
            <ThingRow icon="calculator-outline" text="Calculates the exact principal dump amount each cycle" />
            <ThingRow icon="time-outline"       text="Times each dump to maximize daily interest reduction" />
            <ThingRow icon="trending-down-outline" text="Shows a live payoff curve that updates with your real balances" />
          </View>
        </View>

        {/* Primary CTA — upgrade */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => finishAndNavigate(true)}
            disabled={saving}
            accessibilityLabel="Start 7-day free trial"
          >
            <Text style={styles.primaryBtnText}>Start 7 Days Free</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>

          <Text style={styles.pricing}>$179/yr · $19.99/mo after trial. Cancel anytime.</Text>

          {/* Risk reversal */}
          <View style={styles.riskReversal}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.mint600} />
            <Text style={styles.riskReversalText}>
              Free trial ends automatically — no surprise charges.
            </Text>
          </View>

          {/* Secondary CTA — free */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => finishAndNavigate(false)}
            disabled={saving}
            accessibilityLabel="Continue with free version"
          >
            <Text style={styles.secondaryBtnText}>Continue with the free version</Text>
          </TouchableOpacity>

          <Text style={styles.freeNote}>
            Calculator, projections, and cycle tracker always free.
          </Text>
        </View>

        <Text style={styles.disclaimer}>
          Projections are estimates based on inputs you provided. Not financial advice. Not a lender.
          Results vary based on interest rates, spending, and strategy consistency.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ThingRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.thingRow}>
      <Ionicons name={icon as never} size={16} color={Colors.mint600} />
      <Text style={styles.thingText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.mint700 },
  container: { flexGrow: 1, backgroundColor: Colors.surface },

  hero: {
    paddingTop: Spacing[10],
    paddingBottom: Spacing[8],
    paddingHorizontal: Spacing[6],
    alignItems: 'center',
    gap: Spacing[4],
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.5,
  },
  heroNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[6],
  },
  heroStat: { alignItems: 'center' },
  heroStatValue: {
    fontSize: Typography['4xl'],
    fontWeight: Typography.extrabold,
    color: Colors.white,
    lineHeight: 48,
  },
  heroStatLabel: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  heroDivider: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroDisclaimer: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },

  differentCard: {
    margin: Spacing[5],
    padding: Spacing[5],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.mint200,
    gap: Spacing[3],
    ...Shadows.card,
  },
  differentTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.mint700,
  },
  differentBody: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  thingsList: { gap: Spacing[3], marginTop: Spacing[1] },
  thingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  thingText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },

  ctas: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[6],
    gap: Spacing[3],
    alignItems: 'stretch',
  },
  primaryBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    paddingVertical: Spacing[4] + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    ...Shadows.glow,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  pricing: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing[1],
  },
  riskReversal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  riskReversalText: {
    fontSize: Typography.xs,
    color: Colors.mint600,
  },
  secondaryBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  freeNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing[1],
  },
  disclaimer: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[8],
  },
});
