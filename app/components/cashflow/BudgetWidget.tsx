// components/cashflow/BudgetWidget.tsx — the total, and the three categories
// doing the most damage to it.
//
// Deliberately shows the biggest SPENDERS rather than the worst offenders
// against their ceilings. A preview ranked by how far over budget each category
// is would be dominated by a $30 category with a $20 ceiling, and would hide the
// $1,400 one the user has never budgeted at all — which is the row that actually
// decides whether there is a surplus to cycle.
//
// The over-ceiling state is grey plus the word "over", never colour alone. See
// `Semantic` in lib/theme.ts for why, and `getBarColor` in lib/budget.ts for the
// single threshold rule this shares with every other bar in the app.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/primitives';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight } from '../../lib/haptics';
import { getBarColor, budgetStatus, type BudgetMap } from '../../lib/budget';
import type { CategoryTotal } from '../../lib/spending';

const PREVIEW_COUNT = 3;

export interface BudgetWidgetProps {
  /** Sorted by amount, largest first. */
  categories: CategoryTotal[];
  budgets: BudgetMap;
  /** Every ceiling summed. Null when the user has set none. */
  totalCeiling: number | null;
  totalSpent: number;
  /** "July" — the month these figures cover. */
  monthLabel: string;
  onOpenCategory: (id: CategoryTotal['id']) => void;
  onOpenAll: () => void;
  /** Shown in place of the list when nothing has been budgeted yet. */
  onStartBudget: () => void;
}

export default function BudgetWidget({
  categories, budgets, totalCeiling, totalSpent, monthLabel,
  onOpenCategory, onOpenAll, onStartBudget,
}: BudgetWidgetProps) {
  const { common, colors } = useTheme();
  const styles = useStyles();
  const anyBudget = totalCeiling !== null && totalCeiling > 0;
  const total = budgetStatus(totalSpent, totalCeiling);
  const preview = categories.slice(0, PREVIEW_COUNT);

  return (
    <Card>
      <TouchableOpacity
        style={styles.head}
        onPress={() => { hapticLight(); onOpenAll(); }}
        accessibilityRole="button"
        accessibilityLabel="Budget"
        accessibilityHint="Opens the full budget"
      >
        <Text style={common.eyebrow}>BUDGET</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {!anyBudget ? (
        // No ceilings set. An empty budget screen full of zeroes would be a
        // worse answer than one sentence and a way to start.
        <View style={styles.startBlock}>
          <Text style={styles.startBody}>
            You&apos;ve spent ${fmt(totalSpent)} in {monthLabel}. Set a limit on the
            categories that matter and this fills in with how you&apos;re tracking.
          </Text>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => { hapticLight(); onStartBudget(); }}
            accessibilityRole="button"
            accessibilityLabel="Start a budget"
          >
            <View style={styles.startBtnBody}>
              <Text style={styles.startBtnTitle}>Start a budget</Text>
              <Text style={styles.startBtnSub}>Control your spend</Text>
            </View>
            <View style={styles.startBtnGo}>
              <Text style={styles.startBtnGoText}>Begin</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.white} />
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <BudgetBar
            label="Total budget"
            spent={totalSpent}
            ceiling={totalCeiling}
            emphasis
          />

          <View style={styles.list}>
            {preview.map(c => {
              const ceiling = budgets[c.id]?.ceiling ?? null;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.row}
                  onPress={() => { hapticLight(); onOpenCategory(c.id); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `${c.label}, $${fmt(c.amount)} spent` +
                    (ceiling !== null
                      ? ` of a $${fmt(ceiling)} budget${c.amount > ceiling ? ', over budget' : ''}`
                      : ', no budget set')
                  }
                  accessibilityHint="Opens this category"
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={c.icon} size={17} color={colors.mint700} />
                  </View>
                  <View style={styles.rowBody}>
                    <BudgetBar label={c.label} spent={c.amount} ceiling={ceiling} />
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>

          {total.over && (
            <Text style={styles.overNote}>
              You&apos;re ${fmt(total.overBy)} past your {monthLabel} budget. That comes
              out of the surplus your plan is sized on.
            </Text>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * One labelled bar: name, spent-of-ceiling, and the fill.
 *
 * The word "over" sits beside the figures rather than under the bar, because it
 * is the thing that carries the state — the grey fill is a second cue for people
 * scanning, not the signal itself.
 */
function BudgetBar({ label, spent, ceiling, emphasis }: {
  label: string;
  spent: number;
  ceiling: number | null;
  emphasis?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const status = budgetStatus(spent, ceiling);
  // Passes the theme explicitly — without it this resolves against the light
  // tokens and an over-ceiling bar would draw in the light grey, which is nearly
  // invisible on a dark card.
  const fill = getBarColor(spent, ceiling, theme);

  return (
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={[styles.barLabel, emphasis && styles.barLabelEmphasis]} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.barFigures}>
          {status.over && <Text style={styles.overWord}>over</Text>}
          <Text style={[styles.barValue, emphasis && styles.barValueEmphasis]}>
            ${fmt(spent)}
            <Text style={styles.barOf}>
              {ceiling !== null ? ` of $${fmt(ceiling)}` : ' · no budget'}
            </Text>
          </Text>
        </View>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              // A hair of width on any real spend, so a small-but-real amount
              // reads as a bar rather than as nothing at all.
              width: `${status.pct > 0 ? Math.max(1.5, status.pct) : 0}%`,
              backgroundColor: fill,
            },
          ]}
        />
      </View>
    </View>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },

  startBlock: { gap: Spacing[4], paddingTop: Spacing[1] },
  startBody: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 64,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  startBtnBody: { flex: 1, gap: 2 },
  startBtnTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: t.colors.mint700,
  },
  startBtnSub: { fontSize: Typography.xs, color: t.colors.textSecondary },
  startBtnGo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.full,
    backgroundColor: t.colors.mint600,
  },
  startBtnGoText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: t.colors.white,
  },

  list: { marginTop: Spacing[4], gap: Spacing[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 60,
    paddingVertical: Spacing[2],
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: t.colors.mint50,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1 },

  barBlock: { gap: 6 },
  barHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  barLabel: { flexShrink: 1, fontSize: Typography.sm, color: t.colors.textSecondary },
  barLabelEmphasis: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  barFigures: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  overWord: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.semantic.overCeiling,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  barValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  barValueEmphasis: { fontSize: Typography.base, fontWeight: Typography.bold },
  barOf: { fontWeight: Typography.regular, color: t.colors.textMuted },

  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: t.semantic.ceilingTrack,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },

  overNote: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
}));
