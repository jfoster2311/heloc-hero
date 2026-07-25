// lib/cashflow.ts — what the user actually earns and spends, from their transactions.
//
// This module exists to answer one question: is the surplus figure the app is
// running on anywhere near reality?
//
// Category breakdown lives in lib/spending.ts, NOT here. The split is not
// tidiness: this file decides what counts toward the surplus every projection
// rests on, and that decision must not start bending to make a budgeting screen
// read better. What the two share is exported below as `classifyTransactions`,
// so the Cash flow tab and the surplus figure can never disagree about which
// rows are transfers — a category list whose total contradicts the hero above it
// would discredit both.
//
// ── The failure mode this is built around ──────────────────────────────────
// Internal transfers. A user moving $4,000 from checking to their HELOC — the
// exact action the app tells them to take — looks identical to a $4,000
// expense. Count it and the app sees an expense spike, concludes the user has
// no surplus, and stops recommending the strategy it just recommended. Worse,
// the mortgage payment is already modelled separately, so counting it here
// double-subtracts it.
//
// So exclusion is deliberately aggressive, and the count of what was excluded
// is reported back to the UI. A derived figure the user cannot audit is worse
// than the one they typed, because it arrives with more authority.
//
// ── Direction of error ─────────────────────────────────────────────────────
// Where a judgement call exists, this errs toward LOWER income and HIGHER
// expenses — i.e. toward a smaller surplus. A surplus that is too small makes
// the app recommend a smaller move than it could have. A surplus that is too
// large makes it recommend a draw the user cannot replenish, secured against
// their home. Those are not symmetric mistakes.

export interface TransactionRow {
  transaction_id: string;
  account_id: string;
  account_type: string;
  date: string;                     // YYYY-MM-DD
  /** Plaid convention: POSITIVE is money out of the account. */
  amount: number;
  name: string | null;
  merchant_name: string | null;
  category_primary: string | null;
  category_detailed: string | null;
  pending: boolean;
}

export interface MonthlyFlow {
  /** YYYY-MM */
  key: string;
  label: string;
  income: number;
  expenses: number;
  surplus: number;
}

/**
 * An inflow that behaves like a wage, with enough history to say when the next
 * one is due.
 *
 * This is the ONLY forward-looking thing this module produces, and it is a
 * pattern extended, not a prediction of intent — the user's employer may stop
 * paying them tomorrow. Everything rendered from it must be labelled expected,
 * never scheduled.
 */
export interface RecurringStream {
  /** Payer as it appears on the statement. */
  name: string;
  /** Median amount, positive. */
  typicalAmount: number;
  /** Median gap between deposits, in days. */
  cadenceDays: number;
  /** Most recent occurrence. */
  lastSeen: string;
  /** lastSeen + cadence. Null when the cadence is too erratic to project. */
  nextExpected: string | null;
  /** How many deposits the estimate rests on. Fewer than 4 is thin. */
  observations: number;
}

export interface DerivedCashflow {
  /** Null until there is enough history to say anything. */
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  monthlySurplus: number | null;
  /** Median month, so the user can see how lumpy the mean is. */
  medianExpenses: number | null;
  months: MonthlyFlow[];
  /** Whole calendar months of history actually observed. */
  coverageMonths: number;
  /** Transfers and mortgage payments held out of the totals. */
  excludedCount: number;
  excludedTotal: number;
  /**
   * Inflows that were not recognisable as income — a refund, a gift, a
   * transfer from an account we cannot see. Reported rather than counted,
   * because counting them inflates surplus.
   */
  unclassifiedInflow: number;
  /** Wage-like inflows with a projectable next date. Empty when unknowable. */
  recurringIncome: RecurringStream[];
  /** False when coverage is too thin to offer the figure at all. */
  usable: boolean;
  /**
   * False when we found spending but almost no identifiable income.
   *
   * This is the "paid into an account we cannot see" case, and it is common:
   * salary lands in a checking account the user never linked, or the
   * institution's categorisation is poor. Derived income is then near zero and
   * comparing it to what the user entered would suggest their income collapsed.
   * When this is false the UI must offer the expense figure alone.
   */
  incomeConfident: boolean;
}

/** Below this, a trailing average is noise dressed as a measurement. */
export const MIN_COVERAGE_MONTHS = 3;

/**
 * Categories that are movements of the user's own money, not consumption.
 *
 * TRANSFER_IN / TRANSFER_OUT covers the obvious case. LOAN_PAYMENTS is NOT
 * excluded wholesale — a car payment is a real expense that belongs in the
 * surplus calculation. Only the mortgage payment comes out, because
 * `computeProjection` already subtracts it separately.
 */
const TRANSFER_PRIMARY = new Set(['TRANSFER_IN', 'TRANSFER_OUT']);
const EXCLUDED_DETAILED = new Set([
  'LOAN_PAYMENTS_MORTGAGE_PAYMENT',
  // A credit-card payment is a transfer, but if the card itself is not linked
  // it is the only trace of that spending. HELOC Hero only links mortgage,
  // HELOC and savings, so the card is never linked and the payment is kept as
  // the proxy. Revisit if card linking is ever added, or spending will vanish.
]);

/** Transfers pair up: same amount, opposite direction, within a few days. */
const PAIR_WINDOW_DAYS = 4;
const PAIR_TOLERANCE = 0.005;   // half a cent, for float noise

export interface DeriveOptions {
  /** How many whole months back to average. */
  windowMonths: number;
  now?: Date;
}

export function deriveCashflow(
  transactions: TransactionRow[],
  opts: DeriveOptions,
): DerivedCashflow {
  const now = opts.now ?? new Date();

  // The current month is always partial and always looks cheap. Averaging it in
  // drags expenses down, which is the dangerous direction.
  const endExclusive = startOfMonth(now);
  const start = addMonths(endExclusive, -opts.windowMonths);

  // Only depository accounts describe living costs. Transactions on the
  // mortgage or HELOC item are payments and draws, which the strategy models
  // directly — reading them as spending would count the same dollars twice.
  const inWindow = transactions.filter(t =>
    !t.pending &&
    t.account_type === 'savings' &&
    withinRange(t.date, start, endExclusive),
  );

  const transferIds = findTransfers(inWindow);
  const recurring = findRecurringInflows(inWindow, transferIds);
  const recurringIncome = buildRecurringStreams(inWindow, recurring);

  const buckets = new Map<string, MonthlyFlow>();
  let excludedCount = 0;
  let excludedTotal = 0;
  let unclassifiedInflow = 0;

  for (const t of inWindow) {
    const key = t.date.slice(0, 7);
    if (!buckets.has(key)) {
      buckets.set(key, { key, label: monthLabel(key), income: 0, expenses: 0, surplus: 0 });
    }
    const bucket = buckets.get(key)!;

    const isTransfer =
      transferIds.has(t.transaction_id) ||
      (t.category_primary !== null && TRANSFER_PRIMARY.has(t.category_primary)) ||
      (t.category_detailed !== null && EXCLUDED_DETAILED.has(t.category_detailed));

    if (isTransfer) {
      excludedCount++;
      excludedTotal += Math.abs(t.amount);
      continue;
    }

    if (t.amount > 0) {
      // Money out. Everything that is not a transfer is a cost of living.
      bucket.expenses += t.amount;
    } else {
      // Money in. Counted as income when Plaid says so, or when it recurs like
      // a wage does. Categorisation alone is not enough: self-employment and
      // smaller institutions routinely arrive uncategorised, and dropping those
      // would report an income of zero for someone who is plainly being paid.
      if (t.category_primary === 'INCOME' || recurring.has(t.transaction_id)) {
        bucket.income += Math.abs(t.amount);
      } else {
        unclassifiedInflow += Math.abs(t.amount);
      }
    }
  }

  const allMonths = Array.from(buckets.values())
    .map(m => ({ ...m, surplus: m.income - m.expenses }))
    .sort((a, b) => a.key.localeCompare(b.key));

  // The oldest month is almost always cut off by where the bank's history
  // begins rather than by how the user lived, so it under-reports both sides.
  // Averaging it in understates expenses — which overstates surplus, which
  // oversizes every recommendation. The newest partial month is already handled
  // by ending the window at the start of the current month.
  const months = dropTruncatedOldestMonth(allMonths, inWindow);

  const coverageMonths = months.length;
  const usable = coverageMonths >= MIN_COVERAGE_MONTHS;

  if (!usable) {
    return {
      monthlyIncome: null, monthlyExpenses: null, monthlySurplus: null,
      medianExpenses: null, months, coverageMonths,
      excludedCount, excludedTotal, unclassifiedInflow,
      recurringIncome,
      usable: false, incomeConfident: false,
    };
  }

  // The MEAN, not the median, is the honest average for expenses: the roof
  // repair and the annual insurance premium are exactly the costs people forget
  // when asked to estimate, and trimming them re-creates the bug this is here
  // to fix. The median is reported alongside so the spread is visible.
  const monthlyIncome   = mean(months.map(m => m.income));
  const monthlyExpenses = mean(months.map(m => m.expenses));

  // Income that lands somewhere we cannot see is the normal case for anyone
  // whose salary goes to an unlinked checking account. Saying so beats
  // reporting that they earn nothing.
  const monthsWithIncome = months.filter(m => m.income > 0).length;
  const incomeConfident =
    monthlyIncome > 0 &&
    monthsWithIncome >= Math.ceil(months.length / 2) &&
    monthlyIncome >= monthlyExpenses * 0.5;

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlySurplus: monthlyIncome - monthlyExpenses,
    recurringIncome,
    medianExpenses: median(months.map(m => m.expenses)),
    months,
    coverageMonths,
    excludedCount,
    excludedTotal,
    unclassifiedInflow,
    usable: true,
    incomeConfident,
  };
}

/**
 * Which rows are transfers, and which inflows are income — the two judgements
 * that decide what "spending" even means here.
 *
 * Exported so lib/spending.ts can categorise the exact same set of rows this
 * module counts. If the breakdown applied its own rules, a user could add up
 * every category on the Cash flow tab and land somewhere other than the expense
 * figure the payoff date is computed from, with nothing on screen to explain the
 * gap. Same input, same exclusions, one answer.
 *
 * Note this is deliberately NOT windowed: the caller slices by period after
 * classifying, because transfer pairing needs to see the neighbouring days to
 * match a draw against its deposit.
 */
export interface TransactionClassification {
  /** Movements of the user's own money, plus the separately-modelled mortgage. */
  excludedIds: Set<string>;
  /** Inflows that behave like income. Everything else in is left uncounted. */
  incomeIds: Set<string>;
}

export function classifyTransactions(
  transactions: TransactionRow[],
): TransactionClassification {
  // Same gate as deriveCashflow: only depository rows describe living costs.
  // Mortgage and HELOC activity is the strategy's own machinery, not spending.
  const usable = transactions.filter(t => !t.pending && t.account_type === 'savings');

  const transferIds = findTransfers(usable);
  const recurring   = findRecurringInflows(usable, transferIds);

  const excludedIds = new Set<string>();
  const incomeIds   = new Set<string>();

  for (const t of usable) {
    const isTransfer =
      transferIds.has(t.transaction_id) ||
      (t.category_primary !== null && TRANSFER_PRIMARY.has(t.category_primary)) ||
      (t.category_detailed !== null && EXCLUDED_DETAILED.has(t.category_detailed));

    if (isTransfer) {
      excludedIds.add(t.transaction_id);
      continue;
    }
    // An inflow that is neither labelled income nor recurring stays out of both
    // sets: counting it would inflate income, and calling it spending is absurd.
    if (t.amount < 0 && (t.category_primary === 'INCOME' || recurring.has(t.transaction_id))) {
      incomeIds.add(t.transaction_id);
    }
  }

  return { excludedIds, incomeIds };
}

/**
 * Drops the oldest bucket when it is a boundary artefact rather than a real month.
 *
 * Two signals, either of which is enough: the earliest transaction lands well
 * into the month (so the days before it are missing, not empty), or the month
 * holds far fewer transactions than a typical one.
 *
 * This is allowed to push coverage below the usable floor, and that is the
 * point. "Not enough history yet" is a true statement a user can act on; an
 * average built on a month that never really happened is a wrong number
 * presented as a measurement.
 */
function dropTruncatedOldestMonth(
  months: MonthlyFlow[],
  txns: TransactionRow[],
): MonthlyFlow[] {
  if (months.length < 2) return months;

  const oldest = months[0];
  const inOldest = txns.filter(t => t.date.slice(0, 7) === oldest.key);
  if (inOldest.length === 0) return months.slice(1);

  const earliestDay = Math.min(...inOldest.map(t => Number(t.date.slice(8, 10))));
  const typicalCount = median(
    months.slice(1).map(m => txns.filter(t => t.date.slice(0, 7) === m.key).length),
  );

  const startsLate = earliestDay > 3;
  const tooSparse  = typicalCount > 0 && inOldest.length < typicalCount * 0.6;

  return startsLate || tooSparse ? months.slice(1) : months;
}

/**
 * Inflows that behave like a wage: a similar amount arriving in most months.
 *
 * Deliberately loose on amount (within 15%) because hourly pay, commission and
 * variable deductions all move the figure a little. Deliberately strict on
 * frequency — appearing in at least half the observed months — because that is
 * what separates a salary from a one-off refund.
 */
/**
 * Turns the recurring-inflow set into dated streams with a next-expected date.
 *
 * Cadence is the MEDIAN gap, not the mean: one missed or early deposit would
 * drag a mean far enough to put the next payday on the wrong week. A stream
 * whose gaps are wildly inconsistent gets a null nextExpected rather than a
 * confident-looking guess — better to show nothing than a date someone might
 * plan a mortgage payment around.
 */
function buildRecurringStreams(
  txns: TransactionRow[],
  recurringIds: Set<string>,
): RecurringStream[] {
  const groups = new Map<string, TransactionRow[]>();
  for (const t of txns) {
    if (!recurringIds.has(t.transaction_id)) continue;
    const key = (t.merchant_name ?? t.name ?? '').toLowerCase().replace(/\d+/g, '').trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const streams: RecurringStream[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }
    const cadenceDays = Math.round(median(gaps));

    // Anything outside roughly weekly-to-monthly is not a wage pattern, and a
    // cadence that swings by more than half its own length is not a pattern.
    const spread = Math.max(...gaps) - Math.min(...gaps);
    const projectable =
      cadenceDays >= 5 && cadenceDays <= 40 && spread <= Math.max(4, cadenceDays * 0.5);

    const last = sorted[sorted.length - 1];
    streams.push({
      name: last.merchant_name ?? last.name ?? 'Recurring deposit',
      typicalAmount: median(sorted.map(t => Math.abs(t.amount))),
      cadenceDays,
      lastSeen: last.date,
      nextExpected: projectable ? addDays(last.date, cadenceDays) : null,
      observations: sorted.length,
    });
  }

  return streams.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/** Local-time day arithmetic, matching `iso` so no timezone can shift a date. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

function findRecurringInflows(txns: TransactionRow[], transferIds: Set<string>): Set<string> {
  const inflows = txns.filter(t => t.amount < 0 && !transferIds.has(t.transaction_id));
  const monthsObserved = new Set(txns.map(t => t.date.slice(0, 7))).size;
  if (monthsObserved < MIN_COVERAGE_MONTHS) return new Set();

  // Group by payer, falling back to the raw description.
  const groups = new Map<string, TransactionRow[]>();
  for (const t of inflows) {
    const key = (t.merchant_name ?? t.name ?? '').toLowerCase().replace(/\d+/g, '').trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const recurring = new Set<string>();
  for (const group of groups.values()) {
    const distinctMonths = new Set(group.map(t => t.date.slice(0, 7))).size;
    if (distinctMonths < Math.ceil(monthsObserved / 2)) continue;

    const typical = median(group.map(t => Math.abs(t.amount)));
    if (typical <= 0) continue;
    for (const t of group) {
      if (Math.abs(Math.abs(t.amount) - typical) / typical <= 0.15) {
        recurring.add(t.transaction_id);
      }
    }
  }
  return recurring;
}

/**
 * Finds transfers Plaid did not label as such, by pairing.
 *
 * A transfer between two accounts the user has linked appears twice: once
 * leaving, once arriving, same magnitude, a day or two apart. Plaid's category
 * catches most but not all of these, and the ones it misses are typically the
 * large ones — a $4,000 HELOC draw is exactly the transaction whose
 * misclassification does the most damage.
 *
 * A pair is consumed once matched, so three $500 movements in a month cannot
 * cancel out a single unrelated $500 purchase more than once.
 */
function findTransfers(txns: TransactionRow[]): Set<string> {
  const matched = new Set<string>();
  const outflows = txns.filter(t => t.amount > 0);
  const inflows  = txns.filter(t => t.amount < 0);

  for (const out of outflows) {
    const partner = inflows.find(inf =>
      !matched.has(inf.transaction_id) &&
      inf.account_id !== out.account_id &&
      Math.abs(Math.abs(inf.amount) - out.amount) <= PAIR_TOLERANCE &&
      Math.abs(daysBetween(out.date, inf.date)) <= PAIR_WINDOW_DAYS,
    );
    if (partner) {
      matched.add(out.transaction_id);
      matched.add(partner.transaction_id);
    }
  }
  return matched;
}

/**
 * How far the derived figures sit from what the user told us.
 *
 * Only the expense gap gets a prompt, and only when derived expenses are
 * HIGHER. Understated expenses are what produce an overstated surplus, which
 * is what produces a draw the user cannot replenish.
 */
export interface CashflowGap {
  expenseGap: number;          // derived − entered, positive when spending more
  expenseGapPct: number;
  surplusGap: number;
  /** True when the difference is large enough to be worth interrupting for. */
  material: boolean;
  /** True when the gap runs in the direction that oversizes recommendations. */
  risky: boolean;
}

export function compareToEntered(
  derived: DerivedCashflow,
  enteredIncome: number,
  enteredExpenses: number,
  materialPct: number,
): CashflowGap | null {
  if (!derived.usable || derived.monthlyExpenses === null || derived.monthlyIncome === null) {
    return null;
  }
  const expenseGap = derived.monthlyExpenses - enteredExpenses;
  const expenseGapPct = enteredExpenses > 0 ? expenseGap / enteredExpenses : 1;
  const surplusGap =
    (derived.monthlyIncome - derived.monthlyExpenses) - (enteredIncome - enteredExpenses);

  return {
    expenseGap,
    expenseGapPct,
    surplusGap,
    material: Math.abs(expenseGapPct) >= materialPct && Math.abs(expenseGap) >= 100,
    risky: expenseGap > 0,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
/** Date-only comparison, kept as strings so no timezone can shift a month. */
function withinRange(date: string, startInclusive: Date, endExclusive: Date): boolean {
  return date >= iso(startInclusive) && date < iso(endExclusive);
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}
function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
