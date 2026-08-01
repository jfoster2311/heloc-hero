// components/ui/DetailSheet.tsx — the chrome every detail sheet shares.
//
// Deliberately a plain RN Modal rather than a bottom-sheet library. Adding one
// means a native module, which means a fresh EAS build before anyone can open a
// transaction (see CLAUDE.md) — a real cost to pay for a drag gesture on a sheet
// that has a close button. `presentationStyle="pageSheet"` already gives the
// iOS card, the swipe-to-dismiss and the rounded top corners.
//
// It exists as its own file because three sheets need the same header, the same
// close target and the same sticky footer, and a fourth is coming.
import { ReactNode, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '../../lib/haptics';
import { Typography, Spacing, Radius, Tracking } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

export interface DetailSheetProps {
  visible: boolean;
  /** Tracked-caps label centred in the header. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned above the safe area — the Save button on the budget sheets. */
  footer?: ReactNode;
  /** Runs when the sheet has fully gone, for resetting local edit state. */
  onDismiss?: () => void;
}

export default function DetailSheet({
  visible, title, onClose, children, footer, onDismiss,
}: DetailSheetProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  // onDismiss is iOS-only. Anything that must be reset when the sheet closes has
  // to be reset here too, or Android reopens the sheet still holding the last
  // one's expanded rows and half-typed input.
  const close = useCallback(() => { onDismiss?.(); onClose(); }, [onDismiss, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
      onDismiss={onDismiss}
    >
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.header}>
          {/* A spacer the same width as the close target, so the title is
              centred against the row rather than against the text beside it. */}
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title.toUpperCase()}
          </Text>
          <TouchableOpacity
            onPress={() => { hapticLight(); close(); }}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>

        {footer && <View style={styles.footer}>{footer}</View>}
      </SafeAreaView>
    </Modal>
  );
}

/** A titled block of rows inside a sheet. */
export function SheetSection({ label, children }: { label?: string; children: ReactNode }) {
  const { common } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.section}>
      {label && <Text style={common.eyebrow}>{label.toUpperCase()}</Text>}
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/**
 * One line of a detail card: a label, a value, and optionally a chevron.
 *
 * Distinct from primitives' DataRow, which is a read-only figure with a hint.
 * This one is an editable field: it has a placeholder state for "not set" and
 * lays its value out to be tapped.
 */
export function SheetRow({ label, value, placeholder, onPress, last, children }: {
  label: string;
  value?: string | null;
  /** Shown muted when there is no value. "Add a note", not "—". */
  placeholder?: string;
  onPress?: () => void;
  last?: boolean;
  /** A control rendered in place of the value — a switch, say. */
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const hasValue = value !== null && value !== undefined && value !== '';
  const body = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      {children ?? (
        <Text
          style={[styles.rowValue, !hasValue && styles.rowPlaceholder]}
          numberOfLines={1}
        >
          {hasValue ? value : (placeholder ?? '—')}
        </Text>
      )}
      {onPress && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, last && styles.rowLast]}>{body}</View>;
  }
  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${hasValue ? value : 'not set'}`}
    >
      {body}
    </TouchableOpacity>
  );
}

const useStyles = createThemedStyles(t => ({
  sheet: { flex: 1, backgroundColor: t.colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    gap: Spacing[2],
  },
  headerSpacer: { width: 44 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: Tracking.eyebrow,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[10],
    gap: Spacing[5],
  },

  footer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
    backgroundColor: t.colors.surface,
    ...t.shadows.modal,
  },

  section: { gap: Spacing[2] },
  sectionCard: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    paddingHorizontal: Spacing[4],
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontSize: Typography.sm, color: t.colors.textSecondary },
  rowValue: {
    flexShrink: 1,
    maxWidth: '60%',
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textPrimary,
    textAlign: 'right',
  },
  rowPlaceholder: { color: t.colors.textMuted, fontWeight: Typography.regular },
}));
