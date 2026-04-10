// app/tabs/cashflow.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';

// Static example months — in production these come from Plaid transactions
const MOCK_MONTHS = [
  { month: 'Oct', income: 8200, expenses: 5800 },
  { month: 'Nov', income: 8000, expenses: 6100 },
  { month: 'Dec', income: 9500, expenses: 7200 },
  { month: 'Jan', income: 8000, expenses: 5500 },
  { month: 'Feb', income: 8000, expenses: 5600 },
  { month: 'Mar', income: 8400, expenses: 5700 },
];

const TOP_CATEGORIES = [
  { name: 'Housing', amount: 1800, pct: 31, color: Colors.info },
  { name: 'Food & Dining', amount: 900, pct: 16, color: Colors.warning },
  { name: 'Transportation', amount: 650, pct: 11, color: '#a855f7' },
  { name: 'Utilities', amount: 420, pct: 7, color: Colors.success },
  { name: 'Subscriptions', amount: 180, pct: 3, color: Colors.error },
];

export default function CashFlowScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { savingsAccount, refreshing, refresh } = useAccounts(profile?.id ?? null);

  const latestMonth = MOCK_MONTHS[MOCK_MONTHS.length - 1];
  const surplus = latestMonth.income - latestMonth.expenses;
  const avgSurplus = MOCK_MONTHS.reduce(
    (s, m) => s + (m.income - m.expenses), 0,
  ) / MOCK_MONTHS.length;
  const maxBar = Math.max(...MOCK_MONTHS.map(m => m.income));

  const isLocked = tier === 'free';

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cash Flow</Text>
        <Text style={styles.headerSubtitle}>6-month overview</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.mint600} />
        }
      >
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <SummaryCard
            label="Avg Monthly Income"
            value={`$${Math.round(MOCK_MONTHS.reduce((s, m) => s + m.income, 0) / MOCK_MONTHS.length).toLocaleString()}`}
            icon="trending-up-outline"
            color={Colors.success}
          />
          <SummaryCard
            label="Avg Monthly Surplus"
            value={`$${Math.round(avgSurplus).toLocaleString()}`}
            icon="flash-outline"
            color={Colors.mint600}
          />
        </View>

        {/* Bar chart */}
        <View style={[CommonStyles.card]}>
          <Text style={styles.cardTitle}>Income vs Expenses</Text>
          <View style={styles.chartArea}>
            {MOCK_MONTHS.map((m, i) => (
              <View key={i} style={styles.barGroup}>
                <View style={styles.bars}>
                  <View
                    style={[
                      styles.bar,
                      styles.barIncome,
                      { height: (m.income / maxBar) * 100 },
                    ]}
                  />
                  <View
                    style={[
                      styles.bar,
                      styles.barExpense,
                      { height: (m.expenses / maxBar) * 100 },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{m.month}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.mint600 }]} />
              <Text style={styles.legendText}>Income</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.gray300 }]} />
              <Text style={styles.legendText}>Expenses</Text>
            </View>
          </View>
        </View>

        {/* Surplus highlight */}
        <View style={[CommonStyles.card, styles.surplusCard]}>
          <View style={styles.surplusHeader}>
            <Text style={styles.cardTitle}>This Month's Surplus</Text>
            <View style={styles.surplusBadge}>
              <Text style={styles.surplusBadgeText}>HELOC fuel</Text>
            </View>
          </View>
          <Text style={styles.surplusAmount}>${surplus.toLocaleString()}</Text>
          <Text style={styles.surplusSub}>
            If swept to your HELOC, this reduces your interest by ~${Math.round(surplus * 0.085 / 12).toLocaleString()}/mo
          </Text>
        </View>

        {/* Top spending categories */}
        <View style={CommonStyles.card}>
          <Text style={styles.cardTitle}>Top Spending Categories</Text>
          {TOP_CATEGORIES.map((cat, i) => (
            <View key={i} style={styles.categoryRow}>
              <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
              <Text style={styles.categoryName}>{cat.name}</Text>
              <View style={styles.categoryBar}>
                <View
                  style={[
                    styles.categoryBarFill,
                    { width: `${cat.pct}%`, backgroundColor: cat.color },
                  ]}
                />
              </View>
              <Text style={styles.categoryAmount}>${cat.amount.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        {/* Upgrade prompt for connecting real data */}
        {isLocked && (
          <TouchableOpacity
            style={styles.connectPrompt}
            onPress={() => router.push('/modals/upgrade')}
          >
            <Ionicons name="lock-closed-outline" size={20} color={Colors.mint600} />
            <Text style={styles.connectPromptText}>
              Connect your bank to see your real cash flow data
            </Text>
            <Text style={styles.connectPromptLink}>Upgrade →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({
  label, value, icon, color,
}: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={[styles.summaryCard, Shadows.card]}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },
  summaryRow: { flexDirection: 'row', gap: Spacing[3] },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  summaryValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  summaryLabel: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[4],
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: Spacing[2],
  },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing[1] },
  bars: { flexDirection: 'row', gap: 2, alignItems: 'flex-end' },
  bar: { width: 10, borderRadius: 3, minHeight: 4 },
  barIncome: { backgroundColor: Colors.mint600 },
  barExpense: { backgroundColor: Colors.gray300 },
  barLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  legend: { flexDirection: 'row', gap: Spacing[4], marginTop: Spacing[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: Typography.xs, color: Colors.textSecondary },
  surplusCard: { borderWidth: 1, borderColor: Colors.mint200, backgroundColor: Colors.mint50 },
  surplusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  surplusBadge: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 3,
  },
  surplusBadgeText: { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.semibold },
  surplusAmount: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: Colors.mint700,
  },
  surplusSub: { fontSize: Typography.sm, color: Colors.mint700, lineHeight: 20 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  categoryDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  categoryName: { width: 110, fontSize: Typography.sm, color: Colors.textSecondary },
  categoryBar: { flex: 1, height: 6, backgroundColor: Colors.gray100, borderRadius: 3 },
  categoryBarFill: { height: 6, borderRadius: 3 },
  categoryAmount: {
    width: 54,
    textAlign: 'right',
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textPrimary,
  },
  connectPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  connectPromptText: { flex: 1, fontSize: Typography.sm, color: Colors.mint700, lineHeight: 18 },
  connectPromptLink: { color: Colors.mint600, fontWeight: Typography.bold, fontSize: Typography.sm },
});
