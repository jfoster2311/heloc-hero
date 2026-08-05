// lib/config.ts — every threshold the UI reasons about, in one place.
//
// The rule this file exists to enforce: nothing that drives a rendered position,
// a status word, or an alert may be a magic number buried in a screen. A gauge
// that draws its threshold notch at a hardcoded 80% of the track is a picture
// of a gauge. A "CAUTION" that is really `util > 0.8` written inline in JSX
// cannot be tuned, tested, or explained to a user.
//
// Values here are the product's opinion, not the user's — the ones a user can
// change (replenish threshold, rate stress, surplus override) read their
// default from here and then live on the profile.

/** HELOC utilization bands. Above CAUTION the line has little emergency room. */
export const UTILIZATION = {
  caution: 0.80,
  hold:    0.92,
  /** Default replenish target — user-adjustable. */
  replenishThreshold: 0.80,
} as const;

/** Liquidity floor. Below this many months of expenses, a move is a HOLD. */
export const BUFFER = {
  /** Under this, never recommend a move. */
  minMonths:     2,
  /** Between min and comfortable, recommend with a CAUTION. */
  comfortMonths: 4,
} as const;

/**
 * Trailing window for the surplus figure the recommendation is built on.
 *
 * Twelve, not three. Twelve months gives one of every calendar month, which is
 * the only way to tell "December is always expensive" apart from "spending is
 * trending up" — and the seasonal, lumpy costs are precisely the ones people
 * omit when asked to estimate their spending. Plaid holds up to 24 months at
 * most institutions; that is the ceiling, not the default, because two-year-old
 * spending describes a life the user may no longer be living.
 */
export const SURPLUS_WINDOW_MONTHS = 12;

/** Ceiling on how much history a user can choose to average over. */
export const MAX_SURPLUS_WINDOW_MONTHS = 24;

/**
 * How far derived expenses must diverge from the entered figure before the app
 * interrupts to ask about it. Below this, the prompt is noise.
 */
export const CASHFLOW_MATERIAL_GAP_PCT = 0.15;

/** Don't re-sync transactions more often than this from the client. */
export const TXN_SYNC_INTERVAL_HOURS = 6;

/** Ownership milestones on the payoff progress bar. */
export const MILESTONES = [10, 25, 50, 75, 90] as const;

/** A balance older than this is stale enough to caveat a recommendation. */
export const STALE_SYNC_HOURS = 36;

/** How far ahead to warn about the draw period closing. */
export const DRAW_LOOKAHEAD_MONTHS = 18;

/**
 * How often to nudge the user to confirm their HELOC terms.
 *
 * A HELOC rate is variable and drifts, and no provider reports it, so the figure
 * powering every projection is only as fresh as the last statement the user
 * checked. `termsAreStale` (lib/helocTerms.ts) still governs the visual "confirm"
 * badge at a longer horizon; this is the cadence of the gentle monthly reminder.
 */
export const TERMS_REVIEW_DAYS = 30;

/**
 * The minimum spacing between cash-threshold alerts.
 *
 * The arm/re-arm rule already collapses a sustained high balance into a single
 * prompt. This bounds the other shape: a balance that oscillates across the
 * line as a paycheck lands and direct debits clear. Every one of those is a
 * genuine crossing, and firing on each would be a near-daily buzz saying
 * roughly the same thing — which is how a user mutes the app entirely.
 */
export const CASH_ALERT_MIN_GAP_DAYS = 5;

/** How far ahead a mortgage payment counts as "due". */
export const PAYMENT_DUE_LOOKAHEAD_DAYS = 7;

/** Escrow moves by small amounts constantly; only flag a real change. */
export const ESCROW_CHANGE_MIN = 100;

/** Rate-stress increments offered on the Assumptions control, in basis points. */
export const RATE_STRESS_STEPS_BPS = [0, 100, 200, 300, 500] as const;

/** Default forward assumption for the HELOC rate: today's rate, unchanged. */
export const DEFAULT_FORWARD_RATE_DELTA_BPS = 0;

/** How the HELOC charges interest. Materially changes whether cycling works. */
export type InterestCalcMethod = 'average_daily_balance' | 'statement_balance';

export const INTEREST_CALC_LABEL: Record<InterestCalcMethod, string> = {
  average_daily_balance: 'Average daily balance',
  statement_balance:     'Statement balance',
};

export const INTEREST_CALC_EXPLAINER: Record<InterestCalcMethod, string> = {
  average_daily_balance:
    'Interest is charged on your balance each day. Parking income in the line ' +
    'between paychecks genuinely lowers what you owe, so cycling does what the ' +
    'strategy claims.',
  statement_balance:
    'Interest is charged on the balance on your statement date. Money that sits ' +
    'in the line mid-cycle and leaves before that date changes nothing, so the ' +
    'main mechanic of cycling does not apply to this account.',
};

/** Where the user got their home value. Shown so the estimate can be judged. */
export type HomeValueSource = 'appraisal' | 'assessment' | 'online_estimate' | 'purchase_price';

export const HOME_VALUE_SOURCE_LABEL: Record<HomeValueSource, string> = {
  appraisal:       'Recent appraisal',
  assessment:      'County assessment',
  online_estimate: 'Online estimate',
  purchase_price:  'Purchase price',
};
