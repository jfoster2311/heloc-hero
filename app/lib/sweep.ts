// lib/sweep.ts — how much of this month's surplus is genuinely free to spend.
//
// The strategy tells the user to send every spare dollar at the HELOC, which is
// correct and also unlivable. People need to know what they can spend without
// damaging the plan, and in the absence of that number they either overspend
// guiltily or underspend and resent the app. This module answers it.
//
// ── Why the commitment is defined the way it is ────────────────────────────
// The next dump is gated on ONE thing in this product: utilization back at or
// under the replenish threshold. That is not a claim invented here — it is
// literally `utilCeiling` in lib/safeToMove.ts, which is what makes the Safe to
// Move card go from HOLD to a recommended amount. So "committed to
// replenishment" is exactly the repayment that re-opens that gate, plus the
// interest the line charges in the meantime.
//
// Deriving it from the same threshold is the point. If this card used its own
// model of replenishment, a user could be told their surplus was free to spend
// while the card directly above it said HOLD, and neither number would survive
// the contradiction.
//
// ── Direction of error ─────────────────────────────────────────────────────
// Interest is charged on the full drawn balance and counted as committed before
// anything is called free. Where this rounds, it rounds toward a SMALLER safe
// figure: telling someone $400 is spare when it was $500 costs them nothing,
// and the reverse quietly slows the payoff they are paying us to accelerate.
import { UTILIZATION } from './config';

export type SweepState =
  /** No line on file, so there is no replenishment to be committed to. */
  | 'no_line'
  /**
   * There is a limit, but nothing tells us what is drawn against it. Distinct
   * from a zero balance and it must stay that way: everything committed on this
   * card is derived from the drawn figure, so treating unknown as zero reports
   * the entire surplus as free to spend.
   */
  | 'unknown_balance'
  /** Nothing left over this month; there is nothing to allocate. */
  | 'no_surplus'
  /** The surplus does not even cover the line's interest — the balance grows. */
  | 'under_water'
  /** Every dollar is needed to re-open the next dump. */
  | 'all_committed'
  /**
   * Something structural rules out a dump entirely — an amortizing line, a
   * closed draw period, a prepayment penalty, a buffer already too thin. There
   * is no next dump to slow down, so this card must not talk about one.
   */
  | 'dump_blocked'
  /** Some is committed, some is free. */
  | 'partly_free'
  /** The line is already at or under the threshold — the next dump is open. */
  | 'fully_free';

export interface SafeToSweep {
  state: SweepState;
  /** The surplus this is dividing up. Echoed so the card can show the subtraction. */
  surplus: number;
  /** Interest the line charges this month at the current balance. */
  interestDue: number;
  /**
   * Repayment needed to bring utilization back to the replenish threshold —
   * i.e. to make the next dump possible at all. Zero when already at or under.
   */
  toThreshold: number;
  /** interestDue + toThreshold, capped at the surplus. Never exceeds it. */
  committed: number;
  /** What is left. Never negative. */
  safeToSpend: number;
  /**
   * How far the surplus falls short of the line's monthly interest. Positive
   * only in `under_water`, where the balance grows no matter what is spent.
   */
  shortfall: number;
  /** True when utilization is already at or under the threshold. */
  nextDumpOpen: boolean;
  /** Current utilization, 0..1, or null without a limit. */
  utilization: number | null;
}

export interface SweepInputs {
  /** Current HELOC balance. Null before the linked balances land. */
  helocDrawn: number | null;
  /** Credit limit. Null when unknown — the threshold cannot be located without it. */
  helocLimit: number | null;
  /** Surplus per month, after the mortgage payment. */
  monthlySurplus: number;
  /** Decimal, e.g. 0.085. */
  helocRate: number;
  /** 0..1, user-adjustable. Defaults to the product's opinion. */
  replenishThreshold?: number;
  /**
   * False when a structural blocker rules out dumping at all — see
   * SafeToMove's blockers. Without this the card would cheerfully report the
   * next dump as "open" directly beneath a HOLD that says cycling does not work
   * on this line, and a user has no way to tell which of the two to believe.
   */
  dumpAvailable?: boolean;
}

export function computeSafeToSweep(inputs: SweepInputs): SafeToSweep {
  const {
    helocDrawn, helocLimit, monthlySurplus, helocRate,
    replenishThreshold = UTILIZATION.replenishThreshold,
    dumpAvailable = true,
  } = inputs;

  const surplus = monthlySurplus;
  // See the note in lib/safeToMove.ts. A null balance is "we do not know", and
  // coercing it to zero here made the whole surplus read as free to spend —
  // every committed figure on this card is derived from the drawn balance, so
  // an absent one zeroed the interest due AND the amount owed to the threshold,
  // then reported the remainder as spendable.
  const balanceKnown = helocDrawn !== null;
  const drawn   = Math.max(0, helocDrawn ?? 0);
  const limit   = helocLimit ?? 0;

  const utilization = limit > 0 && balanceKnown ? clamp01(drawn / limit) : null;
  const interestDue = drawn * (helocRate / 12);

  const empty = {
    surplus, interestDue: 0, toThreshold: 0, committed: 0,
    safeToSpend: 0, shortfall: 0, nextDumpOpen: false, utilization,
  };

  // Without a limit there is no threshold to aim at, so no honest commitment
  // figure exists. Saying "spend it all" here would be the flattering guess.
  if (limit <= 0) return { ...empty, state: 'no_line' };
  if (!balanceKnown) return { ...empty, state: 'unknown_balance' };
  if (surplus <= 0) return { ...empty, state: 'no_surplus', interestDue };

  // The gate, straight from safeToMove's utilCeiling. Rounded UP so a rounding
  // artefact can never report the dump as open when it is a few dollars away.
  const toThreshold = Math.ceil(Math.max(0, drawn - limit * replenishThreshold));
  const nextDumpOpen = toThreshold === 0;

  // Interest first: it is charged whether or not the user replenishes, so it is
  // the most senior claim on the surplus.
  if (surplus <= interestDue) {
    return {
      ...empty,
      state: 'under_water',
      interestDue,
      toThreshold,
      committed: surplus,
      shortfall: interestDue - surplus,
      nextDumpOpen,
    };
  }

  // With no dump possible, repaying to the threshold buys nothing, so the only
  // senior claim left is the interest the line charges. The copy has to carry
  // the bad news; the arithmetic would otherwise read as good news.
  if (!dumpAvailable) {
    const committedInterest = Math.min(surplus, interestDue);
    return {
      state: 'dump_blocked',
      surplus,
      interestDue,
      toThreshold,
      committed: committedInterest,
      safeToSpend: Math.max(0, Math.floor(surplus - committedInterest)),
      shortfall: 0,
      nextDumpOpen: false,
      utilization,
    };
  }

  const need = interestDue + toThreshold;
  const committed = Math.min(surplus, need);
  // Floored to the dollar, toward the smaller free figure.
  const safeToSpend = Math.max(0, Math.floor(surplus - committed));

  return {
    state: nextDumpOpen ? 'fully_free' : safeToSpend > 0 ? 'partly_free' : 'all_committed',
    surplus,
    interestDue,
    toThreshold,
    committed,
    safeToSpend,
    shortfall: 0,
    nextDumpOpen,
    utilization,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
