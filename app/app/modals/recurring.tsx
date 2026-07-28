// app/modals/recurring.tsx — what comes back every month, in and out.
//
// The Cash flow tab's Next 14 days strip answers "is payday before the mortgage
// is due". This answers the bigger version: what is committed, what it costs a
// year, and what is still to clear before the surplus is really free.
//
// ── Everything here is a pattern extended, and it says so ──────────────────
// Nobody promised any of these. A charge that has landed on the 12th for six
// months is likely to land again; the user may have cancelled it this morning.
// Every projected date is marked expected, and the copy never calls one due.
// See lib/recurring.ts — the detection bar is set high for the same reason.
//
// ── Why the annual figure leads ────────────────────────────────────────────
// A $15 subscription is beneath deciding about. The same subscription is $180 a
// year, which for a strategy about redirecting surplus onto principal is a real
// number. Per-charge is what the bank shows; per-year is what changes anything.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import ModalScreen, { Segmented } from '../../components/ui/ModalScreen';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import {
  detectRecurringExpenses, committedAhead, annualCost,
  type RecurringExpense,
} from '../../lib/recurring';
import { Colors, Typography, Spacing, Radius, CommonStyles } from '../../lib/theme';

/** The window "still to clear" covers. A month, so it spans a full cycle. */
const HORIZON_DAYS = 30;

type View_ = 'upcoming' | 'all';

export default function RecurringScreen() {
  const { profile } = useAuth();
  const f = useFinancials();
  const txnMeta = f.transactionMeta;

  const [view, setView] = useState<View_>('upcoming');

  // Ids the user marked recurring by hand. Their answer beats the heuristic.
  const confirmedIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, m] of Object.entries(txnMeta.meta)) if (m.recurring) set.add(id);
    return set;
  }, [txnMeta.meta]);

  const expenses = useMemo(
    () => detectRecurringExpenses({
      transactions: f.transactions,
      classification: f.transactionClassification,
      confirmedIds,
    }),
    [f.transactions, f.transactionClassification, confirmedIds],
  );

  const ahead = useMemo(
    () => committedAhead(expenses, HORIZON_DAYS),
    [expenses],
  );

  const income = f.derivedCashflow?.recurringIncome ?? [];

  const annualOut = expenses.reduce((s, e) => s + annualCost(e), 0);
  const annualIn = income.reduce(
    (s, i) => s + (i.cadenceDays > 0 ? i.typicalAmount * (365 / i.cadenceDays) : 0),
    0,
  );

  const hasAnything = expenses.length > 0 || income.length > 0;

  return (
    <ModalScreen
      title="Recurring"
      footnote={
        'These are patterns we found in your own transactions, not a bill schedule. ' +
        'Nothing here is a commitment anyone made, and a charge you cancelled today ' +
        'will still appear until it stops showing up.'
      }
    >
      {!f.hasLinkedAccounts ? (
        <Text style={styles.empty}>
          Link an account and the charges that repeat every month are found here
          automatically.
        </Text>
      ) : !hasAnything ? (
        <Text style={styles.empty}>
          Nothing repeats often enough yet to call it a pattern. This needs a few months
          of history before it can tell a subscription from a coincidence.
        </Text>
      ) : (
        <>
          {/* ── What it nets out to ───────────────────────────────────────── */}
          <View style={styles.summary}>
            <Text style={CommonStyles.eyebrow}>EVERY YEAR</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Coming in</Text>
              <Text style={styles.summaryIn}>${fmt(annualIn)}</Text>
            </View>
            <View style={styles.bar}>
              <View
                style={[styles.barFill, styles.barIn, { width: `${share(annualIn, annualIn, annualOut)}%` }]}
              />
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Going out</Text>
              <Text style={styles.summaryOut}>${fmt(annualOut)}</Text>
            </View>
            <View style={styles.bar}>
              <View
                style={[styles.barFill, styles.barOut, { width: `${share(annualOut, annualIn, annualOut)}%` }]}
              />
            </View>

            <Text style={styles.summaryNote}>
              {annualOut > 0
                ? `Your repeating charges alone come to $${fmt(annualOut / 12)} a month. ` +
                  'Every one you cancel is surplus that can go onto principal instead.'
                : 'Nothing repeating found on the way out yet.'}
            </Text>
          </View>

          {/* ── Still to clear ──────────────────────────────────────────────
              The figure that matters before sizing a dump. Undated streams are
              reported separately rather than folded in — counting a charge we
              cannot date would print a total the rows below do not reproduce. */}
          {ahead.items.length > 0 && (
            <View style={styles.ahead}>
              <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
              <View style={styles.aheadBody}>
                <Text style={styles.aheadTitle}>
                  ${fmt(ahead.total)} expected in the next {HORIZON_DAYS} days
                </Text>
                <Text style={styles.aheadText}>
                  Across {ahead.items.length} charge{ahead.items.length === 1 ? '' : 's'}. Worth
                  holding back before you move money onto the mortgage.
                  {ahead.undatedCount > 0
                    ? ` ${ahead.undatedCount} more repeat${ahead.undatedCount === 1 ? 's' : ''} ` +
                      'too irregularly to put a date on.'
                    : ''}
                </Text>
              </View>
            </View>
          )}

          <Segmented
            options={[
              { value: 'upcoming', label: `Next ${HORIZON_DAYS} days` },
              { value: 'all',      label: 'All recurring' },
            ]}
            value={view}
            onChange={v => { hapticSelection(); setView(v as View_); }}
          />

          {view === 'upcoming' ? (
            ahead.items.length === 0 ? (
              <Text style={styles.empty}>
                Nothing datable is expected in the next {HORIZON_DAYS} days.
              </Text>
            ) : (
              <View style={styles.list}>
                {ahead.items.map((item, i) => (
                  <ExpenseRow
                    key={`${item.expense.key}-${item.date}-${i}`}
                    expense={item.expense}
                    dateLabel={`Expected ${formatDay(item.date)}`}
                  />
                ))}
              </View>
            )
          ) : (
            <>
              {income.length > 0 && (
                <View style={styles.section}>
                  <Text style={CommonStyles.eyebrow}>COMING IN</Text>
                  <View style={styles.list}>
                    {income.map(s => (
                      <View key={s.name} style={styles.row}>
                        <View style={[styles.icon, styles.iconIn]}>
                          <Ionicons name="arrow-down-circle-outline" size={17} color={Colors.mint700} />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowName} numberOfLines={1}>{s.name}</Text>
                          <Text style={styles.rowMeta}>
                            {cadence(s.cadenceDays)}
                            {s.nextExpected ? ` · expected ${formatDay(s.nextExpected)}` : ''}
                            {` · ${s.observations} seen`}
                          </Text>
                        </View>
                        <Text style={styles.rowAmountIn}>+${fmt(s.typicalAmount)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.section}>
                <Text style={CommonStyles.eyebrow}>GOING OUT</Text>
                <View style={styles.list}>
                  {expenses.map(e => (
                    <ExpenseRow
                      key={e.key}
                      expense={e}
                      dateLabel={
                        e.nextExpected
                          ? `Expected ${formatDay(e.nextExpected)}`
                          : 'Too irregular to date'
                      }
                      showAnnual
                    />
                  ))}
                </View>
              </View>
            </>
          )}
        </>
      )}
    </ModalScreen>
  );
}

function ExpenseRow({ expense, dateLabel, showAnnual }: {
  expense: RecurringExpense;
  dateLabel: string;
  showAnnual?: boolean;
}) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={
        `${expense.name}, $${fmt(expense.typicalAmount)} ${cadence(expense.cadenceDays)}. ` +
        `${dateLabel}. About $${fmt(annualCost(expense))} a year.` +
        (expense.userConfirmed ? ' You marked this recurring.' : '')
      }
    >
      <View style={styles.icon}>
        <Ionicons name="repeat" size={17} color={Colors.mint700} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{expense.name}</Text>
        <Text style={styles.rowMeta}>
          {cadence(expense.cadenceDays)} · {dateLabel}
          {expense.userConfirmed ? ' · you marked this' : ''}
        </Text>
      </View>
      <View style={styles.rowAmounts}>
        <Text style={styles.rowAmount}>${fmt(expense.typicalAmount)}</Text>
        {showAnnual && (
          <Text style={styles.rowAnnual}>${fmt(annualCost(expense))}/yr</Text>
        )}
      </View>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Each bar as a share of the larger of the two.
 *
 * Both measured against the same peak, so income and outgoings are comparable
 * by eye. Scaling each to its own width would draw them equal and say nothing.
 */
function share(value: number, a: number, b: number): number {
  const peak = Math.max(a, b, 1);
  return Math.min(100, Math.max(value > 0 ? 1.5 : 0, (value / peak) * 100));
}

function cadence(days: number): string {
  if (days <= 0) return 'Repeats';
  if (days <= 8) return 'Weekly';
  if (days <= 11) return 'Every 10 days';
  if (days <= 18) return 'Every 2 weeks';
  if (days <= 24) return 'Twice a month';
  if (days <= 40) return 'Monthly';
  if (days <= 70) return 'Every 2 months';
  return 'Quarterly';
}

function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const styles = StyleSheet.create({
  summary: {
    gap: Spacing[2],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing[1],
  },
  summaryLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  summaryIn: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.mint600 },
  summaryOut: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gray500 },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.gray100, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barIn: { backgroundColor: Colors.mint600 },
  barOut: { backgroundColor: Colors.gray400 },
  summaryNote: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing[2],
  },

  ahead: {
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: Colors.mint50,
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  aheadBody: { flex: 1, gap: 3 },
  aheadTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.mint700 },
  aheadText: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  section: { gap: Spacing[2] },
  list: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 62,
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  icon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  iconIn: { backgroundColor: Colors.mint50 },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  rowMeta: { fontSize: 11, color: Colors.textMuted },
  rowAmounts: { alignItems: 'flex-end', gap: 1 },
  rowAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  rowAmountIn: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.mint600 },
  rowAnnual: { fontSize: 10, color: Colors.textMuted },

  empty: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    paddingVertical: Spacing[8],
  },
});
