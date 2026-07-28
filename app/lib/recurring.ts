// lib/recurring.ts — the outflows that come back every month.
//
// lib/cashflow.ts already detects recurring INCOME, because that is what the
// surplus figure needs. This is the other half, and it exists for a different
// reason: a user deciding how much they can safely move onto their mortgage
// needs to know what is already committed between now and their next paycheck.
// A $4,000 dump the day before $1,200 of subscriptions and insurance clear is
// the mistake this is here to prevent.
//
// ── This is a pattern extended, never a schedule ───────────────────────────
// Nothing here is a commitment anyone made. Netflix has charged $15.49 on the
// 12th for six months, so a seventh is likely — the user may have cancelled it
// this morning. Every surface rendering these must say "expected", and none may
// present a projected date as a bill that is due.
//
// ── Why the bar is deliberately high ───────────────────────────────────────
// A list of "recurring" charges that includes a fortnightly coffee habit is a
// list nobody trusts, and an untrusted list is worse than no list, because the
// figure at the top of it is what someone sizes a draw against. So a stream
// needs a stable payee, a stable amount, and a stable gap — three agreements,
// not one.
import type { TransactionRow, TransactionClassification } from './cashflow';

export interface RecurringExpense {
  /** Normalised payee, used to group and as a stable key. */
  key: string;
  /** As it appears on the statement. */
  name: string;
  /** Median amount, positive (money out). */
  typicalAmount: number;
  /** Median gap between charges, in days. */
  cadenceDays: number;
  lastSeen: string;
  /** lastSeen + cadence. Null when the cadence is too erratic to project. */
  nextExpected: string | null;
  observations: number;
  /** True when the user marked this recurring themselves, rather than us. */
  userConfirmed: boolean;
  /** Every transaction id in the stream. */
  transactionIds: string[];
}

/** Below this many sightings it is a coincidence, not a pattern. */
const MIN_OBSERVATIONS = 3;
/** Amounts must agree within this to count as the same charge. */
const AMOUNT_TOLERANCE = 0.10;
/** Weekly through quarterly. Outside that it is not a subscription. */
const MIN_CADENCE = 6;
const MAX_CADENCE = 95;

export interface DetectRecurringOptions {
  transactions: TransactionRow[];
  classification: TransactionClassification;
  /** Ids the user marked recurring by hand. Always included, however irregular. */
  confirmedIds: Set<string>;
  now?: Date;
}

/**
 * Repeating outflows, largest annual cost first.
 *
 * Sorted by what each stream costs over a YEAR rather than per charge, because
 * that is the figure that changes behaviour: a $60 quarterly charge and a $20
 * monthly one look ordered one way per charge and the other way per year, and
 * the second ordering is the one a person can act on.
 */
export function detectRecurringExpenses(
  opts: DetectRecurringOptions,
): RecurringExpense[] {
  const { transactions, classification, confirmedIds, now = new Date() } = opts;

  // Same gate as every other reader of these rows: posted, depository, and
  // nothing the classification already excluded — a transfer that repeats
  // monthly is the user moving their own money, not a bill.
  const outflows = transactions.filter(t =>
    !t.pending &&
    t.account_type === 'savings' &&
    t.amount > 0 &&
    !classification.excludedIds.has(t.transaction_id),
  );

  const groups = new Map<string, TransactionRow[]>();
  for (const t of outflows) {
    const k = normalise(t.merchant_name ?? t.name ?? '');
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  const found: RecurringExpense[] = [];

  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const userConfirmed = sorted.some(t => confirmedIds.has(t.transaction_id));

    // The user's own answer overrides every heuristic below. Someone who marks
    // an irregular charge as recurring knows something the data does not.
    if (!userConfirmed && sorted.length < MIN_OBSERVATIONS) continue;

    const typical = median(sorted.map(t => t.amount));
    if (typical <= 0) continue;

    // Agreement 1: the amount is stable. A payee whose charges swing wildly is
    // a shop you visit, not a subscription — the grocery store would otherwise
    // top every list of "recurring" charges by a wide margin.
    const consistent = sorted.filter(
      t => Math.abs(t.amount - typical) / typical <= AMOUNT_TOLERANCE,
    );
    if (!userConfirmed && consistent.length < MIN_OBSERVATIONS) continue;

    // Agreement 2: the gap is stable, and in a plausible band.
    const series = consistent.length >= MIN_OBSERVATIONS ? consistent : sorted;
    const gaps: number[] = [];
    for (let i = 1; i < series.length; i++) {
      gaps.push(daysBetween(series[i - 1].date, series[i].date));
    }
    const cadenceDays = gaps.length > 0 ? Math.round(median(gaps)) : 0;

    const plausible = cadenceDays >= MIN_CADENCE && cadenceDays <= MAX_CADENCE;
    if (!userConfirmed && !plausible) continue;

    // A cadence that swings by more than half its own length is not a cadence.
    // Such a stream is still listed (it is real spending that repeats), but it
    // gets no projected date rather than a confident-looking guess.
    const spread = gaps.length > 0 ? Math.max(...gaps) - Math.min(...gaps) : Infinity;
    const projectable =
      plausible && spread <= Math.max(5, cadenceDays * 0.5);

    const last = series[series.length - 1];

    // A stream whose next date is already well past is probably cancelled.
    // Reported without a date rather than dropped: the user is better served by
    // "we last saw this in March" than by its silent disappearance.
    const next = projectable ? addDays(last.date, cadenceDays) : null;
    const stale = next !== null && daysBetween(next, iso(now)) > cadenceDays;

    found.push({
      key,
      name: last.merchant_name ?? last.name ?? 'Recurring charge',
      typicalAmount: typical,
      cadenceDays,
      lastSeen: last.date,
      nextExpected: stale ? null : next,
      observations: series.length,
      userConfirmed,
      transactionIds: series.map(t => t.transaction_id),
    });
  }

  return found.sort((a, b) => annualCost(b) - annualCost(a));
}

/** What a stream costs over a year, at its observed cadence. */
export function annualCost(e: RecurringExpense): number {
  if (e.cadenceDays <= 0) return e.typicalAmount * 12;
  return e.typicalAmount * (365 / e.cadenceDays);
}

/**
 * What is expected to clear between now and a horizon.
 *
 * The figure a "can I afford this dump" decision actually needs. Streams with
 * no projectable date are excluded from the total and reported separately —
 * counting a charge we cannot date would put a number on screen that no
 * arithmetic on the rows below it reproduces.
 */
export interface CommittedAhead {
  /** Total expected to clear inside the horizon. */
  total: number;
  /** The streams making it up, soonest first. */
  items: { expense: RecurringExpense; date: string }[];
  /** Streams that repeat but could not be dated. */
  undatedCount: number;
  undatedTotal: number;
}

export function committedAhead(
  expenses: RecurringExpense[],
  horizonDays: number,
  now: Date = new Date(),
): CommittedAhead {
  const today = iso(now);
  const limit = addDays(today, horizonDays);

  const items: { expense: RecurringExpense; date: string }[] = [];
  let total = 0;
  let undatedCount = 0;
  let undatedTotal = 0;

  for (const e of expenses) {
    if (e.nextExpected === null) {
      undatedCount++;
      undatedTotal += e.typicalAmount;
      continue;
    }
    // Projected forward repeatedly, so a weekly charge inside a 30-day horizon
    // contributes four times rather than once.
    let cursor = e.nextExpected;
    let guard = 0;
    while (cursor <= limit && guard < 60) {
      if (cursor >= today) {
        items.push({ expense: e, date: cursor });
        total += e.typicalAmount;
      }
      if (e.cadenceDays < 1) break;
      cursor = addDays(cursor, e.cadenceDays);
      guard++;
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return { total, items, undatedCount, undatedTotal };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Digits stripped: statements append store and reference numbers. */
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}

/** Local-time day arithmetic, so no timezone can shift a date. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
