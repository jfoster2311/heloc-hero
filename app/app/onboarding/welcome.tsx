// app/onboarding/welcome.tsx
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Dimensions, Animated, AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';

const { width: SW } = Dimensions.get('window');

// Deep greens from design spec — darker than theme Gradients.primary
const HERO_TOP = '#081A0F';
const HERO_MID = '#0C2A18';
const HERO_BTM = '#0F3D22';

const SLIDES = [
  {
    icon:     'trending-down-outline' as const,
    headline: 'Pay off years\nsooner',
    body:     'The HELOC cycling strategy reduces your daily interest balance in ways extra payments alone cannot. Results projected.',
  },
  {
    icon:     'cash-outline' as const,
    headline: 'Keep tens of thousands\nin interest',
    body:     'Every surplus dollar swept to your HELOC cuts accrued interest immediately. Amounts vary by situation.',
  },
  {
    icon:     'calendar-outline' as const,
    headline: 'Watch your payoff\ndate move closer',
    body:     'Every principal dump accelerates your payoff curve. See the exact date shift as you cycle.',
  },
  {
    icon:     'flash-outline' as const,
    headline: 'Built to run\non autopilot',
    body:     'Safe Sweep and Safe Dump time your moves automatically. Set up once and let the strategy run.',
  },
] as const;

export default function WelcomeScreen() {
  const router  = useRouter();
  const listRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef   = useRef(0);
  const [activeIdx, setActiveIdx] = useState(0);

  // Entrance animation values
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoY        = useRef(new Animated.Value(16)).current;
  const headOpacity  = useRef(new Animated.Value(0)).current;
  const headY        = useRef(new Animated.Value(20)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const next = (idxRef.current + 1) % SLIDES.length;
      idxRef.current = next;
      setActiveIdx(next);
      listRef.current?.scrollToOffset({ offset: next * SW, animated: true });
      scheduleNext();
    }, 4000);
  }, []);

  useEffect(() => {
    let gone = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (gone) return;
      if (reduced) {
        logoOpacity.setValue(1); logoY.setValue(0);
        headOpacity.setValue(1); headY.setValue(0);
        panelOpacity.setValue(1);
      } else {
        Animated.stagger(140, [
          Animated.parallel([
            Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(logoY,       { toValue: 0, duration: 500, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(headOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
            Animated.timing(headY,       { toValue: 0, duration: 420, useNativeDriver: true }),
          ]),
          Animated.timing(panelOpacity,  { toValue: 1, duration: 380, useNativeDriver: true }),
        ]).start();
      }
    });

    scheduleNext();

    return () => {
      gone = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleNext]);

  function handleDragStart() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function handleScrollEnd(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
    idxRef.current = idx;
    setActiveIdx(idx);
    scheduleNext();
  }

  function navigate() {
    import('expo-haptics').then((H) => {
      H.impactAsync(H.ImpactFeedbackStyle.Medium).catch(() => {});
    }).catch(() => {});
    router.push('/onboarding/home-info' as never);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

      {/* ── Dark hero ──────────────────────────────────────────────────── */}
      <LinearGradient colors={[HERO_TOP, HERO_MID, HERO_BTM]} style={s.hero}>
        <Animated.View style={[s.logoBlock, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
          <Text style={s.logoMark}>HELOC</Text>
          <Text style={s.logoWord}>HERO</Text>
        </Animated.View>

        <Animated.View style={[s.headBlock, { opacity: headOpacity, transform: [{ translateY: headY }] }]}>
          <Text style={s.heroHeadline}>Own your home.{'\n'}Free your future.</Text>
        </Animated.View>
      </LinearGradient>

      {/* ── Light panel ────────────────────────────────────────────────── */}
      <Animated.View style={[s.panel, { opacity: panelOpacity }]}>

        {/* Carousel */}
        <FlatList
          ref={listRef}
          data={[...SLIDES]}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          scrollEventThrottle={16}
          getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
          onScrollBeginDrag={handleDragStart}
          onMomentumScrollEnd={handleScrollEnd}
          style={s.list}
          renderItem={({ item }) => (
            <View style={s.slide}>
              <View style={s.iconWrap}>
                <Ionicons name={item.icon} size={44} color={Colors.mint600} />
              </View>
              <Text style={s.slideHead}>{item.headline}</Text>
              <Text style={s.slideBody} numberOfLines={3}>{item.body}</Text>
            </View>
          )}
        />

        {/* Paged dots */}
        <View style={s.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[s.dot, i === activeIdx && s.dotOn]} />
          ))}
        </View>

        {/* Trust chips */}
        <View style={s.trustRow}>
          <TrustChip icon="lock-closed-outline"  label="Encrypted & private" />
          <TrustChip icon="gift-outline"          label="7-day free trial" />
          <TrustChip icon="close-circle-outline"  label="Cancel anytime" />
        </View>

        {/* CTAs */}
        <View style={s.ctas}>
          <TouchableOpacity
            style={s.primary}
            onPress={navigate}
            activeOpacity={0.85}
            accessibilityLabel="Start 7-day free trial"
          >
            <Text style={s.primaryText}>Start 7 Days Free</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>

          <Text style={s.pricing}>$179/yr · $19.99/mo after trial. Cancel anytime.</Text>

          <TouchableOpacity
            style={s.secondary}
            onPress={navigate}
            activeOpacity={0.7}
            accessibilityLabel="Continue with free version"
          >
            <Text style={s.secondaryText}>Continue with the free version</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.signInRow}
            onPress={() => router.push('/auth/login' as never)}
          >
            <Text style={s.signInText}>Already have an account? </Text>
            <Text style={[s.signInText, s.signInLink]}>Sign In</Text>
          </TouchableOpacity>
        </View>

      </Animated.View>
    </SafeAreaView>
  );
}

function TrustChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={s.chip}>
      <Ionicons name={icon as never} size={12} color={Colors.mint600} />
      <Text style={s.chipText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: HERO_TOP },

  // ── Hero ────────────────────────────────────────────────────────────
  hero: {
    paddingTop:        Spacing[6],
    paddingBottom:     Spacing[10],
    paddingHorizontal: Spacing[6],
    alignItems:        'center',
    gap:               Spacing[4],
  },
  logoBlock: { alignItems: 'center', gap: 0 },
  logoMark: {
    fontSize:      10,
    fontWeight:    Typography.extrabold,
    color:         'rgba(255,255,255,0.38)',
    letterSpacing: 9,
    marginBottom:  2,
  },
  logoWord: {
    fontSize:      62,
    fontWeight:    Typography.extrabold,
    color:         Colors.white,
    letterSpacing: 4,
    lineHeight:    70,
  },
  headBlock:    { alignItems: 'center' },
  heroHeadline: {
    fontSize:   Typography['2xl'],
    fontWeight: Typography.bold,
    color:      Colors.white,
    textAlign:  'center',
    lineHeight: 34,
  },

  // ── Panel ────────────────────────────────────────────────────────────
  panel: {
    flex:                  1,
    backgroundColor:       Colors.surface,
    borderTopLeftRadius:   26,
    borderTopRightRadius:  26,
    overflow:              'hidden',
  },

  // ── Carousel ─────────────────────────────────────────────────────────
  list: { flexGrow: 0 },

  slide: {
    width:             SW,
    paddingHorizontal: Spacing[8],
    paddingTop:        Spacing[6],
    paddingBottom:     Spacing[2],
    alignItems:        'center',
    gap:               Spacing[3],
  },
  iconWrap: {
    width:           76,
    height:          76,
    borderRadius:    Radius.xl,
    backgroundColor: Colors.mint50,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     Colors.mint100,
  },
  slideHead: {
    fontSize:   Typography['2xl'],
    fontWeight: Typography.bold,
    color:      Colors.textPrimary,
    textAlign:  'center',
    lineHeight: 32,
  },
  slideBody: {
    fontSize:   Typography.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 21,
    maxWidth:   268,
  },

  // ── Dots ─────────────────────────────────────────────────────────────
  dots: {
    flexDirection:   'row',
    justifyContent:  'center',
    gap:             6,
    paddingVertical: Spacing[3],
  },
  dot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: Colors.gray200,
  },
  dotOn: {
    width:           20,
    backgroundColor: Colors.mint600,
  },

  // ── Trust chips ───────────────────────────────────────────────────────
  trustRow: {
    flexDirection:     'row',
    justifyContent:    'center',
    gap:               Spacing[2],
    paddingHorizontal: Spacing[4],
    paddingBottom:     Spacing[3],
    flexWrap:          'wrap',
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   Colors.mint50,
    borderRadius:      Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical:   5,
    borderWidth:       1,
    borderColor:       Colors.mint100,
  },
  chipText: {
    fontSize:   11,
    color:      Colors.mint600,
    fontWeight: Typography.medium,
  },

  // ── CTAs ──────────────────────────────────────────────────────────────
  ctas: {
    paddingHorizontal: Spacing[6],
    paddingBottom:     Spacing[5],
    gap:               Spacing[2] + 2,
  },
  primary: {
    backgroundColor: Colors.mint600,
    borderRadius:    Radius.md,
    paddingVertical: Spacing[4] + 2,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing[2],
    ...Shadows.glow,
  },
  primaryText: {
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
  secondary: {
    borderRadius:    Radius.md,
    paddingVertical: Spacing[3] + 2,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  secondaryText: {
    fontSize:   Typography.base,
    color:      Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  signInRow: {
    flexDirection:   'row',
    justifyContent:  'center',
    paddingVertical: Spacing[1],
  },
  signInText: {
    color:    Colors.textMuted,
    fontSize: Typography.sm,
  },
  signInLink: {
    color:      Colors.mint600,
    fontWeight: Typography.semibold,
  },
});
