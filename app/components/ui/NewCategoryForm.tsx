// components/ui/NewCategoryForm.tsx — name it, pick a glyph, done.
//
// Appears in two places (the transaction category picker and the Budget screen),
// which is why it is a component rather than a form written twice.
//
// Kept deliberately small. A category is a label and an icon; anything more —
// a colour, a parent category, a default budget — is a decision the user has to
// make before they can finish the thing they were actually doing, which was
// filing one transaction. The budget for it is set where budgets are set.
import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { CUSTOM_CATEGORY_ICONS } from '../../lib/spending';

export interface NewCategoryFormProps {
  saving: boolean;
  error: string | null;
  /** Resolves once the category exists, so the caller can select it. */
  onCreate: (label: string, icon: string) => Promise<void>;
  onCancel: () => void;
  /**
   * Pre-filled values, which turn this into an edit form.
   *
   * The same component both ways because the fields and the validation are
   * identical — a separate edit form is how the two drift into accepting
   * different names.
   */
  initial?: { label: string; icon: string };
  title?: string;
  submitLabel?: string;
}

export default function NewCategoryForm({
  saving, error, onCreate, onCancel, initial, title, submitLabel,
}: NewCategoryFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState<string>(initial?.icon ?? CUSTOM_CATEGORY_ICONS[0]);

  const valid = label.trim().length > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{title ?? 'New category'}</Text>
        <TouchableOpacity
          onPress={() => { hapticLight(); onCancel(); }}
          style={styles.cancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        value={label}
        onChangeText={setLabel}
        placeholder="Name it — Pets, Childcare, Tithing…"
        placeholderTextColor={Colors.textMuted}
        maxLength={30}
        autoFocus
        returnKeyType="done"
        accessibilityLabel="Category name"
      />

      <View style={styles.iconGrid}>
        {CUSTOM_CATEGORY_ICONS.map(g => {
          const active = g === icon;
          return (
            <TouchableOpacity
              key={g}
              style={[styles.iconBtn, active && styles.iconBtnActive]}
              onPress={() => { hapticSelection(); setIcon(g); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Icon: ${g.replace('-outline', '').replace(/-/g, ' ')}`}
            >
              <Ionicons
                name={g}
                size={19}
                color={active ? Colors.white : Colors.textSecondary}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.create, !valid && styles.createDisabled]}
        disabled={!valid || saving}
        onPress={async () => { hapticLight(); await onCreate(label.trim(), icon); }}
        accessibilityRole="button"
        accessibilityLabel="Create this category"
      >
        {saving
          ? <ActivityIndicator size="small" color={Colors.white} />
          : <Text style={styles.createText}>{submitLabel ?? 'Create'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cancel: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  input: {
    minHeight: 48,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: Typography.sm,
    color: Colors.textPrimary,
  },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: Colors.mint600, borderColor: Colors.mint600 },

  error: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },

  create: {
    minHeight: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.mint600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createDisabled: { backgroundColor: Colors.gray300 },
  createText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.white },
});
