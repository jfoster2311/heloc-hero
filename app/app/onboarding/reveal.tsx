// app/onboarding/reveal.tsx — personalized projection reveal + conversion CTA
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Easing, AccessibilityInfo, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuroraBackground from '../../components/Aurora';
import PayoffBoard from '../../components/PayoffBoard';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { useAuth } from '../../hooks/useAuth';
import { computeProjection, genericProjection, formatMonths } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius, Shadows, Aurora } from '../../lib/theme';
import { hapticMedium } from '../../lib/haptics';

// ── Board ritual timeline (ms) ─────────────────────────────────────────────
// Black beat, then the aurora rises slowly while the projection "computes",
// then an avatar walks the countdown board from the years left today down to
// the projected payoff year.
// The walk's own length is dynamic, so everything after arrival is sequenced
// from the board's onArrive rather than a fixed offset chain.
//
// The board is a plain path of year tiles in HELOC Hero's own identity — no
// board-game trade dress (ring layout, corner squares, property bands, or
// licensed iconography).
const DARK_HOLD      = 400;   // pure black before anything appears
const AURORA_IN      = 1300;  // gradient rises slowly — the "calculating" beat
const BOARD_IN       = 600;   // board + caption fade in, overlapping the aurora
const BOARD_IN_AT    = 500;   // when the board starts fading in, after DARK_HOLD
const WALK_LEAD_IN   = 350;   // beat between the aurora settling and the first hop
const ARRIVAL_HOLD   = 1100;  // hold on the landed tile before crossfading out
const RITUAL_FADE_OUT = 550;  // overlay fade-out into the hero reveal

// ── Particle system (module-level so Math.random runs once at load) ──────────
const GREENS = ['#12B76A', '#4ade80', '#6ee7b7', '#34d399', 'rgba(74,222,128,0.8)'];
interface Particle { angle: number; dist: number; size: number; color: string }
const PARTICLES: Particle[] = Array.from({ length: 26 }, (_, i) => ({
  angle: (i / 26) * Math.PI * 2 + (Math.random() * 0.48 - 0.24),
  dist:  60 + Math.random() * 90,
  size:  3 + Math.random() * 5,
  color: GREENS[i % GREENS.length],
}));

function ParticleDot({ p, anim }: { p: Particle; anim: Animated.Value }) {
  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.dist * Math.cos(p.angle)] });
  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.dist * Math.sin(p.angle)] });
  const op = anim.interpolate({ inputRange: [0, 0.1, 0.6, 1], outputRange: [0, 1, 0.85, 0] });
  const sc = anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1.4, 0.7] });
  return (
    <Animated.View style={{
      position:        'absolute',
      width:           p.size,
      height:          p.size,
      borderRadius:    p.size / 2,
      backgroundColor: p.color,
      opacity:         op,
      transform:       [{ translateX: tx }, { translateY: ty }, { scale: sc }],
    }} />
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function fmtPayoffDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

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
  const { user, refresh: refreshProfile } = useAuth();

  const projection = (() => {
    const surplus = Math.max(0,
      (data.monthlyIncome ?? 0) - (data.monthlyExpenses ?? 0) - (data.monthlyPayment ?? 0),
    );
    if (data.mortgageBalance && data.mortgageRate && data.monthlyPayment) {
      return computeProjection({
        mortgageBalance: data.mortgageBalance,
        mortgageRate:    data.mortgageRate,
        monthlyPayment:  data.monthlyPayment,
        monthlySurplus:  surplus || 600,
        helocRate:       data.helocRate ?? 0.085,
        helocLimit:      data.helocLimit || undefined,
      });
    }
    return genericProjection();
  })();

  const targetMonths   = projection.monthsSaved;
  const targetInterest = Math.max(0, Math.round(projection.interestSaved));
  const hasRealNumbers = projection.monthsSaved > 0;

  // ── Ritual animated values ─────────────────────────────────────────────────
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const auroraOpacity  = useRef(new Animated.Value(0)).current; // gradient rises out of black
  const ritualOpacity  = useRef(new Animated.Value(0)).current; // board + caption fade-in
  const particleBurst  = useRef(new Animated.Value(0)).current;
  const [boardActive, setBoardActive] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Board geometry. The board counts DOWN: it opens on the years left under
  // the current schedule and the avatar walks to the projected payoff year, so
  // the distance travelled is the time the strategy removes. computeProjection
  // amortizes forward from today's balance, so originalMonths is already
  // remaining term, not the original 30-year note.
  //
  // ceil, not round: the tile is the year payoff happens *in*. Month 170 is
  // 14.2 years, but year 14 ends at month 168 — so that payoff lands in year
  // 15. Rounding would show a year they have not actually reached yet, and it
  // errs optimistic, which is the wrong direction for a projected number.
  const boardTotalYears = Math.max(1, Math.ceil(projection.originalMonths / 12));
  const boardTargetYear = Math.min(
    boardTotalYears,
    Math.max(1, Math.ceil(projection.acceleratedMonths / 12)),
  );

  // ── Main reveal animated values ───────────────────────────────────────────
  const heroOpacity  = useRef(new Animated.Value(0)).current;
  const heroScale    = useRef(new Animated.Value(0.97)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [displayMonths,   setDisplayMonths]   = useState(0);
  const [displayInterest, setDisplayInterest] = useState(0);
  const [animDone,        setAnimDone]        = useState(false);

  const cancelledRef = useRef(false);

  /** Crossfade the ritual out and run the hero count-ups. Fired on arrival. */
  const runHeroReveal = useCallback(() => {
    const t0 = setTimeout(() => {
      if (cancelledRef.current) return;
      Animated.timing(overlayOpacity, {
        toValue: 0, duration: RITUAL_FADE_OUT, useNativeDriver: true,
      }).start();
    }, ARRIVAL_HOLD);

    const heroAt = ARRIVAL_HOLD + 200;

    const t1 = setTimeout(() => {
      if (cancelledRef.current) return;
      Animated.parallel([
        Animated.timing(heroOpacity, {
          toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(heroScale, {
          toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(progressAnim, {
          toValue: 1, duration: 550, easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,   // width interpolation requires JS driver
        }),
      ]).start();
    }, heroAt);

    const t2 = setTimeout(() => {
      if (cancelledRef.current) return;
      countUp(0, targetMonths, 500, (v) => setDisplayMonths(v));
    }, heroAt + 650);

    const t3 = setTimeout(() => {
      if (cancelledRef.current) return;
      countUp(0, targetInterest, 600, (v) => setDisplayInterest(v), () => {
        if (cancelledRef.current) return;
        setAnimDone(true);
        Animated.timing(particleBurst, {
          toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
        hapticMedium();
      });
    }, heroAt + 1250);

    void t0; void t1; void t2; void t3;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMonths, targetInterest]);

  useEffect(() => {
    cancelledRef.current = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelledRef.current) return;
      setReduceMotion(reduced);

      if (reduced) {
        // Skip the ritual entirely — show final values immediately.
        overlayOpacity.setValue(0);
        heroOpacity.setValue(1);
        heroScale.setValue(1);
        progressAnim.setValue(1);
        setDisplayMonths(targetMonths);
        setDisplayInterest(targetInterest);
        setAnimDone(true);
        return;
      }

      // ── Beat 1: hold on black, then raise the aurora slowly ──────────────
      const tAurora = setTimeout(() => {
        if (cancelledRef.current) return;
        Animated.timing(auroraOpacity, {
          toValue: 1, duration: AURORA_IN, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }).start();
      }, DARK_HOLD);

      // ── Beat 2: board fades in over the rising gradient ──────────────────
      const tBoard = setTimeout(() => {
        if (cancelledRef.current) return;
        Animated.timing(ritualOpacity, {
          toValue: 1, duration: BOARD_IN, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start();
      }, DARK_HOLD + BOARD_IN_AT);

      // ── Beat 3: the walk. Everything after it is driven by onArrive. ─────
      const tWalk = setTimeout(() => {
        if (cancelledRef.current) return;
        setBoardActive(true);
      }, DARK_HOLD + AURORA_IN + WALK_LEAD_IN);

      void tAurora; void tBoard; void tWalk;
    });

    return () => {
      cancelledRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Display values (clamp to final once animation is done) ────────────────
  const shownMonths   = animDone ? targetMonths   : displayMonths;
  const shownInterest = animDone ? targetInterest : displayInterest;

  async function finishAndNavigate(goUpgrade: boolean) {
    if (user) {
      // If this fails, onboarding_complete stays false and the layout guard
      // sends the user straight back into onboarding. Surface it instead of
      // navigating into that loop.
      const { error } = await submit(user.id);
      if (error) {
        Alert.alert(
          'Could not save your details',
          `${error}\n\nYour numbers weren't saved. Please try again.`,
        );
        return;
      }
      await refreshProfile();
    }
    const dest = user ? '/tabs/dashboard' : '/auth/signup';
    router.replace(dest as never);
    if (goUpgrade) setTimeout(() => router.push('/modals/upgrade' as never), 300);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Projection hero — animated.
            Carries the ritual's aurora into the result instead of switching to a
            flat card, so the reveal and its payoff read as one moment. The
            gradient bleeds into the page below rather than ending on a hard
            card edge. Both figures the user came for — years removed and
            interest saved — are at display scale. */}
        <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
          <AuroraBackground style={styles.hero} intensity={0.9}>
            <Text style={styles.heroLabel}>YOUR PROJECTED RESULTS</Text>

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

            {/* PRIMARY: years removed */}
            <View style={styles.gapBlock}>
              <Text style={styles.gapValue} allowFontScaling={false}>
                {formatMonths(Math.max(0, Math.round(shownMonths)))}
              </Text>
              <Text style={styles.gapSublabel}>OFF YOUR MORTGAGE</Text>
            </View>

            {/* PRIMARY: interest saved — the other half of the answer */}
            {targetInterest > 100 && (
              <View style={styles.savedBlock}>
                <Text style={styles.savedValue} allowFontScaling={false}>
                  ${Math.round(shownInterest).toLocaleString('en-US')}
                </Text>
                <Text style={styles.savedSublabel}>LESS INTEREST PAID</Text>
              </View>
            )}

            {/* SECONDARY: before / after payoff dates */}
            <View style={styles.datesRow}>
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>WITHOUT</Text>
                <Text style={styles.dateColValue}>
                  {fmtPayoffDate(projection.originalPayoffDate)}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" />
              <View style={styles.dateCol}>
                <Text style={[styles.dateColLabel, styles.dateColLabelAccel]}>WITH HELOC HERO</Text>
                <Text style={[styles.dateColValue, styles.dateColValueAccel]}>
                  {fmtPayoffDate(projection.acceleratedPayoffDate)}
                </Text>
              </View>
            </View>

            <Text style={styles.heroDisclaimer}>
              {hasRealNumbers
                ? 'Based on your numbers. Projected, not guaranteed.'
                : 'Enter your details to see personalized projections.'}
            </Text>

            {/* Bleeds the aurora into the page instead of a hard edge */}
            <LinearGradient
              colors={['rgba(240,247,243,0)', Colors.surface]}
              style={styles.heroFade}
              pointerEvents="none"
            />
          </AuroraBackground>
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
            <ThingRow icon="calculator-outline"   text="Calculates the exact principal dump amount each cycle" />
            <ThingRow icon="time-outline"         text="Times each dump to maximize daily interest reduction" />
            <ThingRow icon="trending-down-outline" text="Shows a live payoff curve that updates with your real balances" />
          </View>
        </View>

        {/* Primary CTA */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => finishAndNavigate(true)}
            disabled={saving}
            accessibilityLabel="See what Pro adds"
          >
            <Text style={styles.primaryBtnText}>See what Pro adds</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>

          {/* No introductory offer is configured in App Store Connect, so this
              must not promise a trial. The paywall shows a trial only when
              StoreKit actually returns one. */}
          <Text style={styles.pricing}>Pro is $19.99/mo or $175/yr. Cancel anytime.</Text>

          <View style={styles.riskReversal}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.mint600} />
            <Text style={styles.riskReversalText}>
              Everything you just saw stays free. Pro adds live accounts and alerts.
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

      {/* ── Particle burst layer (above ScrollView, ignores touches) ──────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Origin sits at the approximate center of the hero number */}
        <View style={styles.particleOrigin}>
          {PARTICLES.map((p, i) => (
            <ParticleDot key={i} p={p} anim={particleBurst} />
          ))}
        </View>
      </View>

      {/* ── Ritual overlay: black → aurora rises → avatar walks the board ──── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.ritualOverlay, { opacity: overlayOpacity }]}
        pointerEvents="none"
      >
        {/* Gradient rises out of black while the projection computes */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: auroraOpacity }]}>
          <AuroraBackground style={StyleSheet.absoluteFill} />
        </Animated.View>

        <Animated.View style={[styles.boardScene, { opacity: ritualOpacity }]}>
          <PayoffBoard
            totalYears={boardTotalYears}
            targetYear={boardTargetYear}
            active={boardActive}
            reduceMotion={reduceMotion}
            onArrive={runHeroReveal}
          />
        </Animated.View>
      </Animated.View>
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

  // ── Hero card ──────────────────────────────────────────────────────────────
  hero: {
    paddingTop:        Spacing[12],
    // Extra room at the base so the fade has somewhere to land.
    paddingBottom:     Spacing[12],
    paddingHorizontal: Spacing[6],
    alignItems:        'center',
    gap:               Spacing[4],
    overflow:          'hidden',
  },
  // The aurora dissolving into the page, as in the reference shots — no card edge.
  heroFade: {
    position: 'absolute',
    left:     0,
    right:    0,
    bottom:   0,
    height:   Spacing[10],
  },
  heroLabel: {
    fontSize:      11,
    fontWeight:    Typography.extrabold,
    color:         'rgba(255,255,255,0.6)',
    letterSpacing: 1.6,
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

  // Display numerals: oversized and tightly tracked, the way the reference
  // fintech screens treat a balance. The number is the design.
  gapBlock:    { alignItems: 'center', gap: 2 },
  gapValue: {
    fontSize:      56,
    fontWeight:    Typography.extrabold,
    color:         Colors.white,
    lineHeight:    62,
    letterSpacing: -1.6,
    textAlign:     'center',
  },
  gapSublabel: {
    fontSize:      11,
    fontWeight:    Typography.bold,
    color:         'rgba(255,255,255,0.55)',
    letterSpacing: 1.4,
  },

  savedBlock: {
    alignItems:     'center',
    gap:            2,
    paddingTop:     Spacing[4],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    alignSelf:      'stretch',
  },
  savedValue: {
    fontSize:      40,
    fontWeight:    Typography.extrabold,
    color:         Aurora.glowSoft,
    lineHeight:    46,
    letterSpacing: -1.2,
    textAlign:     'center',
  },
  savedSublabel: {
    fontSize:      11,
    fontWeight:    Typography.bold,
    color:         'rgba(255,255,255,0.55)',
    letterSpacing: 1.4,
  },

  datesRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4] },
  dateCol:           { alignItems: 'center', gap: 3 },
  dateColLabel: {
    fontSize:      10,
    fontWeight:    Typography.bold,
    color:         'rgba(255,255,255,0.45)',
    letterSpacing: 1,
  },
  dateColLabelAccel: { color: 'rgba(255,255,255,0.75)' },
  dateColValue: {
    fontSize:   Typography.base,
    fontWeight: Typography.semibold,
    color:      'rgba(255,255,255,0.65)',
  },
  dateColValueAccel: { color: Colors.white },

  heroDisclaimer: {
    fontSize:  Typography.xs,
    color:     'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },

  // ── No-HELOC card ──────────────────────────────────────────────────────────
  noHelocCard: {
    marginHorizontal: Spacing[5],
    backgroundColor:  Colors.mint50,
    borderRadius:     Radius.xl,
    padding:          Spacing[4],
    borderWidth:      1,
    borderColor:      Colors.mint200,
    ...Shadows.card,
  },
  noHelocRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
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

  // ── "Not a budgeting app" card ─────────────────────────────────────────────
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
  differentTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.mint700 },
  differentBody:  { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
  thingsList:     { gap: Spacing[3], marginTop: Spacing[1] },
  thingRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  thingText:      { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 20 },

  // ── CTAs ───────────────────────────────────────────────────────────────────
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
  primaryBtnText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
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
  riskReversalText: { fontSize: Typography.xs, color: Colors.mint600 },
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

  // ── Particle burst ─────────────────────────────────────────────────────────
  particleOrigin: {
    position: 'absolute',
    top:      190,   // approximate center of the hero number on most devices
    left:     '50%', // left edge at horizontal center; particles radiate symmetrically
  },

  // ── Ritual overlay ─────────────────────────────────────────────────────────
  ritualOverlay: {
    backgroundColor: '#081A0F',
    alignItems:      'center',
    justifyContent:  'center',
  },
  boardScene: {
    width:             '100%',
    paddingHorizontal: Spacing[6],
    alignItems:        'center',
  },
});
