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
import Logo from '../../components/ui/Logo';
import { Typography, Spacing, Radius, Aurora } from '../../lib/theme';

const { width: SW } = Dimensions.get('window');

// Display type sits above the token scale (which tops out at 36) and needs
// negative tracking to hold together at size.
//
// Sized off the longest line ("OFF IN 10 YEARS", 15 characters). The previous
// 0.108 was set for a shorter headline and overflows this one on every device
// narrower than an iPhone Pro Max.
const DISPLAY_SIZE = Math.min(38, SW * 0.092);
const DISPLAY_LEAD = DISPLAY_SIZE * 1.04;

// Each of these has to be something the app actually does. "Runs on autopilot
// once it is set up" used to sit in this list — the same false automation claim
// that was removed from the paywall, the App Store listing and the edge
// functions, still running on the FIRST screen a new user ever sees. HELOC Hero
// has no payment rail. What it really does between dumps is tell you when to
// act, which is what the replacement says.
const VALUE_PROPS = [
  { icon: 'trending-down-outline' as const, text: 'Cut years off your payoff — projected' },
  { icon: 'cash-outline'          as const, text: 'Keep more of your own interest' },
  { icon: 'calendar-outline'      as const, text: 'Watch your payoff date move closer' },
  { icon: 'notifications-outline' as const, text: 'Know exactly when to make your next move' },
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
          <Logo size={38} variant="inline" />
        </Animated.View>

        <View style={s.spacer} />

        {/* ── Headline ─────────────────────────────────────────────────────
            "Owned IT in 10 years" left the noun dangling — the reader has to
            guess what "it" is on the one screen where nothing else on the page
            can tell them. Naming the home is the whole job of this sentence.

            Still a question, deliberately. A flat "your home, paid off in 10
            years" is a performance claim made before the app has seen a single
            figure of the user's, which is exactly the sort of thing the honesty
            rule exists to stop. */}
        <Animated.View style={[s.headBlock, { opacity: headOpacity, transform: [{ translateY: headY }] }]}>
          <Text style={s.headline} accessibilityRole="header">
            WHAT IF YOUR{'\n'}HOME WAS PAID{'\n'}OFF IN 10 YEARS{'\n'}— NOT 30?
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
