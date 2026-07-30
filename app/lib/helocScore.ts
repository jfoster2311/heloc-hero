// lib/helocScore.ts — is this person actually in a position to run the strategy?
//
// ── What this score is, and what it must never be ──────────────────────────
// It is a readiness check the app performs on itself: four things have to be
// true before HELOC cycling makes sense, and this measures how close the user is
// to each. It is NOT a credit decision, an approval odds estimate, or a promise
// that any lender will say yes. Nothing here is scored against an underwriting
// model, because we have no underwriting model — and a number that looked like
// one would be the kind of claim that gets a finance app pulled from the store.
//
// So every factor is something the user could work out themselves from figures
// they already gave us, and the UI shows the arithmetic. The score's whole value
// is that it ranks what to fix first, not that it knows something they don't.
//
// ── Why the weights are what they are ──────────────────────────────────────
// Surplus dominates at 45 points, because the strategy is arithmetic and its one
// input is the money left over each month. Someone with a perfect credit score,
// a paid-down house and no surplus cannot run this at all — the line never gets
// replenished, the balance compounds, and the house is the collateral. Someone
// with a mediocre credit score and a large surplus is in genuinely good shape.
// A score that let credit outweigh surplus would rank those two backwards.
//
// Equity is the second-largest at 25 because it is what determines whether a
// line can be opened at a usable size, and it is the factor a user can do least
// about in the short term — which is precisely why it should not be buried.
//
// Credit is 20 and self-reported, from a range the user picks. We do not pull
// it, and the copy must never imply we do.
//
// Utilization is 10 and only meaningful once a line exists. Before that it is
// not a strength or a weakness, so it is held out of the denominator entirely
// rather than scored as zero — see `applicable` below. Scoring an absent line as
// a failure would tell someone shopping for a HELOC that their readiness is poor
// BECAUSE they have not yet done the thing the score is meant to prepare them
// for.
import type { HelocScore } from './types';

/** At or above this, the app says ready. */
export const READY_THRESHOLD = 80;

/** The share of income left over that earns full marks. */
const SURPLUS_TARGET = 0.25;

/** Combined loan-to-value at or below this earns full equity marks. */
const LTV_EXCELLENT = 0.60;
/** Above this, a lender is unlikely to leave usable room on a line. */
const LTV_CEILING = 0.90;

const CREDIT_FLOOR = 580;
const CREDIT_CEILING = 780;

/**
 * The bands a user picks from, and the midpoint each one scores as.
 *
 * Lives here rather than on either screen because two screens collect it —
 * onboarding and the score sheet — and they had drifted to different midpoints
 * for the same band. That is a real bug and a quiet one: someone picking
 * "Very good" during onboarding and re-picking it later would watch their score
 * move without having changed their answer.
 *
 * Midpoints rather than exact figures, because the user is estimating. An input
 * that accepted "742" would imply a precision the answer does not have.
 */
export const CREDIT_RANGES = [
  { label: 'Exceptional', range: '800+',      value: 820 },
  { label: 'Very good',   range: '740–799',   value: 770 },
  { label: 'Good',        range: '670–739',   value: 705 },
  { label: 'Fair',        range: '580–669',   value: 625 },
  { label: 'Poor',        range: 'Below 580', value: 550 },
] as const;

/**
 * Where to send someone who does not know their score.
 *
 * The official free-report site, not a referral and not an affiliate link. This
 * app does not pull credit and must never imply it does.
 */
export const FREE_CREDIT_REPORT_URL = 'https://www.annualcreditreport.com';

export interface ScoreInputs {
  monthlyIncome: number;
  monthlyExpenses: number;
  /** The mortgage payment. Committed, and not part of the surplus. */
  monthlyPayment: number;
  helocBalance: number | null;
  helocLimit: number | null;
  /** Self-reported range midpoint. Null when they have not told us. */
  creditScore: number | null;
  homeValue: number | null;
  mortgageBalance: number | null;
}

export type FactorId = 'surplus' | 'equity' | 'credit' | 'utilization';

export interface ScoreFactor {
  id: FactorId;
  label: string;
  /** Points earned. */
  points: number;
  /** Points available. */
  max: number;
  /**
   * False when this factor cannot be judged yet — no line open, or no credit
   * score given. Held out of BOTH numerator and denominator, so an unanswered
   * question never reads as a failed one.
   */
  applicable: boolean;
  /** What the figure actually is, in words. Always states the arithmetic. */
  detail: string;
  /** The single most useful next move. Null when the factor is maxed. */
  advice: string | null;
}

export interface ScoreResult extends HelocScore {
  factors: ScoreFactor[];
  /** True at or above READY_THRESHOLD. */
  ready: boolean;
  /** Factors below full marks, worst-value-first — what to fix, in order. */
  improvements: ScoreFactor[];
  /** True when something needed to score properly is missing. */
  incomplete: boolean;
  /** One sentence for the top of the card. */
  headline: string;
}

export function computeHelocScore(inputs: ScoreInputs): ScoreResult {
  const {
    monthlyIncome, monthlyExpenses, monthlyPayment,
    helocBalance, helocLimit, creditScore, homeValue, mortgageBalance,
  } = inputs;

  // A line on file with no balance for it. Both factors below net off the drawn
  // amount, so `?? 0` would score an unverified line as pristine: utilization
  // took the full 10 points for a line that might be maxed, and equity
  // understated the LTV by the whole drawn balance. Two factors inflated at
  // once, on the score that tells someone whether to borrow against their house.
  const balanceUnknown = (helocLimit ?? 0) > 0 && helocBalance === null;

  const factors: ScoreFactor[] = [
    surplusFactor(monthlyIncome, monthlyExpenses, monthlyPayment),
    equityFactor(homeValue, mortgageBalance, helocBalance, balanceUnknown),
    creditFactor(creditScore),
    utilizationFactor(helocBalance, helocLimit, balanceUnknown),
  ];

  // Normalised over what could be judged, so an inapplicable factor neither
  // helps nor hurts. With a line open the denominator is 100; without one it is
  // 90 and the same performance yields the same score, which is the point.
  const applicable = factors.filter(f => f.applicable);
  const earned = applicable.reduce((s, f) => s + f.points, 0);
  const available = applicable.reduce((s, f) => s + f.max, 0);
  const total = available > 0 ? Math.round((earned / available) * 100) : 0;

  const improvements = factors
    .filter(f => f.applicable && f.advice !== null)
    // Biggest gap first — the honest ranking of what to do next, rather than
    // whatever happens to be easiest to word.
    .sort((a, b) => (b.max - b.points) - (a.max - a.points));

  // `balanceUnknown` belongs here too. Without it the score normalises over the
  // two factors that survive, then presents the result — 85 and "ready", on the
  // same inputs that score 67 once a real balance arrives — with a headline
  // claiming it is a read on where the user stands. Two of the four factors
  // being unjudgeable is the definition of incomplete.
  const incomplete =
    creditScore === null || homeValue === null || monthlyIncome <= 0 || balanceUnknown;

  return {
    total,
    ready: total >= READY_THRESHOLD,
    factors,
    improvements,
    incomplete,
    headline: headlineFor(total, incomplete, improvements),
    label: labelFor(total),
    // Kept for the HelocScore shape. Severity reads as a word here, not a hue —
    // the palette is monochrome and a "score colour" would be the one place a
    // red crept back in. Callers should use `label`.
    color: '',
    // Legacy per-factor fields, still on the HelocScore type. Read `factors`.
    surplusScore: factors[0].points,
    utilizationScore: factors[3].points,
    creditPoints: factors[2].points,
    mteModifier: 0,
  };
}

// ─── Factors ──────────────────────────────────────────────────────────────────

/**
 * Surplus as a share of income, AFTER the mortgage payment.
 *
 * After, deliberately. The payment is committed and cannot be redirected into
 * the line, so counting it as available would score someone as ready on money
 * that is already spoken for — and the recommendation built on that error is a
 * draw against their house.
 */
function surplusFactor(income: number, expenses: number, payment: number): ScoreFactor {
  const max = 45;
  if (income <= 0) {
    return {
      id: 'surplus', label: 'Monthly surplus', points: 0, max, applicable: true,
      detail: 'We don’t know what you earn yet.',
      advice: 'Add your income and expenses so we can work out what’s left each month.',
    };
  }

  const surplus = income - expenses - payment;
  const share = surplus / income;
  const points = Math.round(clamp01(share / SURPLUS_TARGET) * max);

  return {
    id: 'surplus',
    label: 'Monthly surplus',
    points,
    max,
    applicable: true,
    detail: surplus > 0
      ? `$${money(surplus)} left each month — ${pct(share)} of what you earn.`
      : `Nothing left each month after your expenses and mortgage payment.`,
    advice: points >= max
      ? null
      : surplus <= 0
        ? 'Cycling runs on the money left over. Until there is some, a HELOC would ' +
          'grow rather than shrink.'
        : `Every extra $${money(Math.max(50, (income * SURPLUS_TARGET - surplus) / 4))} a ` +
          'month here moves this the most of any factor. It is also the one you control.',
  };
}

/** Room between what the house is worth and what is already owed on it. */
function equityFactor(
  homeValue: number | null,
  mortgageBalance: number | null,
  helocBalance: number | null,
  balanceUnknown: boolean,
): ScoreFactor {
  const max = 25;
  if (homeValue === null || homeValue <= 0 || mortgageBalance === null) {
    return {
      id: 'equity', label: 'Equity in your home', points: 0, max, applicable: true,
      detail: 'We don’t know your home value or mortgage balance yet.',
      advice: 'Add your home value and mortgage balance to see how much room a lender ' +
        'would have to work with.',
    };
  }

  // Inapplicable rather than computed off a coerced zero. This factor measures
  // COMBINED borrowing against the home, so a missing line balance understates
  // the LTV by exactly the drawn amount and hands back points that were never
  // earned. Held out of both numerator and denominator, like every other
  // question the user has not answered.
  if (balanceUnknown) {
    return {
      id: 'equity', label: 'Equity in your home', points: 0, max, applicable: false,
      detail: 'We know your home value and mortgage, but not what is drawn on your line.',
      advice: 'Add your line balance — equity here counts every debt secured on the ' +
        'house, so we cannot judge it without that one.',
    };
  }

  const secured = mortgageBalance + (helocBalance ?? 0);
  const ltv = secured / homeValue;
  // Full marks at or below 60% LTV, nothing at or above 90%, linear between.
  const scaled = (LTV_CEILING - ltv) / (LTV_CEILING - LTV_EXCELLENT);
  const points = Math.round(clamp01(scaled) * max);

  return {
    id: 'equity',
    label: 'Equity in your home',
    points,
    max,
    applicable: true,
    detail: `You owe ${pct(ltv)} of what your home is worth ` +
      `($${money(secured)} against $${money(homeValue)}).`,
    advice: points >= max
      ? null
      : ltv >= LTV_CEILING
        ? 'Most lenders want your total borrowing under about 85–90% of the home’s ' +
          'value. Paying down principal is what moves this.'
        : 'This improves on its own as you pay down the mortgage, and every dump ' +
          'moves it faster.',
  };
}

/**
 * Self-reported credit. Never pulled, and the copy says so.
 *
 * Inapplicable rather than zero when unknown: someone who has not told us their
 * credit score does not have bad credit, and scoring it as zero would hand them
 * a bleak number for declining to answer an optional question.
 */
function creditFactor(creditScore: number | null): ScoreFactor {
  const max = 20;
  if (creditScore === null) {
    return {
      id: 'credit', label: 'Credit score', points: 0, max, applicable: false,
      detail: 'Not added yet.',
      advice: 'Add your credit range — it’s the last piece of the picture. We never ' +
        'pull it, and you can get it free from your bank or card issuer.',
    };
  }

  const scaled = (creditScore - CREDIT_FLOOR) / (CREDIT_CEILING - CREDIT_FLOOR);
  const points = Math.round(clamp01(scaled) * max);

  return {
    id: 'credit',
    label: 'Credit score',
    points,
    max,
    applicable: true,
    detail: `Around ${creditScore}, from the range you picked.`,
    advice: points >= max
      ? null
      : 'Lenders price HELOCs off this. Bringing card balances down before you ' +
        'apply is usually the fastest lever.',
  };
}

/**
 * How much of the line is already drawn.
 *
 * Inapplicable before a line exists — and that is the most important line in
 * this file. Scoring an unopened HELOC as zero would tell someone shopping for
 * one that their readiness is poor BECAUSE they have not yet done the thing the
 * score exists to prepare them for, which is exactly backwards.
 */
function utilizationFactor(
  helocBalance: number | null,
  helocLimit: number | null,
  balanceUnknown: boolean,
): ScoreFactor {
  const max = 10;
  if (helocLimit === null || helocLimit <= 0) {
    return {
      id: 'utilization', label: 'Line usage', points: 0, max, applicable: false,
      detail: 'No HELOC open yet — nothing to measure.',
      advice: null,
    };
  }

  // The clearest case of the whole rule. `1 - used` with `used` coerced to zero
  // awards FULL marks to a line whose balance we have never seen — and the
  // detail line below would state "0% of your line is drawn" as fact.
  if (balanceUnknown) {
    return {
      id: 'utilization', label: 'Line usage', points: 0, max, applicable: false,
      detail: 'We don’t know what is drawn on your line yet.',
      advice: 'Add your current balance so this can be scored.',
    };
  }

  const used = (helocBalance ?? 0) / helocLimit;
  const points = Math.round(clamp01(1 - used) * max);

  return {
    id: 'utilization',
    label: 'Line usage',
    points,
    max,
    applicable: true,
    detail: `${pct(used)} of your line is drawn ` +
      `($${money(helocBalance ?? 0)} of $${money(helocLimit)}).`,
    advice: points >= max
      ? null
      : 'Replenishing the line with your surplus is the second half of every ' +
        'cycle — it’s what makes the next dump possible.',
  };
}

// ─── Wording ──────────────────────────────────────────────────────────────────

function labelFor(total: number): HelocScore['label'] {
  if (total >= READY_THRESHOLD) return 'Excellent';
  if (total >= 60) return 'Good';
  if (total >= 40) return 'Fair';
  return 'Needs Work';
}

/**
 * The sentence at the top of the card.
 *
 * Encouraging, and specific — those are not in tension, and the second is what
 * makes the first mean anything. "You're doing great!" next to a 41 is noise;
 * naming the one factor that would move it most is the actual motivation.
 */
function headlineFor(
  total: number,
  incomplete: boolean,
  improvements: ScoreFactor[],
): string {
  if (incomplete) {
    return 'Add the missing pieces below and this becomes a real read on where you stand.';
  }
  if (total >= READY_THRESHOLD) {
    return 'You’re in shape to run this strategy. Keep the surplus steady and the ' +
      'line replenished.';
  }
  const next = improvements[0];
  if (!next) return 'You’re close. Keep going.';

  const toGo = READY_THRESHOLD - total;
  return `${toGo} point${toGo === 1 ? '' : 's'} from ready. ` +
    `${next.label} is where you’d gain the most.`;
}

/**
 * A representative score for someone with nothing on file.
 *
 * Explicitly flagged incomplete so no screen can present it as the user's own —
 * the previous version of this returned a plausible 62 with no such marker, and
 * a made-up readiness score shown as real is exactly the sort of claim
 * CLAUDE.md's honesty rule exists to prevent.
 */
export function genericHelocScore(): ScoreResult {
  return computeHelocScore({
    monthlyIncome: 0,
    monthlyExpenses: 0,
    monthlyPayment: 0,
    helocBalance: null,
    helocLimit: null,
    creditScore: null,
    homeValue: null,
    mortgageBalance: null,
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function money(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString('en-US');
}
function pct(n: number): string {
  return `${Math.round(clamp01(n) * 100)}%`;
}
