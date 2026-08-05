// components/cashflow/LatestActivity.tsx — the last few transactions, and a way
// into all of them.
//
// The header is the navigation target, not a separate button: tapping "LATEST
// ACTIVITY ›" opens the full list, tapping a row opens that row. Two different
// destinations from one card, which is why the rows carry their own chevrons and
// the header carries one too — a card where only some of the surface is tappable
// teaches people to stop trying.
import { View, Text, StyleSheet } from 'react-native';
import { Touchable } from '../ui/press';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/primitives';
import TransactionRow from '../ui/TransactionRow';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight } from '../../lib/haptics';
import type { CategorizedTxn, CategoryMeta, SpendCategory } from '../../lib/spending';
import type { TransactionMeta } from '../../hooks/useTransactionMeta';

/** Four is the whole point of a preview. More and it stops being one. */
const PREVIEW_COUNT = 4;

export interface LatestActivityProps {
  /** Already sorted newest-first by the caller. */
  rows: CategorizedTxn[];
  metaFor: (transactionId: string) => TransactionMeta;
  categoryFor: (id: SpendCategory) => CategoryMeta;
  onOpenRow: (row: CategorizedTxn) => void;
  onOpenAll: () => void;
}

export default function LatestActivity({
  rows, metaFor, categoryFor, onOpenRow, onOpenAll,
}: LatestActivityProps) {
  const { common, colors } = useTheme();
  const styles = useStyles();
  const preview = rows.slice(0, PREVIEW_COUNT);

  return (
    <Card>
      <Touchable
        style={styles.head}
        onPress={() => { onOpenAll(); }}
        accessibilityRole="button"
        accessibilityLabel={`Latest activity. ${rows.length} transactions.`}
        accessibilityHint="Opens the full list"
      >
        <Text style={common.eyebrow}>LATEST ACTIVITY</Text>
        <View style={styles.headRight}>
          <Text style={styles.count}>{rows.length}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </Touchable>

      {preview.length === 0 ? (
        <Text style={styles.empty}>
          Nothing in this period yet. Transactions appear here as your bank sends them.
        </Text>
      ) : (
        <View style={styles.list}>
          {preview.map(r => {
            const m = metaFor(r.txn.transaction_id);
            // An inflow has no spending category — summarizePeriod puts a
            // placeholder on it so the shapes match, and displaying that
            // placeholder would label a paycheck "Other".
            const inflow = r.txn.amount < 0;
            return (
              <TransactionRow
                key={r.txn.transaction_id}
                name={r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}
                meta={formatDay(r.txn.date)}
                amount={r.txn.amount}
                icon={inflow ? 'arrow-down-circle-outline' : categoryFor(r.category).icon}
                hidden={m.hidden}
                recurring={m.recurring}
                overridden={!inflow && r.overridden}
                pending={r.txn.pending}
                accessibilityExtra={inflow ? 'money in' : categoryFor(r.category).label}
                onPress={() => { hapticLight(); onOpenRow(r); }}
              />
            );
          })}
        </View>
      )}

      {rows.length > preview.length && (
        <Touchable
          style={styles.more}
          onPress={() => { onOpenAll(); }}
          accessibilityRole="button"
          accessibilityLabel={`See all ${rows.length} transactions`}
        >
          <Text style={styles.moreText}>
            See all {rows.length}
          </Text>
        </Touchable>
      )}
    </Card>
  );
}

function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const useStyles = createThemedStyles(t => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: Spacing[2],
  },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: Typography.xs, color: t.colors.textMuted },

  list: { marginTop: Spacing[1] },
  empty: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    paddingVertical: Spacing[3],
  },

  more: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
  moreText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },
}));
