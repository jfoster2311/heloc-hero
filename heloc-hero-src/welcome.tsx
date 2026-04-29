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

const { width } = Dimensions.get('window');

const BENEFITS = [
  {
    icon: 'trending-down-outline',
    title: 'Pay off your home faster',
    body: 'The average HELOC Hero user cuts 7+ years off their mortgage.',
  },
  {
    icon: 'cash-outline',
    title: 'Save tens of thousands',
    body: 'Redirect your monthly surplus to slash mortgage interest dramatically.',
  },
  {
    icon: 'flash-outline',
    title: 'Automated on autopilot',
    body: 'Safe Sweep™ and Safe Dump™ move money for you, automatically.',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero gradient */}
        <LinearGradient colors={Gradients.primary} style={styles.hero}>
          <Text style={styles.heroLogo}>HELOC HERO</Text>
          <Text style={styles.heroHeadline}>Your mortgage{'\n'}payoff accelerator</Text>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Avg. payoff 7 years sooner</Text>
          </View>
        </LinearGradient>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon as any} size={22} color={Colors.mint600} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA buttons */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/onboarding/home-info')}
          >
            <Text style={styles.primaryBtnText}>Get Started — It's Free</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={styles.secondaryBtnText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingTop: Spacing[10],
    paddingBottom: Spacing[10],
    paddingHorizontal: Spacing[6],
  },
  heroLogo: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: Colors.mint100,
    letterSpacing: 4,
    marginBottom: Spacing[4],
  },
  heroHeadline: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: Spacing[5],
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  heroBadgeText: {
    color: Colors.white,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  benefits: {
    padding: Spacing[6],
    gap: Spacing[5],
    backgroundColor: Colors.surface,
  },
  benefitRow: {
    flexDirection: 'row',
    gap: Spacing[4],
    alignItems: 'flex-start',
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.mint50,
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
  ctas: {
    padding: Spacing[6],
    backgroundColor: Colors.surface,
    gap: Spacing[3],
  },
  primaryBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
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
  secondaryBtn: {
    padding: Spacing[3],
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.mint600,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
  },
});
