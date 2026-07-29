// lib/budget.ts — ceilings the user sets, and whether a change is good news.
//
// Two pure functions carry almost all of this file's weight, and both exist
// because the same judgement was about to be made in five places:
//
//   · `getBarColor` decides on-track vs over for every progress bar, every
//     category row and every bar of every mini chart. One threshold, one place.
//   · `isFavorable` decides whether a movement is good news. It is NOT a sign
//     check — see the comment on it, which is the most load-bearing one here.
//
// ── What a ceiling is, and what it is not ──────────────────────────────────
// A ceiling is a number the user typed. It is not a projection input, it does
// not touch `computeProjection`, and nothing in lib/cashflow.ts reads this file.
// That separation is deliberate: the payoff date must not move because someone
// adjusted a grocery budget. Budgets here explain spending; they never model it.
import { Colors, LightTheme, type SemanticTokens } from './theme';
import type { SpendCategory } from './spending';

// ─── Ceilings ─────────────────────────────────────────────────────────────────

/** A monthly ceiling on one category. Absent means the user has not set one. */
export interface CategoryBudget {
  category: SpendCategory;
  /** Dollars per month. Always > 0 — a zero ceiling is stored as no ceiling. */
  ceiling: number;
  /** Carry this ceiling into months the user has not explicitly budgeted. */
  appliesToFuture: boolean;
}

/** Ceilings keyed by category, as the hooks and screens pass them around. */
export type BudgetMap = Partial<Record<SpendCategory, CategoryBudget>>;

export interface BudgetStatus {
  /** What the user set, or null when this category has no ceiling. */
  ceiling: number | null;
  spent: number;
  /**
   * Spend as a share of the ceiling, 0–100 and CLAMPED.
   *
   * Clamped because it drives a bar width, and a 300%-of-budget category would
   * otherwise render a bar three times wider than its track. `overBy` carries
   * the magnitude that this figure throws away, so nothing is lost — the two are
   * returned together precisely so a caller cannot reach for the clamped one
   * when it needs the real overage.
   */
  pct: number;
  /** True once spend has passed the ceiling. False when no ceiling is set. */
  over: boolean;
  /** Dollars past the ceiling. 0 when under, or when no ceiling is set. */
  overBy: number;
  /**
   * Dollars left before the ceiling. Null with no ceiling — NOT zero.
   *
   * The difference matters on screen: "$0 left" is a budget you have exhausted,
   * "—" is a budget you never set. Rendering the first when you mean the second
   * tells the user they are out of room they never asked for.
   */
  remaining: number | null;
}

export function budgetStatus(spent: number, ceiling: number | null): BudgetStatus {
  if (ceiling === null || ceiling <= 0) {
    return { ceiling: null, spent, pct: 0, over: false, overBy: 0, remaining: null };
  }
  const over = spent > ceiling;
  return {
    ceiling,
    spent,
    pct: Math.min(100, (spent / ceiling) * 100),
    over,
    overBy: over ? spent - ceiling : 0,
    remaining: Math.max(0, ceiling - spent),
  };
}

/**
 * The colour every progress bar and every threshold bar in the app resolves to.
 *
 * Named for what the brief called it so the shared vocabulary survives, but it
 * returns tokens rather than hex: the over-budget mark is grey here rather than
 * red (see `Semantic` in lib/theme.ts for why), and a caller that hardcoded
 * '#DC4A4A' would quietly reintroduce the palette this app does not use.
 *
 * No ceiling means no judgement to make, so the bar draws in the neutral track
 * colour rather than defaulting to "on track" — a category with no budget is not
 * passing a test it was never given.
 */
export function getBarColor(
  spent: number,
  budget: number | null,
  /**
   * The palette to resolve against. Optional, defaulting to the light tokens.
   *
   * A default rather than a required argument so the screens that have not been
   * converted to the theme yet keep calling this with two arguments and keep
   * rendering exactly as they do today. A converted caller passes its own theme
   * and gets the dark grey/mint pair instead. When the migration finishes, the
   * default comes off and the parameter becomes required.
   */
  theme: { colors: Pick<typeof Colors, 'gray300'>; semantic: SemanticTokens } = LightTheme,
): string {
  if (budget === null || budget <= 0) return theme.colors.gray300;
  return spent > budget ? theme.semantic.overCeiling : theme.semantic.underCeiling;
}

/**
 * The word that must accompany the bar.
 *
 * Exported alongside `getBarColor` and not folded into it, because they are
 * returned to different places — but they are always used together. The colour
 * is never allowed to be the only signal (lib/theme.ts, `Semantic`), so a caller
 * reaching for one should find the other immediately above it.
 */
export function budgetLabel(status: BudgetStatus): string | null {
  if (status.ceiling === null) return null;
  if (status.over) return 'over';
  if (status.pct >= 90) return 'nearly there';
  return null;
}

// ─── Direction of change ──────────────────────────────────────────────────────

/**
 * Which way a category WANTS to move.
 *
 * This is the lookup that makes `isFavorable` more than a sign check, and it is
 * the whole reason that function exists as a table rather than an `if`.
 */
export type Direction = 'higherIsBetter' | 'lowerIsBetter';

/**
 * The kinds of line a change pill can appear next to.
 *
 * Deliberately its own type rather than `SpendCategory`: the report table mixes
 * spending categories with figures that are not categories at all — interest
 * accrued, principal paid, the surplus itself — and those are exactly the rows
 * where a naive rule gets the colour backwards.
 */
export type ChangeSubject =
  | SpendCategory        // every spending bucket: less is better
  | 'income'
  | 'spending'           // the aggregate of every bucket
  | 'surplus'
  | 'extraPrincipal'     // money onto the mortgage principal
  | 'interestPaid'       // interest accrued on the line
  | 'interestSaved'      // interest the strategy avoided
  | 'helocDrawn'
  | 'helocBalance';

/**
 * Which direction is good news, per subject.
 *
 * Spending categories are not listed individually — they all fall through to
 * `lowerIsBetter`, and enumerating them would mean a new category silently
 * getting no rule. The named entries are the ones a sign check gets WRONG.
 */
const DIRECTION: Partial<Record<ChangeSubject, Direction>> = {
  income:         'higherIsBetter',
  surplus:        'higherIsBetter',
  extraPrincipal: 'higherIsBetter',
  interestSaved:  'higherIsBetter',

  interestPaid:   'lowerIsBetter',
  helocDrawn:     'lowerIsBetter',
  helocBalance:   'lowerIsBetter',
};

export function directionFor(subject: ChangeSubject): Direction {
  // Anything unlisted is a spending bucket, and spending less is the point.
  return DIRECTION[subject] ?? 'lowerIsBetter';
}

/**
 * Is this movement good news for the user?
 *
 * ── Why this cannot be `delta > 0` ─────────────────────────────────────────
 * The arrow and the colour answer two different questions, and conflating them
 * is the single most common bug in a report table. The arrow says which way the
 * number moved. The colour says whether the user should be pleased. Those come
 * apart constantly, and on the rows that matter most here:
 *
 *   Income down 0.8%          ↘  bad     (a fall in income)
 *   Groceries down 1.6%       ↘  good    (a fall in spending)
 *   Interest accrued up 8%    ↗  bad     (the line is costing more)
 *   Extra principal up 96%    ↗  good    (the strategy is working)
 *
 * Two of those four are rising and one of the two is good; two are falling and
 * one of the two is good. No function of the sign alone can separate them. So
 * the subject decides, and the sign only says which side of it we are on.
 *
 * A delta of exactly zero is not favourable and not unfavourable — callers get
 * null and are expected to draw no pill at all, rather than a neutral-coloured
 * one that still implies a judgement was made.
 */
export function isFavorable(delta: number, subject: ChangeSubject): boolean | null {
  if (delta === 0) return null;
  return directionFor(subject) === 'higherIsBetter' ? delta > 0 : delta < 0;
}

/** The arrow to draw. Purely the sign — never the judgement. */
export function changeArrow(delta: number): 'arrow-up' | 'arrow-down' | null {
  if (delta === 0) return null;
  return delta > 0 ? 'arrow-up' : 'arrow-down';
}

/**
 * Period-over-period change, as a percentage of where it started.
 *
 * Null rather than Infinity when the baseline is zero: "up ∞%" from a month with
 * no spending in a category is not information, and a pill rendering it would be
 * the loudest thing on a table for the least reason. A caller showing null is
 * expected to say "new" or show nothing.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ─── Allocation ───────────────────────────────────────────────────────────────

/**
 * How the month's income is spoken for, once every ceiling is counted.
 *
 * The point of showing this is not the arithmetic — it is that a user who sets
 * thirteen ceilings independently has no idea whether they add up to more than
 * they earn until something is put in front of them that says so.
 */
export interface Allocation {
  income: number;
  /** Every ceiling the user has set, summed. */
  budgeted: number;
  /** Income the mortgage payment has already claimed. */
  mortgage: number;
  /**
   * What is left for the strategy once budgets and the payment are met.
   * Negative when the ceilings over-commit the income — which is the case worth
   * interrupting for, and the reason this is signed rather than clamped.
   */
  unallocated: number;
  /** True when the ceilings alone exceed income, before the mortgage payment. */
  overCommitted: boolean;
}

export function allocate(args: {
  income: number;
  budgets: BudgetMap;
  mortgagePayment: number;
}): Allocation {
  const { income, budgets, mortgagePayment } = args;
  const budgeted = Object.values(budgets)
    .reduce((sum, b) => sum + (b?.ceiling ?? 0), 0);

  return {
    income,
    budgeted,
    mortgage: mortgagePayment,
    unallocated: income - budgeted - mortgagePayment,
    overCommitted: budgeted + mortgagePayment > income && income > 0,
  };
}

/**
 * A starting ceiling for a category the user has not budgeted yet.
 *
 * Their own trailing average, rounded up to something a person would actually
 * type. Seeding from the average rather than from a percentage-of-income rule is
 * the honest default: it is a description of what they already do, not a target
 * this app invented and then measured them against.
 *
 * Returns null below a floor — offering a $12 ceiling for a category with one
 * transaction in it is noise, and the user is better served by an empty field.
 */
export function suggestCeiling(trailingAverage: number): number | null {
  if (trailingAverage < 25) return null;
  // Round to the nearest $25 under $500, nearest $50 above — the granularity
  // people actually budget at. A suggested "$347" reads as a computed figure the
  // user is expected to accept rather than a starting point they should edit.
  const step = trailingAverage < 500 ? 25 : 50;
  return Math.ceil(trailingAverage / step) * step;
}
