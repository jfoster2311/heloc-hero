// app/onboarding/reveal.tsx — personalized projection reveal + conversion CTA
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Animated, Easing, AccessibilityInfo, Alert, ActivityIndicator,
} from 'react-native';
import { Touchable } from '../../components/ui/press';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuroraBackground from '../../components/Aurora';
import PayoffBoard from '../../components/PayoffBoard';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { useAuth } from '../../hooks/useAuth';
import { computeProjection, genericProjection, formatMonths } from '../../lib/projections';
import { Typography, Spacing, Radius, Aurora, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight, hapticMedium } from '../../lib/haptics';

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

// ── Particle system ──────────────────────────────────────────────────────────
// Geometry is module-level so Math.random runs once at load and the burst does
// not reshuffle on every render. Colour is NOT: it used to be a hardcoded list
// of hexes, two of which were copies of mint600 and mint400 — exactly the drift
// the palette rule exists to stop. The ramp index travels with the particle and
// the theme resolves it at render.
interface Particle { angle: number; dist: number; size: number; ramp: number }
const PARTICLE_RAMP_STEPS = 5;
const PARTICLES: Particle[] = Array.from({ length: 26 }, (_, i) => ({
  angle: (i / 26) * Math.PI * 2 + (Math.random() * 0.48 - 0.24),
  dist:  60 + Math.random() * 90,
  size:  3 + Math.random() * 5,
  ramp:  i % PARTICLE_RAMP_STEPS,
}));

function ParticleDot({ p, anim, color }: { p: Particle; anim: Animated.Value; color: string }) {
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
      backgroundColor: color,
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
  const { colors } = useTheme();
  const styles = useStyles();
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
  const unsureAboutHeloc = data.helocStatus === 'not_sure';

  // The burst's palette, from the theme rather than from quoted hexes. Five
  // steps to match PARTICLE_RAMP_STEPS; the alpha on the last is the one thing
  // here with no token, and it is a scatter of 3–8pt dots on a dark aurora
  // rather than anything that has to be read.
  const particleColors = [
    colors.mint600, colors.mint400, colors.mint200, colors.mint400, colors.mint600,
  ];

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
  // True once the ritual has been skipped or has finished, so neither path can
  // run the reveal twice — a tap landing in the same frame as `onArrive` would
  // otherwise start two sets of count-ups over the same values.
  const revealedRef = useRef(false);

  /** Crossfade the ritual out and run the hero count-ups. Fired on arrival. */
  const runHeroReveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;

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

    // The ticks check `cancelled` too, not just the timer that starts them.
    // countUp drives itself with requestAnimationFrame and has no stop, so
    // leaving this screen mid-count left a loop calling setState on an
    // unmounted component for the rest of its duration.
    const t2 = setTimeout(() => {
      if (cancelledRef.current) return;
      countUp(0, targetMonths, 500, (v) => {
        if (!cancelledRef.current) setDisplayMonths(v);
      });
    }, heroAt + 650);

    const t3 = setTimeout(() => {
      if (cancelledRef.current) return;
      countUp(0, targetInterest, 600, (v) => {
        if (!cancelledRef.current) setDisplayInterest(v);
      }, () => {
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
    revealedRef.current  = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelledRef.current) return;
      setReduceMotion(reduced);

      if (reduced) {
        // Skip the ritual entirely — show final values immediately. Claims the
        // reveal so a board that reports arrival anyway cannot re-run the
        // count-ups over values already at their final state.
        revealedRef.current = true;
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

  /**
   * Skip straight to the result.
   *
   * The ritual runs roughly four to six seconds before the numbers appear, and
   * there was no way out of it. Worse than merely long: the overlay is opaque
   * and `pointerEvents="none"`, so a tap during it passed through to a
   * ScrollView the user cannot see and nothing happened at all — the screen
   * reads as frozen at exactly the moment it is trying to impress someone.
   *
   * Jumps to the same end state the reduce-motion path already produces, which
   * is why this needs no new arrangement of values: that branch had proven the
   * screen is correct without any of the animation.
   */
  const skipRitual = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    hapticLight();
    overlayOpacity.setValue(0);
    heroOpacity.setValue(1);
    heroScale.setValue(1);
    progressAnim.setValue(1);
    setDisplayMonths(targetMonths);
    setDisplayInterest(targetInterest);
    setAnimDone(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMonths, targetInterest]);

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
              {/* Scales — capped — but deliberately WITHOUT the
                  adjustsFontSizeToFit that HeroValue uses. These two figures
                  count up: their text changes every frame while the ritual
                  runs, so shrink-to-fit would re-measure on each one and the
                  number would visibly wobble as it climbed. They sit in a
                  ScrollView, so larger text scrolls rather than clipping, which
                  is what makes the cap enough on its own here. */}
              <Text
                style={styles.gapValue}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
              >
                {formatMonths(Math.max(0, Math.round(shownMonths)))}
              </Text>
              <Text style={styles.gapSublabel}>OFF YOUR MORTGAGE</Text>
            </View>

            {/* PRIMARY: interest saved — the other half of the answer */}
            {targetInterest > 100 && (
              <View style={styles.savedBlock}>
                <Text
                  style={styles.savedValue}
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                >
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
              {/* Was 0.3 alpha — 2.47:1 on the aurora's lightest band, under
                  the 3:1 a meaningful icon needs. It is the only thing saying
                  these two dates are before-and-after rather than a pair. */}
              <Ionicons name="arrow-forward" size={16} color={OnDark.muted} />
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
              colors={['rgba(240,247,243,0)', colors.surface]}
              style={styles.heroFade}
              pointerEvents="none"
            />
          </AuroraBackground>
        </Animated.View>

        {/* No-HELOC card.
            "First step: open a HELOC" is the right instruction for someone who
            said they do not have one, and an assertion nobody checked for
            someone who said they were not sure — they may well already have a
            line. Same destination, since the guide covers what to look for
            either way; different sentence, because only one of them is known. */}
        {!data.hasHeloc && (
          <Touchable
            style={styles.noHelocCard}
            onPress={() => { router.push('/modals/get-heloc' as never); }}
            accessibilityRole="button"
            accessibilityLabel="Open HELOC guide"
          >
            <View style={styles.noHelocRow}>
              <View style={styles.noHelocIcon}>
                <Ionicons
                  name={unsureAboutHeloc ? 'help-circle-outline' : 'home-outline'}
                  size={22}
                  color={colors.accentInk}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noHelocTitle}>
                  {unsureAboutHeloc ? 'Check whether you have a HELOC' : 'First step: open a HELOC'}
                </Text>
                <Text style={styles.noHelocBody}>
                  {unsureAboutHeloc
                    ? 'Your projection above assumes a line. The strategy needs an interest-only ' +
                      'HELOC with a 10+ year draw period — tap to see what that means, then ' +
                      'confirm your terms.'
                    : 'The strategy requires an interest-only HELOC with a 10+ year draw period. ' +
                      'Tap to see what to look for and avoid.'}
                </Text>
              </View>
              {/* textMuted, not mint400: mint400 is a decorative tint and this
                  is a UI affordance on a light card, where 3:1 applies. */}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </Touchable>
        )}

        {/* "Not a budgeting app" card */}
        <View style={styles.differentCard}>
          <Text style={styles.differentTitle}>Not a budgeting app.</Text>
          <Text style={styles.differentBody}>
            Apps like Mint and YNAB track spending — which is helpful, but passive.
            HELOC Hero is a strategy engine that does three things no budget app can:
          </Text>
          <View style={styles.thingsList}>
            {/* Each of these has to name something lib/ actually does.
                "Times each dump to maximize daily interest reduction" was here
                and nothing in the app times anything — there is no optimiser,
                and the closest thing is computeStrike reporting when the
                balance reaches the replenish threshold. "The exact dump amount"
                overstated safeToMove too, which rounds DOWN to $500 precisely
                so it reads as a recommendation rather than an instruction. */}
            <ThingRow icon="calculator-outline"   text="Works out how much is safe to move, and what it costs your cash buffer" />
            <ThingRow icon="time-outline"         text="Tracks how far the line has to be repaid before your next dump opens" />
            <ThingRow icon="trending-down-outline" text="Shows a payoff curve that updates as your balances change" />
          </View>
        </View>

        {/* Primary CTA */}
        {/* Both buttons write the whole onboarding record before they navigate,
            which is a network call. They were already disabled while it ran and
            otherwise unchanged — so on a slow connection the tap that ends
            onboarding looked like it had not registered, and the natural
            response to that is to tap again. */}
        <View style={styles.ctas}>
          <Touchable
            style={[styles.primaryBtn, saving && styles.btnBusy]}
            onPress={() => { finishAndNavigate(true); }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="See what Pro adds"
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>See what Pro adds</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
              </>
            )}
          </Touchable>

          {/* No introductory offer is configured in App Store Connect, so this
              must not promise a trial. The paywall shows a trial only when
              StoreKit actually returns one. */}
          <Text style={styles.pricing}>Pro is $19.99/mo or $175/yr. Cancel anytime.</Text>

          <View style={styles.riskReversal}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.accentInk} />
            <Text style={styles.riskReversalText}>
              Everything you just saw stays free. Pro adds live accounts and alerts.
            </Text>
          </View>

          <Touchable
            style={[styles.secondaryBtn, saving && styles.btnBusy]}
            onPress={() => { finishAndNavigate(false); }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Continue with free version"
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            <Text style={styles.secondaryBtnText}>
              {saving ? 'Saving…' : 'Continue with the free version'}
            </Text>
          </Touchable>

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
            <ParticleDot key={i} p={p} anim={particleBurst} color={particleColors[p.ramp]} />
          ))}
        </View>
      </View>

      {/* ── Ritual overlay: black → aurora rises → avatar walks the board ────
          Takes touches now, rather than passing them through to a ScrollView
          nobody can see. `pointerEvents` flips to "none" once the reveal has
          run so the overlay — which stays mounted at zero opacity — cannot
          swallow taps meant for the buttons underneath it. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.ritualOverlay, { opacity: overlayOpacity }]}
        pointerEvents={animDone ? 'none' : 'auto'}
      >
        {/* Gradient rises out of black while the projection computes */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: auroraOpacity }]}>
          <AuroraBackground style={StyleSheet.absoluteFill} />
        </Animated.View>

        {/* Anywhere on the overlay skips — that is the obvious place to tap
            when a screen is making you wait. Rendered FIRST so the board and
            the labelled button sit above it; the board itself is not a
            responder, so a tap on it falls through to this.

            The labelled button below carries the accessibility identity. This
            layer is the same action with a bigger target, and announcing both
            would put two identical controls in VoiceOver's path. */}
        <Touchable
          style={StyleSheet.absoluteFill}
          onPress={skipRitual}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />

        <Animated.View style={[styles.boardScene, { opacity: ritualOpacity }]} pointerEvents="none">
          <PayoffBoard
            totalYears={boardTotalYears}
            targetYear={boardTargetYear}
            active={boardActive}
            reduceMotion={reduceMotion}
            onArrive={runHeroReveal}
          />
        </Animated.View>

        {/* Held back until the board is on screen: offering "Skip" against pure
            black, before anything has been shown, invites a skip past the one
            moment this screen exists for. */}
        <Animated.View style={[styles.skipWrap, { opacity: ritualOpacity }]}>
          <Touchable
            style={styles.skipBtn}
            onPress={skipRitual}
            accessibilityRole="button"
            accessibilityLabel="Skip the animation and show my results"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Touchable>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

function ThingRow({ icon, text }: { icon: string; text: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.thingRow}>
      <Ionicons name={icon as never} size={16} color={colors.accentInk} />
      <Text style={styles.thingText}>{text}</Text>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  safe:      { flex: 1, backgroundColor: t.colors.mint700 },
  container: { flexGrow: 1, backgroundColor: t.colors.surface },

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
    color:         OnDark.muted,
    letterSpacing: 1.6,
  },

  progressTrack: {
    width:           '40%',
    height:          2,
    backgroundColor: OnDark.fillStrong,
    borderRadius:    1,
    overflow:        'hidden',
  },
  progressFill: {
    height:          '100%',
    backgroundColor: OnDark.secondary,
    borderRadius:    1,
  },

  // Display numerals: oversized and tightly tracked, the way the reference
  // fintech screens treat a balance. The number is the design.
  gapBlock:    { alignItems: 'center', gap: 2 },
  gapValue: {
    fontSize:      56,
    fontWeight:    Typography.extrabold,
    color:         t.colors.white,
    lineHeight:    62,
    letterSpacing: -1.6,
    textAlign:     'center',
  },
  gapSublabel: {
    fontSize:      11,
    fontWeight:    Typography.bold,
    color:         OnDark.muted,
    letterSpacing: 1.4,
  },

  savedBlock: {
    alignItems:     'center',
    gap:            2,
    paddingTop:     Spacing[4],
    borderTopWidth: 1,
    borderTopColor: OnDark.hairline,
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
    color:         OnDark.muted,
    letterSpacing: 1.4,
  },

  datesRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4] },
  dateCol:           { alignItems: 'center', gap: 3 },
  // `faint`, which exists for exactly this: 10pt bold is SMALL text, so 4.5:1
  // applies. The 0.45 alpha this carried measured 3.75:1 on the aurora's
  // lightest band and failed. See the note on OnDark.faint in lib/theme.ts.
  dateColLabel: {
    fontSize:      10,
    fontWeight:    Typography.bold,
    color:         OnDark.faint,
    letterSpacing: 1,
  },
  dateColLabelAccel: { color: OnDark.secondary },
  dateColValue: {
    fontSize:   Typography.base,
    fontWeight: Typography.semibold,
    color:      OnDark.secondary,
  },
  dateColValueAccel: { color: t.colors.white },

  heroDisclaimer: {
    fontSize:  Typography.xs,
    color:     OnDark.faint,
    textAlign: 'center',
  },

  // ── No-HELOC card ──────────────────────────────────────────────────────────
  noHelocCard: {
    marginHorizontal: Spacing[5],
    backgroundColor:  t.colors.mint50,
    borderRadius:     Radius.xl,
    padding:          Spacing[4],
    borderWidth:      1,
    borderColor:      t.colors.mint200,
    ...t.shadows.card,
  },
  noHelocRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  noHelocIcon: {
    width:           40,
    height:          40,
    borderRadius:    Radius.md,
    backgroundColor: t.colors.mint100,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  noHelocTitle: {
    fontSize:     Typography.base,
    fontWeight:   Typography.semibold,
    color:        t.colors.mint700,
    marginBottom: 2,
  },
  noHelocBody: { fontSize: Typography.xs, color: t.colors.accentInk, lineHeight: 18 },

  // ── "Not a budgeting app" card ─────────────────────────────────────────────
  differentCard: {
    margin:          Spacing[5],
    padding:         Spacing[5],
    backgroundColor: t.colors.mint50,
    borderRadius:    Radius.xl,
    borderWidth:     1,
    borderColor:     t.colors.mint200,
    gap:             Spacing[3],
    ...t.shadows.card,
  },
  differentTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: t.colors.mint700 },
  differentBody:  { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 21 },
  thingsList:     { gap: Spacing[3], marginTop: Spacing[1] },
  thingRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  thingText:      { flex: 1, fontSize: Typography.sm, color: t.colors.textPrimary, lineHeight: 20 },

  // ── CTAs ───────────────────────────────────────────────────────────────────
  ctas: {
    paddingHorizontal: Spacing[6],
    paddingBottom:     Spacing[6],
    gap:               Spacing[3],
    alignItems:        'stretch',
  },
  primaryBtn: {
    backgroundColor: t.colors.mint600,
    borderRadius:    Radius.md,
    paddingVertical: Spacing[4] + 2,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing[2],
    ...t.shadows.glow,
  },
  primaryBtnText: { color: t.colors.onAccent, fontSize: Typography.base, fontWeight: Typography.bold },
  // Shared by both CTAs. The spinner carries the state; this only stops the
  // button looking pressable while it is not.
  btnBusy: { opacity: 0.7 },
  pricing: {
    fontSize:  Typography.xs,
    color:     t.colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing[1],
  },
  riskReversal: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  riskReversalText: { fontSize: Typography.xs, color: t.colors.accentInk },
  secondaryBtn: {
    borderRadius:    Radius.md,
    paddingVertical: Spacing[4],
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     t.colors.border,
  },
  secondaryBtnText: {
    fontSize:   Typography.base,
    color:      t.colors.textSecondary,
    fontWeight: Typography.medium,
  },
  freeNote: {
    fontSize:  Typography.xs,
    color:     t.colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing[1],
  },
  disclaimer: {
    fontSize:          Typography.xs,
    color:             t.colors.textMuted,
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
  // Bottom-centre, clear of the board and out of the way of the walk. OnDark
  // tokens throughout — this sits on the ritual's own near-black, which is the
  // one surface on this screen the page palette does not describe.
  skipWrap: {
    position:   'absolute',
    bottom:     Spacing[10],
    alignSelf:  'center',
  },
  skipBtn: {
    minHeight:        44,
    justifyContent:   'center',
    paddingHorizontal: Spacing[6],
    borderRadius:     Radius.full,
    borderWidth:      1,
    borderColor:      OnDark.hairline,
    backgroundColor:  OnDark.fill,
  },
  skipText: {
    fontSize:   Typography.sm,
    fontWeight: Typography.semibold,
    // secondary, not muted: 0.72 alpha on the ritual's #081A0F is the readable
    // end of the OnDark scale, and this is the only control on the screen.
    color:      OnDark.secondary,
    textAlign:  'center',
  },
}));
