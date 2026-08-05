// components/ui/OnboardingStep.tsx
import { useEffect, useRef } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, ScrollView, Animated, Easing,
} from 'react-native';
import { Touchable, useReduceMotion } from './press';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

interface Props {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  whyWeAsk?: string;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

export default function OnboardingStep({
  step, totalSteps, title, subtitle, whyWeAsk,
  onBack, onNext, nextLabel = 'Continue',
  nextDisabled = false, loading = false, children,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReduceMotion();

  /**
   * The bar fills from the PREVIOUS step to this one on arrival.
   *
   * Each step is its own route, so this component unmounts and remounts on every
   * screen and the bar simply appeared at its new width — the one piece of
   * chrome whose entire job is to show movement was the piece that never moved.
   * Seeding at `step - 1` and animating in gives back the thing a progress bar
   * is for: not "you are 60% through", but "you just got further".
   *
   * It runs on mount only, which is correct here — `step` is fixed for the life
   * of each screen. 420ms and eased out, so it lands just after the slide-in
   * rather than competing with it.
   */
  const progress = useRef(new Animated.Value((step - 1) / totalSteps)).current;

  useEffect(() => {
    const to = step / totalSteps;
    if (reduceMotion) {
      progress.setValue(to);
      return;
    }
    const a = Animated.timing(progress, {
      toValue: to,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      // Width cannot be driven natively, and this is a 3pt bar animating once
      // per screen — the JS driver is not a cost worth engineering around.
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [step, totalSteps, progress, reduceMotion]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progress.interpolate({
                  inputRange:  [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Header row */}
        <View style={styles.header}>
          {onBack ? (
            <Touchable
              onPress={() => { onBack(); }}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Go back to the previous step"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Touchable>
          ) : <View style={styles.backBtn} />}

          {/* Step dot indicators */}
          <View style={styles.dots}>
            {Array.from({ length: totalSteps }).map((_, i) => {
              const done   = i < step - 1;
              const active = i === step - 1;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    done   && styles.dotDone,
                    active && styles.dotActive,
                  ]}
                >
                  {done && (
                    <Ionicons name="checkmark" size={8} color={colors.onAccent} />
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {whyWeAsk && (
            <View style={styles.whyWeAsk}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
              <Text style={styles.whyWeAskText}>{whyWeAsk}</Text>
            </View>
          )}
          {children}
        </ScrollView>

        {/* Next button */}
        <View style={styles.footer}>
          {/* The most-pressed control in the app's first five minutes, and it
              was the one with no haptic — while the sliders and preset cards
              above it all buzz. */}
          <Touchable
            style={[styles.nextBtn, (nextDisabled || loading) && styles.nextBtnDisabled]}
            onPress={() => { onNext(); }}
            disabled={nextDisabled || loading}
            accessibilityRole="button"
            accessibilityLabel={loading ? 'Saving' : nextLabel}
            accessibilityState={{ disabled: nextDisabled || loading, busy: loading }}
          >
            <Text style={styles.nextBtnText}>
              {loading ? 'Saving…' : nextLabel}
            </Text>
            {!loading && (
              <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
            )}
          </Touchable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(t => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  progressTrack: {
    height: 3,
    backgroundColor: t.colors.gray100,
  },
  progressFill: {
    height: 3,
    backgroundColor: t.colors.mint600,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: t.colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    width: 28,
    height: 10,
    borderRadius: 5,
    backgroundColor: t.colors.mint600,
  },
  dotDone: {
    backgroundColor: t.colors.mint600,
  },
  content: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[6],
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
    marginBottom: Spacing[2],
    lineHeight: 34,
  },
  subtitle: {
    fontSize: Typography.base,
    color: t.colors.textSecondary,
    marginBottom: Spacing[6],
    lineHeight: 24,
  },
  whyWeAsk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    marginTop: -Spacing[4],
    marginBottom: Spacing[5],
  },
  whyWeAskText: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    flexShrink: 1,
  },
  footer: {
    padding: Spacing[4],
    paddingBottom: Spacing[5],
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  nextBtn: {
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    ...t.shadows.glow,
  },
  nextBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextBtnText: {
    color: t.colors.onAccent,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
}));
