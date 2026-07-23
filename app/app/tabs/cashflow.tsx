// app/tabs/cashflow.tsx — cash flow and cycle history.
//
// This screen used to render eight hardcoded budget categories and a fabricated
// six-month income/expense chart. The disclosure was also inverted: the
// "Example" chip and badge only rendered for FREE users, so a PAYING user saw
// invented categories labelled "This month" and an invented trend chart with no
// caveat at all. In a finance app that is a claim the product cannot back up.
//
// Nothing persists Plaid transactions — there is no transactions table and the
// webhook does not store any — so per-category spending and an income/expense
// trend cannot be computed. They are therefore not shown. What IS real:
//   · the figures the user entered at onboarding (labelled as their figures)
//   · live HELOC/mortgage balances when accounts are linked
//   · dumps they have logged, from automation_log
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { useDumpHistory } from '../../hooks/useDumpHistory';
import { hapticLight } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';
import type { LinkedAccount } from '../../lib/types';

const ASSUMED_HELOC_RATE = 0.085;

export default function CashFlowScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { refreshing, refresh, helocAccount } = useAccounts(profile?.id ?? null);
  const {
    buckets, totalDumped, count, lastDumpAt, loading: historyLoading,
    error: historyError, refresh: refreshHistory,
  } = useDumpHistory(profile?.id);

  const helocBalance = firstBalance(helocAccount);

  const income   = profile?.monthly_income   ?? 0;
  const expenses = profile?.monthly_expenses ?? 0;
  const payment  = profile?.monthly_payment  ?? 0;
  const helocInterest = (helocBalance ?? 0) * ASSUMED_HELOC_RATE / 12;

  const hasFigures = income > 0;
  const committed  = expenses + payment + (helocInterest > 1 ? helocInterest : 0);
  const surplus    = income - committed;
  const committedPct = income > 0 ? Math.min((committed / income) * 100, 100) : 0;

  const onRefresh = useCallback(() => {
    refresh();
    refreshHistory();
  }, [refresh, refreshHistory]);

  const maxBucket = Math.max(...buckets.map(b => b.total), 0);

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cash flow</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.mint600} />
        }
      >
        {/* ── Monthly cash flow, from the user's own figures ──────────────── */}
        {hasFigures ? (
          <View style={CommonStyles.card}>
            <Text style={styles.cardTitle}>Every month</Text>

            <Line label="Income" amount={income} />
            <Line label="Mortgage payment" amount={-payment} />
            <Line label="Living expenses" amount={-expenses} />
            {helocInterest > 1 && (
              <Line label="HELOC interest (estimated)" amount={-helocInterest} />
            )}

            <View style={styles.surplusRow}>
              <Text style={styles.surplusLabel}>
                {surplus >= 0 ? 'Left to cycle' : 'Short each month'}
              </Text>
              <Text style={[styles.surplusValue, surplus < 0 && styles.surplusNegative]}>
                {surplus >= 0 ? '' : '−'}${fmt(Math.abs(surplus))}
              </Text>
            </View>

            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${committedPct}%` }]} />
            </View>
            <Text style={styles.trackNote}>
              {committedPct.toFixed(0)}% of income committed
              {surplus < 0 ? ' — expenses exceed income, so there is nothing to cycle' : ''}
            </Text>

            <Text style={styles.sourceNote}>
              Based on the figures you entered
              {helocInterest > 1 ? ', plus interest estimated from your linked HELOC balance' : ''}.
              Update them in Settings.
            </Text>
          </View>
        ) : (
          <View style={CommonStyles.card}>
            <Text style={styles.cardTitle}>Every month</Text>
            <Text style={styles.emptyBody}>
              Add your income and expenses to see what you have available to cycle.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/modals/settings')}
              accessibilityLabel="Add your figures"
            >
              <Text style={styles.emptyBtnText}>Add your figures</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Cycle history — real logged dumps ───────────────────────────── */}
        <View style={CommonStyles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your dumps</Text>
            {count > 0 && (
              <Text style={styles.cardStatus}>
                {count} logged · ${fmt(totalDumped)} total
              </Text>
            )}
          </View>

          {historyError ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                Couldn&apos;t load your history: {historyError}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={refreshHistory}
                accessibilityLabel="Try loading history again"
              >
                <Text style={styles.emptyBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : historyLoading ? (
            <Text style={styles.emptyBody}>Loading…</Text>
          ) : count === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                No dumps logged yet. When you move money onto your principal, record it here
                and this fills in with your real history.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => { hapticLight(); router.push('/modals/move-money' as never); }}
                accessibilityLabel="Plan a move"
              >
                <Text style={styles.emptyBtnText}>Plan a move</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.chart}>
                {buckets.map((b, i) => (
                  <View key={i} style={styles.barGroup}>
                    <View style={styles.barSlot}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: maxBucket > 0 ? Math.max(3, (b.total / maxBucket) * 88) : 3,
                            backgroundColor: b.total > 0 ? Colors.mint600 : Colors.gray100,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{b.label}</Text>
                  </View>
                ))}
              </View>
              {/* The totals above are all-time; the chart is a 6-month window.
                  Say so, rather than leaving two different numbers unexplained. */}
              <Text style={styles.chartNote}>
                Last 6 months
                {lastDumpAt
                  ? ` · most recent ${lastDumpAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ''}
              </Text>
            </>
          )}
        </View>

        {/* ── What this screen deliberately does not show ─────────────────── */}
        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            Spending by category isn&apos;t shown because HELOC Hero doesn&apos;t read your
            transactions — only account balances. For category budgeting, a dedicated budgeting
            app will serve you better.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Line({ label, amount }: { label: string; amount: number }) {
  const negative = amount < 0;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineAmount}>
        {negative ? '−' : ''}${fmt(Math.abs(amount))}
      </Text>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function firstBalance(account: LinkedAccount | null): number | null {
  if (!account || account.accounts.length === 0) return null;
  return account.accounts[0].balances.current;
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[3],
  },
  cardStatus: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing[3] },

  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
  },
  lineLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  lineAmount: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },

  surplusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    marginBottom: Spacing[3],
  },
  surplusLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  surplusValue: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.mint600,
  },
  // Negative numbers use muted grey, never red.
  surplusNegative: { color: Colors.gray400 },

  track: { height: 8, backgroundColor: Colors.gray100, borderRadius: 4, overflow: 'hidden' },
  trackFill: { height: 8, borderRadius: 4, backgroundColor: Colors.gray400 },
  trackNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[2] },
  sourceNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },

  stateBlock: { gap: Spacing[3] },
  emptyBody: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  emptyBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.mint200,
    backgroundColor: Colors.mint50,
  },
  emptyBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing[2], height: 112 },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing[2] },
  barSlot: { height: 88, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 4 },
  barLabel: { fontSize: 11, color: Colors.textMuted },
  chartNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[3] },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    ...Shadows.card,
  },
  noteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },
});
