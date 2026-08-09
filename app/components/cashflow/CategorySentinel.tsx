// components/cashflow/CategorySentinel.tsx — where the velocity leaks out.
//
// The ring says how the period's spending divided up. The rows under it say
// whether any of it broke a ceiling the user set, and the banner at the bottom
// says how much of the picture cannot be trusted at all. Those three belong on
// one surface because they are one reading: an arc is only as meaningful as the
// share of the money that carries a real label.
//
// ── Two kinds of bar, and they are not interchangeable ─────────────────────
// A category with a ceiling gets a bar against THAT ceiling, plus the word
// ("over", "nearly there") — colour is never the signal here, per `Semantic` in
// lib/theme.ts. A category without one gets a bar of its size relative to the
// largest category, carrying no judgement: a category with no budget is not
// failing a test it was never given. The label under each bar says which of the
// two it is, because the same 60%-wide bar means very different things.
//
// ── Why the unjudged bar is NOT drawn in its arc colour ────────────────────
// It was, and it was measured out again. A bar fill has to be distinguishable
// from its track (WCAG 1.4.11, 3:1) and the ramp is ordered by SHARE, so the
// smallest categories get the palest steps: against `ceilingTrack` the four
// steps measure 12.13 / 5.40 / 2.71 / 1.51. The bottom two fail, and the very
// last one is invisible — so the rows least likely to be looked at closely were
// the ones whose bar could not be seen at all. `textMuted` (4.35) is used
// instead, and the tie back to the arc is carried by the swatch on the icon,
// which is a 10pt decorative dot rather than the graphic conveying the value.
//
// ── Why the list is here rather than beside the ring ───────────────────────
// The brief put the ranked list in a right-hand column next to the chart. At
// 375pt the ring's box is 256pt wide with its rim badges, which leaves ~45pt for
// a column that has to hold an icon, a name, an amount and a bar. Both halves
// become unreadable, so the same two elements are stacked instead — the ranking
// survives, the ring stays legible, and nothing about the reading changes.
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable } from '../ui/press';
import MachinedCard from '../ui/MachinedCard';
import DonutRing, { type RingSegment } from '../ui/DonutRing';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { budgetStatus, budgetLabel, getBarColor, type BudgetMap } from '../../lib/budget';
import { VELOCITY } from '../../lib/config';
import type { CategoryTotal, SpendCategory } from '../../lib/spending';
import type { UntaggedShare } from '../../lib/velocity';

interface Props {
  categories: CategoryTotal[];
  segments: RingSegment[];
  /** Arc colour per category id, so a bar below matches its arc above. */
  colorFor: Record<string, string>;
  budgets: BudgetMap;
  untagged: UntaggedShare;
  rangeLabel: string;
  inProgress: boolean;

  centerLabel: string;
  centerValue: string;
  centerSub: string;
  selectedKey: string | null;
  onSelectArc: (key: string | null) => void;

  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenCategory: (id: SpendCategory) => void;
  onOpenAll: () => void;
  /** Opens the list where untagged rows can be given a category. */
  onCategorize: () => void;
  /** Rendered instead of the ring when there is nothing to break down. */
  empty?: React.ReactNode;
}

export default function CategorySentinel({
  categories, segments, colorFor, budgets, untagged,
  rangeLabel, inProgress,
  centerLabel, centerValue, centerSub, selectedKey, onSelectArc,
  expanded, onToggleExpanded, onOpenCategory, onOpenAll, onCategorize,
  empty,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const { colors, categoryRamp } = theme;

  const shown = expanded ? categories : categories.slice(0, VELOCITY.topOffenders);
  const rest = categories.length - shown.length;
  // The biggest category sets the length of every share bar, so the rows read as
  // a ranking rather than as a set of unrelated percentages.
  const peak = categories.length > 0 ? categories[0].amount : 0;

  return (
    <MachinedCard>
      <Touchable
        style={styles.head}
        onPress={onOpenAll}
        accessibilityRole="button"
        accessibilityLabel="Breakdown"
        accessibilityHint="Opens the full breakdown by category and merchant"
      >
        <View style={styles.headBody}>
          <Text style={styles.eyebrow}>WHERE IT WENT</Text>
          <Text style={styles.range}>
            {rangeLabel}{inProgress ? ' · in progress' : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Touchable>

      {empty ?? (
        <>
          <View style={styles.ringWrap}>
            <DonutRing
              segments={segments}
              centerLabel={centerLabel}
              centerValue={centerValue}
              centerSub={centerSub}
              selectedKey={selectedKey}
              onSelect={onSelectArc}
            />
          </View>

          <View style={styles.rows}>
            {shown.map((c, i) => {
              const ceiling = budgets[c.id]?.ceiling ?? null;
              const status = budgetStatus(c.amount, ceiling);
              const word = budgetLabel(status);
              const hasCeiling = status.ceiling !== null;
              // Against the ceiling where there is one; against the largest
              // category where there is not. See the header note.
              const barPct = hasCeiling
                ? status.pct
                : peak > 0 ? (c.amount / peak) * 100 : 0;
              const barColor = hasCeiling
                ? getBarColor(c.amount, ceiling, theme)
                : colors.textMuted;

              return (
                <Touchable
                  key={c.id}
                  style={styles.row}
                  onPress={() => onOpenCategory(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `${i + 1}. ${c.label}, $${money(c.amount)}, ` +
                    `${c.pct.toFixed(0)} percent of spending` +
                    (hasCeiling
                      ? `, ${status.pct.toFixed(0)} percent of a $${money(status.ceiling!)} ceiling` +
                        (word ? `, ${word}` : '')
                      : '')
                  }
                  accessibilityHint="Shows the transactions in this category"
                >
                  <View style={styles.rowHead}>
                    <View style={styles.icon}>
                      <Ionicons name={c.icon} size={16} color={colors.accentInk} />
                      {/* Ties the row to its arc. A second cue, never the only
                          one — the icon and the name carry identity, so the
                          rows survive the colour being removed entirely. */}
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: colorFor[c.id] ?? categoryRamp.neutral },
                        ]}
                      />
                    </View>
                    <Text style={styles.name} numberOfLines={1}>{c.label}</Text>
                    <Text style={styles.amount}>${money(c.amount)}</Text>
                  </View>

                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${barPct > 0 ? Math.max(2, barPct) : 0}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>

                  {/* The colour is never allowed to be the only signal, so the
                      state is spelled out. This line is also what keeps the two
                      kinds of bar apart. */}
                  <Text style={styles.rowMeta}>
                    {hasCeiling
                      ? `$${money(c.amount)} of your $${money(status.ceiling!)} ceiling` +
                        (word ? ` · ${word}` : status.remaining !== null
                          ? ` · $${money(status.remaining)} left`
                          : '')
                      : `${c.pct.toFixed(0)}% of spend · ${c.count} transaction${c.count === 1 ? '' : 's'} · no ceiling set`}
                  </Text>
                </Touchable>
              );
            })}

            {(rest > 0 || expanded) && categories.length > VELOCITY.topOffenders && (
              <Touchable
                style={styles.more}
                onPress={onToggleExpanded}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={
                  expanded ? 'Show fewer categories' : `Show ${rest} more categories`
                }
              >
                <Text style={styles.moreText}>
                  {expanded ? 'Show fewer' : `Show ${rest} more`}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={colors.accentInk}
                />
              </Touchable>
            )}
          </View>
        </>
      )}

      {/* ── The black hole ──────────────────────────────────────────────────
          Stated as a share of the MONEY, not a count of rows. "18 transactions"
          sounds like housekeeping; "$1,240, a fifth of everything you spent"
          says why the chart above it cannot be acted on yet. */}
      {untagged.material && (
        <View style={styles.callout}>
          <Ionicons name="help-circle-outline" size={18} color={colors.textSecondary} />
          <View style={styles.calloutBody}>
            <Text style={styles.calloutText}>
              {untagged.pct.toFixed(0)}% of your spending — ${money(untagged.amount)} across{' '}
              {untagged.count} transaction{untagged.count === 1 ? '' : 's'} — came through with no
              label from your bank, so it is sitting in Other. The split above is only as good as
              that share is small.
            </Text>
            <Touchable
              style={styles.calloutBtn}
              onPress={onCategorize}
              accessibilityRole="button"
              accessibilityLabel={`Categorise ${untagged.count} unlabelled transactions`}
            >
              <Text style={styles.calloutBtnText}>Categorise them</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.onAccent} />
            </Touchable>
          </View>
        </View>
      )}
    </MachinedCard>
  );
}

function money(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: Spacing[2],
  },
  headBody: { flex: 1, gap: 2 },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    letterSpacing: 1.4,
    color: t.colors.textMuted,
  },
  range: { fontSize: Typography.xs, color: t.colors.textSecondary },

  ringWrap: { alignItems: 'center', marginTop: Spacing[2] },

  rows: { gap: Spacing[4], marginTop: Spacing[2] },
  row: { gap: 6, paddingVertical: Spacing[1], minHeight: 44 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: t.colors.machinedNear,
  },
  name: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  amount: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
    ...Typography.tabular,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: t.semantic.ceilingTrack,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
  rowMeta: { fontSize: 11, color: t.colors.textMuted },

  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: t.colors.machinedEdge,
  },
  moreText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },

  callout: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginTop: Spacing[4],
    paddingTop: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: t.colors.machinedEdge,
  },
  calloutBody: { flex: 1, gap: Spacing[3] },
  calloutText: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },
  calloutBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.full,
    backgroundColor: t.colors.mint600,
  },
  calloutBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    // `onAccent`, never white — see lib/theme.ts.
    color: t.colors.onAccent,
  },
}));
