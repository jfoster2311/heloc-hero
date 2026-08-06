// lib/accountRole.ts — picking the right account out of a Plaid item.
//
// A `linked_accounts` row stores an ITEM, and an item is a login, not an
// account. One sandbox link returned three: a home equity loan, a savings
// account and a mortgage — all under the row the user linked as "savings".
//
// Every balance in this app used to read `accounts[0]`, which is whatever order
// Plaid happened to return. On that item index 0 was the HOME EQUITY LOAN, so
// `liquidCash` came out as 20,000 — a debt — instead of the 8,000 actually in
// savings, and Safe to Sweep offered to move 16,400 the user did not have.
// Seeded single-account rows had hidden this; the first real link exposed it.
//
// So the account is chosen by the ROLE it plays, using the type/subtype Plaid
// already sends. supabase/functions/_shared/cashAlert.ts mirrors the cash half
// — the server must never quote a figure the app does not show.
import type { LinkedAccount, PlaidAccount } from './types';

export type AccountRole = 'cash' | 'mortgage' | 'heloc';

/**
 * Plaid's own taxonomy, not ours.
 *
 * `type` is the coarse bucket and `subtype` the specific product. A HELOC is
 * reported either as a loan with subtype 'home equity' or as a revolving credit
 * line, depending on the institution, so both are accepted.
 */
function matchesRole(account: PlaidAccount, role: AccountRole): boolean {
  const type = (account.type ?? '').toLowerCase();
  const subtype = (account.subtype ?? '').toLowerCase();

  switch (role) {
    case 'cash':
      // Deliberately the TYPE, not the subtype list. A depository account is
      // spendable money whatever the institution calls it; enumerating
      // subtypes would silently drop 'money market' or a cash-management
      // account and read as an empty balance.
      return type === 'depository';
    case 'mortgage':
      return subtype === 'mortgage';
    case 'heloc':
      return subtype === 'home equity' || subtype === 'line of credit';
  }
}

/**
 * The account in this item that plays `role`, or null when it cannot be told.
 *
 * The single-account fallback is what keeps every existing link working: an
 * item with one account is unambiguous, and some institutions report a subtype
 * this code has never heard of. With SEVERAL accounts and no match there is no
 * safe guess, so it returns null — the bug being fixed here is precisely what
 * guessing looks like.
 */
export function pickAccount(
  account: LinkedAccount | null | undefined,
  role: AccountRole,
): PlaidAccount | null {
  const accounts = account?.accounts;
  if (!accounts || accounts.length === 0) return null;

  const matched = accounts.find((a) => matchesRole(a, role));
  if (matched) return matched;

  return accounts.length === 1 ? accounts[0] : null;
}

/** The role's current balance, or null when there is no identifiable account. */
export function roleBalance(
  account: LinkedAccount | null | undefined,
  role: AccountRole,
): number | null {
  const picked = pickAccount(account, role);
  const current = picked?.balances?.current;
  return typeof current === 'number' ? current : null;
}

/** Current/available/limit for the role. Null when nothing identifiable. */
export function roleBalances(
  account: LinkedAccount | null | undefined,
  role: AccountRole,
): { current: number | null; available: number | null; limit: number | null } | null {
  const picked = pickAccount(account, role);
  if (!picked) return null;
  const b = picked.balances;
  return { current: b.current, available: b.available, limit: b.limit ?? null };
}
