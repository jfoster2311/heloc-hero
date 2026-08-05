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
import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';
import { hapticSelection, hapticLight } from '../lib/haptics';
import type { RecurringStream } from '../lib/cashflow';

const HORIZON_DAYS = 14;
/** The strip pages a week at a time; the horizon is two of them. */
const WEEK = 7;

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
  const { colors } = useTheme();
  const styles = useStyles();
  const now = startOfDay(new Date());
  // Which week of the horizon the strip is showing, and which day (if any) the
  // user has drilled into. Selection is an ISO key rather than a Date so that
  // re-rendering with a fresh `now` cannot quietly lose it.
  const [week, setWeek] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const weeks = Math.ceil(HORIZON_DAYS / WEEK);
  const days = Array.from({ length: WEEK }, (_, i) => addDays(now, week * WEEK + i));

  // One pass, so a fourteen-day horizon is not re-scanned once per cell.
  const byDay = useMemo(() => {
    const m = new Map<string, UpcomingItem[]>();
    for (const it of items) {
      const k = key(it.date);
      const list = m.get(k);
      if (list) list.push(it);
      else m.set(k, [it]);
    }
    return m;
  }, [items]);

  const net = items.reduce((sum, i) => sum + i.amount, 0);
  const shown = selected ? byDay.get(selected) ?? [] : items.slice(0, 5);
  const hiddenCount = selected ? 0 : items.length - shown.length;

  function pickDay(d: Date) {
    const k = key(d);
    hapticSelection();
    setSelected(prev => (prev === k ? null : k));
  }

  function page(delta: number) {
    hapticLight();
    setWeek(w => Math.min(weeks - 1, Math.max(0, w + delta)));
    // A selection on a week you can no longer see is a filter with no visible
    // cause — the list would stay narrowed with nothing on screen explaining it.
    setSelected(null);
  }

  return (
    <View style={styles.wrap}>
      {/* Which stretch of days the strip is currently showing. Stated rather
          than implied: without it, paging forward a week silently changes what
          the cells mean and the only clue is the day numbers. */}
      <View style={styles.stripHead}>
        <Text style={styles.stripRange}>{rangeLabel(days[0], days[days.length - 1])}</Text>
        <View style={styles.pager}>
          <PagerButton
            icon="chevron-back"
            label="Previous week"
            disabled={week === 0}
            onPress={() => page(-1)}
          />
          <PagerButton
            icon="chevron-forward"
            label="Next week"
            disabled={week >= weeks - 1}
            onPress={() => page(1)}
          />
        </View>
      </View>

      <View style={styles.strip}>
        {days.map((d, i) => {
          const k = key(d);
          const onDay = byDay.get(k) ?? [];
          const isToday = sameDay(d, now);
          const isSelected = selected === k;
          const dayNet = onDay.reduce((s, it) => s + it.amount, 0);
          // A day whose only entries are patterns extended forward is marked,
          // so a confident-looking figure on a calendar cannot pass for a
          // scheduled one. See the note at the top of this file.
          const allExpected = onDay.length > 0 && onDay.every(it => it.expected);

          return (
            <TouchableOpacity
              key={k}
              style={[
                styles.cell,
                isToday && styles.cellToday,
                isSelected && styles.cellSelected,
              ]}
              onPress={() => pickDay(d)}
              disabled={onDay.length === 0}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: onDay.length === 0 }}
              accessibilityLabel={dayLabel(d, onDay, dayNet, allExpected)}
              accessibilityHint={onDay.length > 0
                ? (isSelected ? 'Shows everything again' : 'Shows only this day')
                : undefined}
            >
              <Text style={[styles.dow, (isToday || isSelected) && styles.dowActive]}>
                {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
              </Text>
              <Text style={[styles.dom, (isToday || isSelected) && styles.domActive]}>
                {d.getDate()}
              </Text>

              {/* The amount is the point of the strip: "payday Thursday" is
                  useful, "+1.3k Thursday" is actionable. Dropped to a compact
                  form because a cell is a seventh of the screen — the exact
                  figure is one tap away in the list beneath. */}
              {onDay.length > 0 ? (
                <Text
                  style={[styles.cellAmount, dayNet <= 0 && styles.cellAmountOut]}
                  numberOfLines={1}
                >
                  {/* A day whose money in and money out cancel has still had
                      money move across it. "+0" would read as a quiet day, so
                      the sign is dropped and the figure stands as a net. */}
                  {dayNet === 0 ? '0' : `${dayNet < 0 ? '−' : '+'}${fmtCompact(dayNet)}`}
                </Text>
              ) : (
                <View style={styles.cellAmountSpacer} />
              )}

              {allExpected && <View style={styles.expectedTick} />}
            </TouchableOpacity>
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
          {selected && (
            <TouchableOpacity
              style={styles.filterNote}
              onPress={() => { hapticLight(); setSelected(null); }}
              // The only way out of a day filter, at 32pt of inline text. Slop
              // rather than height: growing the row would push the list down
              // every time a day is selected, so the control would move the
              // content it is filtering.
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear the day filter and show everything again"
            >
              <Ionicons name="funnel-outline" size={12} color={colors.mint700} />
              <Text style={styles.filterNoteText}>
                {formatWhen(fromKey(selected), now)} only · show all
              </Text>
            </TouchableOpacity>
          )}

          {shown.length === 0 ? (
            <Text style={styles.empty}>Nothing dated on this day.</Text>
          ) : shown.map((it, i) => (
            <View key={`${key(it.date)}-${it.label}-${i}`} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Ionicons
                  name={it.amount > 0 ? 'arrow-down' : 'arrow-up'}
                  size={13}
                  color={it.amount > 0 ? colors.mint600 : colors.gray500}
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

          {hiddenCount > 0 && (
            <Text style={styles.moreNote}>
              {hiddenCount} more in the next {HORIZON_DAYS} days. Tap a day above to see it.
            </Text>
          )}

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

function PagerButton({ icon, label, disabled, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[styles.pagerBtn, disabled && styles.pagerBtnOff]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons
        name={icon}
        size={15}
        color={disabled ? colors.gray300 : colors.textSecondary}
      />
    </TouchableOpacity>
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
/** Local-date key. Identity for a day, safe to hold in state across renders. */
function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function rangeLabel(a: Date, b: Date): string {
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  return a.getMonth() === b.getMonth()
    ? `${mon(a)} ${a.getDate()}–${b.getDate()}`
    : `${mon(a)} ${a.getDate()} – ${mon(b)} ${b.getDate()}`;
}

/**
 * What the cell says out loud.
 *
 * A mixed day is spelled out in both directions rather than as its net: the
 * cell has room for one number and shows the net, but "1,900 in and 1,900 out"
 * and "nothing happening" are not the same day, and the screen reader is where
 * that distinction can be afforded.
 */
function dayLabel(d: Date, items: UpcomingItem[], net: number, allExpected: boolean): string {
  const when = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (items.length === 0) return `${when}, nothing dated`;

  const inTotal  = items.reduce((s, it) => s + (it.amount > 0 ? it.amount : 0), 0);
  const outTotal = items.reduce((s, it) => s + (it.amount < 0 ? -it.amount : 0), 0);
  const money = inTotal > 0 && outTotal > 0
    ? `${fmt(inTotal)} dollars in and ${fmt(outTotal)} dollars out`
    : `${fmt(Math.abs(net))} dollars ${net < 0 ? 'out' : 'in'}`;

  return `${when}, ${items.length} item${items.length === 1 ? '' : 's'}, ` +
    `${money}${allExpected ? ', expected' : ''}`;
}

/**
 * Compact money for a cell a seventh of the screen wide.
 *
 * The currency symbol is dropped here and only here — every figure in the list
 * beneath keeps its "$". A calendar cell is unambiguously money in this card,
 * and the four points it buys are the difference between "+1.3k" fitting and
 * being truncated to nonsense.
 */
function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 10_000) return `${Math.round(a / 1000)}k`;
  if (a >= 1_000) return `${(a / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(a)}`;
}

function cadenceLabel(days: number): string {
  if (days <= 8) return 'weekly';
  if (days <= 16) return 'every two weeks';
  if (days <= 18) return 'twice monthly';
  return 'monthly';
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  wrap: { gap: Spacing[2] },

  stripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  stripRange: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
  },
  pager: { flexDirection: 'row', gap: Spacing[1] },
  pagerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnOff: { borderColor: t.colors.borderSubtle },

  strip: { flexDirection: 'row', gap: 4, marginBottom: Spacing[2] },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing[2],
    paddingHorizontal: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 2,
    minHeight: 64,
  },
  cellToday: { backgroundColor: t.colors.mint50, borderColor: t.colors.mint200 },
  // Selection has to outrank "today", since today is where selection starts.
  cellSelected: { backgroundColor: t.colors.mint50, borderColor: t.colors.mint600 },
  dow: { fontSize: 10, color: t.colors.textMuted, fontWeight: Typography.semibold },
  dowActive: { color: t.colors.mint700 },
  dom: { fontSize: Typography.sm, color: t.colors.textPrimary, fontWeight: Typography.semibold },
  domActive: { color: t.colors.mint700 },
  cellAmount: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: t.colors.accentInk,
  },
  cellAmountOut: { color: t.colors.gray500 },
  /** Holds the row height steady on days with nothing on them. */
  cellAmountSpacer: { height: 11 },
  expectedTick: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: t.colors.gray400,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3] },
  rowBorder: { borderTopWidth: 1, borderTopColor: t.colors.borderSubtle },
  rowIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: t.colors.gray50,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textPrimary },
  rowDetail: { fontSize: 11, color: t.colors.textMuted, marginTop: 1 },
  rowAmount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: t.colors.accentInk },
  // Money out is muted grey, never red. See the palette policy in lib/theme.
  rowAmountOut: { color: t.colors.gray500 },

  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.gray100,
  },
  netLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  netValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: t.colors.accentInk },

  empty: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },

  filterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
  },
  filterNoteText: {
    fontSize: 11,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },
  moreNote: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: Spacing[2],
  },
}));
