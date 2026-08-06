// supabase/functions/_shared/cashAlert.ts — deciding whether a balance change is worth saying.
//
// This is the server half of the alert the app already runs on foreground
// (app/lib/notify.ts, evaluateCashThreshold). The two MUST agree: a user who
// gets a push saying $3,000 is spare and then opens the app to a Safe to Sweep
// card showing something else has been given two answers by one product, and
// will believe neither. So the arithmetic here is a deliberate mirror, and any
// change to one belongs in both.
//
// What it replaces is worse than a duplicate: plaid-webhook used to compare
// balances against a hardcoded $5,000 / $20,000 and write a row into a
// `notifications` table that nothing in the app has ever read. Every one of
// those alerts was invisible, and none of them used the thresholds the user set.

/** Mirrors lib/automation.ts computeSweepAmount. Floors at zero. */
export function computeSweepAmount(
  cashBalance: number,
  bufferTarget: number,
  upcomingBills: number,
): number {
  return Math.max(0, Math.floor(cashBalance - bufferTarget - upcomingBills));
}

export interface ArmState {
  armed: boolean;
  lastFiredAt: string | null;
}

/**
 * Mirrors lib/notify.ts evaluateCashThreshold.
 *
 * Fires on the CROSSING, not the state. Without the arm flag a balance sitting
 * happily above the line would produce a push on every webhook Plaid sends —
 * several a day, all saying the same thing.
 */
export function evaluateCashThreshold(
  spare: number,
  floor: number,
  prev: ArmState,
  minGapDays: number,
  now = new Date(),
): { fire: boolean; next: ArmState } {
  if (spare < floor) {
    return { fire: false, next: { armed: true, lastFiredAt: prev.lastFiredAt } };
  }
  if (!prev.armed) return { fire: false, next: prev };

  if (prev.lastFiredAt) {
    const since = now.getTime() - new Date(prev.lastFiredAt).getTime();
    // NaN from an unparseable stored date must not read as "long enough ago".
    if (!Number.isFinite(since) || since < minGapDays * 86_400_000) {
      return { fire: false, next: prev };
    }
  }

  return { fire: true, next: { armed: false, lastFiredAt: now.toISOString() } };
}

/** Mirrors lib/pricing.ts isPaidTier. 'medium'/'full' are legacy paid values. */
export function isPaidTier(tier: string | null | undefined): boolean {
  return tier === "pro" || tier === "medium" || tier === "full";
}

interface PlaidAccountRow {
  type?: string | null;
  subtype?: string | null;
  balances?: { current?: number | null } | null;
}

interface LinkedAccountRow {
  account_type: string;
  accounts: PlaidAccountRow[] | null;
}

/**
 * The balance the sweep is measured against, or null when there is none.
 *
 * Checking wins over savings, matching hooks/useAccounts.ts `cashAccount`. That
 * fallback is load-bearing: every account linked before the roles were split is
 * stored as 'savings'.
 *
 * This used to read `accounts[0]`, mirroring the app — and both were wrong. A
 * linked row holds an ITEM, and an item is a login: one real link returned a
 * home equity loan, a savings account and a mortgage together. Index 0 was the
 * LOAN, so the sweep was measured against a 20,000 debt instead of the 8,000 in
 * savings, and the alert would have offered to move 16,400 that did not exist.
 *
 * Now matched on Plaid's own `type`, mirroring lib/accountRole.ts. Keep the two
 * in step: a server that picks differently from the app quotes a figure the
 * Safe to Sweep card contradicts.
 */
export function resolveCashBalance(rows: LinkedAccountRow[]): number | null {
  const pickRow = (type: string) => rows.find((r) => r.account_type === type);
  const row = pickRow("checking") ?? pickRow("savings");
  const accounts = row?.accounts;
  if (!accounts || accounts.length === 0) return null;

  // Single-account items are unambiguous, which keeps every existing link
  // working even where an institution reports a type this has never seen.
  // With several and no depository among them there is no safe guess.
  const account = accounts.find((a) => (a.type ?? "").toLowerCase() === "depository")
    ?? (accounts.length === 1 ? accounts[0] : null);

  const balance = account?.balances?.current;
  return typeof balance === "number" ? balance : null;
}

/** True when a webhook for this account_type could move the cash figure. */
export function isCashAccountType(type: string | null | undefined): boolean {
  return type === "savings" || type === "checking";
}
