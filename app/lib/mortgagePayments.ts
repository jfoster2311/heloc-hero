// lib/mortgagePayments.ts — finding the mortgage payment in a bank feed.
//
// The payment is the single largest committed outflow most users have, and the
// app already models it directly: `computeProjection` subtracts it, and
// `classifyTransactions` holds it out of spending so it is not counted twice.
// Both of those depend on knowing WHICH transactions it is, and on the amount
// being right.
//
// ── Why this cannot be automatic ───────────────────────────────────────────
// Plaid labels some mortgage payments `LOAN_PAYMENTS_MORTGAGE_PAYMENT` and
// misses plenty of others — a payment made by bill-pay, by transfer to a
// servicer the institution does not recognise, or bundled with escrow arrives
// as an ordinary debit. Guessing wrong is expensive in both directions:
//
//   · A real payment left in spending is counted twice (once here, once by the
//     projection), which understates surplus and shrinks every recommendation.
//   · An ordinary expense wrongly excluded overstates surplus, which oversizes
//     a draw taken against the user's house.
//
// The second is the dangerous one, which is why nothing in this file excludes
// anything on its own. It produces CANDIDATES, ranked, with the evidence for
// each; the user confirms. Confirmation is stored on transaction_meta and is
// what `classifyTransactions` actually reads.
import type { TransactionRow } from './cashflow';

/** Plaid's own label, when the institution supplies it. */
const PFC_MORTGAGE = 'LOAN_PAYMENTS_MORTGAGE_PAYMENT';

/** Words that appear in the description of a payment to a servicer. */
const NAME_HINTS = [
  'mortgage', 'mtg', 'home loan', 'homeloan', 'loan pmt', 'loan payment',
  'rocket mortgage', 'quicken loans', 'wells fargo home', 'chase home',
  'freedom mortgage', 'mr cooper', 'nationstar', 'loandepot', 'penny mac',
  'pennymac', 'caliber home', 'newrez', 'shellpoint', 'servicing',
  'escrow',
];

/** How far from the expected payment an amount can sit and still be a match. */
const AMOUNT_TOLERANCE = 0.12;

/** Roughly monthly. Payments land on a date, not a fixed interval. */
const MIN_GAP_DAYS = 24;
const MAX_GAP_DAYS = 38;

export interface PaymentCandidate {
  /** Normalised payee, used to group occurrences. */
  key: string;
  /** As it appears on the statement. */
  name: string;
  /** Median of the occurrences — the figure to offer as the payment. */
  typicalAmount: number;
  /** How many times it was seen. */
  occurrences: number;
  /** Most recent date, YYYY-MM-DD. */
  lastSeen: string;
  /** Every transaction id in this group, for the confirm write. */
  transactionIds: string[];
  /**
   * 0–1. Not a probability — a rank, so the likeliest group sorts first and
   * the UI can pre-select only when the evidence is strong.
   */
  confidence: number;
  /** Plain-English evidence, shown next to the row. The user is the check. */
  reasons: string[];
  /** Already confirmed by the user. */
  confirmed: boolean;
}

export interface DetectOptions {
  transactions: TransactionRow[];
  /** The payment on file, when there is one. Sharpens the amount match. */
  expectedPayment: number | null;
  /** Transaction ids the user has already confirmed. */
  confirmedIds: Set<string>;
}

/**
 * Groups of outflows that look like a mortgage payment, likeliest first.
 *
 * Grouped by normalised payee rather than returned as loose rows: the user is
 * being asked "is this your mortgage", which is a question about a payee, not
 * about twelve individual debits. Confirming the group confirms every
 * occurrence, which is also what makes the exclusion consistent month to month.
 */
export function detectMortgagePayments(opts: DetectOptions): PaymentCandidate[] {
  const { transactions, expectedPayment, confirmedIds } = opts;

  // Money out, on a depository account, not pending. Same gate as everything
  // else that reads these rows — see lib/cashflow.ts.
  const outflows = transactions.filter(t =>
    !t.pending && t.account_type === 'savings' && t.amount > 0,
  );

  const groups = new Map<string, TransactionRow[]>();
  for (const t of outflows) {
    const key = normalise(t.merchant_name ?? t.name ?? '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const candidates: PaymentCandidate[] = [];

  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map(t => t.amount);
    const typical = median(amounts);
    const label = sorted[sorted.length - 1].merchant_name ?? sorted[sorted.length - 1].name ?? '';

    const reasons: string[] = [];
    let score = 0;

    // 1. Plaid said so. The strongest single signal available, and still not
    //    enough on its own — institutions mislabel, and a user paying rent
    //    through a servicer-like payee would be excluded silently.
    const labelled = sorted.some(t => t.category_detailed === PFC_MORTGAGE);
    if (labelled) {
      score += 0.5;
      reasons.push('Your bank labels this a mortgage payment');
    }

    // 2. The description reads like a servicer.
    const hint = NAME_HINTS.find(h => key.includes(h));
    if (hint) {
      score += 0.2;
      reasons.push('The description looks like a mortgage or servicer');
    }

    // 3. It matches the payment already on file. Only meaningful when there IS
    //    one — otherwise every large recurring debit would score here.
    if (expectedPayment !== null && expectedPayment > 0) {
      const off = Math.abs(typical - expectedPayment) / expectedPayment;
      if (off <= AMOUNT_TOLERANCE) {
        score += 0.25;
        reasons.push(`Close to the $${round(expectedPayment)} payment on file`);
      }
    }

    // 4. It recurs roughly monthly. A mortgage is the most reliably monthly
    //    thing in a person's life, so an erratic gap argues against.
    if (sorted.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
      const cadence = median(gaps);
      if (cadence >= MIN_GAP_DAYS && cadence <= MAX_GAP_DAYS) {
        score += 0.2;
        reasons.push(`Paid ${sorted.length} times, about once a month`);
      }
    }

    // 5. It is large. A mortgage payment is not $40. This is a weak signal on
    //    its own and is weighted as one — it exists to break ties, not to
    //    nominate a candidate.
    if (typical >= 500) score += 0.05;

    // Nothing here argued for it beyond being an ordinary recurring bill.
    // Offering every subscription as a possible mortgage would make the list
    // useless and train people to confirm without reading.
    if (score < 0.2) continue;

    candidates.push({
      key,
      name: label,
      typicalAmount: typical,
      occurrences: sorted.length,
      lastSeen: sorted[sorted.length - 1].date,
      transactionIds: sorted.map(t => t.transaction_id),
      confidence: Math.min(1, score),
      reasons,
      confirmed: sorted.some(t => confirmedIds.has(t.transaction_id)),
    });
  }

  return candidates.sort((a, b) => {
    // Confirmed first — the user's own answer outranks the app's guess.
    if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.typicalAmount - a.typicalAmount;
  });
}

/**
 * Is the payment on file consistent with what the accounts show?
 *
 * Returns null when there is nothing to compare — no confirmed payments, or no
 * figure on file. A disagreement is reported, never applied: the entered figure
 * is what the projection runs on, and silently replacing it would move a payoff
 * date the user never asked to move.
 */
export interface PaymentCheck {
  /** What the confirmed transactions actually cleared, median. */
  observed: number;
  /** What the app is currently running on. */
  onFile: number;
  difference: number;
  /** True when the gap is big enough to be worth showing. */
  material: boolean;
}

export function checkPaymentAmount(
  confirmed: PaymentCandidate[],
  onFile: number | null,
): PaymentCheck | null {
  if (confirmed.length === 0 || onFile === null || onFile <= 0) return null;
  const observed = median(confirmed.map(c => c.typicalAmount));
  if (observed <= 0) return null;

  const difference = observed - onFile;
  return {
    observed,
    onFile,
    difference,
    // Escrow moves a payment by a few dollars a year and that is not news.
    // 5% or $25, whichever is larger, is roughly where a change is a change.
    material: Math.abs(difference) >= Math.max(25, onFile * 0.05),
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Payee name, stripped to something groupable.
 *
 * Digits go because statements append reference and account numbers, which
 * would otherwise make every month its own payee. Punctuation goes for the
 * same reason.
 */
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

function round(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
