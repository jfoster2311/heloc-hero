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
        <View style={styles.progressBar}>
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
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          ) : <View style={styles.backBtn} />}

          <Text style={styles.stepCount}>{step} of {totalSteps}</Text>
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
  progressBar: {
    height: 4,
    backgroundColor: Colors.gray100,
  },
  progressFill: {
    height: 4,
    backgroundColor: Colors.mint600,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  stepCount: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    fontWeight: Typography.medium,
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
    lineHeight: 22,
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
  nextBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  nextBtnText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
});
