// components/ui/ModalScreen.tsx — the frame every edit sheet shares.
//
// Four modals were each hand-rolling a header, a keyboard-avoiding scroll view
// and a save button, which is how three of them ended up with different
// touch-target heights. The frame is here so the screens are only their fields.
import {
  View, Text, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

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
  const { colors, mode } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* The sheet slides over a tab whose status bar is light, so it has to set
          its own — and it has to follow the theme, not a fixed value. The old
          hardcoded "dark" was correct while sheets were always a light surface;
          on a dark sheet it painted the clock and battery near-black on
          near-black. It is the one thing here that is invisible rather than
          merely wrong, since the OS draws it over content this file cannot see. */}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.close} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
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
              <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
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
                ? <ActivityIndicator color={colors.white} />
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
  const styles = useStyles();
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

const useStyles = createThemedStyles(t => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  title: { flex: 1, fontSize: Typography.xl, fontWeight: Typography.bold, color: t.colors.textPrimary },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  introCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
  },
  introText: { flex: 1, fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },

  saveBtn: {
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: t.colors.white, fontSize: Typography.base, fontWeight: Typography.bold },

  footnote: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
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
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
  },
  segmentBtnActive: { backgroundColor: t.colors.mint50, borderColor: t.colors.mint600 },
  segmentText: {
    fontSize: Typography.sm, fontWeight: Typography.medium,
    color: t.colors.textSecondary, textAlign: 'center',
  },
  segmentTextActive: { color: t.colors.mint700, fontWeight: Typography.semibold },
}));
