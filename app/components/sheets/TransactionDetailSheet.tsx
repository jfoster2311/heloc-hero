// components/sheets/TransactionDetailSheet.tsx — one transaction, opened from
// anywhere.
//
// Every transaction row in the app opens THIS sheet: the activity widget, the
// full list, a calendar day, a category, a merchant. That is the point of it
// existing as a component rather than a route — a route would have to re-fetch
// the row it was handed, which means a second read and two copies of the same
// transaction that can differ mid-flight.
//
// ── What can be edited, and what cannot ────────────────────────────────────
// Nothing here writes to public.transactions. The date, the amount and the
// payee are what the bank reported and are rendered as facts. What the user can
// add is their own layer: which category it belongs in, a note, whether it
// repeats, and whether it is a duplicate that should not be counted. That split
// is enforced by the schema (transactions has no user write policy) and is
// worth preserving in the UI, because the value of a derived surplus is exactly
// that the user did not get to choose the inputs.
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DetailSheet, { SheetSection, SheetRow } from '../ui/DetailSheet';
import NewCategoryForm from '../ui/NewCategoryForm';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import type { SpendCategory, CategorizedTxn, CategoryMeta } from '../../lib/spending';
import type { TransactionMeta } from '../../hooks/useTransactionMeta';

export interface TransactionDetailSheetProps {
  /** Null closes the sheet. */
  row: CategorizedTxn | null;
  meta: TransactionMeta;
  /** Every category the user can file this under, builtin and their own. */
  categories: CategoryMeta[];
  /** Resolves an id to a label and glyph. Total — see hooks/useCategories. */
  categoryFor: (id: SpendCategory) => CategoryMeta;
  /** Creating a category from the picker. Null hides the affordance. */
  onCreateCategory?: (label: string, icon: string) => Promise<SpendCategory | null>;
  categorySaving?: boolean;
  categoryError?: string | null;
  /** True while any write for this row is in flight. */
  saving: boolean;
  /** "Chase — Savings", when known. Rendered at the foot as provenance. */
  accountLabel?: string | null;
  onClose: () => void;
  onRecategorize: (transactionId: string, category: SpendCategory) => Promise<void> | void;
  onSetHidden: (transactionId: string, hidden: boolean) => Promise<void> | void;
  onSetNote: (transactionId: string, note: string) => Promise<void> | void;
  onSetRecurring: (transactionId: string, recurring: boolean) => Promise<void> | void;
}

export default function TransactionDetailSheet({
  row, meta, categories, categoryFor, saving, accountLabel,
  onCreateCategory, categorySaving, categoryError,
  onClose, onRecategorize, onSetHidden, onSetNote, onSetRecurring,
}: TransactionDetailSheetProps) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(false);

  // The draft has to follow the row, not just the mount: opening a second
  // transaction without this leaves the previous one's note in the field, and
  // blurring would then write it onto the wrong transaction.
  useEffect(() => {
    setNoteDraft(meta.note ?? '');
    setEditingNote(false);
    setPickerOpen(false);
    setCreating(false);
  }, [row?.txn.transaction_id, meta.note]);

  if (!row) {
    return (
      <DetailSheet visible={false} title="Details" onClose={onClose}>
        <View />
      </DetailSheet>
    );
  }

  const t = row.txn;
  const inflow = t.amount < 0;
  const cat = categoryFor(row.category);

  const commitNote = () => {
    setEditingNote(false);
    const next = noteDraft.trim();
    if (next !== (meta.note ?? '')) onSetNote(t.transaction_id, next);
  };

  return (
    <DetailSheet
      visible
      title={t.merchant_name ?? t.name ?? 'Transaction'}
      onClose={onClose}
      onDismiss={() => { setPickerOpen(false); setEditingNote(false); }}
    >
      {/* ── The figure, and what it is ─────────────────────────────────────
          Money in gets an explicit plus and the mint value. The sign is the
          only thing separating a $40 refund from a $40 purchase, so it is
          never left to colour alone. */}
      <View style={styles.amountBlock}>
        <Text style={[styles.amount, inflow && styles.amountIn]}>
          {inflow ? '+' : ''}${fmtCents(Math.abs(t.amount))}
        </Text>
        {t.pending && <Text style={styles.pending}>Pending — this may still change</Text>}

        {/* Money in has no spending category, so there is nothing to pick. The
            row still carries a placeholder one so the arrays it travels in
            share a shape; offering it here would invite someone to file their
            paycheck under Groceries. */}
        {inflow ? (
          <View style={[styles.catPill, styles.catPillStatic]}>
            <Ionicons name="arrow-down-circle-outline" size={15} color={colors.mint700} />
            <Text style={styles.catPillText}>Money in</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.catPill}
            onPress={() => { hapticLight(); setPickerOpen(o => !o); }}
            accessibilityRole="button"
            accessibilityLabel={`Category: ${cat.label}. Tap to change.`}
          >
            <Ionicons name={cat.icon} size={15} color={colors.mint700} />
            <Text style={styles.catPillText}>{cat.label}</Text>
            <Ionicons
              name={pickerOpen ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.mint700}
            />
          </TouchableOpacity>
        )}
      </View>

      {pickerOpen && !inflow && (
        creating && onCreateCategory ? (
          <NewCategoryForm
            saving={categorySaving ?? false}
            error={categoryError ?? null}
            onCancel={() => setCreating(false)}
            onCreate={async (label, icon) => {
              const id = await onCreateCategory(label, icon);
              // Only close and file the transaction if the category actually
              // exists. A failed create that closed the form anyway would look
              // like it worked and leave the row where it was.
              if (!id) return;
              setCreating(false);
              setPickerOpen(false);
              await onRecategorize(t.transaction_id, id);
            }}
          />
        ) : (
          <View style={styles.picker}>
            {categories.map(c => {
              const active = c.id === row.category;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.pickerChip, active && styles.pickerChipActive]}
                  disabled={active}
                  onPress={async () => {
                    hapticSelection();
                    setPickerOpen(false);
                    await onRecategorize(t.transaction_id, c.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Categorise as ${c.label}`}
                >
                  <Ionicons
                    name={c.icon}
                    size={14}
                    color={active ? colors.mint700 : colors.textSecondary}
                  />
                  <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {onCreateCategory && (
              <TouchableOpacity
                style={[styles.pickerChip, styles.pickerChipNew]}
                onPress={() => { hapticLight(); setCreating(true); }}
                accessibilityRole="button"
                accessibilityLabel="Create a new category"
              >
                <Ionicons name="add" size={15} color={colors.mint700} />
                <Text style={[styles.pickerChipText, styles.pickerChipTextActive]}>
                  New category
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )
      )}

      {/* ── What the bank reported ─────────────────────────────────────────
          Read-only, and labelled as the bank's. Nothing in this app may edit
          a bank-reported row; see the header comment. */}
      <SheetSection label="From your bank">
        <SheetRow label="Date" value={formatFullDay(t.date)} />
        <SheetRow label="Description" value={t.name ?? '—'} />
        <SheetRow
          label="Bank's category"
          value={prettyPfc(t.category_detailed ?? t.category_primary)}
          last
        />
      </SheetSection>

      {/* ── What you've added ──────────────────────────────────────────── */}
      <SheetSection label="Your notes">
        <View style={styles.noteRow}>
          <Text style={styles.rowLabel}>Note</Text>
          {editingNote ? (
            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              onBlur={commitNote}
              onSubmitEditing={commitNote}
              placeholder="Add a note"
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              maxLength={280}
              accessibilityLabel="Note for this transaction"
            />
          ) : (
            <TouchableOpacity
              style={styles.noteValueTap}
              onPress={() => { hapticLight(); setEditingNote(true); }}
              accessibilityRole="button"
              accessibilityLabel={meta.note ? `Note: ${meta.note}. Tap to edit.` : 'Add a note'}
            >
              <Text
                style={[styles.rowValue, !meta.note && styles.rowPlaceholder]}
                numberOfLines={2}
              >
                {meta.note || 'Add a note'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <SheetRow label="Repeats monthly">
          <Switch
            value={meta.recurring}
            onValueChange={v => { hapticSelection(); onSetRecurring(t.transaction_id, v); }}
            trackColor={{ false: colors.gray200, true: colors.mint600 }}
            thumbColor={colors.white}
            accessibilityLabel="Mark this transaction as repeating monthly"
          />
        </SheetRow>

        <SheetRow label="Hide as a duplicate" last>
          {saving ? (
            <ActivityIndicator size="small" color={colors.accentInk} />
          ) : (
            <Switch
              value={meta.hidden}
              onValueChange={v => { hapticSelection(); onSetHidden(t.transaction_id, v); }}
              trackColor={{ false: colors.gray200, true: colors.mint600 }}
              thumbColor={colors.white}
              accessibilityLabel="Hide this transaction from all totals"
            />
          )}
        </SheetRow>
      </SheetSection>

      {/* Hiding is the one edit here that changes a number elsewhere, so it
          says so. A user who hides a row and then finds their surplus moved
          without warning has been surprised by their own app. */}
      <Text style={styles.footnote}>
        {meta.hidden
          ? 'This transaction is left out of your spending totals, your category ' +
            'breakdown and your measured surplus. Your bank’s record of it is unchanged.'
          : 'Hiding is for a charge that appears twice — once on a card and again as a ' +
            'bank transfer. A hidden transaction is left out of every total in the app.'}
      </Text>

      {accountLabel && (
        <View style={styles.accountRow}>
          <View style={[styles.accountDot, { borderColor: semantic.linkedAccount }]} />
          <Text style={styles.accountLabel}>{accountLabel}</Text>
        </View>
      )}
    </DetailSheet>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtCents(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFullDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/**
 * Plaid's SCREAMING_SNAKE category, made readable.
 *
 * Shown rather than hidden because it is the reason the row landed where it
 * did, and a user disagreeing with a category deserves to see what the app was
 * working from before they override it.
 */
function prettyPfc(raw: string | null): string {
  if (!raw) return 'Not categorised';
  return raw
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^./, c => c.toUpperCase());
}

const useStyles = createThemedStyles(t => ({
  amountBlock: { alignItems: 'center', gap: Spacing[3], paddingTop: Spacing[2] },
  amount: {
    fontSize: Typography.displaySm,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: -1,
  },
  amountIn: { color: t.colors.accentInk },
  pending: { fontSize: Typography.xs, color: t.colors.textMuted },

  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.full,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  catPillStatic: { paddingHorizontal: Spacing[4] },
  catPillText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },

  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  pickerChipActive: { backgroundColor: t.colors.mint50, borderColor: t.colors.mint600 },
  pickerChipNew: { borderStyle: 'dashed', borderColor: t.colors.mint600 },
  pickerChipText: {
    fontSize: Typography.xs,
    fontWeight: Typography.medium,
    color: t.colors.textSecondary,
  },
  pickerChipTextActive: { color: t.colors.mint700, fontWeight: Typography.semibold },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  noteValueTap: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', minHeight: 44 },
  noteInput: {
    flex: 1,
    fontSize: Typography.sm,
    color: t.colors.textPrimary,
    textAlign: 'right',
    paddingVertical: Spacing[2],
  },
  rowLabel: { fontSize: Typography.sm, color: t.colors.textSecondary },
  rowValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textPrimary,
    textAlign: 'right',
  },
  rowPlaceholder: { color: t.colors.textMuted, fontWeight: Typography.regular },

  footnote: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 18,
  },

  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    justifyContent: 'center',
  },
  accountDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  accountLabel: { fontSize: Typography.xs, color: t.colors.textMuted },
}));
