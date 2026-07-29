// components/sheets/MerchantDetailSheet.tsx — everything one payee has cost.
//
// Opened from Largest transactions and Most frequent. It is the only surface in
// the app that looks past a single period, and that is its whole reason for
// existing: the spending that quietly defeats this strategy is not the $400
// month, it is the $2.50 four times a week. That charge is invisible on every
// other screen — beneath notice in a category total, a rounding error on the
// ring — and it is $520 a year that could have gone onto principal.
//
// So the year totals get equal billing with the month. They are the figures
// that make a habit visible.
import { View, Text } from 'react-native';
import DetailSheet from '../ui/DetailSheet';
import TransactionRow from '../ui/TransactionRow';
import TrendBarChart from '../ui/TrendBarChart';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight } from '../../lib/haptics';
import type {
  MerchantDetail, CategorizedTxn, CategoryMeta, SpendCategory,
} from '../../lib/spending';
import type { TransactionMeta } from '../../hooks/useTransactionMeta';

export interface MerchantDetailSheetProps {
  /** Null closes the sheet. */
  merchant: MerchantDetail | null;
  metaFor: (transactionId: string) => TransactionMeta;
  categoryFor: (id: SpendCategory) => CategoryMeta;
  onClose: () => void;
  onOpenTransaction: (row: CategorizedTxn) => void;
}

export default function MerchantDetailSheet({
  merchant, metaFor, categoryFor, onClose, onOpenTransaction,
}: MerchantDetailSheetProps) {
  const { common } = useTheme();
  const styles = useStyles();
  if (!merchant) {
    return (
      <DetailSheet visible={false} title="Merchant detail" onClose={onClose}>
        <View />
      </DetailSheet>
    );
  }

  const total = merchant.rows.reduce((s, r) => s + r.txn.amount, 0);
  const thisYear = merchant.byYear[0];
  const lastYear = merchant.byYear[1];

  return (
    <DetailSheet visible title="Merchant detail" onClose={onClose}>
      {/* ── Identity ──────────────────────────────────────────────────────
          An initial rather than a logo. Fetching brand marks would mean a
          network call per row to a third party, which is a privacy cost —
          telling someone else's server what this user spends money on — for
          a decorative gain. */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {merchant.name.trim().charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.identityBody}>
          <Text style={styles.name} numberOfLines={2}>{merchant.name}</Text>
          <Text style={styles.sub}>
            {merchant.rows.length} charge{merchant.rows.length === 1 ? '' : 's'} · $
            {fmt(total)} in the last {merchant.history.length} months
          </Text>
        </View>
      </View>

      {/* ── The trend ─────────────────────────────────────────────────────
          'selection' mode: a merchant has no ceiling to pass or fail, so the
          only distinction worth drawing is which month you are looking at. */}
      {merchant.history.some(p => p.amount > 0) && (
        <View style={styles.chartBlock}>
          <Text style={common.eyebrow}>BY MONTH</Text>
          <TrendBarChart
            points={merchant.history}
            colorMode="selection"
            showValues
            accessibilityLabel={
              `${merchant.name} by month. ` +
              merchant.history.map(p => `${p.label}: $${fmt(p.amount)}`).join('. ')
            }
          />
        </View>
      )}

      {/* ── The figures that make a habit visible ─────────────────────── */}
      <View style={styles.grid}>
        <Stat
          label="This month"
          value={`${merchant.countThisMonth}×`}
          sub={merchant.countThisMonth === 0 ? 'nothing yet' : 'so far'}
        />
        <Stat label="Average charge" value={`$${fmtCents(merchant.averageAmount)}`} />
        {thisYear && (
          <Stat label={`${thisYear.year} total`} value={`$${fmt(thisYear.total)}`} />
        )}
        {lastYear && (
          <Stat label={`${lastYear.year} total`} value={`$${fmt(lastYear.total)}`} />
        )}
      </View>

      {/* The one sentence this sheet exists to make possible. Only drawn where
          the pattern is real — a rate extrapolated from two charges would be
          arithmetic dressed as insight. */}
      {merchant.rows.length >= 6 && (
        <Text style={styles.insight}>
          At this rate that is about ${fmt(annualRate(merchant))} a year. Every dollar
          of it is a dollar not going onto your principal.
        </Text>
      )}

      <View style={styles.listBlock}>
        <Text style={common.eyebrow}>EVERY CHARGE</Text>
        <View style={styles.list}>
          {merchant.rows.map(r => {
            const m = metaFor(r.txn.transaction_id);
            return (
              <TransactionRow
                key={r.txn.transaction_id}
                name={categoryFor(r.category).label}
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
      </View>
    </DetailSheet>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

/**
 * What this payee costs over a year, from the months actually observed.
 *
 * Extrapolated from months WITH activity rather than from the full window: a
 * merchant first seen three months into a six-month window would otherwise be
 * annualised at half its real rate, which understates exactly the habit this
 * sheet is trying to surface.
 */
function annualRate(m: MerchantDetail): number {
  const active = m.history.filter(p => p.amount > 0);
  if (active.length === 0) return 0;
  const perMonth = active.reduce((s, p) => s + p.amount, 0) / active.length;
  return perMonth * 12;
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtCents(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const useStyles = createThemedStyles(t => ({
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: t.colors.mint600,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: t.colors.onAccent,
  },
  identityBody: { flex: 1, gap: 2 },
  name: { fontSize: Typography.lg, fontWeight: Typography.bold, color: t.colors.textPrimary },
  sub: { fontSize: Typography.xs, color: t.colors.textMuted },

  chartBlock: { gap: Spacing[3] },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  stat: {
    // Two per row with the gap accounted for, so a 3rd and 4th stat wrap into
    // a tidy 2×2 rather than a ragged run.
    width: '48.5%',
    gap: 2,
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
  },
  statLabel: { fontSize: 11, color: t.colors.textMuted },
  statValue: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
  },
  statSub: { fontSize: 10, color: t.colors.textMuted },

  insight: {
    fontSize: Typography.sm,
    color: t.colors.mint700,
    lineHeight: 20,
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },

  listBlock: { gap: Spacing[2] },
  list: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    paddingHorizontal: Spacing[4],
  },
}));
