// app/onboarding/welcome.tsx — full-bleed aurora splash.
//
// Composition follows the reference: mark up top, oversized tight-tracked
// headline anchored to the lower third, white pill primary, plain-text
// secondary. The headline is deliberately a question — a bald "own it in 10
// years" would be an unsubstantiated performance claim on a screen that has
// none of the user's numbers yet.
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Animated, AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuroraBackground from '../../components/Aurora';
import { Typography, Spacing, Radius, Aurora } from '../../lib/theme';

const { width: SW } = Dimensions.get('window');

// Display type sits above the token scale (which tops out at 36) and needs
// negative tracking to hold together at size.
const DISPLAY_SIZE = Math.min(42, SW * 0.108);
const DISPLAY_LEAD = DISPLAY_SIZE * 1.04;

const VALUE_PROPS = [
  { icon: 'trending-down-outline' as const, text: 'Cut years off your payoff — projected' },
  { icon: 'cash-outline'          as const, text: 'Keep more of your own interest' },
  { icon: 'calendar-outline'      as const, text: 'Watch your payoff date move closer' },
  { icon: 'flash-outline'         as const, text: 'Runs on autopilot once it is set up' },
];

const PROP_INTERVAL = 3200;

export default function WelcomeScreen() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [propIdx, setPropIdx] = useState(0);

  // Entrance stagger
  const markOpacity = useRef(new Animated.Value(0)).current;
  const headOpacity = useRef(new Animated.Value(0)).current;
  const headY       = useRef(new Animated.Value(24)).current;
  const ctaOpacity  = useRef(new Animated.Value(0)).current;
  const ctaY        = useRef(new Animated.Value(16)).current;

  // Crossfade for the rotating value prop
  const propOpacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);

  const advanceProp = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (reduceMotion.current) {
        setPropIdx(i => (i + 1) % VALUE_PROPS.length);
        advanceProp();
        return;
      }
      Animated.timing(propOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setPropIdx(i => (i + 1) % VALUE_PROPS.length);
        Animated.timing(propOpacity, { toValue: 1, duration: 320, useNativeDriver: true }).start();
      });
      advanceProp();
    }, PROP_INTERVAL);
  }, [propOpacity]);

  useEffect(() => {
    let gone = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (gone) return;
      reduceMotion.current = reduced;
      if (reduced) {
        markOpacity.setValue(1);
        headOpacity.setValue(1); headY.setValue(0);
        ctaOpacity.setValue(1);  ctaY.setValue(0);
      } else {
        Animated.stagger(160, [
          Animated.timing(markOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(headOpacity, { toValue: 1, duration: 560, useNativeDriver: true }),
            Animated.timing(headY,       { toValue: 0, duration: 560, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(ctaOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
            Animated.timing(ctaY,       { toValue: 0, duration: 420, useNativeDriver: true }),
          ]),
        ]).start();
      }
    });

    advanceProp();

    return () => {
      gone = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [advanceProp]);

  function startProjection() {
    import('expo-haptics').then((H) => {
      H.impactAsync(H.ImpactFeedbackStyle.Medium).catch(() => {});
    }).catch(() => {});
    router.push('/onboarding/home-info' as never);
  }

  const prop = VALUE_PROPS[propIdx];

  return (
    <AuroraBackground style={s.root}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* ── Mark ─────────────────────────────────────────────────────── */}
        <Animated.View style={[s.markBlock, { opacity: markOpacity }]}>
          <Text style={s.markKicker}>HELOC</Text>
          <Text style={s.markWord}>HERO</Text>
        </Animated.View>

        <View style={s.spacer} />

        {/* ── Headline ─────────────────────────────────────────────────── */}
        <Animated.View style={[s.headBlock, { opacity: headOpacity, transform: [{ translateY: headY }] }]}>
          <Text style={s.headline} accessibilityRole="header">
            WHAT IF YOU{'\n'}OWNED IT IN{'\n'}10 YEARS —{'\n'}NOT 30?
          </Text>
          <Text style={s.subcopy}>
            Run your numbers and see your projected payoff date. Takes about two minutes.
          </Text>
        </Animated.View>

        {/* ── Rotating value prop ──────────────────────────────────────── */}
        <Animated.View style={[s.propRow, { opacity: Animated.multiply(propOpacity, ctaOpacity) }]}>
          <Ionicons name={prop.icon} size={14} color={Aurora.glowSoft} />
          <Text style={s.propText}>{prop.text}</Text>
        </Animated.View>

        {/* ── CTAs ─────────────────────────────────────────────────────── */}
        <Animated.View style={[s.ctas, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}>
          <TouchableOpacity
            style={s.primary}
            onPress={startProjection}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Get my projection"
          >
            <Text style={s.primaryText}>Get my projection</Text>
            <Ionicons name="arrow-forward" size={17} color={Aurora.deepest} />
          </TouchableOpacity>

          <Text style={s.freeNote}>Free to start. No card required.</Text>

          <TouchableOpacity
            style={s.secondary}
            onPress={() => router.push('/auth/login' as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Sign in to an existing account"
          >
            <Text style={s.secondaryText}>I already have an account</Text>
          </TouchableOpacity>
        </Animated.View>

      </SafeAreaView>
    </AuroraBackground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Aurora.deepest },
  safe: { flex: 1, paddingHorizontal: Spacing[6] },

  // ── Mark ──────────────────────────────────────────────────────────────
  markBlock: { paddingTop: Spacing[4] },
  markKicker: {
    fontSize:      10,
    fontWeight:    Typography.extrabold,
    color:         'rgba(255,255,255,0.42)',
    letterSpacing: 7,
  },
  markWord: {
    fontSize:      22,
    fontWeight:    Typography.extrabold,
    color:         '#ffffff',
    letterSpacing: 2,
    marginTop:     1,
  },

  spacer: { flex: 1 },

  // ── Headline ──────────────────────────────────────────────────────────
  headBlock: { gap: Spacing[4] },
  headline: {
    fontSize:      DISPLAY_SIZE,
    lineHeight:    DISPLAY_LEAD,
    letterSpacing: -1.2,
    fontWeight:    Typography.extrabold,
    color:         '#ffffff',
  },
  subcopy: {
    fontSize:   Typography.base,
    lineHeight: 24,
    color:      'rgba(255,255,255,0.66)',
    maxWidth:   320,
  },

  // ── Value prop ────────────────────────────────────────────────────────
  propRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[2],
    minHeight:     22,
    marginTop:     Spacing[6],
    marginBottom:  Spacing[5],
  },
  propText: {
    fontSize:   Typography.sm,
    color:      'rgba(255,255,255,0.60)',
    flexShrink: 1,
  },

  // ── CTAs ──────────────────────────────────────────────────────────────
  ctas: { paddingBottom: Spacing[4], gap: Spacing[3] },
  primary: {
    backgroundColor: '#ffffff',
    borderRadius:    Radius.full,
    paddingVertical: Spacing[4] + 2,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing[2],
    minHeight:       56,
  },
  primaryText: {
    color:         Aurora.deepest,
    fontSize:      Typography.base,
    fontWeight:    Typography.bold,
    letterSpacing: -0.2,
  },
  freeNote: {
    fontSize:  Typography.xs,
    color:     'rgba(255,255,255,0.46)',
    textAlign: 'center',
  },
  secondary: {
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: Spacing[3],
    minHeight:       44,
  },
  secondaryText: {
    fontSize:   Typography.base,
    fontWeight: Typography.semibold,
    color:      'rgba(255,255,255,0.88)',
  },
});
