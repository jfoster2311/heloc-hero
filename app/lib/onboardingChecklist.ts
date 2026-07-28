// lib/onboardingChecklist.ts — the six things that make this strategy real.
//
// ── Every step is DERIVED, never stored ────────────────────────────────────
// There is no `completed_steps` column and there must not be one. A stored flag
// is a claim that can come apart from the thing it claims: a user who links an
// account and later unlinks it would keep a ticked box, and a user whose budget
// failed to save would see a step they never finished marked done. Both are the
// app lying about the user's own progress, on the screen whose entire job is
// telling them where they stand.
//
// So each step asks the same question the rest of the app asks. "Budget created"
// is `any category_budgets row exists`, which is the same read the Budget screen
// renders from. If a step is ticked, the thing is true right now.
//
// The cost is that a step can un-tick itself. That is correct: if someone
// unlinks their accounts, they no longer have accounts linked.
//
// ── Order is the order of the strategy ─────────────────────────────────────
// Not difficulty, and not what we would like them to do first. Run the numbers
// before linking anything (nobody should hand over bank credentials to an app
// whose premise they have not tested), understand the cash flow before opening a
// line of credit, and open the line before drawing on it. A checklist that put
// "Link your accounts" first would be optimising for our data, not their money.
import { READY_THRESHOLD } from './helocScore';

export type ChecklistStepId =
  | 'scenario' | 'accounts' | 'budget' | 'score' | 'heloc' | 'dump';

export interface ChecklistStep {
  id: ChecklistStepId;
  title: string;
  /** What this step is for, in one line. */
  body: string;
  done: boolean;
  /** Where tapping it goes. */
  route: string;
  /** Shown instead of the body once done — the state, not the instruction. */
  doneNote?: string;
  /**
   * True when the step cannot be done yet because an earlier one is missing.
   *
   * Rendered as muted-and-explained rather than hidden. Someone who cannot see
   * step 6 does not know the strategy has a step 6, and the whole point of the
   * list is showing where this goes.
   */
  blocked: boolean;
  blockedReason?: string;
}

export interface ChecklistState {
  steps: ChecklistStep[];
  completed: number;
  total: number;
  /** True once every step is done — the card retires itself. */
  finished: boolean;
  /** The step to nudge toward. Null when finished. */
  next: ChecklistStep | null;
}

export interface ChecklistInputs {
  /** Enough mortgage detail to have produced a real projection. */
  hasProjection: boolean;
  hasLinkedAccounts: boolean;
  /** Any category ceiling set. */
  hasBudget: boolean;
  /** The readiness score, 0–100. */
  score: number;
  /** True when a HELOC with a usable limit is on file. */
  hasHeloc: boolean;
  /** Dumps logged. */
  dumpCount: number;
}

export function buildChecklist(inputs: ChecklistInputs): ChecklistState {
  const {
    hasProjection, hasLinkedAccounts, hasBudget, score, hasHeloc, dumpCount,
  } = inputs;

  const steps: ChecklistStep[] = [
    {
      id: 'scenario',
      title: 'Run your first scenario',
      body: 'See what cycling would do to your payoff date before you commit to anything.',
      done: hasProjection,
      doneNote: 'Your projection is running on your own figures.',
      route: '/tabs/calculator',
      blocked: false,
    },
    {
      id: 'accounts',
      title: 'Link your accounts',
      body: 'Your surplus stops being a number you typed and becomes one we can check.',
      done: hasLinkedAccounts,
      doneNote: 'Balances and transactions are syncing.',
      route: '/modals/link-account',
      blocked: false,
    },
    {
      id: 'budget',
      title: 'Create your budget',
      body: 'Set a ceiling on the categories that matter. Protecting the surplus is what ' +
        'keeps the cycle turning.',
      done: hasBudget,
      doneNote: 'You have ceilings set.',
      route: '/modals/budget',
      // Budgets measure real spending against a limit. Without transactions
      // there is nothing to measure, so the step would open a screen that can
      // only say so.
      blocked: !hasLinkedAccounts,
      blockedReason: 'Link an account first so there is spending to budget against.',
    },
    {
      id: 'score',
      title: `Reach a HELOC Hero score of ${READY_THRESHOLD}`,
      body: 'Four things have to line up before borrowing against your home makes sense. ' +
        'This tracks how close they are.',
      done: score >= READY_THRESHOLD,
      doneNote: `You're at ${score} — in shape to run this.`,
      route: '/modals/heloc-score',
      blocked: false,
    },
    {
      id: 'heloc',
      title: 'Open your HELOC',
      body: 'An interest-only line with a long draw period is the one that works for cycling.',
      done: hasHeloc,
      doneNote: 'Your line is on file.',
      route: '/modals/get-heloc',
      // Deliberately soft: this warns rather than bars. Plenty of people have a
      // line already, or are opening one while they get the rest in order, and
      // an app that refused to acknowledge a HELOC they hold would be wrong
      // about a fact rather than early.
      blocked: false,
    },
    {
      id: 'dump',
      title: 'Make your first dump',
      body: 'Move a lump sum onto your principal, then replenish it with your surplus. ' +
        'That is the whole strategy, once.',
      done: dumpCount > 0,
      doneNote: dumpCount === 1 ? 'One dump logged.' : `${dumpCount} dumps logged.`,
      route: '/modals/move-money',
      blocked: !hasHeloc,
      blockedReason: 'You need a line of credit open before there is anything to draw from.',
    },
  ];

  const completed = steps.filter(s => s.done).length;
  // The next thing they can actually do — a blocked step is not a nudge, it is
  // a dead end with a chevron on it.
  const next = steps.find(s => !s.done && !s.blocked) ?? null;

  return {
    steps,
    completed,
    total: steps.length,
    finished: completed === steps.length,
    next,
  };
}
