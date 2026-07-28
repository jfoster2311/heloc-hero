// components/ui/TransactionRow.tsx — one transaction, rendered the same way
// everywhere it appears.
//
// This row shows up in six places: the Latest Activity widget, the full Activity
// list, the day-detail sheet behind a calendar cell, the category sheet, the
// merchant sheet, and the largest-draws list. They were on their way to being
// six slightly different rows — which is how an amount ends up right-aligned in
// five of them and centred in the sixth, and how a "hidden" row keeps its
// dimming in one list and loses it in another.
//
// So the props here are STATE, not styling. A caller says the row is hidden; it
// does not say the row is 40% opacity. That keeps the decision about what hidden
// looks like in one file, which is the only way it stays consistent.
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Semantic } from '../../lib/theme';

export interface TransactionRowProps {
  /** Payee, or the raw description when the bank sent no merchant. */
  name: string;
  /** Already-formatted, e.g. "Jul 14". The row does not know about dates. */
  meta: string;
  /** Plaid's sign convention: POSITIVE is money out. */
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;

  /**
   * Excluded from every total because the user marked it a duplicate.
   *
   * Dimmed AND given an eye-off glyph. Two cues rather than one, because
   * opacity alone is invisible to anyone who has not seen the un-dimmed row for
   * comparison — which is everyone opening the screen for the first time.
   */
  hidden?: boolean;
  /** The bank has not posted this yet, so the amount may still change. */
  pending?: boolean;
  /** This row is tied to a specific linked account. Drawn as a ring. */
  linkedAccount?: boolean;
  /** The user placed this row in its category, rather than the bank. */
  overridden?: boolean;
  /** The user marked this as repeating. */
  recurring?: boolean;

  /** Shows a spinner in place of the amount while a write is in flight. */
  saving?: boolean;
  onPress?: () => void;
  /** Appended to the row's accessibility label — e.g. its category. */
  accessibilityExtra?: string;
}

export default function TransactionRow({
  name, meta, amount, icon,
  hidden, pending, linkedAccount, overridden, recurring,
  saving, onPress, accessibilityExtra,
}: TransactionRowProps) {
  // Money IN, in Plaid's convention. Shown with an explicit plus, because the
  // sign is the only thing separating a $40 refund from a $40 purchase and the
  // colour cannot carry it — mint means "on track" elsewhere in this app.
  const inflow = amount < 0;
  const magnitude = Math.abs(amount);

  const body = (
    <>
      <View style={[styles.icon, hidden && styles.iconHidden]}>
        <Ionicons
          name={hidden ? 'eye-off-outline' : icon}
          size={17}
          color={hidden ? Colors.textMuted : Colors.mint700}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, hidden && styles.dimText]} numberOfLines={1}>
            {name}
          </Text>
          {recurring && !hidden && (
            <Ionicons name="repeat" size={13} color={Colors.textMuted} />
          )}
        </View>
        <Text style={[styles.meta, hidden && styles.dimText]} numberOfLines={1}>
          {meta}
          {pending ? ' · Pending' : ''}
          {overridden ? ' · you categorised this' : ''}
          {hidden ? ' · hidden from totals' : ''}
        </Text>
      </View>

      <View style={styles.amountBlock}>
        {saving ? (
          <ActivityIndicator size="small" color={Colors.mint600} />
        ) : (
          <Text
            style={[
              styles.amount,
              inflow && styles.amountIn,
              hidden && styles.dimText,
              // A hidden row's amount is struck through as well as dimmed: it
              // is the figure that is NOT being counted, and that is the whole
              // meaning of the state.
              hidden && styles.amountStruck,
            ]}
          >
            {inflow ? '+' : ''}${fmtCents(magnitude)}
          </Text>
        )}
        {linkedAccount && !hidden && (
          // A ring, not a filled dot. A filled mint dot at this size is the
          // same mark this app uses for "on track", and the two appearing in
          // one row would collide. See Semantic.linkedAccount in lib/theme.
          <View
            style={[styles.accountDot, { borderColor: Semantic.linkedAccount }]}
            accessibilityElementsHidden
          />
        )}
      </View>

      {onPress && (
        <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
      )}
    </>
  );

  const label =
    `${name}, ${inflow ? 'credit of ' : ''}$${fmtCents(magnitude)}, ${meta}` +
    (pending ? ', pending' : '') +
    (recurring ? ', recurring' : '') +
    (linkedAccount ? ', linked account' : '') +
    (hidden ? ', hidden from totals' : '') +
    (accessibilityExtra ? `, ${accessibilityExtra}` : '');

  if (!onPress) {
    return (
      <View style={[styles.row, hidden && styles.rowHidden]} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.row, hidden && styles.rowHidden]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the details for this transaction"
    >
      {body}
    </TouchableOpacity>
  );
}

function fmtCents(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    // 44pt is the floor; these carry two lines of text, so they sit above it.
    minHeight: 60,
    paddingVertical: Spacing[2],
  },
  rowHidden: { opacity: Semantic.hiddenOpacity },

  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHidden: { backgroundColor: Colors.gray100 },

  body: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: {
    flexShrink: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textPrimary,
  },
  meta: { fontSize: 11, color: Colors.textMuted },
  dimText: { color: Colors.textMuted },

  amountBlock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amount: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  amountIn: { color: Colors.mint600 },
  amountStruck: { textDecorationLine: 'line-through' },

  accountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
});
