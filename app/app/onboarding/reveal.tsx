// app/onboarding/reveal.tsx — personalized projection reveal + conversion CTA
import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Easing, AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { useAuth } from '../../hooks/useAuth';
import { computeProjection, genericProjection } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';

// Ease-out cubic counter using requestAnimationFrame.
function countUp(
  from: number,
  to: number,
  duration: number,
  onTick: (v: number) => void,
  onDone?: () => void,
) {
  const start = Date.now();
  function step() {
    const t = Math.min((Date.now() - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    onTick(from + (to - from) * eased);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      onTick(to);
      onDone?.();
    }
  }
  requestAnimationFrame(step);
}

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

  const targetYears    = projection.monthsSaved / 12;
  const targetInterest = Math.max(0, Math.round(projection.interestSaved));
  const hasRealNumbers = projection.monthsSaved > 0;

  // ─── Animation state ───────────────────────────────────────────────────────
  const heroOpacity   = useRef(new Animated.Value(0)).current;
  const heroScale     = useRef(new Animated.Value(0.97)).current;
  const progressAnim  = useRef(new Animated.Value(0)).current;
  const [displayYears,    setDisplayYears]    = useState(0);
  const [displayInterest, setDisplayInterest] = useState(0);
  const [animDone,        setAnimDone]        = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;

      if (reduced) {
        // Skip animation — show final values immediately.
        heroOpacity.setValue(1);
        heroScale.setValue(1);
        progressAnim.setValue(1);
        setDisplayYears(targetYears);
        setDisplayInterest(targetInterest);
        setAnimDone(true);
        return;
      }

      // Phase 1 (0-650ms): hero fades/scales in + progress bar fills.
      Animated.parallel([
        Animated.timing(heroOpacity, {
          toValue:         1,
          duration:        650,
          easing:          Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(heroScale, {
          toValue:         1,
          duration:        700,
          easing:          Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(progressAnim, {
          toValue:         1,
          duration:        550,
          easing:          Easing.inOut(Easing.quad),
          useNativeDriver: false,  // width interpolation requires JS driver
        }),
      ]).start();

      // Phase 2 (650ms): years saved count up.
      const t2 = setTimeout(() => {
        if (cancelled) return;
        countUp(0, targetYears, 500, (v) => setDisplayYears(v));
      }, 650);

      // Phase 3 (1250ms): interest saved count up → haptic at payoff beat.
      const t3 = setTimeout(() => {
        if (cancelled) return;
        countUp(0, targetInterest, 600, (v) => setDisplayInterest(v), () => {
          if (!cancelled) {
            setAnimDone(true);
            // Guard haptics — native module, not available in Expo Go.
            import('expo-haptics').then((Haptics) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }).catch(() => {});
          }
        });
      }, 1250);

      return () => {
        clearTimeout(t2);
        clearTimeout(t3);
      };
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Display values (clamp to final once animation is done) ────────────────
  const shownYears    = animDone ? targetYears    : displayYears;
  const shownInterest = animDone ? targetInterest : displayInterest;

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

        {/* Projection hero — animated */}
        <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
          <LinearGradient colors={Gradients.hero} style={styles.hero}>
            <Text style={styles.heroLabel}>YOUR ESTIMATED RESULTS</Text>

            {/* Anticipation bar — fills left-to-right before numbers appear */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[styles.progressFill, {
                  width: progressAnim.interpolate({
                    inputRange:  [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                }]}
              />
            </View>

            <View style={styles.heroNumbers}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{shownYears.toFixed(1)} yrs</Text>
                <Text style={styles.heroStatLabel}>Projected sooner</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {shownInterest > 0 ? `$${Math.round(shownInterest / 1000)}k` : '—'}
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
        </Animated.View>

        {/* No-HELOC card */}
        {!data.hasHeloc && (
          <TouchableOpacity
            style={styles.noHelocCard}
            onPress={() => router.push('/modals/get-heloc' as never)}
            accessibilityLabel="Open HELOC guide"
          >
            <View style={styles.noHelocRow}>
              <View style={styles.noHelocIcon}>
                <Ionicons name="home-outline" size={22} color={Colors.mint600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noHelocTitle}>First step: open a HELOC</Text>
                <Text style={styles.noHelocBody}>
                  The strategy requires an interest-only HELOC with a 10+ year draw period.
                  Tap to see what to look for and avoid.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.mint400} />
            </View>
          </TouchableOpacity>
        )}

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

          <View style={styles.riskReversal}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.mint600} />
            <Text style={styles.riskReversalText}>
              Free trial ends automatically — no surprise charges.
            </Text>
          </View>

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
  safe:      { flex: 1, backgroundColor: Colors.mint700 },
  container: { flexGrow: 1, backgroundColor: Colors.surface },

  hero: {
    paddingTop:        Spacing[10],
    paddingBottom:     Spacing[8],
    paddingHorizontal: Spacing[6],
    alignItems:        'center',
    gap:               Spacing[4],
  },
  heroLabel: {
    fontSize:      11,
    fontWeight:    Typography.extrabold,
    color:         'rgba(255,255,255,0.65)',
    letterSpacing: 1.5,
  },

  progressTrack: {
    width:           '40%',
    height:          2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius:    1,
    overflow:        'hidden',
  },
  progressFill: {
    height:          '100%',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius:    1,
  },

  heroNumbers: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[6],
  },
  heroStat:      { alignItems: 'center' },
  heroStatValue: {
    fontSize:   Typography['4xl'],
    fontWeight: Typography.extrabold,
    color:      Colors.white,
    lineHeight: 48,
  },
  heroStatLabel: {
    fontSize:  Typography.xs,
    color:     'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  heroDivider: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroDisclaimer: {
    fontSize:  Typography.xs,
    color:     'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },

  noHelocCard: {
    marginHorizontal: Spacing[5],
    backgroundColor:  Colors.mint50,
    borderRadius:     Radius.xl,
    padding:          Spacing[4],
    borderWidth:      1,
    borderColor:      Colors.mint200,
    ...Shadows.card,
  },
  noHelocRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  noHelocIcon: {
    width:           40,
    height:          40,
    borderRadius:    Radius.md,
    backgroundColor: Colors.mint100,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  noHelocTitle: {
    fontSize:     Typography.base,
    fontWeight:   Typography.semibold,
    color:        Colors.mint700,
    marginBottom: 2,
  },
  noHelocBody: { fontSize: Typography.xs, color: Colors.mint600, lineHeight: 18 },

  differentCard: {
    margin:          Spacing[5],
    padding:         Spacing[5],
    backgroundColor: Colors.mint50,
    borderRadius:    Radius.xl,
    borderWidth:     1,
    borderColor:     Colors.mint200,
    gap:             Spacing[3],
    ...Shadows.card,
  },
  differentTitle: {
    fontSize:   Typography.lg,
    fontWeight: Typography.bold,
    color:      Colors.mint700,
  },
  differentBody: {
    fontSize:   Typography.sm,
    color:      Colors.textSecondary,
    lineHeight: 21,
  },
  thingsList: { gap: Spacing[3], marginTop: Spacing[1] },
  thingRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           Spacing[3],
  },
  thingText: {
    flex:       1,
    fontSize:   Typography.sm,
    color:      Colors.textPrimary,
    lineHeight: 20,
  },

  ctas: {
    paddingHorizontal: Spacing[6],
    paddingBottom:     Spacing[6],
    gap:               Spacing[3],
    alignItems:        'stretch',
  },
  primaryBtn: {
    backgroundColor: Colors.mint600,
    borderRadius:    Radius.md,
    paddingVertical: Spacing[4] + 2,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing[2],
    ...Shadows.glow,
  },
  primaryBtnText: {
    color:      Colors.white,
    fontSize:   Typography.base,
    fontWeight: Typography.bold,
  },
  pricing: {
    fontSize:  Typography.xs,
    color:     Colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing[1],
  },
  riskReversal: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  riskReversalText: {
    fontSize: Typography.xs,
    color:    Colors.mint600,
  },
  secondaryBtn: {
    borderRadius:    Radius.md,
    paddingVertical: Spacing[4],
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  secondaryBtnText: {
    fontSize:   Typography.base,
    color:      Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  freeNote: {
    fontSize:  Typography.xs,
    color:     Colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing[1],
  },
  disclaimer: {
    fontSize:          Typography.xs,
    color:             Colors.textMuted,
    lineHeight:        18,
    textAlign:         'center',
    paddingHorizontal: Spacing[6],
    paddingBottom:     Spacing[8],
  },
});
