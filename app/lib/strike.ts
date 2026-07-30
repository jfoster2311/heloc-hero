// lib/strike.ts — the replenishment phase, as a thing you can watch move.
//
// The gap this fills is motivational, not arithmetic. After a dump the line is
// drawn near its limit and there is nothing to do for months except send the
// surplus at it. `computeSafeToSweep` already knows exactly how far there is to
// go — it returns `toThreshold`, the amount that has to come off before the next
// dump opens — but the dashboard states it in a sentence, and a sentence does
// not visibly move. This turns the same number into a position on a track.
//
// ── Everything here is the threshold math that already ships ───────────────
// Nothing new is modelled. `target` is the same `limit × replenishThreshold`
// that `computeSafeToSweep` and `safeToMove` gate on, so the meter cannot
// disagree with the card that decides whether a dump is available. If those two
// ever showed different answers the meter would be the bug.
//
// ── What this deliberately does NOT do ─────────────────────────────────────
// It does not ask anyone to route their paycheck through the line. The daily
// figures below are computed from the drawn balance and the MONTHLY SURPLUS the
// app already models — the same surplus every projection uses. The variant that
// parks income in the HELOC to suppress the average daily balance is a different
// and riskier strategy, and app/tabs/learn.tsx tells users outright that this
// app does not ask that of them. A widget here that assumed otherwise would make
// that statement false.
import { UTILIZATION } from './config';

export interface StrikeInputs {
  helocDrawn: number | null;
  helocLimit: number | null;
  /** Monthly surplus. Negative or zero means nothing is replenishing. */
  monthlySurplus: number;
  /** Decimal APR, e.g. 0.085. */
  helocRate: number;
  /** Share of the limit the balance has to fall to. Defaults to config. */
  replenishThreshold?: number;
}

export type StrikeState =
  /** No line on file — there is no cycle to be in. */
  | 'no_line'
  /**
   * A limit is on file but the drawn balance is not. The meter has no position
   * to draw, and drawing it at "fully replenished" — which is what a coerced
   * zero produces — would tell a user mid-cycle that their next dump is open.
   */
  | 'unknown_balance'
  /** The line is already at or under the threshold: the next dump is available. */
  | 'open'
  /** Repaying, and the surplus covers the interest, so the balance is falling. */
  | 'replenishing'
  /** Drawn, but the surplus does not cover the monthly interest. Going backwards. */
  | 'stalled';

export interface Strike {
  state: StrikeState;
  /** Balance the line has to reach for the next dump to open. */
  target: number;
  drawn: number;
  limit: number;
  /** Still to repay before the next dump. 0 once open. */
  toGo: number;
  /**
   * 0..1 along the track, where 1 is "the next dump is open".
   *
   * Measured between the LIMIT and the target rather than from wherever the
   * balance happened to peak. The peak is not recorded anywhere, and inferring
   * it from the current balance would make the meter jump backwards the moment
   * someone drew again — the one behaviour that would make it untrustworthy.
   */
  progress: number;
  /** Interest the drawn balance accrues this month. */
  monthlyInterest: number;
  /** Surplus left after that interest — what actually reduces the balance. */
  netRepayment: number;
  /** Whole months to the next dump at the current rate. Null when stalled. */
  monthsToGo: number | null;
  /**
   * What the drawn balance costs per day, today.
   *
   * The honest version of a "daily interest" figure: it is what is being
   * CHARGED, not a saving being claimed. A user watching this fall as they
   * replenish is watching something real.
   */
  dailyCost: number;
  /** What that becomes after one month of sweeping the surplus at it. */
  dailyCostNextMonth: number;
}

export function computeStrike(input: StrikeInputs): Strike {
  const threshold = input.replenishThreshold ?? UTILIZATION.replenishThreshold;
  const limit = input.helocLimit ?? 0;
  const drawn = Math.max(0, input.helocDrawn ?? 0);
  const rate  = input.helocRate;

  const empty: Strike = {
    state: 'no_line', target: 0, drawn, limit, toGo: 0, progress: 0,
    monthlyInterest: 0, netRepayment: 0, monthsToGo: null,
    dailyCost: 0, dailyCostNextMonth: 0,
  };
  if (limit <= 0) return empty;
  // See lib/safeToMove.ts. `progress` is measured from the limit down to the
  // target, so a coerced-zero balance sits at the far end of the track and the
  // meter reads "next dump open" for anyone who entered a limit by hand.
  if (input.helocDrawn === null) return { ...empty, state: 'unknown_balance' };

  const target = limit * threshold;
  const toGo   = Math.max(0, drawn - target);

  // Interest is charged whether or not anything is repaid, so it comes out of
  // the surplus first. Repaying is what is LEFT, which is why a line can be
  // stalled even with a positive surplus.
  const monthlyInterest = (drawn * rate) / 12;
  const netRepayment    = Math.max(0, input.monthlySurplus - monthlyInterest);

  const dailyCost = (drawn * rate) / 365;

  // Where the balance lands after one month of sweeping. Floored at zero, and
  // it is fine for this to pass below `target` — overshooting the threshold is
  // ordinary, and `safeToMove` sizes the next dump off the headroom it leaves.
  const drawnNextMonth = Math.max(0, drawn - netRepayment);
  const dailyCostNextMonth = (drawnNextMonth * rate) / 365;

  const span = limit - target;
  const progress = span <= 0
    ? 1
    : Math.min(1, Math.max(0, (limit - drawn) / span));

  const base = {
    target, drawn, limit, toGo, progress,
    monthlyInterest, netRepayment, dailyCost, dailyCostNextMonth,
  };

  if (toGo === 0) return { ...base, state: 'open', monthsToGo: 0 };
  if (netRepayment <= 0) return { ...base, state: 'stalled', monthsToGo: null };

  return {
    ...base,
    state: 'replenishing',
    monthsToGo: Math.ceil(toGo / netRepayment),
  };
}

// ─── Unified net debt ─────────────────────────────────────────────────────────

export interface NetDebtInputs {
  mortgageBalance: number | null;
  helocDrawn: number | null;
  /**
   * What the ORIGINAL note says the balance would be today, if it is knowable.
   *
   * Null whenever origination principal, term or date are missing — which is the
   * common case for a manually-entered mortgage. The comparison is then omitted
   * rather than estimated, because the entire point of this figure is that it is
   * the honest yardstick.
   */
  scheduledBalance: number | null;
}

export interface NetDebt {
  mortgage: number;
  heloc: number;
  /** Mortgage plus the drawn line. The number the user should be watching. */
  total: number;
  /** Share of the bar the mortgage occupies, 0..1. */
  mortgageShare: number;
  /**
   * Total debt minus what the original schedule would have them owing today.
   *
   * NEGATIVE is ahead. Null when `scheduledBalance` is unknown. Note that this
   * counts the drawn HELOC against them, which is the conservative direction and
   * the whole reason the figure is trustworthy: mid-cycle, with a line freshly
   * drawn, it can legitimately show them BEHIND. A card that hid the HELOC to
   * keep this number flattering would be the exact dishonesty the unified view
   * exists to prevent.
   */
  vsSchedule: number | null;
}

export function computeNetDebt(input: NetDebtInputs): NetDebt {
  const mortgage = Math.max(0, input.mortgageBalance ?? 0);
  const heloc    = Math.max(0, input.helocDrawn ?? 0);
  const total    = mortgage + heloc;
  return {
    mortgage,
    heloc,
    total,
    mortgageShare: total > 0 ? mortgage / total : 1,
    vsSchedule: input.scheduledBalance === null ? null : total - input.scheduledBalance,
  };
}
