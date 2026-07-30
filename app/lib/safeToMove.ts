// lib/safeToMove.ts — "is now a sensible time to move money onto the mortgage?"
//
// This module produces a status, an amount, and the sentences that justify
// both. The sentences are the point. A screen that says CLEAR and nothing else
// trains the user to obey it; a screen that says CLEAR because the line is at
// 76%, the trailing surplus is $2,100 and the buffer only drops to 2.4 months
// teaches them to make the call themselves — and to notice when the app is
// wrong, which it eventually will be, because it is reasoning from balances
// that refresh twice a day.
//
// Two rules the arithmetic here is built around:
//  1. Liquidity is stated with the same precision as savings. Interest saved
//     without the buffer consumed is a sales pitch.
//  2. Anything that makes the strategy structurally unsound — an amortizing
//     line, a closed draw period, a prepayment penalty — is a HOLD outright,
//     not a smaller recommended amount.
import { analyzeMove, type MoveAnalysis } from './moveDecision';
import { UTILIZATION, BUFFER } from './config';

export type MoveStatus = 'CLEAR' | 'CAUTION' | 'HOLD';

export type Blocker =
  | 'no_line'
  | 'balance_unknown'
  | 'no_surplus'
  | 'amortizing_heloc'
  | 'draw_ended'
  | 'prepayment_penalty'
  | 'utilization_maxed'
  | 'buffer_too_thin';

export const BLOCKER_TEXT: Record<Blocker, string> = {
  no_line:            'No HELOC limit on file, so there is nothing to draw against.',
  balance_unknown:    'We do not know what is currently drawn on your line, so we cannot size a move against it.',
  no_surplus:         'Your monthly surplus is zero or negative, so a draw could not be replenished.',
  amortizing_heloc:   'This HELOC amortizes rather than charging interest only. Cycling does not work on it.',
  draw_ended:         'The draw period has closed, so no further draws are possible.',
  prepayment_penalty: 'This mortgage carries a prepayment penalty. Check the terms before paying ahead.',
  utilization_maxed:  'The line is already drawn near its limit.',
  buffer_too_thin:    'Your cash and remaining credit are already under two months of expenses.',
};

export interface SafeToMoveInputs {
  helocLimit: number | null;
  helocDrawn: number | null;
  /** Trailing-window surplus. Falls back to income − expenses − payment. */
  avgMonthlySurplus: number;
  /**
   * Where that surplus came from. The app has no transactions table, so today
   * this is always 'entered' — and the reasoning string has to say so rather
   * than claim a trailing average it cannot compute.
   */
  surplusBasis: 'entered' | 'trailing';
  monthlyExpenses: number;
  /** Cash the user could actually reach in an emergency. */
  liquidCash: number;
  helocRate: number;
  mortgageBalance: number;
  mortgageRate: number;
  monthlyPayment: number;
  /** 0..1, user-adjustable. The utilization a move is allowed to reach. */
  replenishThreshold: number;
  /** Structural reasons a move must not be recommended at any amount. */
  blockers: Blocker[];
}

export interface SafeToMove {
  status: MoveStatus;
  /** null whenever the status is HOLD. */
  recommendedAmount: number | null;
  currentUtilization: number | null;
  postMoveUtilization: number | null;
  estReplenishMonths: number | null;
  bufferMonthsBefore: number | null;
  bufferMonthsAfter: number | null;
  /** Sentences the screen shows verbatim. Never collapsed behind a tap. */
  reasons: string[];
  blockers: Blocker[];
  analysis: MoveAnalysis | null;
}

/**
 * Liquidity, counted honestly.
 *
 * Available credit belongs in the buffer because on a HELOC it IS the
 * emergency fund — that is the whole reason drawing it down has a cost worth
 * stating. Counting only cash would make every move look free.
 */
export function bufferMonths(
  liquidCash: number,
  availableCredit: number,
  monthlyExpenses: number,
): number | null {
  if (!(monthlyExpenses > 0)) return null;
  return Math.max(0, liquidCash + availableCredit) / monthlyExpenses;
}

export function evaluateMove(inputs: SafeToMoveInputs): SafeToMove {
  const {
    helocLimit, helocDrawn, avgMonthlySurplus, monthlyExpenses, liquidCash,
    helocRate, mortgageBalance, mortgageRate, monthlyPayment,
    replenishThreshold,
  } = inputs;

  const limit = helocLimit ?? 0;

  // ── A limit with no balance is NOT an undrawn line ───────────────────────
  // This used to be a bare `helocDrawn ?? 0`, and the drawn balance arrives
  // only from a linked account. So every user who entered a HELOC limit by hand
  // — the manual path, which is free-tier and deliberately supported — was
  // modelled as having a completely undrawn line. `utilCeiling` then came out at
  // 80% of their whole credit limit and this module returned CLEAR with that as
  // the recommended amount, to someone who might be sitting mid-cycle with most
  // of it already drawn.
  //
  // Not knowing is a distinct state from knowing it is zero, and only one of
  // them may produce a recommendation. Anything derived from the balance is null
  // rather than optimistic, including the buffer: available credit is counted as
  // liquidity here, so an unknown balance would inflate it by the drawn amount.
  const balanceKnown = helocDrawn !== null;
  const drawn = helocDrawn ?? 0;
  const availableNow = Math.max(0, limit - drawn);

  const currentUtilization = limit > 0 && balanceKnown ? clamp01(drawn / limit) : null;
  const bufferBefore = limit > 0 && !balanceKnown
    ? null
    : bufferMonths(liquidCash, availableNow, monthlyExpenses);

  // Structural blockers first, then the derived ones.
  const blockers = [...inputs.blockers];
  if (limit <= 0) push(blockers, 'no_line');
  if (limit > 0 && !balanceKnown) push(blockers, 'balance_unknown');
  if (avgMonthlySurplus <= 0) push(blockers, 'no_surplus');
  if (currentUtilization !== null && currentUtilization >= UTILIZATION.hold) {
    push(blockers, 'utilization_maxed');
  }
  if (bufferBefore !== null && bufferBefore < BUFFER.minMonths) {
    push(blockers, 'buffer_too_thin');
  }

  // ── The amount ───────────────────────────────────────────────────────────
  // Two ceilings, and the move takes the lower: how far the line may be drawn,
  // and how far liquidity may fall. Rounded DOWN to $500 so the figure reads as
  // a recommendation rather than a computed-to-the-dollar instruction.
  const utilCeiling   = limit * replenishThreshold - drawn;
  const bufferCeiling = monthlyExpenses > 0
    ? liquidCash + availableNow - BUFFER.minMonths * monthlyExpenses
    : utilCeiling;
  const raw = Math.min(utilCeiling, bufferCeiling, availableNow);
  const amount = raw >= 500 ? Math.floor(raw / 500) * 500 : 0;

  // `balanceKnown` guards this as well as the status below. `amount` is still a
  // number when the balance is unknown — utilCeiling reduces to 80% of the whole
  // limit — and analyzeMove would happily model a draw from an undrawn line, so
  // the reasoning strings would describe a move that is never offered.
  const analysis = amount > 0 && limit > 0 && balanceKnown
    ? analyzeMove({
        helocLimit: limit,
        helocDrawn: drawn,
        moveAmount: amount,
        monthlySurplus: avgMonthlySurplus,
        helocRate,
        mortgageBalance,
        mortgageRate,
        monthlyPayment,
      })
    : null;

  const postMoveUtilization = analysis ? clamp01(analysis.utilAfter) : currentUtilization;
  const availableAfter = analysis ? analysis.availableAfter : availableNow;
  const bufferAfter = limit > 0 && !balanceKnown
    ? null
    : bufferMonths(liquidCash, availableAfter, monthlyExpenses);
  const estReplenishMonths = analysis && analysis.replenishable ? analysis.replenishMonths : null;

  // ── The status ───────────────────────────────────────────────────────────
  let status: MoveStatus;
  if (blockers.length > 0 || amount <= 0) {
    status = 'HOLD';
  } else if (
    (postMoveUtilization !== null && postMoveUtilization > UTILIZATION.caution) ||
    (bufferAfter !== null && bufferAfter < BUFFER.comfortMonths) ||
    estReplenishMonths === null ||
    estReplenishMonths > 12 ||
    (analysis !== null && analysis.netInterestSaved <= 0)
  ) {
    status = 'CAUTION';
  } else {
    status = 'CLEAR';
  }

  return {
    status,
    recommendedAmount: status === 'HOLD' ? null : amount,
    currentUtilization,
    postMoveUtilization: status === 'HOLD' ? currentUtilization : postMoveUtilization,
    estReplenishMonths,
    bufferMonthsBefore: bufferBefore,
    bufferMonthsAfter: status === 'HOLD' ? bufferBefore : bufferAfter,
    reasons: buildReasons({
      status, blockers, amount, currentUtilization, postMoveUtilization,
      avgMonthlySurplus, estReplenishMonths, bufferAfter, analysis,
      surplusBasis: inputs.surplusBasis,
    }),
    blockers,
    analysis,
  };
}

interface ReasonInputs {
  status: MoveStatus;
  blockers: Blocker[];
  amount: number;
  currentUtilization: number | null;
  postMoveUtilization: number | null;
  avgMonthlySurplus: number;
  estReplenishMonths: number | null;
  bufferAfter: number | null;
  analysis: MoveAnalysis | null;
  surplusBasis: 'entered' | 'trailing';
}

/**
 * The reasoning, in plain sentences.
 *
 * Order is deliberate: what is true now, what the move would change, then what
 * it costs. The cost line is last so it is the one the eye rests on.
 */
function buildReasons(i: ReasonInputs): string[] {
  const out: string[] = [];

  if (i.blockers.length > 0) {
    for (const b of i.blockers) out.push(BLOCKER_TEXT[b]);
    return out;
  }

  const util = i.currentUtilization;
  if (util !== null) {
    const surplus = i.surplusBasis === 'trailing'
      ? `The last few months averaged ${money(i.avgMonthlySurplus)} of surplus.`
      : `Your entered figures leave ${money(i.avgMonthlySurplus)} a month.`;
    out.push(`Your line is at ${pct(util)} utilization. ${surplus}`);
  }

  if (i.amount > 0 && i.postMoveUtilization !== null) {
    const replenish = i.estReplenishMonths !== null
      ? ` — about ${i.estReplenishMonths} month${i.estReplenishMonths === 1 ? '' : 's'} to replenish`
      : ', and your surplus would not clear it';
    out.push(
      `A ${money(i.amount)} move puts you at ${pct(i.postMoveUtilization)}${replenish}.`,
    );
  }

  if (i.bufferAfter !== null) {
    out.push(
      `Cash plus remaining credit would cover ${i.bufferAfter.toFixed(1)} months of expenses.`,
    );
  }

  if (i.analysis && i.analysis.netInterestSaved <= 0) {
    out.push(
      'At these rates the HELOC interest costs more than the mortgage interest ' +
      'this move avoids.',
    );
  }

  return out;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function push(arr: Blocker[], b: Blocker) { if (!arr.includes(b)) arr.push(b); }
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function pct(n: number): string { return `${Math.round(n * 100)}%`; }
function money(n: number): string { return `$${Math.round(n).toLocaleString('en-US')}`; }
