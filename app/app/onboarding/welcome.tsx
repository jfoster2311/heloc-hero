// app/onboarding/welcome.tsx
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const BENEFITS = [
  {
    icon: 'trending-down-outline' as const,
    title: 'Pay off 7+ years sooner',
    body: 'The HELOC strategy slashes your amortization schedule in ways extra payments alone cannot.',
    color: Colors.mint600,
  },
  {
    icon: 'cash-outline' as const,
    title: 'Save $40k–$120k in interest',
    body: 'Every surplus dollar swept to your HELOC reduces daily interest accrual immediately.',
    color: Colors.info,
  },
  {
    icon: 'flash-outline' as const,
    title: 'Fully automated strategy',
    body: 'Safe Sweep™ and Safe Dump™ move money for you — set it and forget it.',
    color: Colors.success,
  },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Hero */}
        <LinearGradient colors={Gradients.primary} style={styles.hero}>
          <View style={styles.heroContent}>
            <Text style={styles.logoMark}>HELOC</Text>
            <Text style={styles.logoHero}>HERO</Text>
            <Text style={styles.heroHeadline}>
              Pay off your{'’'}mortgage{'’'}{'
'}years sooner.
            </Text>
            <Text style={styles.heroSub}>
              The automated strategy used by 12,000+ homeowners to eliminate mortgage interest.
            </Text>
          </View>

          {/* Social proof strip */}
          <View style={styles.socialProof}>
            <SocialStat value="12,000+" label="Homeowners" />
            <View style={styles.socialDivider} />
            <SocialStat value="$74k" label="Avg. Saved" />
            <View style={styles.socialDivider} />
            <SocialStat value="7.2 yrs" label="Avg. Sooner" />
          </View>
        </LinearGradient>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: `${b.color}18` }]}>
                <Ionicons name={b.icon} size={20} color={b.color} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Trust signals */}
        <View style={styles.trustRow}>
          <TrustChip icon="shield-checkmark-outline" label="Bank-level security" />
          <TrustChip icon="gift-outline" label="7-day free trial" />
          <TrustChip icon="close-circle-outline" label="Cancel anytime" />
        </View>

        {/* CTAs */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/onboarding/home-info')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Get Started — It’s Free</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>

          <Text style={styles.noCard}>No credit card required</Text>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/auth/login')}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Already have an account? </Text>
            <Text style={[styles.secondaryBtnText, styles.secondaryBtnLink]}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SocialStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.socialStat}>
      <Text style={styles.socialStatValue}>{value}</Text>
      <Text style={styles.socialStatLabel}>{label}</Text>
    </View>
  );
}

function TrustChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.trustChip}>
      <Ionicons name={icon as any} size={12} color={Colors.textMuted} />
      <Text style={styles.trustChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.mint700 },
  container: { flexGrow: 1, backgroundColor: Colors.surface },

  hero: {
    paddingTop: Spacing[10],
    paddingBottom: 0,
    paddingHorizontal: Spacing[6],
    minHeight: SCREEN_HEIGHT * 0.44,
  },
  heroContent: {
    alignItems: 'center',
    paddingBottom: Spacing[6],
  },
  logoMark: {
    fontSize: 13,
    fontWeight: Typography.extrabold,
    color: Colors.mint200,
    letterSpacing: 6,
    marginBottom: -4,
  },
  logoHero: {
    fontSize: 54,
    fontWeight: Typography.extrabold,
    color: Colors.white,
    letterSpacing: 2,
    lineHeight: 62,
    marginBottom: Spacing[4],
  },
  heroHeadline: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: Spacing[3],
  },
  heroSub: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },

  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[6],
    marginHorizontal: -Spacing[6],
    marginBottom: 0,
  },
  socialStat: { flex: 1, alignItems: 'center' },
  socialStatValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: Colors.white,
  },
  socialStatLabel: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  socialDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  benefits: {
    padding: Spacing[6],
    gap: Spacing[5],
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -1,
  },
  benefitRow: {
    flexDirection: 'row',
    gap: Spacing[4],
    alignItems: 'flex-start',
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  benefitText: { flex: 1 },
  benefitTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  benefitBody: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[4],
    flexWrap: 'wrap',
    backgroundColor: Colors.surface,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trustChipText: { fontSize: 11, color: Colors.textMuted },

  ctas: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
    backgroundColor: Colors.surface,
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
    fontWeight: Typography.semibold,
  },
  noCard: {
    textAlign: 'center',
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: -Spacing[1],
  },
  secondaryBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Spacing[2],
  },
  secondaryBtnText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  secondaryBtnLink: {
    color: Colors.mint600,
    fontWeight: Typography.semibold,
  },
});
