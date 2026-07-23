// components/ui/ModalScreen.tsx — the frame every edit sheet shares.
//
// Four modals were each hand-rolling a header, a keyboard-avoiding scroll view
// and a save button, which is how three of them ended up with different
// touch-target heights. The frame is here so the screens are only their fields.
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

interface ModalScreenProps {
  title: string;
  /** One sentence on why the app is asking. Answers "didn't you just link my bank?" */
  intro?: string;
  children: React.ReactNode;
  save?: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    saving?: boolean;
  };
  footnote?: string;
}

export default function ModalScreen({ title, intro, children, save, footnote }: ModalScreenProps) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Sheets are light, and they slide over tabs that set this to light. */}
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.close} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {intro ? (
            <View style={styles.introCard}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
              <Text style={styles.introText}>{intro}</Text>
            </View>
          ) : null}

          {children}

          {save ? (
            <TouchableOpacity
              style={[styles.saveBtn, (save.disabled || save.saving) && styles.saveBtnDisabled]}
              onPress={save.onPress}
              disabled={save.disabled || save.saving}
              accessibilityRole="button"
              accessibilityLabel={save.label}
            >
              {save.saving
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.saveText}>{save.label}</Text>}
            </TouchableOpacity>
          ) : null}

          {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Segmented choice. Used wherever a field is one of a small closed set. */
export function Segmented<T extends string>({ options, value, onChange, columns = 2 }: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <View style={styles.segment}>
      {options.map(o => {
        const active = value === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[
              styles.segmentBtn,
              { flexBasis: `${100 / columns}%` },
              active && styles.segmentBtnActive,
            ]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  title: { flex: 1, fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  introCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  introText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  saveBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },

  footnote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
  },

  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  segmentBtn: {
    flexGrow: 1,
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
  },
  segmentBtnActive: { backgroundColor: Colors.mint50, borderColor: Colors.mint600 },
  segmentText: {
    fontSize: Typography.sm, fontWeight: Typography.medium,
    color: Colors.textSecondary, textAlign: 'center',
  },
  segmentTextActive: { color: Colors.mint700, fontWeight: Typography.semibold },
});
