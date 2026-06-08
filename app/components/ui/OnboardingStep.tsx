// components/ui/OnboardingStep.tsx
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';

interface Props {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

export default function OnboardingStep({
  step, totalSteps, title, subtitle,
  onBack, onNext, nextLabel = 'Continue',
  nextDisabled = false, loading = false, children,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(step / totalSteps) * 100}%` },
            ]}
          />
        </View>

        {/* Header row */}
        <View style={styles.header}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
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
                    <Ionicons name="checkmark" size={8} color={Colors.white} />
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
          {children}
        </ScrollView>

        {/* Next button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, (nextDisabled || loading) && styles.nextBtnDisabled]}
            onPress={onNext}
            disabled={nextDisabled || loading}
          >
            <Text style={styles.nextBtnText}>
              {loading ? 'Saving…' : nextLabel}
            </Text>
            {!loading && (
              <Ionicons name="arrow-forward" size={18} color={Colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.surface },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.gray100,
  },
  progressFill: {
    height: 3,
    backgroundColor: Colors.mint600,
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
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    width: 28,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.mint600,
  },
  dotDone: {
    backgroundColor: Colors.mint600,
  },
  content: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[6],
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
    lineHeight: 34,
  },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    marginBottom: Spacing[6],
    lineHeight: 24,
  },
  footer: {
    padding: Spacing[4],
    paddingBottom: Spacing[5],
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  nextBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    ...Shadows.glow,
  },
  nextBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextBtnText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
});
