// components/sheets/ReportDetailSheet.tsx — one month against the one before it.
//
// ── The pill is the whole point of this file ───────────────────────────────
// Every row shows an arrow and a colour, and they answer DIFFERENT questions.
// The arrow follows the number: up is up. The colour follows the subject: is
// this good for the user? On the rows that matter most those point opposite
// ways —
//
//   Income        ↓ 0.8%    bad
//   Groceries     ↓ 1.6%    good
//   Net           ↑ 12%     good
//   Dining        ↑ 96%     bad
//
// Two of those are falling and one of the two is good; two are rising and one
// of the two is good. No function of the sign alone separates them, which is
// why `isFavorable` is a lookup keyed by subject in lib/budget.ts and why this
// component never inspects a sign itself.
//
// In this palette "favourable" is mint and "unfavourable" is muted grey, never
// red — and the arrow is always drawn, so the direction survives with the colour
// removed entirely.
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DetailSheet from '../ui/DetailSheet';
import TrendBarChart from '../ui/TrendBarChart';
import { Typography, Spacing, Radius, Semantic } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { ChangeRow, ReportMonth } from '../../lib/reports';
import type { MonthPoint } from '../../lib/spending';

export interface ReportDetailSheetProps {
  /** Null closes the sheet. */
  month: ReportMonth | null;
  /** Null when there is no previous month to compare against. */
  rows: ChangeRow[] | null;
  /** The whole series, for the mini chart. */
  history: MonthPoint[];
  onClose: () => void;
}

export default function ReportDetailSheet({
  month, rows, history, onClose,
}: ReportDetailSheetProps) {
  const { common } = useTheme();
  const styles = useStyles();
  if (!month) {
    return (
      <DetailSheet visible={false} title="Details" onClose={onClose}>
        <View />
      </DetailSheet>
    );
  }

  return (
    <DetailSheet visible title={`${month.label} details`} onClose={onClose}>
      <View style={styles.head}>
        <Text style={common.eyebrow}>NET THAT MONTH</Text>
        <Text style={[styles.net, month.net < 0 && styles.netNegative]}>
          {month.net < 0 ? '−' : ''}${fmt(Math.abs(month.net))}
        </Text>
        <Text style={styles.headSub}>
          ${fmt(month.income)} in · ${fmt(month.spend)} out
        </Text>
      </View>

      {history.length > 0 && (
        <TrendBarChart
          points={history}
          colorMode="selection"
          selectedKey={month.key}
          accessibilityLabel={
            `Net by month, ${month.label} selected. ` +
            history.map(p => `${p.label}: $${fmt(p.amount)}`).join('. ')
          }
        />
      )}

      {rows === null ? (
        <Text style={styles.noCompare}>
          There is no month before this one to compare against yet.
        </Text>
      ) : (
        <>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.thLabel]}>Category</Text>
            <Text style={[styles.th, styles.thAmount]}>Amount</Text>
            <Text style={[styles.th, styles.thChange]}>Change</Text>
          </View>

          <View style={styles.table}>
            {rows.map(r => (
              <View key={r.label}>
                <Row row={r} />
                {r.children?.map(child => <Row key={child.label} row={child} nested />)}
              </View>
            ))}
          </View>

          <Text style={styles.footnote}>
            Green means the change is good for you, whichever way the arrow points —
            spending down is good, income down is not. Transfers between your own
            accounts and your mortgage payment are excluded throughout.
          </Text>
        </>
      )}
    </DetailSheet>
  );
}

function Row({ row, nested }: { row: ChangeRow; nested?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.tr, nested && styles.trNested]}>
      <Text
        style={[styles.tdLabel, nested && styles.tdLabelNested]}
        numberOfLines={1}
      >
        {row.label}
      </Text>
      <Text style={styles.tdAmount}>${fmt(row.current)}</Text>
      <View style={styles.tdChange}>
        <ChangePill row={row} />
      </View>
    </View>
  );
}

/**
 * The arrow and the verdict, side by side.
 *
 * `favorable === null` means the figure did not move, and nothing is drawn — a
 * neutral-coloured pill would still imply a judgement was made about a change
 * that did not happen. `percent === null` means the previous month was zero, so
 * the row shows "new" rather than an infinite rise.
 */
function ChangePill({ row }: { row: ChangeRow }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (row.favorable === null || row.arrow === null) {
    return <Text style={styles.flat}>—</Text>;
  }

  const good = row.favorable;
  return (
    <View
      style={[styles.pill, good ? styles.pillGood : styles.pillBad]}
      accessible
      accessibilityLabel={
        `${row.label} ${row.arrow === 'arrow-up' ? 'up' : 'down'} ` +
        `${row.percent === null ? 'from nothing' : `${Math.abs(row.percent).toFixed(0)} percent`}, ` +
        `${good ? 'good' : 'not good'} for you`
      }
    >
      <Ionicons
        name={row.arrow}
        size={11}
        color={good ? colors.mint700 : colors.gray500}
      />
      <Text style={[styles.pillText, good ? styles.pillTextGood : styles.pillTextBad]}>
        {row.percent === null
          ? 'new'
          : `${Math.abs(row.percent).toFixed(0)}%`}
      </Text>
    </View>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  head: { alignItems: 'center', gap: 2, paddingTop: Spacing[2] },
  net: {
    fontSize: Typography.displaySm,
    fontWeight: Typography.extrabold,
    color: t.colors.mint600,
    letterSpacing: -1,
  },
  netNegative: { color: t.colors.gray500 },
  headSub: { fontSize: Typography.xs, color: t.colors.textMuted },

  noCompare: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
  },
  th: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: 1,
  },
  thLabel: { flex: 1 },
  thAmount: { width: 82, textAlign: 'right' },
  thChange: { width: 74, textAlign: 'right' },

  table: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  trNested: { minHeight: 40, backgroundColor: t.colors.surfaceSunken },
  tdLabel: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  tdLabelNested: {
    fontWeight: Typography.regular,
    color: t.colors.textSecondary,
    paddingLeft: Spacing[3],
  },
  tdAmount: {
    width: 82,
    textAlign: 'right',
    fontSize: Typography.sm,
    color: t.colors.textPrimary,
  },
  tdChange: { width: 74, alignItems: 'flex-end' },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pillGood: { backgroundColor: t.colors.mint50 },
  pillBad:  { backgroundColor: t.colors.gray100 },
  pillText: { fontSize: 11, fontWeight: Typography.semibold },
  pillTextGood: { color: t.colors.mint700 },
  pillTextBad:  { color: Semantic.overCeiling },
  flat: { fontSize: 11, color: t.colors.textMuted },

  footnote: { fontSize: 11, color: t.colors.textMuted, lineHeight: 16 },
}));
