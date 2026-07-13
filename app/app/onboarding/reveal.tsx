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
import { computeProjection, genericProjection, formatMonths } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';

// ── Race ritual timeline (ms) ──────────────────────────────────────────────
// An original "racing toward your goal" motif — a token speeds down a track,
// blows past a dim marker for the old, slower payoff pace, and arrives early
// at the accelerated one. No board-game imagery, names, or iconography.
const RACE_TRACK_IN     = 450;  // track + markers fade in
const RACE_HOLD_BEFORE  = 450;  // beat of anticipation before the token takes off
const RACE_DURATION     = 2500; // token travels start -> finish
const RACE_GHOST_AT     = 0.6;  // fraction of RACE_DURATION when it passes the "old pace" marker
const RACE_GHOST_PCT    = 62;   // that marker's position along the track (%)
const RACE_ARRIVAL_HOLD = 900;  // hold on the arrival flash before crossfading out
const RACE_FADE_OUT     = 550;  // dark overlay fade-out into the hero reveal
const TOKEN_SIZE = 22;
const RACE_TRACK_HEIGHT = 6;

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
  const ritualOpacity  = useRef(new Animated.Value(0)).current; // track + markers fade-in
  const tokenProgress  = useRef(new Animated.Value(0)).current; // 0 = start, 1 = finish
  const ghostPulse     = useRef(new Animated.Value(0)).current; // punch as token passes the old-pace marker
  const finishPulse    = useRef(new Animated.Value(0)).current; // arrival bounce on the finish flag
  const arrivalFlash   = useRef(new Animated.Value(0)).current; // arrival glow flash
  const particleBurst  = useRef(new Animated.Value(0)).current;
  const [raceWidth, setRaceWidth] = useState(1);

  // ── Main reveal animated values ───────────────────────────────────────────
  const heroOpacity  = useRef(new Animated.Value(0)).current;
  const heroScale    = useRef(new Animated.Value(0.97)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [displayMonths,   setDisplayMonths]   = useState(0);
  const [displayInterest, setDisplayInterest] = useState(0);
  const [animDone,        setAnimDone]        = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;

      if (reduced) {
        // Skip ritual + animations — show final values immediately.
        overlayOpacity.setValue(0);
        heroOpacity.setValue(1);
        heroScale.setValue(1);
        progressAnim.setValue(1);
        setDisplayMonths(targetMonths);
        setDisplayInterest(targetInterest);
        setAnimDone(true);
        return;
      }

      // ── Phase 0 (0ms): dark screen + track/markers fade in ───────────────
      Animated.timing(ritualOpacity, {
        toValue: 1, duration: RACE_TRACK_IN, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }).start();

      // ── Race (after a beat of anticipation): token speeds to the finish ──
      const tRaceStart = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(tokenProgress, {
          toValue:         1,
          duration:        RACE_DURATION,
          easing:          Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, RACE_TRACK_IN + RACE_HOLD_BEFORE);

      // Punch the "old pace" marker as the token blows past it, mid-race.
      const tGhostPass = setTimeout(() => {
        if (cancelled) return;
        hapticLight();
        Animated.sequence([
          Animated.timing(ghostPulse, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(ghostPulse, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]).start();
      }, RACE_TRACK_IN + RACE_HOLD_BEFORE + RACE_DURATION * RACE_GHOST_AT);

      const tArrival = RACE_TRACK_IN + RACE_HOLD_BEFORE + RACE_DURATION;

      // Arrival: flash + bounce on the finish marker.
      const tArrivalBurst = setTimeout(() => {
        if (cancelled) return;
        hapticSuccess();
        Animated.parallel([
          Animated.sequence([
            Animated.timing(finishPulse, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
            Animated.timing(finishPulse, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(arrivalFlash, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(arrivalFlash, { toValue: 0, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ]).start();
      }, tArrival);

      const tOverlayFadeStart = tArrival + RACE_ARRIVAL_HOLD;

      // Fade out the dark overlay into the hero reveal.
      const tOverlay = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(overlayOpacity, {
          toValue: 0, duration: RACE_FADE_OUT, useNativeDriver: true,
        }).start();
      }, tOverlayFadeStart);

      // ── Phase 1: hero fades/scales in + progress bar fills (slight crossfade) ─
      const tPhase1Delay = tOverlayFadeStart + 200;
      const tPhase1 = setTimeout(() => {
        if (cancelled) return;
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
            useNativeDriver: false,   // width interpolation requires JS driver
          }),
        ]).start();
      }, tPhase1Delay);

      // ── Phase 2: months-saved count-up ────────────────────────────────────
      const tPhase2 = setTimeout(() => {
        if (cancelled) return;
        countUp(0, targetMonths, 500, (v) => setDisplayMonths(v));
      }, tPhase1Delay + 650);

      // ── Phase 3: interest count-up → particle burst + haptic ─────────────
      const tPhase3 = setTimeout(() => {
        if (cancelled) return;
        countUp(0, targetInterest, 600, (v) => setDisplayInterest(v), () => {
          if (!cancelled) {
            setAnimDone(true);
            Animated.timing(particleBurst, {
              toValue:         1,
              duration:        850,
              easing:          Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
            hapticMedium();
          }
        });
      }, tPhase1Delay + 1250);

      // Suppress unused-variable lint warnings; timeouts are guarded by `cancelled`
      void tRaceStart; void tGhostPass; void tArrivalBurst; void tOverlay; void tPhase1; void tPhase2; void tPhase3;
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Display values (clamp to final once animation is done) ────────────────
  const shownMonths   = animDone ? targetMonths   : displayMonths;
  const shownInterest = animDone ? targetInterest : displayInterest;

  async function finishAndNavigate(goUpgrade: boolean) {
    if (user) {
      await submit(user.id);
      await refreshProfile();
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

            {/* PRIMARY: time saved */}
            <View style={styles.gapBlock}>
              <Text style={styles.gapValue}>
                {formatMonths(Math.max(0, Math.round(shownMonths)))}
              </Text>
              <Text style={styles.gapSublabel}>SOONER, PROJECTED</Text>
            </View>

            {/* SECONDARY: before / after payoff dates */}
            <View style={styles.datesRow}>
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>WITHOUT</Text>
                <Text style={styles.dateColValue}>
                  {fmtPayoffDate(projection.originalPayoffDate)}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.35)" />
              <View style={styles.dateCol}>
                <Text style={[styles.dateColLabel, styles.dateColLabelAccel]}>WITH HELOC HERO</Text>
                <Text style={[styles.dateColValue, styles.dateColValueAccel]}>
                  {fmtPayoffDate(projection.acceleratedPayoffDate)}
                </Text>
              </View>
            </View>

            {/* TERTIARY: interest saved */}
            {shownInterest > 100 && (
              <View style={styles.interestRow}>
                <Ionicons name="cash-outline" size={13} color="rgba(255,255,255,0.55)" />
                <Text style={styles.interestText}>
                  Est.{' '}
                  <Text style={styles.interestBold}>
                    ${Math.round(shownInterest / 1000)}k
                  </Text>
                  {' '}in interest saved
                </Text>
              </View>
            )}

            <Text style={styles.heroDisclaimer}>
              {hasRealNumbers
                ? 'Based on your numbers. Projected, not guaranteed.'
                : 'Enter your details to see personalized projections.'}
            </Text>
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

      {/* ── Particle burst layer (above ScrollView, ignores touches) ──────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Origin sits at the approximate center of the hero number */}
        <View style={styles.particleOrigin}>
          {PARTICLES.map((p, i) => (
            <ParticleDot key={i} p={p} anim={particleBurst} />
          ))}
        </View>
      </View>

      {/* ── Ritual overlay: racing-toward-your-goal reveal (full screen) ───── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.ritualOverlay, { opacity: overlayOpacity }]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.raceScene, { opacity: ritualOpacity }]}>
          <Text style={styles.raceCaptionText}>Fast-forwarding your mortgage timeline…</Text>

          <View
            style={styles.raceRunway}
            onLayout={(e) => setRaceWidth(e.nativeEvent.layout.width)}
          >
            <View style={styles.raceTrack} />

            {/* Start marker */}
            <View style={[styles.raceMarker, styles.raceMarkerStart]}>
              <View style={styles.raceStartDot} />
              <Text style={styles.raceMarkerLabel}>TODAY</Text>
            </View>

            {/* Ghost marker — the old, slower payoff pace */}
            <Animated.View
              style={[
                styles.raceMarker,
                { left: `${RACE_GHOST_PCT}%` },
                {
                  transform: [{
                    scale: ghostPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }),
                  }],
                },
              ]}
            >
              <Ionicons name="flag-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={styles.raceMarkerLabelGhost}>OLD PACE</Text>
            </Animated.View>

            {/* Finish marker — the accelerated payoff */}
            <Animated.View
              style={[
                styles.raceMarker,
                styles.raceMarkerFinish,
                {
                  transform: [{
                    scale: finishPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }),
                  }],
                },
              ]}
            >
              <Animated.View style={[
                styles.raceFinishFlash,
                {
                  opacity: arrivalFlash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
                  transform: [{ scale: arrivalFlash.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
                },
              ]} />
              <View style={styles.raceFinishGlow} />
              <Ionicons name="flag" size={15} color="#12B76A" />
              <Text style={styles.raceMarkerLabelFinish}>YOUR PAYOFF</Text>
            </Animated.View>

            {/* Comet trail — faint echoes behind the racing token */}
            {[18, 34, 50].map((offset, i) => (
              <Animated.View
                key={offset}
                style={[
                  styles.cometDot,
                  {
                    opacity: 0.3 - i * 0.09,
                    transform: [{
                      translateX: tokenProgress.interpolate({
                        inputRange:  [0, 1],
                        outputRange: [-offset, Math.max(0, raceWidth - TOKEN_SIZE - offset)],
                        extrapolate: 'clamp',
                      }),
                    }],
                  },
                ]}
              />
            ))}

            {/* Racing token */}
            <Animated.View
              style={[
                styles.cometHead,
                {
                  transform: [{
                    translateX: tokenProgress.interpolate({
                      inputRange:  [0, 1],
                      outputRange: [0, Math.max(0, raceWidth - TOKEN_SIZE)],
                    }),
                  }],
                },
              ]}
            />
          </View>
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

  gapBlock:    { alignItems: 'center', gap: 4 },
  gapValue: {
    fontSize:   44,
    fontWeight: Typography.extrabold,
    color:      Colors.white,
    lineHeight: 52,
    textAlign:  'center',
  },
  gapSublabel: {
    fontSize:      11,
    fontWeight:    Typography.bold,
    color:         'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
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

  interestRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] + 2 },
  interestText: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.6)' },
  interestBold: { fontWeight: Typography.semibold, color: 'rgba(255,255,255,0.85)' },

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
    top:      170,   // approximate center of the hero number on most devices
    left:     '50%', // left edge at horizontal center; particles radiate symmetrically
  },

  // ── Ritual overlay ─────────────────────────────────────────────────────────
  ritualOverlay: {
    backgroundColor: '#081A0F',
    alignItems:      'center',
    justifyContent:  'center',
  },
  raceScene: {
    width:             '100%',
    paddingHorizontal: Spacing[8],
    alignItems:        'center',
    gap:               Spacing[10],
  },
  raceCaptionText: {
    fontSize:      Typography.sm,
    fontWeight:    Typography.semibold,
    color:         'rgba(255,255,255,0.55)',
    letterSpacing: 0.4,
    textAlign:     'center',
  },
  raceRunway: {
    width:          '100%',
    height:         56,
    justifyContent: 'center',
  },
  raceTrack: {
    height:          RACE_TRACK_HEIGHT,
    borderRadius:    RACE_TRACK_HEIGHT / 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  raceMarker: {
    position:  'absolute',
    top:       -24,
    alignItems: 'center',
    gap:       4,
  },
  raceMarkerStart:  { left: -3 },
  raceMarkerFinish: { right: -6 },
  raceStartDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  raceMarkerLabel: {
    fontSize:      9,
    fontWeight:    Typography.bold,
    color:         'rgba(255,255,255,0.5)',
    letterSpacing: 0.8,
  },
  raceMarkerLabelGhost: {
    fontSize:      9,
    fontWeight:    Typography.bold,
    color:         'rgba(255,255,255,0.35)',
    letterSpacing: 0.8,
  },
  raceMarkerLabelFinish: {
    fontSize:      9,
    fontWeight:    Typography.extrabold,
    color:         '#12B76A',
    letterSpacing: 0.8,
  },
  // Ambient ring around the finish flag, always faintly visible
  raceFinishGlow: {
    position:        'absolute',
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: 'rgba(18, 183, 106, 0.3)',
  },
  // Bigger flash that flares up only on arrival
  raceFinishFlash: {
    position:        'absolute',
    width:           60,
    height:          60,
    borderRadius:    30,
    backgroundColor: 'rgba(74, 222, 128, 0.55)',
  },
  // Racing token
  cometHead: {
    position:        'absolute',
    top:             (RACE_TRACK_HEIGHT - TOKEN_SIZE) / 2,
    width:           TOKEN_SIZE,
    height:          TOKEN_SIZE,
    borderRadius:    TOKEN_SIZE / 2,
    backgroundColor: '#12B76A',
    shadowColor:     '#12B76A',
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.8,
    shadowRadius:    8,
    elevation:       6,
  },
  // Faint trailing echoes behind the token
  cometDot: {
    position:        'absolute',
    top:             (RACE_TRACK_HEIGHT - TOKEN_SIZE * 0.55) / 2,
    width:           TOKEN_SIZE * 0.55,
    height:          TOKEN_SIZE * 0.55,
    borderRadius:    (TOKEN_SIZE * 0.55) / 2,
    backgroundColor: '#4ade80',
  },
});
