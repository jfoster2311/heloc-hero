// components/UpcomingMoney.tsx — the next two weeks of money, and nothing else.
//
// Borrowed from the reference apps' upcoming-transactions calendar, aimed at
// the only question this product needs it to answer: is there room to move
// money this month, or is payday still a week out and the mortgage due first?
//
// ── What is real here, and what is inferred ────────────────────────────────
// Two very different kinds of row share this list, and they are labelled
// differently because conflating them would be the dishonest move:
//
//   · the mortgage payment — a date and an amount the servicer reported, or
//     that the user typed. Stated plainly.
//   · recurring income — a PATTERN EXTENDED. Someone's employer has paid them
//     every 14 days for six months, so a 15th day is likely. It is not
//     scheduled, nobody promised it, and it is always marked "expected".
//
// Nothing here is invented to fill the calendar. A user with no linked
// transactions and no servicer date sees an empty state, not a plausible week.
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../lib/theme';
import type { RecurringStream } from '../lib/cashflow';

const HORIZON_DAYS = 14;

export interface UpcomingItem {
  date: Date;
  label: string;
  /** Positive is money in. */
  amount: number;
  /** True when this is a pattern extended rather than a reported date. */
  expected: boolean;
  detail?: string;
}

/**
 * Merges the streams we can date into one ordered list inside the horizon.
 *
 * Recurring income is projected forward repeatedly, so a weekly wage shows both
 * of the next two paydays rather than only the first.
 */
export function buildUpcoming(
  streams: RecurringStream[],
  mortgage: { amount: number; dueDate: Date | null; reported: boolean },
  now = new Date(),
): UpcomingItem[] {
  const start = startOfDay(now);
  const end = addDays(start, HORIZON_DAYS);
  const items: UpcomingItem[] = [];

  for (const s of streams) {
    if (!s.nextExpected) continue;
    // Guard the loop on the cadence itself: a zero or negative cadence would
    // spin forever, and it costs nothing to refuse to trust one.
    if (s.cadenceDays < 1) continue;

    // A stream is only projected while it is plausibly still running. The
    // derivation window ends at the start of the current month, so lastSeen is
    // routinely a few weeks old and the threshold has to be generous — but
    // without one, someone who changed jobs in March still sees "payday
    // Thursday, expected" in July, which is the app inventing income for a
    // person who has none.
    const staleAfterDays = Math.max(60, s.cadenceDays * 3);
    if (daysBetween(new Date(`${s.lastSeen}T00:00:00`), start) > staleAfterDays) continue;

    let d = startOfDay(new Date(`${s.nextExpected}T00:00:00`));
    while (d < end) {
      if (d >= start) {
        items.push({
          date: d,
          label: s.name,
          amount: s.typicalAmount,
          expected: true,
          detail: `${cadenceLabel(s.cadenceDays)} · ${s.observations} deposits seen`,
        });
      }
      d = addDays(d, s.cadenceDays);
    }
  }

  if (mortgage.dueDate && mortgage.amount > 0) {
    const d = startOfDay(mortgage.dueDate);
    if (d >= start && d < end) {
      items.push({
        date: d,
        label: 'Mortgage payment',
        amount: -mortgage.amount,
        expected: !mortgage.reported,
        detail: mortgage.reported ? 'from your servicer' : 'the figure you entered',
      });
    }
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export default function UpcomingMoney({ items }: { items: UpcomingItem[] }) {
  const now = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i));
  const net = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <View style={styles.wrap}>
      {/* A week strip, marked where money lands. Seven days rather than
          fourteen so each cell stays a comfortable tap target on a small
          phone; the list beneath covers the full horizon. */}
      <View style={styles.strip}>
        {days.map((d, i) => {
          const onDay = items.filter(it => sameDay(it.date, d));
          const inflow = onDay.some(it => it.amount > 0);
          const outflow = onDay.some(it => it.amount < 0);
          return (
            <View key={i} style={[styles.cell, i === 0 && styles.cellToday]}>
              <Text style={[styles.dow, i === 0 && styles.dowToday]}>
                {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
              </Text>
              <Text style={[styles.dom, i === 0 && styles.domToday]}>{d.getDate()}</Text>
              <View style={styles.dots}>
                {inflow && <View style={[styles.dot, styles.dotIn]} />}
                {outflow && <View style={[styles.dot, styles.dotOut]} />}
              </View>
            </View>
          );
        })}
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>
          Nothing dated in the next {HORIZON_DAYS} days. Recurring income appears here once
          there are a few months of transactions to read a pattern from, and your mortgage
          payment once a servicer reports its due date.
        </Text>
      ) : (
        <>
          {items.slice(0, 5).map((it, i) => (
            <View key={i} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Ionicons
                  name={it.amount > 0 ? 'arrow-down' : 'arrow-up'}
                  size={13}
                  color={it.amount > 0 ? Colors.mint600 : Colors.gray500}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel} numberOfLines={1}>{it.label}</Text>
                <Text style={styles.rowDetail} numberOfLines={1}>
                  {formatWhen(it.date, now)}
                  {it.expected ? ' · expected' : ''}
                  {it.detail ? ` · ${it.detail}` : ''}
                </Text>
              </View>
              <Text style={[styles.rowAmount, it.amount < 0 && styles.rowAmountOut]}>
                {it.amount > 0 ? '+' : '−'}${fmt(Math.abs(it.amount))}
              </Text>
            </View>
          ))}

          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Net over {HORIZON_DAYS} days</Text>
            <Text style={[styles.netValue, net < 0 && styles.rowAmountOut]}>
              {net < 0 ? '−' : '+'}${fmt(Math.abs(net))}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function formatWhen(d: Date, now: Date): string {
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function cadenceLabel(days: number): string {
  if (days <= 8) return 'weekly';
  if (days <= 16) return 'every two weeks';
  if (days <= 18) return 'twice monthly';
  return 'monthly';
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const styles = StyleSheet.create({
  wrap: { gap: Spacing[2] },

  strip: { flexDirection: 'row', gap: 4, marginBottom: Spacing[2] },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderRadius: Radius.sm,
    gap: 2,
    minHeight: 56,
  },
  cellToday: { backgroundColor: Colors.mint50, borderWidth: 1, borderColor: Colors.mint200 },
  dow: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.semibold },
  dowToday: { color: Colors.mint700 },
  dom: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.semibold },
  domToday: { color: Colors.mint700 },
  dots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotIn: { backgroundColor: Colors.mint600 },
  dotOut: { backgroundColor: Colors.gray400 },

  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3] },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  rowIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.gray50,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  rowDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  rowAmount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.mint600 },
  // Money out is muted grey, never red. See the palette policy in lib/theme.
  rowAmountOut: { color: Colors.gray500 },

  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  netLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  netValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.mint600 },

  empty: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
});
