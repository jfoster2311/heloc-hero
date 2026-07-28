// lib/reports.ts — the trend layer: is this working, month over month?
//
// Everything else in the app answers a question about now. The breakdown says
// where this month went, the budget says whether it fit, the score says whether
// the user is ready. This is the only place that answers "is it getting better",
// which is the question someone three months into a strategy actually has.
//
// ── Whole months only ──────────────────────────────────────────────────────
// Every series here ends at the last COMPLETE month. The current one is always
// partial, and a trend chart whose final bar is a half-month reads as a
// collapse in spending — the most flattering possible misreading, on the screen
// meant to tell someone whether they are actually improving. The UI states the
// range so the omission is visible rather than silent.
import type { TransactionRow, TransactionClassification } from './cashflow';
import { defaultCategory, type SpendCategory, type CategoryMeta } from './spending';
import {
  isFavorable, percentChange, changeArrow, type ChangeSubject,
} from './budget';

export interface ReportMonth {
  /** YYYY-MM. */
  key: string;
  /** "Jul" */
  label: string;
  income: number;
  spend: number;
  /** Income − spend, before the mortgage payment. Signed. */
  net: number;
}

export interface ReportSeries {
  months: ReportMonth[];
  /** "Feb 1 – Jul 31" — the range actually summed. */
  rangeLabel: string;
  totalIncome: number;
  totalSpend: number;
  totalNet: number;
  avgNet: number;
  /** False when there are not enough whole months to call anything a trend. */
  usable: boolean;
}

/** Two months is a comparison; three is the shortest thing worth a chart. */
const MIN_MONTHS = 3;

/**
 * Income, spend and net for the last N complete months.
 *
 * Built from the same classification everything else uses, so the totals here
 * reconcile with the Cash flow tab rather than being a second opinion computed
 * from the same rows by different rules.
 */
export function buildReportSeries(args: {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  months: number;
  now?: Date;
}): ReportSeries {
  const { transactions, classification, months, now = new Date() } = args;

  // Ends at the last complete month. See the header note.
  const buckets: ReportMonth[] = [];
  for (let i = months; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: monthKey(d),
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      income: 0,
      spend: 0,
      net: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));

  for (const t of transactions) {
    if (t.pending || t.account_type !== 'savings') continue;
    if (classification.excludedIds.has(t.transaction_id)) continue;
    const i = index.get(t.date.slice(0, 7));
    if (i === undefined) continue;

    if (t.amount > 0) {
      buckets[i].spend += t.amount;
    } else if (classification.incomeIds.has(t.transaction_id)) {
      buckets[i].income += Math.abs(t.amount);
    }
    // An unclassified inflow is counted in neither, matching deriveCashflow.
    // Adding it to income here would make this screen disagree with the surplus.
  }

  for (const b of buckets) b.net = b.income - b.spend;

  // Months with nothing at all are almost always months before the bank's
  // history starts, not months where the user spent nothing. Leading empties
  // are dropped so the chart does not open with a flat run implying frugality.
  const firstReal = buckets.findIndex(b => b.income > 0 || b.spend > 0);
  const trimmed = firstReal === -1 ? [] : buckets.slice(firstReal);

  const totalIncome = trimmed.reduce((s, b) => s + b.income, 0);
  const totalSpend  = trimmed.reduce((s, b) => s + b.spend, 0);
  const totalNet    = totalIncome - totalSpend;

  return {
    months: trimmed,
    rangeLabel: trimmed.length > 0
      ? `${monthName(trimmed[0].key)} – ${monthName(trimmed[trimmed.length - 1].key)}`
      : '',
    totalIncome,
    totalSpend,
    totalNet,
    avgNet: trimmed.length > 0 ? totalNet / trimmed.length : 0,
    usable: trimmed.length >= MIN_MONTHS,
  };
}

// ─── Stacked category series ──────────────────────────────────────────────────

export interface CategoryMonthSeries {
  category: SpendCategory;
  label: string;
  icon: CategoryMeta['icon'];
  /** One figure per month, aligned to `ReportSeries.months`. */
  values: number[];
  total: number;
}

/**
 * Spend per category per month, for the stacked bars.
 *
 * Aligned by index to the months passed in rather than carrying its own dates,
 * so the stack and the axis beneath it cannot drift apart — the failure mode
 * where a chart's bars and its labels describe different months is invisible
 * until someone checks a figure against their statement.
 */
export function buildCategorySeries(args: {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  overrides: Record<string, SpendCategory>;
  months: ReportMonth[];
  metaFor: (id: SpendCategory) => CategoryMeta;
}): CategoryMonthSeries[] {
  const { transactions, classification, overrides, months, metaFor } = args;
  const index = new Map(months.map((m, i) => [m.key, i]));

  const byCategory = new Map<SpendCategory, number[]>();

  for (const t of transactions) {
    if (t.pending || t.account_type !== 'savings') continue;
    if (classification.excludedIds.has(t.transaction_id)) continue;
    if (t.amount <= 0) continue;
    const i = index.get(t.date.slice(0, 7));
    if (i === undefined) continue;

    const cat = overrides[t.transaction_id] ?? defaultCategory(t);
    if (!byCategory.has(cat)) byCategory.set(cat, new Array(months.length).fill(0));
    byCategory.get(cat)![i] += t.amount;
  }

  return Array.from(byCategory.entries())
    .map(([category, values]) => {
      const meta = metaFor(category);
      return {
        category,
        label: meta.label,
        icon: meta.icon,
        values,
        total: values.reduce((s, v) => s + v, 0),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ─── Change rows ──────────────────────────────────────────────────────────────

/**
 * One line of the details table: what it was, what it is, and whether that is
 * good news.
 *
 * `favorable` is the whole reason this type exists rather than the UI computing
 * a sign. See `isFavorable` in lib/budget.ts — the arrow follows the number and
 * the colour follows the subject, and on the rows that matter most here (income
 * falling, spending falling) those point opposite ways.
 */
export interface ChangeRow {
  label: string;
  subject: ChangeSubject;
  current: number;
  previous: number;
  /** Signed. */
  delta: number;
  /** Null when the previous figure was zero — "up ∞%" is not information. */
  percent: number | null;
  arrow: 'arrow-up' | 'arrow-down' | null;
  /** Null when the change is exactly zero, meaning: draw no pill. */
  favorable: boolean | null;
  /** Sub-rows, e.g. the categories under Spending. */
  children?: ChangeRow[];
}

function row(
  label: string,
  subject: ChangeSubject,
  current: number,
  previous: number,
  children?: ChangeRow[],
): ChangeRow {
  const delta = current - previous;
  return {
    label, subject, current, previous, delta,
    percent: percentChange(current, previous),
    arrow: changeArrow(delta),
    favorable: isFavorable(delta, subject),
    children,
  };
}

/**
 * The month a user tapped, against the one before it.
 *
 * Returns null with no previous month rather than comparing against zero: every
 * row would read as an infinite rise, which is both useless and alarming on a
 * screen about someone's finances.
 */
export function buildChangeRows(args: {
  months: ReportMonth[];
  categorySeries: CategoryMonthSeries[];
  /** Index into `months` of the month being examined. */
  selected: number;
}): ChangeRow[] | null {
  const { months, categorySeries, selected } = args;
  if (selected <= 0 || selected >= months.length) return null;

  const now = months[selected];
  const before = months[selected - 1];

  const categoryRows = categorySeries
    .map(s => row(s.label, s.category, s.values[selected] ?? 0, s.values[selected - 1] ?? 0))
    // A category absent from both months is not a change worth a line.
    .filter(r => r.current > 0 || r.previous > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return [
    row('Income', 'income', now.income, before.income),
    row('Spending', 'spending', now.spend, before.spend, categoryRows),
    row('Net', 'surplus', now.net, before.net),
  ];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
