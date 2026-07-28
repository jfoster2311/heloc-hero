// lib/spending.ts — where the money actually went, by period and by category.
//
// This is the budgeting half of the Cash flow tab, and it is deliberately
// subordinate to the strategy: it explains the surplus figure the HELOC plan
// runs on rather than competing with it. Every exclusion it applies comes from
// lib/cashflow.ts (`classifyTransactions`), so the categories on screen always
// add up to the spending the payoff projection was computed from.
//
// ── What this will not do ──────────────────────────────────────────────────
// It does not invent a figure when there is nothing to measure. With no linked
// transactions the period totals fall back to the user's own entered monthly
// figures, scaled — and the UI is required to say which of the two it is
// showing. A category breakdown cannot be derived from a single typed expense
// total, so when the basis is estimated there are simply no categories, and the
// screen says so instead of drawing a plausible-looking split.
import type { TransactionRow, TransactionClassification } from './cashflow';

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

/**
 * Eight buckets, and no more.
 *
 * A taxonomy the user has to scroll is one they will not maintain, and the
 * purpose here is not accounting — it is answering "what is eating the surplus"
 * accurately enough to act on. Anything Plaid cannot place confidently lands in
 * `other`, which the user can retag; a wrong-but-specific guess is worse than an
 * honest "Other", because it looks authoritative.
 */
export type SpendCategory =
  | 'housing' | 'auto' | 'groceries' | 'dining'
  | 'shopping' | 'bills' | 'health' | 'other';

export interface CategoryMeta {
  id: SpendCategory;
  label: string;
  icon: 'home-outline' | 'car-outline' | 'basket-outline' | 'restaurant-outline'
      | 'bag-handle-outline' | 'receipt-outline' | 'fitness-outline'
      | 'ellipsis-horizontal-circle-outline';
}

export const SPEND_CATEGORIES: CategoryMeta[] = [
  { id: 'housing',   label: 'Housing',           icon: 'home-outline' },
  { id: 'auto',      label: 'Auto & Transport',  icon: 'car-outline' },
  { id: 'groceries', label: 'Groceries',         icon: 'basket-outline' },
  { id: 'dining',    label: 'Dining',            icon: 'restaurant-outline' },
  { id: 'shopping',  label: 'Shopping',          icon: 'bag-handle-outline' },
  { id: 'bills',     label: 'Bills & Utilities', icon: 'receipt-outline' },
  { id: 'health',    label: 'Health',            icon: 'fitness-outline' },
  { id: 'other',     label: 'Other',             icon: 'ellipsis-horizontal-circle-outline' },
];

const META = new Map<SpendCategory, CategoryMeta>(SPEND_CATEGORIES.map(c => [c.id, c]));

export function categoryMeta(id: SpendCategory): CategoryMeta {
  return META.get(id) ?? SPEND_CATEGORIES[SPEND_CATEGORIES.length - 1];
}

/**
 * Plaid's detailed Personal Finance Category → our bucket.
 *
 * Detailed is checked before primary because the primary alone loses the
 * distinctions that matter most to someone looking for slack in their budget:
 * FOOD_AND_DRINK covers both the weekly grocery shop and every coffee, and
 * those are not the same decision.
 */
const BY_DETAILED: Record<string, SpendCategory> = {
  // Housing — rent, and work done on the home. The mortgage payment never
  // reaches here: classifyTransactions excludes it, because the strategy
  // models it directly and counting it twice would understate the surplus.
  RENT_AND_UTILITIES_RENT: 'housing',

  // Groceries. Superstores and warehouse clubs are mostly food shops for most
  // households; a user who disagrees can retag, which is what the table is for.
  FOOD_AND_DRINK_GROCERIES:            'groceries',
  GENERAL_MERCHANDISE_SUPERSTORES:     'groceries',
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: 'groceries',

  // Insurance reads as a bill, not a "general service".
  GENERAL_SERVICES_INSURANCE: 'bills',

  // Automotive servicing belongs with the car, not with services in general.
  GENERAL_SERVICES_AUTOMOTIVE: 'auto',

  // Gyms are a health commitment people evaluate as one.
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'health',
};

const BY_PRIMARY: Record<string, SpendCategory> = {
  FOOD_AND_DRINK:      'dining',      // whatever detailed did not claim for groceries
  GENERAL_MERCHANDISE: 'shopping',
  TRANSPORTATION:      'auto',
  RENT_AND_UTILITIES:  'bills',       // telephone, gas, electricity, internet
  MEDICAL:             'health',
  HOME_IMPROVEMENT:    'housing',
  PERSONAL_CARE:       'health',
  TRAVEL:              'other',
  ENTERTAINMENT:       'other',
  GENERAL_SERVICES:    'other',
  GOVERNMENT_AND_NON_PROFIT: 'other',
  BANK_FEES:           'other',
  // Car and student loans are real costs of living and belong in the totals.
  // Only the mortgage is held out, and that happens before this map is reached.
  LOAN_PAYMENTS:       'other',
};

/** Plaid's guess, before any user override. */
export function defaultCategory(t: TransactionRow): SpendCategory {
  if (t.category_detailed && BY_DETAILED[t.category_detailed]) {
    return BY_DETAILED[t.category_detailed];
  }
  if (t.category_primary && BY_PRIMARY[t.category_primary]) {
    return BY_PRIMARY[t.category_primary];
  }
  return 'other';
}

/** True when nothing but the fallback placed this row — worth offering a tag. */
export function isUncategorized(t: TransactionRow): boolean {
  const detailed = t.category_detailed ? BY_DETAILED[t.category_detailed] : undefined;
  const primary  = t.category_primary  ? BY_PRIMARY[t.category_primary]   : undefined;
  return detailed === undefined && primary === undefined;
}

// ─── Periods ──────────────────────────────────────────────────────────────────

export type PeriodId = 'week' | 'month' | 'quarter' | 'year';

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'week',    label: 'Week' },
  { id: 'month',   label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year',    label: 'Year' },
];

export interface PeriodRange {
  id: PeriodId;
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  endExclusive: Date;
  /** "Jul 1 – 25" — the dates actually summed, so a part-period is visible. */
  rangeLabel: string;
  /** True while the period is still running, which always under-reports spend. */
  inProgress: boolean;
  /** Length in months, for scaling the entered monthly figures. */
  months: number;
}

/**
 * Calendar periods, not rolling windows.
 *
 * "This month" is the question people actually ask, and a rolling 30 days
 * silently mixes two months of a bill cycle. The cost is that early in a period
 * the totals are small — which is why `inProgress` exists and the UI states the
 * date range rather than implying a full period has been measured.
 */
export function periodRange(id: PeriodId, now: Date = new Date()): PeriodRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let endExclusive: Date;
  let months: number;

  switch (id) {
    case 'week': {
      // Week starts Sunday, matching US bank statements and the calendar app.
      start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
      endExclusive = new Date(start);
      endExclusive.setDate(endExclusive.getDate() + 7);
      months = 7 / 30.44;
      break;
    }
    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      endExclusive = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      months = 1;
      break;
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3) * 3;
      start = new Date(today.getFullYear(), q, 1);
      endExclusive = new Date(today.getFullYear(), q + 3, 1);
      months = 3;
      break;
    }
    case 'year':
      start = new Date(today.getFullYear(), 0, 1);
      endExclusive = new Date(today.getFullYear() + 1, 0, 1);
      months = 12;
      break;
  }

  const inProgress = endExclusive > today;
  // A finished period is named; a running one is dated to the day, so nobody
  // reads a part-month total as a whole month's spending.
  const lastCounted = new Date(Math.min(endExclusive.getTime() - 86_400_000, today.getTime()));

  return {
    id, start, endExclusive, months, inProgress,
    rangeLabel: formatRange(start, lastCounted),
  };
}

function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const m = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (sameMonth) return `${m(start)} ${start.getDate()}–${end.getDate()}`;
  return `${m(start)} ${start.getDate()} – ${m(end)} ${end.getDate()}`;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface CategoryTotal {
  id: SpendCategory;
  label: string;
  icon: CategoryMeta['icon'];
  amount: number;
  /** Share of total spend in the period, 0–100. */
  pct: number;
  count: number;
}

export interface CategorizedTxn {
  txn: TransactionRow;
  category: SpendCategory;
  /** True when the user placed it here, rather than Plaid. */
  overridden: boolean;
}

export interface PeriodSummary {
  /**
   * 'live'      — summed from the user's own transactions.
   * 'estimated' — scaled from the monthly figures they entered.
   * The UI must label these differently. They are not the same claim.
   */
  basis: 'live' | 'estimated';
  income: number;
  spend: number;
  /** Income − spend. Before the mortgage payment, which is modelled separately. */
  net: number;
  categories: CategoryTotal[];
  /**
   * Money OUT, categorised. This is what the ring and the category sheets read.
   *
   * Inflows are deliberately not in here. A category sheet filters this array by
   * category, and an inflow has no meaningful spending category — a paycheck
   * landing in "Other" would sit in the breakdown as if it were an expense.
   */
  rows: CategorizedTxn[];
  /**
   * Money IN — income and credits both.
   *
   * Kept separate for the reason above, but kept at all because an activity
   * list that showed only outflows would be missing the paycheck, and a user
   * scanning for a transaction they remember has no idea the list is filtered.
   * The `category` on these rows is a placeholder and must not be displayed.
   */
  inflows: CategorizedTxn[];
  /** Rows Plaid could not place, sitting in Other until the user tags them. */
  untaggedCount: number;
}

export function summarizePeriod(args: {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  overrides: Record<string, SpendCategory>;
  range: PeriodRange;
  /** The user's own figures, used only when there is nothing to sum. */
  entered: { monthlyIncome: number; monthlyExpenses: number };
}): PeriodSummary {
  const { transactions, classification, overrides, range, entered } = args;

  const inWindow = transactions.filter(t =>
    !t.pending &&
    t.account_type === 'savings' &&
    !classification.excludedIds.has(t.transaction_id) &&
    t.date >= iso(range.start) && t.date < iso(range.endExclusive),
  );

  if (inWindow.length === 0) {
    // Nothing measured. Offer the user's own figures, scaled to the period, and
    // let the caller say so — never a zero that reads as "you spent nothing".
    return {
      basis: 'estimated',
      income: entered.monthlyIncome * range.months,
      spend:  entered.monthlyExpenses * range.months,
      net:    (entered.monthlyIncome - entered.monthlyExpenses) * range.months,
      categories: [],
      rows: [],
      inflows: [],
      untaggedCount: 0,
    };
  }

  let income = 0;
  let spend  = 0;
  let untaggedCount = 0;
  const totals = new Map<SpendCategory, { amount: number; count: number }>();
  const rows: CategorizedTxn[] = [];
  const inflows: CategorizedTxn[] = [];

  for (const t of inWindow) {
    if (t.amount < 0) {
      // Plaid's sign convention: negative is money in.
      if (classification.incomeIds.has(t.transaction_id)) income += Math.abs(t.amount);
      // Listed whether or not it counted as income. An inflow this module could
      // not classify is still a row the user saw on their statement, and
      // omitting it from the activity list would make the list look wrong to
      // the one person able to check it.
      inflows.push({ txn: t, category: 'other', overridden: false });
      continue;
    }
    spend += t.amount;

    const override = overrides[t.transaction_id];
    const category = override ?? defaultCategory(t);
    if (!override && isUncategorized(t)) untaggedCount++;

    rows.push({ txn: t, category, overridden: override !== undefined });
    const bucket = totals.get(category) ?? { amount: 0, count: 0 };
    bucket.amount += t.amount;
    bucket.count  += 1;
    totals.set(category, bucket);
  }

  const categories: CategoryTotal[] = SPEND_CATEGORIES
    .map(meta => {
      const b = totals.get(meta.id);
      return {
        id: meta.id,
        label: meta.label,
        icon: meta.icon,
        amount: b?.amount ?? 0,
        count:  b?.count ?? 0,
        pct: spend > 0 ? ((b?.amount ?? 0) / spend) * 100 : 0,
      };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    basis: 'live',
    income,
    spend,
    net: income - spend,
    categories,
    rows,
    inflows,
    untaggedCount,
  };
}

/** Local-date ISO, matching the string dates stored on the rows. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Spending pace ────────────────────────────────────────────────────────────

/**
 * The same period, one step back — the only fair thing to compare a running
 * period against.
 *
 * Calendar-aligned like `periodRange`, so "last month" is last month and not
 * the previous 30 days. `inProgress` is always false: a period that has ended
 * cannot still be running, which is what makes it a stable baseline.
 */
export function previousRange(range: PeriodRange): PeriodRange {
  const s = range.start;
  let start: Date;
  let endExclusive: Date;

  switch (range.id) {
    case 'week':
      start = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7);
      endExclusive = new Date(s);
      break;
    case 'month':
      start = new Date(s.getFullYear(), s.getMonth() - 1, 1);
      endExclusive = new Date(s.getFullYear(), s.getMonth(), 1);
      break;
    case 'quarter':
      start = new Date(s.getFullYear(), s.getMonth() - 3, 1);
      endExclusive = new Date(s.getFullYear(), s.getMonth(), 1);
      break;
    case 'year':
      start = new Date(s.getFullYear() - 1, 0, 1);
      endExclusive = new Date(s.getFullYear(), 0, 1);
      break;
  }

  const lastCounted = new Date(endExclusive.getTime() - 86_400_000);
  return {
    id: range.id,
    start,
    endExclusive,
    months: range.months,
    inProgress: false,
    rangeLabel: formatRange(start, lastCounted),
  };
}

export interface SpendSeries {
  /** Cumulative spend at the end of each day. Index 0 is the period's day 1. */
  values: number[];
  /** Days in the whole period. */
  days: number;
  /**
   * Days with data behind them. Equals `days` for a finished period, and stops
   * at today for a running one — so a line for a part-period can be drawn
   * short rather than running flat to the end of the month, which would read
   * as "spending stopped" instead of "the month is not over".
   */
  elapsed: number;
  /** Cumulative spend at `elapsed`. */
  total: number;
}

/**
 * Spend accumulated day by day across a period.
 *
 * Deliberately built from the same filters as `summarizePeriod` — not pending,
 * savings only, nothing `classifyTransactions` excluded, money out only. If the
 * two ever diverged, the curve and the total printed beside it would disagree
 * on screen and neither would be trustworthy.
 *
 * Day indices come from formatted local date strings rather than millisecond
 * arithmetic, so a DST boundary inside the period cannot shift a transaction
 * into the wrong bucket.
 */
export function cumulativeSpend(args: {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  range: PeriodRange;
  now?: Date;
}): SpendSeries {
  const { transactions, classification, range, now = new Date() } = args;

  const dayIndex = new Map<string, number>();
  const cursor = new Date(range.start);
  let days = 0;
  while (cursor < range.endExclusive) {
    dayIndex.set(iso(cursor), days);
    cursor.setDate(cursor.getDate() + 1);
    days++;
  }
  if (days === 0) return { values: [], days: 0, elapsed: 0, total: 0 };

  const daily = new Array<number>(days).fill(0);
  for (const t of transactions) {
    if (t.pending || t.account_type !== 'savings') continue;
    if (classification.excludedIds.has(t.transaction_id)) continue;
    // Plaid's sign convention: positive is money out. Income is not spend.
    if (t.amount <= 0) continue;
    const i = dayIndex.get(t.date);
    if (i !== undefined) daily[i] += t.amount;
  }

  const values: number[] = [];
  let running = 0;
  for (const d of daily) {
    running += d;
    values.push(running);
  }

  const today = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const todayIdx = dayIndex.get(today);
  const elapsed = range.inProgress && todayIdx !== undefined ? todayIdx + 1 : days;

  return { values, days, elapsed, total: values[elapsed - 1] ?? 0 };
}

// ─── Day-by-day ───────────────────────────────────────────────────────────────

/**
 * One cell of the calendar heat grid.
 *
 * `spend` and `credit` are separate rather than netted. A day with a $200
 * purchase and a $200 refund is not the same day as one where nothing happened,
 * and netting them to zero would paint it as if it were.
 */
export interface DayCell {
  /** YYYY-MM-DD. */
  date: string;
  /** Day of month, 1-based. */
  day: number;
  /** Money out, positive. */
  spend: number;
  /** Money in that is not income — a refund or a credit. Positive. */
  credit: number;
  /** Transactions behind this cell, for the day-detail sheet. */
  rows: CategorizedTxn[];
  /**
   * True for days that have not happened yet.
   *
   * Rendered as an inert placeholder rather than a $0 cell, because those are
   * different claims: one says nothing was spent, the other says the day has not
   * arrived. A month of "$0" cells stretching to the 31st reads as a month of
   * perfect restraint rather than a month that is half over.
   */
  future: boolean;
  /** Grid padding before the 1st, so the month starts on the right weekday. */
  weekday: number;
}

/**
 * Every day of a period, with what landed on it.
 *
 * Built from the same filters as `summarizePeriod` and `cumulativeSpend` — not
 * pending, savings only, nothing the classification excluded. The heat grid and
 * the total printed above it are read together, so they must be summed from the
 * same rows or the card contradicts itself.
 */
export function dailyBreakdown(args: {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  overrides: Record<string, SpendCategory>;
  range: PeriodRange;
  now?: Date;
}): DayCell[] {
  const { transactions, classification, overrides, range, now = new Date() } = args;
  const today = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  const cells = new Map<string, DayCell>();
  const cursor = new Date(range.start);
  while (cursor < range.endExclusive) {
    const key = iso(cursor);
    cells.set(key, {
      date: key,
      day: cursor.getDate(),
      spend: 0,
      credit: 0,
      rows: [],
      future: key > today,
      weekday: cursor.getDay(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const t of transactions) {
    if (t.pending || t.account_type !== 'savings') continue;
    if (classification.excludedIds.has(t.transaction_id)) continue;
    const cell = cells.get(t.date);
    if (!cell) continue;

    if (t.amount > 0) {
      cell.spend += t.amount;
      const override = overrides[t.transaction_id];
      cell.rows.push({
        txn: t,
        category: override ?? defaultCategory(t),
        overridden: override !== undefined,
      });
    } else {
      // Income is not a refund. Only inflows the classification did NOT call
      // income land here, which is exactly the refund/credit case — counting a
      // paycheck as a credit would put a "+$2,450" on payday and make the
      // heat grid look like the best spending day of the month.
      if (!classification.incomeIds.has(t.transaction_id)) {
        cell.credit += Math.abs(t.amount);
        const override = overrides[t.transaction_id];
        cell.rows.push({
          txn: t,
          category: override ?? defaultCategory(t),
          overridden: override !== undefined,
        });
      }
    }
  }

  return Array.from(cells.values());
}

// ─── Trailing history ─────────────────────────────────────────────────────────

/** One month of one category's spending, for the mini trend charts. */
export interface MonthPoint {
  /** YYYY-MM. */
  key: string;
  /** "Jul" — short, because these sit under 40px-wide bars. */
  label: string;
  amount: number;
  /** True for the month currently being viewed. Drives the selection state. */
  current: boolean;
}

/**
 * The last N whole months of one category, plus the month in view.
 *
 * The current month is included and marked rather than held out, because the
 * question the chart answers is "is this month unusual", and you cannot see that
 * without the month itself on the axis. It IS partial, and the caller is
 * expected to say so — the chart cannot, and a short final bar that goes
 * unexplained reads as an improvement rather than as a month still running.
 *
 * Passing `category: null` gives total spend per month, which is what the
 * whole-budget and merchant charts want.
 */
export function categoryHistory(args: {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  overrides: Record<string, SpendCategory>;
  category: SpendCategory | null;
  /** How many months to show, including the current one. */
  months: number;
  now?: Date;
}): MonthPoint[] {
  const { transactions, classification, overrides, category, months, now = new Date() } = args;

  const points: MonthPoint[] = [];
  const currentKey = monthKey(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    points.push({
      key,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      amount: 0,
      current: key === currentKey,
    });
  }
  const index = new Map(points.map((p, i) => [p.key, i]));

  for (const t of transactions) {
    if (t.pending || t.account_type !== 'savings') continue;
    if (classification.excludedIds.has(t.transaction_id)) continue;
    if (t.amount <= 0) continue;                     // spend only
    const i = index.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    if (category !== null) {
      const resolved = overrides[t.transaction_id] ?? defaultCategory(t);
      if (resolved !== category) continue;
    }
    points[i].amount += t.amount;
  }

  return points;
}

/**
 * The trailing average behind a "last 12 months avg." stat.
 *
 * Whole months only, and the current one excluded — it is always partial, and
 * averaging it in drags the figure down, which is the direction that makes a
 * suggested ceiling too tight. Returns null rather than 0 when there is no
 * history: an average of nothing is not zero dollars a month.
 */
export function trailingAverage(points: MonthPoint[]): number | null {
  const whole = points.filter(p => !p.current);
  if (whole.length === 0) return null;
  return whole.reduce((sum, p) => sum + p.amount, 0) / whole.length;
}

// ─── Merchants ────────────────────────────────────────────────────────────────

/** A payee, rolled up across the period. */
export interface MerchantTotal {
  /** Normalised key used for grouping. */
  key: string;
  /** As it appears on the statement. */
  name: string;
  amount: number;
  count: number;
}

/**
 * Who the money went to, most-spent first.
 *
 * Grouped on a normalised name because statements append store numbers, dates
 * and reference codes — "SQ *BLUE BOTTLE 4471" and "SQ *BLUE BOTTLE 8892" are
 * one coffee habit, and leaving them separate is what makes a frequency list
 * useless. Digits are stripped for the key only; the label keeps whichever form
 * the bank sent, so nothing on screen is a name the user has never seen.
 */
export function merchantTotals(rows: CategorizedTxn[]): MerchantTotal[] {
  const groups = new Map<string, MerchantTotal>();
  for (const r of rows) {
    const raw = r.txn.merchant_name ?? r.txn.name ?? '';
    const key = raw.toLowerCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.amount += r.txn.amount;
      existing.count  += 1;
    } else {
      groups.set(key, { key, name: raw, amount: r.txn.amount, count: 1 });
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
