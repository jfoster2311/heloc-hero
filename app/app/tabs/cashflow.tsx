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

const MOCK_MONTHS = [
  { month: 'Oct', income: 8200, expenses: 5800 },
  { month: 'Nov', income: 8000, expenses: 6100 },
  { month: 'Dec', income: 9500, expenses: 7200 },
  { month: 'Jan', income: 8000, expenses: 5500 },
  { month: 'Feb', income: 8000, expenses: 5600 },
  { month: 'Mar', income: 8400, expenses: 5700 },
];

const TOP_CATEGORIES = [
  { name: 'Housing',        amount: 1800, pct: 31, color: Colors.info },
  { name: 'Food & Dining',  amount: 900,  pct: 16, color: Colors.warning },
  { name: 'Transportation', amount: 650,  pct: 11, color: '#a855f7' },
  { name: 'Utilities',      amount: 420,  pct: 7,  color: Colors.success },
  { name: 'Subscriptions',  amount: 180,  pct: 3,  color: Colors.error },
];

export default function CashFlowScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { refreshing, refresh } = useAccounts(profile?.id ?? null);

  const latestMonth  = MOCK_MONTHS[MOCK_MONTHS.length - 1];
  const surplus      = latestMonth.income - latestMonth.expenses;
  const avgSurplus   = MOCK_MONTHS.reduce((s, m) => s + (m.income - m.expenses), 0) / MOCK_MONTHS.length;
  const avgIncome    = MOCK_MONTHS.reduce((s, m) => s + m.income, 0) / MOCK_MONTHS.length;
  const maxBar       = Math.max(...MOCK_MONTHS.map(m => m.income));
  const isLocked     = tier === 'free';

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Cash Flow</Text>
          <Text style={styles.headerSubtitle}>6-month snapshot</Text>
        </View>
        {isLocked && (
          <View style={styles.exampleBadge}>
            <Text style={styles.exampleBadgeText}>Example Data</Text>
          </View>
        )}
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
            value={`$${Math.round(avgIncome).toLocaleString()}`}
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
        <View style={CommonStyles.card}>
          <View style={styles.chartTitleRow}>
            <Text style={styles.cardTitle}>Income vs Expenses</Text>
            {isLocked && (
              <View style={styles.exampleChipSmall}>
                <Text style={styles.exampleChipText}>Example</Text>
              </View>
            )}
          </View>
          <View style={styles.chartArea}>
            {MOCK_MONTHS.map((m, i) => (
              <View key={i} style={styles.barGroup}>
                <View style={styles.barValues}>
                  <View style={styles.bars}>
                    <View
                      style={[
                        styles.bar,
                        styles.barIncome,
                        { height: Math.max(8, (m.income / maxBar) * 110) },
                      ]}
                    />
                    <View
                      style={[
                        styles.bar,
                        styles.barExpense,
                        { height: Math.max(8, (m.expenses / maxBar) * 110) },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.barLabel}>{m.month}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <LegendItem color={Colors.mint600} label="Income" />
            <LegendItem color={Colors.gray300} label="Expenses" />
            <View style={{ flex: 1 }} />
            <Text style={styles.legendNote}>Last 6 months</Text>
          </View>
        </View>

        {/* Surplus highlight */}
        <View style={[CommonStyles.card, styles.surplusCard]}>
          <View style={styles.surplusHeader}>
            <Text style={styles.cardTitle}>This Month’s Surplus</Text>
            <View style={styles.surplusBadge}>
              <Ionicons name="flash" size={10} color={Colors.white} />
              <Text style={styles.surplusBadgeText}>HELOC fuel</Text>
            </View>
          </View>
          <Text style={styles.surplusAmount}>${surplus.toLocaleString()}</Text>
          <Text style={styles.surplusSub}>
            Swept to your HELOC, this reduces mortgage interest by ~${Math.round(surplus * 0.085 / 12).toLocaleString()} this month alone
          </Text>
        </View>

        {/* Top spending categories */}
        <View style={CommonStyles.card}>
          <Text style={styles.cardTitle}>Top Spending Categories</Text>
          {TOP_CATEGORIES.map((cat, i) => (
            <View key={i} style={[styles.categoryRow, i === TOP_CATEGORIES.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
              <Text style={styles.categoryName}>{cat.name}</Text>
              <View style={styles.categoryTrack}>
                <View
                  style={[
                    styles.categoryFill,
                    { width: `${cat.pct}%`, backgroundColor: cat.color },
                  ]}
                />
              </View>
              <Text style={styles.categoryAmount}>${cat.amount.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        {/* Real data CTA */}
        {isLocked && (
          <TouchableOpacity
            style={styles.connectPrompt}
            onPress={() => router.push('/modals/upgrade')}
            activeOpacity={0.85}
          >
            <View style={styles.connectPromptIcon}>
              <Ionicons name="bar-chart-outline" size={22} color={Colors.mint600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectPromptTitle}>See your real cash flow</Text>
              <Text style={styles.connectPromptSub}>
                Connect your bank to replace example data with live transactions
              </Text>
            </View>
            <View style={styles.connectPill}>
              <Text style={styles.connectPillText}>Upgrade</Text>
            </View>
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
      <View style={[styles.summaryIconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  exampleBadge: {
    backgroundColor: Colors.warning + '22',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderWidth: 1,
    borderColor: Colors.warning + '44',
  },
  exampleBadgeText: { fontSize: Typography.xs, color: Colors.warning, fontWeight: Typography.semibold },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  summaryRow: { flexDirection: 'row', gap: Spacing[3] },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  summaryLabel: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[4],
  },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  exampleChipSmall: {
    backgroundColor: Colors.warning + '22',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
  },
  exampleChipText: { fontSize: 10, color: Colors.warning, fontWeight: Typography.semibold },

  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 130,
    gap: Spacing[2],
  },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing[2] },
  barValues: { flex: 1, justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  bar: { width: 12, borderRadius: 4, minHeight: 4 },
  barIncome: { backgroundColor: Colors.mint600 },
  barExpense: { backgroundColor: Colors.gray300 },
  barLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },

  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4], marginTop: Spacing[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: Typography.xs, color: Colors.textSecondary },
  legendNote: { fontSize: Typography.xs, color: Colors.textMuted },

  surplusCard: {
    borderWidth: 1,
    borderColor: Colors.mint200,
    backgroundColor: Colors.mint50,
    gap: Spacing[2],
  },
  surplusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  surplusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  categoryTrack: { flex: 1, height: 6, backgroundColor: Colors.gray100, borderRadius: 3 },
  categoryFill: { height: 6, borderRadius: 3 },
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
    gap: Spacing[4],
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1.5,
    borderColor: Colors.mint200,
    ...Shadows.card,
  },
  connectPromptIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectPromptTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  connectPromptSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  connectPill: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1] + 2,
  },
  connectPillText: { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.semibold },
});
