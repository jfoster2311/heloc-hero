// components/cashflow/DayDetailSheet.tsx — what went out on one day.
//
// Opened from a cell of the calendar grid, and nothing more than a header, a
// total and the same TransactionRow list every other surface uses. It is a
// separate file only because the grid needs somewhere to send a tap; there is no
// logic here that is not shared.
import { View, Text, StyleSheet } from 'react-native';
import DetailSheet from '../ui/DetailSheet';
import TransactionRow from '../ui/TransactionRow';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';
import { hapticLight } from '../../lib/haptics';
import type {
  DayCell, CategorizedTxn, CategoryMeta, SpendCategory,
} from '../../lib/spending';
import type { TransactionMeta } from '../../hooks/useTransactionMeta';

export interface DayDetailSheetProps {
  /** Null closes the sheet. */
  day: DayCell | null;
  metaFor: (transactionId: string) => TransactionMeta;
  categoryFor: (id: SpendCategory) => CategoryMeta;
  onClose: () => void;
  onOpenTransaction: (row: CategorizedTxn) => void;
}

export default function DayDetailSheet({
  day, metaFor, categoryFor, onClose, onOpenTransaction,
}: DayDetailSheetProps) {
  if (!day) {
    return (
      <DetailSheet visible={false} title="Details" onClose={onClose}>
        <View />
      </DetailSheet>
    );
  }

  // Largest first. A day is usually one big thing and some small ones, and the
  // big one is what the user tapped the cell to find.
  const rows = [...day.rows].sort((a, b) => b.txn.amount - a.txn.amount);

  return (
    <DetailSheet visible title="Details" onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.date}>{formatFullDay(day.date)}</Text>
        <Text style={styles.total}>${fmtCents(day.spend)}</Text>
        {day.credit > 0 && (
          <Text style={styles.credit}>
            and ${fmtCents(day.credit)} back
          </Text>
        )}
      </View>

      {rows.length === 0 ? (
        <Text style={styles.empty}>Nothing went out on this day.</Text>
      ) : (
        <View style={styles.list}>
          {rows.map(r => {
            const m = metaFor(r.txn.transaction_id);
            // Credits carry a placeholder category — see summarizePeriod.
            const inflow = r.txn.amount < 0;
            return (
              <TransactionRow
                key={r.txn.transaction_id}
                name={r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}
                meta={inflow ? 'Money back' : categoryFor(r.category).label}
                amount={r.txn.amount}
                icon={inflow ? 'arrow-down-circle-outline' : categoryFor(r.category).icon}
                hidden={m.hidden}
                recurring={m.recurring}
                overridden={!inflow && r.overridden}
                pending={r.txn.pending}
                onPress={() => { hapticLight(); onOpenTransaction(r); }}
              />
            );
          })}
        </View>
      )}
    </DetailSheet>
  );
}

function fmtCents(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFullDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: Spacing[1], paddingTop: Spacing[2] },
  date: { fontSize: Typography.sm, color: Colors.textMuted },
  total: {
    fontSize: Typography.displaySm,
    fontWeight: Typography.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  credit: { fontSize: Typography.xs, color: Colors.mint600, fontWeight: Typography.semibold },

  list: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
  empty: { fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 20, textAlign: 'center' },
});
