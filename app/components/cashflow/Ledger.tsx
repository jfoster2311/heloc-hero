// components/cashflow/Ledger.tsx — the raw data, organised by consequence.
//
// Replaces the old Latest Activity preview, which listed four rows newest-first
// with no structure. Four undifferentiated rows answer "did my coffee land yet";
// they do not answer the question this tab exists for, which is where a period's
// net came from. So the rows are grouped by day, each day carries its own net,
// and the days are separated by a milled rule rather than by nothing.
//
// ── Why the day header carries a figure ────────────────────────────────────
// The velocity chart above is a line of daily nets. Without a net per day here,
// a user who sees a step in that line has nowhere to go to find out what caused
// it. This is the other end of that gesture: the chart says WHEN, this says WHAT.
//
// ── The preview is bounded by DAYS, not by rows ────────────────────────────
// A fixed row count cuts a day in half, and a half-shown day whose header says
// "−$412" while only two of its five rows are visible is a card that appears to
// have its arithmetic wrong. Whole days only; "See all" carries the rest.
import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable } from '../ui/press';
import MachinedCard from '../ui/MachinedCard';
import TransactionRow from '../ui/TransactionRow';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight } from '../../lib/haptics';
import type { CategorizedTxn, CategoryMeta, SpendCategory } from '../../lib/spending';
import type { TransactionMeta } from '../../hooks/useTransactionMeta';

/** Days shown before "See all". Three fits the fold without dominating it. */
const PREVIEW_DAYS = 3;

export interface LedgerProps {
  /** Already sorted newest-first by the caller. */
  rows: CategorizedTxn[];
  metaFor: (transactionId: string) => TransactionMeta;
  categoryFor: (id: SpendCategory) => CategoryMeta;
  onOpenRow: (row: CategorizedTxn) => void;
  onOpenAll: () => void;
  /**
   * Swipe-right on a row opens the same sheet focused on its category.
   *
   * Only wired here, and only because this card renders inside the tabs where
   * gesture-handler is rooted — see the note on `onSwipeCategorize` in
   * TransactionRow. The full list in /modals/activity is outside that root.
   */
  onCategorize: (row: CategorizedTxn) => void;
}

interface DayGroup {
  date: string;
  label: string;
  /** Money in minus money out for the day. Signed. */
  net: number;
  rows: CategorizedTxn[];
}

export default function Ledger({
  rows, metaFor, categoryFor, onOpenRow, onOpenAll, onCategorize,
}: LedgerProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  const days = useMemo(() => group(rows), [rows]);
  const preview = days.slice(0, PREVIEW_DAYS);
  const shownRows = preview.reduce((n, d) => n + d.rows.length, 0);

  return (
    <MachinedCard>
      <Touchable
        style={styles.head}
        onPress={onOpenAll}
        accessibilityRole="button"
        accessibilityLabel={`Ledger. ${rows.length} transactions.`}
        accessibilityHint="Opens the full list"
      >
        <Text style={styles.eyebrow}>LEDGER</Text>
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
        preview.map((d, i) => (
          <View key={d.date} style={[styles.day, i > 0 && styles.dayRuled]}>
            <View style={styles.dayHead}>
              <Text style={styles.dayLabel}>{d.label}</Text>
              <Text style={[styles.dayNet, d.net < 0 && styles.dayNetOut]}>
                {d.net < 0 ? '−' : '+'}${money(Math.abs(d.net))}
              </Text>
            </View>

            {d.rows.map(r => {
              const m = metaFor(r.txn.transaction_id);
              // An inflow has no spending category — `summarizePeriod` puts a
              // placeholder on it so the shapes match, and showing that
              // placeholder would label a paycheck "Other".
              const inflow = r.txn.amount < 0;
              return (
                <TransactionRow
                  key={r.txn.transaction_id}
                  name={r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}
                  meta={inflow ? 'Money in' : categoryFor(r.category).label}
                  amount={r.txn.amount}
                  icon={inflow ? 'arrow-down-circle-outline' : categoryFor(r.category).icon}
                  hidden={m.hidden}
                  recurring={m.recurring}
                  overridden={!inflow && r.overridden}
                  pending={r.txn.pending}
                  accessibilityExtra={inflow ? 'money in' : categoryFor(r.category).label}
                  onPress={() => { hapticLight(); onOpenRow(r); }}
                  // Inflows are excluded: there is no spending category to
                  // reassign one to, and a swipe that opened a picker of
                  // expense buckets for a paycheck would be an invitation to
                  // put it somewhere wrong.
                  onSwipeCategorize={inflow ? undefined : () => onCategorize(r)}
                />
              );
            })}
          </View>
        ))
      )}

      {rows.length > shownRows && (
        <Touchable
          style={styles.more}
          onPress={onOpenAll}
          accessibilityRole="button"
          accessibilityLabel={`See all ${rows.length} transactions`}
        >
          <Text style={styles.moreText}>See all {rows.length}</Text>
        </Touchable>
      )}

      {shownRows > 0 && (
        <Text style={styles.hint}>Swipe a row right to change its category.</Text>
      )}
    </MachinedCard>
  );
}

/**
 * Rows into days, newest first.
 *
 * The net is summed from the rows as displayed, including any the user has
 * hidden — deliberately, and it is the one thing to be careful about here. The
 * hidden state belongs to `classifyTransactions`, which has already removed
 * hidden rows upstream in `useFinancials`; anything that reaches this list is
 * counted in the totals above it. Filtering again here would produce a day net
 * that disagreed with the chart.
 */
function group(rows: CategorizedTxn[]): DayGroup[] {
  const out: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const r of rows) {
    if (!current || current.date !== r.txn.date) {
      current = { date: r.txn.date, label: dayLabel(r.txn.date), net: 0, rows: [] };
      out.push(current);
    }
    // Plaid's sign convention: positive is money out.
    current.net += -r.txn.amount;
    current.rows.push(r);
  }
  return out;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (isSameDay(dt, today)) return 'Today';
  if (isSameDay(dt, yesterday)) return 'Yesterday';
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const useStyles = createThemedStyles(t => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: Spacing[2],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    letterSpacing: 1.4,
    color: t.colors.textMuted,
  },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: Typography.xs, color: t.colors.textMuted },

  empty: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    paddingVertical: Spacing[3],
  },

  day: { paddingTop: Spacing[2] },
  dayRuled: {
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    // The milled rule. Decorative, and exempt like every other divider.
    borderTopColor: t.colors.machinedEdge,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  dayLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: t.colors.textSecondary,
  },
  dayNet: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: t.colors.accentInk,
    ...Typography.tabular,
  },
  // Muted grey, never red. Money leaving on schedule is not an error state.
  dayNetOut: { color: t.colors.gray500 },

  more: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.machinedEdge,
  },
  moreText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },

  hint: { fontSize: 11, color: t.colors.textMuted, marginTop: Spacing[2] },
}));
