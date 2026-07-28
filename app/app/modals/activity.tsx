// app/modals/activity.tsx — every transaction behind the figures.
//
// Reached from the Latest Activity widget's header chevron. The widget shows
// four rows; this shows all of them, grouped by day, searchable and sortable.
//
// ── Why the summary sits at the top and is collapsed ───────────────────────
// The totals here have to agree with the Cash flow tab exactly, because a user
// arriving from that tab is checking the app's arithmetic — that is what a full
// transaction list is FOR. So they are summed from the same `summarizePeriod`
// call with the same classification, and the count of what was held out is
// stated rather than hidden. Collapsed by default because the list is the
// reason someone opened this screen, not the total they already saw.
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import ModalScreen from '../../components/ui/ModalScreen';
import TransactionRow from '../../components/ui/TransactionRow';
import TransactionDetailSheet from '../../components/sheets/TransactionDetailSheet';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import type { UseTransactionMetaResult } from '../../hooks/useTransactionMeta';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import {
  periodRange, summarizePeriod,
  type CategorizedTxn, type CategoryMeta, type SpendCategory,
} from '../../lib/spending';
import { Colors, Typography, Spacing, Radius, CommonStyles } from '../../lib/theme';

type Sort = 'newest' | 'oldest' | 'largest';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'newest',  label: 'Newest' },
  { id: 'oldest',  label: 'Oldest' },
  { id: 'largest', label: 'Largest' },
];

export default function ActivityScreen() {
  const { profile } = useAuth();
  const f = useFinancials();
  const overrides = useCategoryOverrides(profile?.id);
  // One instance for the whole app — see the note in useFinancials.
  const txnMeta = f.transactionMeta;

  const [sort, setSort] = useState<Sort>('newest');
  const [query, setQuery] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [openTxn, setOpenTxn] = useState<CategorizedTxn | null>(null);

  const range = useMemo(() => periodRange('month'), []);

  const summary = useMemo(
    () => summarizePeriod({
      transactions: f.transactions,
      classification: f.transactionClassification,
      overrides: overrides.overrides,
      range,
      entered: { monthlyIncome: f.income, monthlyExpenses: f.expenses },
    }),
    [f.transactions, f.transactionClassification, overrides.overrides, range, f.income, f.expenses],
  );

  // Outflows and inflows together. They are separate on the summary so a
  // paycheck cannot land in the category breakdown, but this screen is where a
  // user checks the app against their statement, and a list missing their
  // deposits would read as the app having lost them.
  const all = useMemo(
    () => [...summary.rows, ...summary.inflows],
    [summary.rows, summary.inflows],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(r =>
          (r.txn.merchant_name ?? r.txn.name ?? '').toLowerCase().includes(q) ||
          (r.txn.amount > 0 && f.categories.metaFor(r.category).label.toLowerCase().includes(q)))
      : all;

    const sorted = [...filtered];
    switch (sort) {
      case 'newest':  sorted.sort((a, b) => b.txn.date.localeCompare(a.txn.date)); break;
      case 'oldest':  sorted.sort((a, b) => a.txn.date.localeCompare(b.txn.date)); break;
      case 'largest': sorted.sort((a, b) => b.txn.amount - a.txn.amount); break;
    }
    return sorted;
  }, [all, query, sort, f.categories]);

  // Day headings only make sense on a date-ordered list. Sorting by amount and
  // keeping them would produce a heading per row, which is not a grouping.
  const grouped = useMemo(() => {
    if (sort === 'largest') return null;
    const groups: { date: string; rows: CategorizedTxn[] }[] = [];
    for (const r of rows) {
      const last = groups[groups.length - 1];
      if (last && last.date === r.txn.date) last.rows.push(r);
      else groups.push({ date: r.txn.date, rows: [r] });
    }
    return groups;
  }, [rows, sort]);

  const hiddenInPeriod = useMemo(
    () => summary.rows.filter(r => txnMeta.get(r.txn.transaction_id).hidden).length,
    [summary.rows, txnMeta],
  );

  return (
    <>
      <ModalScreen title="Activity">
        <Text style={styles.range}>
          {range.rangeLabel}{range.inProgress ? ' · in progress' : ''}
        </Text>

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by payee or category"
            placeholderTextColor={Colors.textMuted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search transactions"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => { hapticLight(); setQuery(''); }}
              style={styles.searchClear}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Sort ───────────────────────────────────────────────────────── */}
        <View style={styles.sorts} accessibilityRole="tablist">
          {SORTS.map(s => {
            const active = s.id === sort;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.sortPill, active && styles.sortPillActive]}
                onPress={() => { hapticSelection(); setSort(s.id); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sort by ${s.label.toLowerCase()}`}
              >
                <Text style={[styles.sortText, active && styles.sortTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Summary ───────────────────────────────────────────────────── */}
        <View style={styles.summaryCard}>
          <TouchableOpacity
            style={styles.summaryHead}
            onPress={() => { hapticLight(); setSummaryOpen(o => !o); }}
            accessibilityRole="button"
            accessibilityState={{ expanded: summaryOpen }}
            accessibilityLabel="Summary for this period"
          >
            <Text style={CommonStyles.eyebrow}>SUMMARY</Text>
            <Ionicons
              name={summaryOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textMuted}
            />
          </TouchableOpacity>

          {summaryOpen && (
            <View style={styles.summaryBody}>
              <SummaryLine label="Money in" value={summary.income} />
              <SummaryLine label="Money out" value={-summary.spend} />
              <SummaryLine label="Transactions" text={String(summary.rows.length)} />
              {hiddenInPeriod > 0 && (
                <SummaryLine
                  label="Hidden by you"
                  text={`${hiddenInPeriod} not counted`}
                />
              )}
              <Text style={styles.summaryNote}>
                Transfers between your own accounts and your mortgage payment are left out —
                the strategy models those directly.
              </Text>
            </View>
          )}
        </View>

        {/* ── The list ──────────────────────────────────────────────────── */}
        {summary.basis !== 'live' ? (
          <Text style={styles.empty}>
            {f.hasLinkedAccounts
              ? 'No transactions this month yet.'
              : 'Link an account and your transactions appear here.'}
          </Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            Nothing matches “{query}”.
          </Text>
        ) : grouped ? (
          grouped.map(g => (
            <View key={g.date} style={styles.group}>
              <Text style={styles.groupHead}>{formatGroupDay(g.date)}</Text>
              <View style={styles.list}>
                {g.rows.map(r => <Row key={r.txn.transaction_id} row={r} meta={txnMeta} categoryFor={f.categories.metaFor} onOpen={setOpenTxn} />)}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.list}>
            {rows.map(r => <Row key={r.txn.transaction_id} row={r} meta={txnMeta} categoryFor={f.categories.metaFor} onOpen={setOpenTxn} />)}
          </View>
        )}
      </ModalScreen>

      <TransactionDetailSheet
        row={openTxn}
        categories={f.categories.all}
        categoryFor={f.categories.metaFor}
        onCreateCategory={f.categories.create}
        categorySaving={f.categories.saving}
        categoryError={f.categories.error}
        meta={openTxn ? txnMeta.get(openTxn.txn.transaction_id) : { hidden: false, note: null, recurring: false }}
        saving={openTxn ? txnMeta.saving === openTxn.txn.transaction_id : false}
        onClose={() => setOpenTxn(null)}
        onRecategorize={overrides.setCategory}
        onSetHidden={txnMeta.setHidden}
        onSetNote={txnMeta.setNote}
        onSetRecurring={txnMeta.setRecurring}
      />
    </>
  );
}

function Row({ row, meta, categoryFor, onOpen }: {
  row: CategorizedTxn;
  meta: UseTransactionMetaResult;
  categoryFor: (id: SpendCategory) => CategoryMeta;
  onOpen: (r: CategorizedTxn) => void;
}) {
  const m = meta.get(row.txn.transaction_id);
  // An inflow carries a placeholder category so the two arrays share a shape.
  // Rendering it would label a paycheck "Other".
  const inflow = row.txn.amount < 0;
  return (
    <TransactionRow
      name={row.txn.merchant_name ?? row.txn.name ?? 'Transaction'}
      meta={inflow ? 'Money in' : categoryFor(row.category).label}
      amount={row.txn.amount}
      icon={inflow ? 'arrow-down-circle-outline' : categoryFor(row.category).icon}
      hidden={m.hidden}
      recurring={m.recurring}
      overridden={!inflow && row.overridden}
      pending={row.txn.pending}
      onPress={() => { hapticLight(); onOpen(row); }}
    />
  );
}

function SummaryLine({ label, value, text }: {
  label: string;
  value?: number;
  text?: string;
}) {
  const negative = value !== undefined && value < 0;
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, negative && styles.summaryValueMuted]}>
        {text ?? `${negative ? '−' : ''}$${fmt(Math.abs(value ?? 0))}`}
      </Text>
    </View>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

function formatGroupDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric',
  });
}

const styles = StyleSheet.create({
  range: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 48,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  searchClear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  sorts: { flexDirection: 'row', gap: Spacing[2] },
  sortPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortPillActive: { backgroundColor: Colors.mint800, borderColor: Colors.mint800 },
  sortText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  sortTextActive: { color: Colors.white, fontWeight: Typography.semibold },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  summaryBody: { paddingBottom: Spacing[3], gap: Spacing[1] },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    gap: Spacing[3],
  },
  summaryLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  summaryValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  summaryValueMuted: { color: Colors.gray500 },
  summaryNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: Spacing[2] },

  group: { gap: Spacing[2] },
  groupHead: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textMuted },
  list: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },

  empty: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: Spacing[8],
  },
});
