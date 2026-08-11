// components/ui/ModalScreen.tsx — the frame every edit sheet shares.
//
// Four modals were each hand-rolling a header, a keyboard-avoiding scroll view
// and a save button, which is how three of them ended up with different
// touch-target heights. The frame is here so the screens are only their fields.
//
// The header itself now lives in ModalHeader, because four MORE screens —
// settings, move-money, link-account, get-heloc — have bodies too different to
// adopt this frame and had each grown a header of their own. A screen may need
// its own body; none needs its own title bar.
import {
  View, Text, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Touchable } from './press';
import ModalHeader from './ModalHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { hapticSelection } from '../../lib/haptics';
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
    /** Why the last attempt did not save. Rendered above the button. */
    error?: string | null;
  };
  footnote?: string;
}

export default function ModalScreen({ title, intro, children, save, footnote }: ModalScreenProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Shared with the four sheets that keep their own bodies — see
          ModalHeader, which also carries the themed status bar this used to
          declare for itself. */}
      <ModalHeader title={title} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          // Six of the modals built on this host a keypad or a text field, and
          // several of them put the figure the user is checking BELOW the input
          // — heloc-terms, assumptions, mortgage-details all do. Without this,
          // scrolling down to look at it was blocked by the keyboard the user
          // had no way to dismiss except by finding a gap to tap. The auth
          // screens already settled on on-drag; this is the same choice.
          keyboardDismissMode="on-drag"
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
            <>
              {/* Sits ABOVE the button, not in an Alert. A save that failed
                  leaves the user looking at the figures they just typed, and
                  the fix is to press the same button again — so the message
                  belongs beside it, where a modal dismissal cannot take it
                  away. assertive, because it reports that the thing they just
                  asked for did not happen. */}
              {save.error ? (
                <View style={styles.saveError} accessibilityLiveRegion="assertive">
                  <Ionicons name="alert-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.saveErrorText}>{save.error}</Text>
                </View>
              ) : null}
              <Touchable
                style={[styles.saveBtn, (save.disabled || save.saving) && styles.saveBtnDisabled]}
                onPress={save.onPress}
                disabled={save.disabled || save.saving}
                accessibilityRole="button"
                accessibilityLabel={save.label}
              >
                {save.saving
                  ? <ActivityIndicator color={colors.onAccent} />
                  : <Text style={styles.saveText}>{save.label}</Text>}
              </Touchable>
            </>
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
          <Touchable
            haptic="selection"
            key={o.value}
            style={[
              styles.segmentBtn,
              { flexBasis: `${100 / columns}%` },
              active && styles.segmentBtnActive,
            ]}
            // Same correction ChipField got: every caller passes a plain
            // setter, so there is no caller-side haptic to double up with, and
            // a segmented control that does not buzz reads as unresponsive
            // beside the sliders and preset cards on the same forms.
            onPress={() => { onChange(o.value); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
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
  saveText: { color: t.colors.onAccent, fontSize: Typography.base, fontWeight: Typography.bold },
  // Grey, not red — CLAUDE.md's palette rule holds here too, and the icon plus
  // the sentence carry the severity. Same treatment the auth screens give a
  // failed sign-in.
  saveError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[3],
  },
  saveErrorText: {
    flex: 1,
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
  },

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
