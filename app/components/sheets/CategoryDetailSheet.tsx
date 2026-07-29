// components/sheets/CategoryDetailSheet.tsx — one category, from wherever it
// was tapped.
//
// The Budget list and the Breakdown ring both open this. They are different
// screens asking the same question, and building it twice is how a ceiling comes
// to be editable from one of them and read-only from the other.
//
// ── Why `type` and not two components ──────────────────────────────────────
// Income has no ceiling. There is nothing to cap on money coming in, so the
// income form omits the ceiling field, the available-to-spend callout, the
// apply-to-future toggle and the Save button, and its trend chart runs in 'flat'
// mode because no bar can fail. Everything else — the stat rows, the history,
// the transaction list — is identical, and that shared remainder is most of the
// screen. Two components would have drifted; a boolean-shaped prop keeps the
// difference explicit and in one place.
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, Switch, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DetailSheet, { SheetSection, SheetRow } from '../ui/DetailSheet';
import TransactionRow from '../ui/TransactionRow';
import TrendBarChart from '../ui/TrendBarChart';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight, hapticSelection, hapticSuccess } from '../../lib/haptics';
import { budgetStatus, suggestCeiling } from '../../lib/budget';
import type {
  SpendCategory, CategorizedTxn, MonthPoint, CategoryMeta,
} from '../../lib/spending';
import { parseNumeric } from '../../lib/parseNumeric';
import type { TransactionMeta } from '../../hooks/useTransactionMeta';

export interface CategoryDetailTarget {
  /** Expense shows the ceiling block; income omits it entirely. */
  type: 'income' | 'expense';
  /** Null for income, which is not one of the spending buckets. */
  category: SpendCategory | null;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface CategoryDetailSheetProps {
  /** Null closes the sheet. */
  target: CategoryDetailTarget | null;
  /** "July" — the month the figures below cover. */
  monthLabel: string;
  /** Spent (or earned) in the month on screen. */
  amount: number;
  history: MonthPoint[];
  /** Whole-month average behind the "last 12 months" stat. Null with no history. */
  trailingAverage: number | null;
  /** The ceiling in force, or null. Ignored for income. */
  ceiling: number | null;
  /** True when the ceiling came from the standing default, not this month. */
  inherited: boolean;
  rows: CategorizedTxn[];
  metaFor: (transactionId: string) => TransactionMeta;
  categoryFor: (id: SpendCategory) => CategoryMeta;
  /** True while the month shown is still running, so the total is partial. */
  inProgress: boolean;
  saving: boolean;

  onClose: () => void;
  onSaveCeiling: (ceiling: number, applyToFuture: boolean) => Promise<void> | void;
  onClearCeiling: () => Promise<void> | void;
  onOpenTransaction: (row: CategorizedTxn) => void;
}

export default function CategoryDetailSheet(props: CategoryDetailSheetProps) {
  const { common, colors } = useTheme();
  const styles = useStyles();
  const {
    target, monthLabel, amount, history, trailingAverage, ceiling, inherited,
    rows, metaFor, categoryFor, inProgress, saving,
    onClose, onSaveCeiling, onClearCeiling, onOpenTransaction,
  } = props;

  const [draft, setDraft] = useState('');
  const [applyToFuture, setApplyToFuture] = useState(true);

  const key = target?.category ?? target?.type ?? null;
  // Reset when the sheet is pointed at a different category, not just on mount.
  // Without this, opening Groceries after Dining shows Dining's ceiling in the
  // field, and saving would write it onto Groceries.
  useEffect(() => {
    setDraft(ceiling !== null ? String(Math.round(ceiling)) : '');
    setApplyToFuture(ceiling === null ? true : inherited);
  }, [key, ceiling, inherited]);

  const parsed = parseNumeric(draft);
  const dirty = target?.type === 'expense' && parsed !== null && parsed > 0 && parsed !== ceiling;

  const status = useMemo(() => budgetStatus(amount, ceiling), [amount, ceiling]);
  const suggestion = useMemo(
    () => (trailingAverage !== null ? suggestCeiling(trailingAverage) : null),
    [trailingAverage],
  );

  if (!target) {
    return (
      <DetailSheet visible={false} title="Category detail" onClose={onClose}>
        <View />
      </DetailSheet>
    );
  }

  const isExpense = target.type === 'expense';

  return (
    <DetailSheet
      visible
      title="Category detail"
      onClose={onClose}
      onDismiss={() => setDraft('')}
      footer={
        dirty ? (
          <TouchableOpacity
            style={styles.save}
            onPress={async () => {
              hapticSuccess();
              await onSaveCeiling(parsed!, applyToFuture);
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={`Save a ${monthLabel} budget of $${fmt(parsed!)} for ${target.label}`}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.saveText}>Save budget</Text>}
          </TouchableOpacity>
        ) : undefined
      }
    >
      {/* ── Identity ───────────────────────────────────────────────────── */}
      <View style={styles.identity}>
        <View style={styles.identityIcon}>
          <Ionicons name={target.icon} size={20} color={colors.mint700} />
        </View>
        <View style={styles.identityBody}>
          <Text style={styles.identityLabel}>{target.label}</Text>
          <Text style={styles.identitySub}>
            {rows.length} transaction{rows.length === 1 ? '' : 's'} in {monthLabel}
          </Text>
        </View>
        <Text style={styles.identityAmount}>${fmt(amount)}</Text>
      </View>

      {/* ── The ceiling block — expense only ───────────────────────────────
          Income has nothing to cap, so none of this renders for it. See the
          header comment for why that is a prop rather than a second file. */}
      {isExpense && (
        <SheetSection label={`Budget for ${monthLabel}`}>
          <View style={styles.inputRow}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              placeholder={suggestion !== null ? String(suggestion) : '0'}
              placeholderTextColor={colors.textMuted}
              maxLength={9}
              accessibilityLabel={`Monthly budget for ${target.label}`}
            />
            {ceiling !== null && (
              <TouchableOpacity
                onPress={() => { hapticLight(); onClearCeiling(); }}
                style={styles.clear}
                accessibilityRole="button"
                accessibilityLabel="Remove this budget"
              >
                <Text style={styles.clearText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <SheetRow label={`Use this every month`} last>
            <Switch
              value={applyToFuture}
              onValueChange={v => { hapticSelection(); setApplyToFuture(v); }}
              trackColor={{ false: colors.gray200, true: colors.mint600 }}
              thumbColor={colors.white}
              accessibilityLabel="Apply this budget to future months"
            />
          </SheetRow>
        </SheetSection>
      )}

      {/* ── Room left ──────────────────────────────────────────────────────
          Only drawn when a ceiling exists. With none set there is no
          "remaining" to state, and a $0 callout would tell someone they are
          out of room they never asked for. */}
      {isExpense && status.ceiling !== null && (
        <View style={[styles.callout, status.over && styles.calloutOver]}>
          <Ionicons
            name={status.over ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            size={18}
            color={status.over ? colors.gray500 : colors.mint700}
          />
          <View style={styles.calloutBody}>
            <Text style={[styles.calloutValue, status.over && styles.calloutValueOver]}>
              {status.over
                ? `$${fmt(status.overBy)} over`
                : `$${fmt(status.remaining ?? 0)} left`}
            </Text>
            <Text style={styles.calloutSub}>
              {status.over
                ? `You've spent $${fmt(amount)} against a $${fmt(status.ceiling)} budget.`
                : `of your $${fmt(status.ceiling)} budget${inProgress ? ', and the month is still running' : ''}.`}
            </Text>
          </View>
        </View>
      )}

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <SheetSection label="History">
        <SheetRow
          label="Average per month"
          value={trailingAverage !== null ? `$${fmt(trailingAverage)}` : null}
          placeholder="Not enough history yet"
        />
        <SheetRow
          label={`${monthLabel} ${isExpense ? 'spent' : 'earned'}`}
          value={`$${fmt(amount)}`}
        />
        {isExpense && (
          <SheetRow
            label={`${monthLabel} budget`}
            value={ceiling !== null ? `$${fmt(ceiling)}` : null}
            placeholder="None set"
          />
        )}
        <SheetRow label="Transactions" value={String(rows.length)} last />
      </SheetSection>

      {/* ── The trend ──────────────────────────────────────────────────────
          'threshold' only where a ceiling exists to pass or fail. Income runs
          'flat', and so does an expense with no budget — a bar cannot fail a
          test that was never set. */}
      {history.length > 0 && (
        <View style={styles.chartBlock}>
          <Text style={common.eyebrow}>LAST {history.length} MONTHS</Text>
          <TrendBarChart
            points={history}
            colorMode={isExpense && ceiling !== null ? 'threshold' : 'flat'}
            threshold={ceiling}
            showValues
            accessibilityLabel={
              `${target.label} by month. ` +
              history.map(p => `${p.label}: $${fmt(p.amount)}`).join('. ') +
              (ceiling !== null ? `. Budget: $${fmt(ceiling)} a month.` : '')
            }
          />
          {inProgress && (
            <Text style={styles.chartNote}>
              {monthLabel} is still running, so its bar is a part-month.
            </Text>
          )}
        </View>
      )}

      {/* ── The rows behind the figure ─────────────────────────────────── */}
      <View style={styles.listBlock}>
        <Text style={common.eyebrow}>
          TRANSACTIONS IN {monthLabel.toUpperCase()}
        </Text>
        {rows.length === 0 ? (
          <Text style={styles.empty}>Nothing in this category this month.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map(r => {
              const m = metaFor(r.txn.transaction_id);
              return (
                <TransactionRow
                  key={r.txn.transaction_id}
                  name={r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}
                  meta={formatDay(r.txn.date)}
                  amount={r.txn.amount}
                  icon={categoryFor(r.category).icon}
                  hidden={m.hidden}
                  recurring={m.recurring}
                  overridden={r.overridden}
                  pending={r.txn.pending}
                  onPress={() => { hapticLight(); onOpenTransaction(r); }}
                />
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.footnote}>
        A budget here is yours alone. It does not change your payoff projection or the
        surplus your plan is sized on — those come from what you actually earn and spend.
      </Text>
    </DetailSheet>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const useStyles = createThemedStyles(t => ({
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  identityIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: t.colors.mint50,
    alignItems: 'center', justifyContent: 'center',
  },
  identityBody: { flex: 1, gap: 2 },
  identityLabel: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
  },
  identitySub: { fontSize: Typography.xs, color: t.colors.textMuted },
  identityAmount: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  currency: {
    fontSize: Typography.xl,
    fontWeight: Typography.semibold,
    color: t.colors.textMuted,
  },
  input: {
    flex: 1,
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
    paddingVertical: Spacing[2],
  },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing[2] },
  clearText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: t.colors.textSecondary },

  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  calloutOver: { backgroundColor: t.colors.gray100, borderColor: t.colors.gray200 },
  calloutBody: { flex: 1, gap: 2 },
  calloutValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: t.colors.mint700,
  },
  calloutValueOver: { color: t.colors.gray500 },
  calloutSub: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },

  chartBlock: { gap: Spacing[3] },
  chartNote: { fontSize: 11, color: t.colors.textMuted },

  listBlock: { gap: Spacing[2] },
  list: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
  empty: { fontSize: Typography.sm, color: t.colors.textMuted, lineHeight: 20 },

  footnote: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 18 },

  save: {
    minHeight: 52,
    borderRadius: Radius.full,
    backgroundColor: t.colors.mint600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: t.colors.white,
  },
}));
