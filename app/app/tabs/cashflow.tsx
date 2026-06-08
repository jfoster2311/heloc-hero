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

// Budget categories: budgeted vs actual spending this month
const BUDGET_CATEGORIES: {
  name: string;
  icon: string;
  budget: number;
  spent: number;
  color: string;
}[] = [
  { name: 'Housing',        icon: 'home-outline',            budget: 2000, spent: 1800, color: Colors.info },
  { name: 'Food & Dining',  icon: 'restaurant-outline',      budget: 1000, spent: 1050, color: Colors.warning },
  { name: 'Transportation', icon: 'car-outline',             budget: 600,  spent: 580,  color: '#a855f7' },
  { name: 'Utilities',      icon: 'flash-outline',           budget: 500,  spent: 420,  color: '#0ea5e9' },
  { name: 'Healthcare',     icon: 'medkit-outline',          budget: 300,  spent: 120,  color: Colors.success },
  { name: 'Subscriptions',  icon: 'phone-portrait-outline',  budget: 200,  spent: 180,  color: '#ec4899' },
  { name: 'Entertainment',  icon: 'game-controller-outline', budget: 250,  spent: 310,  color: Colors.error },
  { name: 'Savings',        icon: 'wallet-outline',          budget: 800,  spent: 700,  color: Colors.mint600 },
];

const TREND_MONTHS = [
  { month: 'Oct', income: 8200, expenses: 5800 },
  { month: 'Nov', income: 8000, expenses: 6100 },
  { month: 'Dec', income: 9500, expenses: 7200 },
  { month: 'Jan', income: 8000, expenses: 5500 },
  { month: 'Feb', income: 8000, expenses: 5600 },
  { month: 'Mar', income: 8400, expenses: 5700 },
];

function getBudgetStatus(pct: number): { color: string; label: string } {
  if (pct > 100) return { color: Colors.error,   label: 'Over' };
  if (pct >= 90) return { color: Colors.warning,  label: 'Near limit' };
  return             { color: Colors.success,  label: 'On track' };
}

export default function CashFlowScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { refreshing, refresh } = useAccounts(profile?.id ?? null);

  const income   = profile?.monthly_income  ?? TREND_MONTHS[TREND_MONTHS.length - 1].income;
  const expenses = profile?.monthly_expenses ?? TREND_MONTHS[TREND_MONTHS.length - 1].expenses;
  const surplus  = income - expenses;
  const savingsRate = income > 0 ? (surplus / income) * 100 : 0;

  const totalBudgeted = BUDGET_CATEGORIES.reduce((s, c) => s + c.budget, 0);
  const totalSpent    = BUDGET_CATEGORIES.reduce((s, c) => s + c.spent, 0);
  const budgetPct     = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const overBudgetCategories = BUDGET_CATEGORIES.filter(c => c.spent > c.budget).length;
  const isLocked = tier === 'free';
  const maxBar   = Math.max(...TREND_MONTHS.map(m => m.income));

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Budget & Cash Flow</Text>
          <Text style={styles.headerSub}>March 2026</Text>
        </View>
        {isLocked && (
          <View style={styles.exampleBadge}>
            <Text style={styles.exampleBadgeText}>Example</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.mint600} />}
      >
        {/* Monthly summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Income</Text>
              <Text style={[styles.summaryItemValue, { color: Colors.success }]}>${income.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Spent</Text>
              <Text style={[styles.summaryItemValue, { color: Colors.textPrimary }]}>${totalSpent.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Remaining</Text>
              <Text style={[
                styles.summaryItemValue,
                { color: income - totalSpent >= 0 ? Colors.mint600 : Colors.error },
              ]}>
                ${Math.abs(income - totalSpent).toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Overall budget bar */}
          <View style={styles.overallTrack}>
            <View style={[
              styles.overallFill,
              {
                width: `${Math.min(budgetPct, 100)}%`,
                backgroundColor: budgetPct > 100 ? Colors.error : budgetPct > 85 ? Colors.warning : Colors.mint600,
              },
            ]} />
          </View>
          <View style={styles.summaryFooter}>
            <Text style={styles.summaryFooterText}>
              {overBudgetCategories > 0
                ? `${overBudgetCategories} categor${overBudgetCategories === 1 ? 'y' : 'ies'} over budget`
                : 'All categories within budget'}
            </Text>
            <Text style={[styles.savingsRateChip, { color: savingsRate >= 20 ? Colors.success : savingsRate >= 10 ? Colors.warning : Colors.error }]}>
              {savingsRate.toFixed(1)}% savings rate
            </Text>
          </View>
        </View>

        {/* Budget categories */}
        <View style={CommonStyles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Budget Categories</Text>
            <Text style={styles.sectionSub}>This month</Text>
          </View>

          {BUDGET_CATEGORIES.map((cat, i) => {
            const pct    = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
            const status = getBudgetStatus(pct);
            const remaining = cat.budget - cat.spent;
            const isLast = i === BUDGET_CATEGORIES.length - 1;

            return (
              <View key={cat.name} style={[styles.budgetRow, isLast && styles.budgetRowLast]}>
                <View style={[styles.catIcon, { backgroundColor: `${cat.color}18` }]}>
                  <Ionicons name={cat.icon as any} size={15} color={cat.color} />
                </View>
                <View style={styles.catBody}>
                  <View style={styles.catTopRow}>
                    <Text style={styles.catName}>{cat.name}</Text>
                    <Text style={[
                      styles.catSpent,
                      pct > 100 && { color: Colors.error },
                    ]}>
                      ${cat.spent.toLocaleString()}
                      <Text style={styles.catBudget}> / ${cat.budget.toLocaleString()}</Text>
                    </Text>
                  </View>
                  <View style={styles.catTrack}>
                    <View style={[
                      styles.catFill,
                      { width: `${Math.min(pct, 100)}%`, backgroundColor: status.color },
                    ]} />
                  </View>
                  <View style={styles.catBottomRow}>
                    <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
                    <Text style={styles.catRemaining}>
                      {remaining >= 0
                        ? `$${remaining.toLocaleString()} left`
                        : `$${Math.abs(remaining).toLocaleString()} over`}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Surplus → HELOC opportunity */}
        {surplus > 0 && (
          <View style={styles.helocOpportunity}>
            <View style={styles.helocOppIcon}>
              <Ionicons name="flash" size={20} color={Colors.mint600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.helocOppTitle}>Surplus Available for HELOC</Text>
              <Text style={styles.helocOppSub}>
                Sweeping your ${surplus.toLocaleString()} monthly surplus to your HELOC
                saves ~${Math.round(surplus * 0.085 / 12).toLocaleString()} in interest this month
              </Text>
            </View>
            <Text style={styles.helocOppAmount}>${surplus.toLocaleString()}</Text>
          </View>
        )}

        {/* 6-month income vs expenses trend */}
        <View style={CommonStyles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>6-Month Trend</Text>
            {isLocked && <View style={styles.exampleChip}><Text style={styles.exampleChipText}>Example</Text></View>}
          </View>
          <View style={styles.chartArea}>
            {TREND_MONTHS.map((m, i) => (
              <View key={i} style={styles.barGroup}>
                <View style={styles.bars}>
                  <View style={[styles.bar, styles.barIncome, { height: Math.max(8, (m.income / maxBar) * 100) }]} />
                  <View style={[styles.bar, styles.barExpense, { height: Math.max(8, (m.expenses / maxBar) * 100) }]} />
                </View>
                <Text style={styles.barLabel}>{m.month}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <LegendItem color={Colors.mint600} label="Income" />
            <LegendItem color={Colors.gray300}  label="Expenses" />
          </View>
        </View>

        {/* Connect real data CTA */}
        {isLocked && (
          <TouchableOpacity style={styles.connectPrompt} onPress={() => router.push('/modals/upgrade')} activeOpacity={0.85}>
            <View style={styles.connectPromptIcon}>
              <Ionicons name="bar-chart-outline" size={22} color={Colors.mint600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectPromptTitle}>Replace examples with your real budget</Text>
              <Text style={styles.connectPromptSub}>
                Connect your bank to track actual spending by category
              </Text>
            </View>
            <View style={styles.connectPill}><Text style={styles.connectPillText}>Upgrade</Text></View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4],
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub:   { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  exampleBadge: {
    backgroundColor: Colors.warning + '22', borderRadius: Radius.full,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[1],
    borderWidth: 1, borderColor: Colors.warning + '55',
  },
  exampleBadgeText: { fontSize: Typography.xs, color: Colors.warning, fontWeight: Typography.semibold },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  // Monthly summary card
  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing[4], gap: Spacing[3], ...Shadows.card,
  },
  summaryTop:      { flexDirection: 'row', alignItems: 'stretch' },
  summaryItem:     { flex: 1, alignItems: 'center', gap: 3 },
  summaryItemLabel:{ fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  summaryItemValue:{ fontSize: Typography.xl, fontWeight: Typography.extrabold },
  summaryDivider:  { width: 1, backgroundColor: Colors.gray100, marginHorizontal: Spacing[2] },
  overallTrack:    { height: 10, backgroundColor: Colors.gray100, borderRadius: 5 },
  overallFill:     { height: 10, borderRadius: 5 },
  summaryFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryFooterText: { fontSize: Typography.xs, color: Colors.textMuted },
  savingsRateChip:   { fontSize: Typography.xs, fontWeight: Typography.semibold },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[4] },
  sectionTitle:  { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sectionSub:    { fontSize: Typography.xs, color: Colors.textMuted },
  exampleChip:   { backgroundColor: Colors.warning + '22', borderRadius: Radius.full, paddingHorizontal: Spacing[2], paddingVertical: 2 },
  exampleChipText: { fontSize: 10, color: Colors.warning, fontWeight: Typography.semibold },

  // Budget category rows
  budgetRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  budgetRowLast: { borderBottomWidth: 0 },
  catIcon: { width: 34, height: 34, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  catBody:      { flex: 1, gap: Spacing[2] },
  catTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catName:      { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  catSpent:     { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  catBudget:    { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.regular },
  catTrack:     { height: 6, backgroundColor: Colors.gray100, borderRadius: 3 },
  catFill:      { height: 6, borderRadius: 3 },
  catBottomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusLabel:  { fontSize: Typography.xs, fontWeight: Typography.medium, flex: 1 },
  catRemaining: { fontSize: Typography.xs, color: Colors.textMuted },

  // Surplus → HELOC
  helocOpportunity: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.mint50, borderRadius: Radius.lg, padding: Spacing[4],
    borderWidth: 1.5, borderColor: Colors.mint200,
  },
  helocOppIcon:   { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.mint100, alignItems: 'center', justifyContent: 'center' },
  helocOppTitle:  { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.mint700 },
  helocOppSub:    { fontSize: Typography.xs, color: Colors.mint600, lineHeight: 16, marginTop: 2 },
  helocOppAmount: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.mint600 },

  // Trend chart
  chartArea:  { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: Spacing[2] },
  barGroup:   { flex: 1, alignItems: 'center', gap: Spacing[2] },
  bars:       { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  bar:        { width: 12, borderRadius: 4, minHeight: 4 },
  barIncome:  { backgroundColor: Colors.mint600 },
  barExpense: { backgroundColor: Colors.gray300 },
  barLabel:   { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  legend:     { flexDirection: 'row', gap: Spacing[4], marginTop: Spacing[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: Typography.xs, color: Colors.textSecondary },

  // Connect CTA
  connectPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[4],
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing[4],
    borderWidth: 1.5, borderColor: Colors.mint200, ...Shadows.card,
  },
  connectPromptIcon:  { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.mint50, alignItems: 'center', justifyContent: 'center' },
  connectPromptTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  connectPromptSub:   { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  connectPill:        { backgroundColor: Colors.mint600, borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: Spacing[1] + 2 },
  connectPillText:    { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.semibold },
});
