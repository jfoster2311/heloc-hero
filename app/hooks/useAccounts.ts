// hooks/useAccounts.ts
// Plaid cost discipline: auto-refresh only when lastSynced > 12h.
// Manual pull-to-refresh always fetches fresh. Never refresh on every mount.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, invokeFunction } from '../lib/supabase';
import type { LinkedAccount } from '../lib/types';

const REFRESH_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours

interface AccountsState {
  accounts: LinkedAccount[];
  loading: boolean;
  refreshing: boolean;
  /** Resolves true when the read succeeded. */
  refresh: () => Promise<boolean>;
  /**
   * Why the last read failed, or null.
   *
   * This exists because the alternative is worse than it sounds: the fetch used
   * to discard its error and return [], which the UI then rendered as "Nothing
   * connected yet". A user on a dropped connection was told their accounts were
   * gone. In a finance app that is not a cosmetic bug — it is the screen
   * claiming a fact about the user's money that it has no basis for.
   */
  error: string | null;
  hasAllAccounts: boolean;
  mortgageAccount: LinkedAccount | null;
  helocAccount: LinkedAccount | null;
  savingsAccount: LinkedAccount | null;
  checkingAccount: LinkedAccount | null;
  /** Checking if linked, else savings. What a sweep is measured against. */
  cashAccount: LinkedAccount | null;
}

/**
 * Shared across every mounted instance, unlike the per-instance ref it replaces.
 *
 * `useAccounts` is mounted by the dashboard, the accounts tab, cash flow and the
 * move-money modal — each with its own state. A per-instance "already refreshed"
 * flag therefore guarded nothing across them: two screens mounting before the
 * first Plaid call returned would both see a stale accounts_updated_at and both
 * call out. Liabilities bill per item per month, so a duplicated refresh is a
 * real cost, not just a wasted round trip.
 */
const autoRefreshedUsers = new Set<string>();

export function useAccounts(userId: string | null): AccountsState {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A per-instance suffix so each mounted hook gets its OWN realtime topic.
  // Several screens use this hook, and a modal (move-money) opens on top of a
  // tab that is already subscribed — all with the same userId. A shared topic
  // means the modal's .subscribe() rebinds callbacks onto the tab's already-
  // joined channel, which Realtime rejects: "cannot add postgres_changes
  // callbacks after subscribe()". A unique topic per instance avoids the clash.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  /**
   * Returns the rows, or null when the read FAILED. Null and [] mean different
   * things and callers must not collapse them: [] is "you have no linked
   * accounts", null is "we do not know".
   */
  const fetchLocal = useCallback(async (): Promise<LinkedAccount[] | null> => {
    if (!userId) { setLoading(false); return null; }
    const { data, error: err } = await supabase
      .from('linked_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
      return null;
    }
    setError(null);
    return (data as LinkedAccount[]) ?? [];
  }, [userId]);

  /**
   * Trigger a Plaid balance refresh for all of the user's linked accounts.
   * The plaid-get-balances function keys off userId (optionally accountType) —
   * NOT plaid_item_id — and refreshes every account in a single call.
   *
   * Reports whether it worked. It used to swallow the failure and return void,
   * which produced the bug documented on `load` below: the caller could not
   * tell a sync that reached Plaid from one that never left the building.
   */
  async function triggerPlaidRefresh(uid: string): Promise<boolean> {
    try {
      await invokeFunction('plaid-get-balances', { userId: uid });
      return true;
    } catch {
      // Swallowed deliberately — a Plaid outage must not blank the screen or
      // throw. It is REPORTED instead, by the return value.
      return false;
    }
  }

  /**
   * Resolves true when the balances on screen are actually current.
   *
   * "The read succeeded" is not the same claim, and returning that was a bug
   * with real consequences. `fetchLocal` reads OUR table, not the bank: with
   * Plaid down, the sync failed silently, the second local read returned the
   * same untouched rows, and this returned true. Every caller uses that boolean
   * to pick between a success and an error buzz — the dashboard's own comment
   * says a success buzz on a failed refresh is worse than silence, because the
   * whole point of the gesture is to answer "are these numbers current?".
   * The answer was no and the phone said yes.
   *
   * So a failed Plaid sync now resolves false AND sets `error`, which is what
   * puts the "showing the last balances we have" banner on screen. The rows
   * themselves stay exactly where they are — they are still the best figures
   * available, they are just not fresh, and those are different problems.
   */
  const load = useCallback(async (isManualRefresh = false): Promise<boolean> => {
    if (!userId) { setLoading(false); return false; }
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    const fresh = await fetchLocal();
    let syncFailed = false;
    // Only overwrite what is on screen when the read actually succeeded. A
    // failed refresh should leave the last known balances visible next to the
    // error, not blank the screen.
    if (fresh) setAccounts(fresh);

    // Auto-refresh Plaid only on first mount if any account is stale (> 12h).
    // Manual refresh always calls Plaid.
    if (fresh && fresh.length > 0) {
      const now = Date.now();
      const alreadyRefreshed = autoRefreshedUsers.has(userId);
      const toRefresh = fresh.filter(a => {
        if (isManualRefresh) return true;
        if (alreadyRefreshed) return false;
        if (!a.accounts_updated_at) return true;
        return (now - new Date(a.accounts_updated_at).getTime()) > REFRESH_THRESHOLD_MS;
      });

      if (toRefresh.length > 0) {
        // Claimed BEFORE the await, so a second instance mounting while this
        // call is in flight sees it taken rather than firing its own.
        autoRefreshedUsers.add(userId);
        // One call refreshes every linked account for this user.
        syncFailed = !(await triggerPlaidRefresh(userId));
        // Re-fetch local after Plaid sync
        const updated = await fetchLocal();
        if (updated) setAccounts(updated);
      }
    }

    // AFTER the second fetchLocal, which clears `error` on a successful read —
    // set it any earlier and that call would wipe it out again.
    if (syncFailed) {
      setError('We could not reach your bank. These are the last balances we have.');
    }

    setLoading(false);
    setRefreshing(false);
    return fresh !== null && !syncFailed;
  }, [userId, fetchLocal]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: re-fetch local whenever linked_accounts changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`accounts:${userId}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'linked_accounts', filter: `user_id=eq.${userId}` },
        () => fetchLocal().then(d => { if (d) setAccounts(d); }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchLocal, instanceId]);

  const mortgageAccount = accounts.find(a => a.account_type === 'mortgage') ?? null;
  const helocAccount    = accounts.find(a => a.account_type === 'home equity') ?? null;
  const savingsAccount  = accounts.find(a => a.account_type === 'savings') ?? null;
  const checkingAccount = accounts.find(a => a.account_type === 'checking') ?? null;

  /**
   * The account the sweep is measured against.
   *
   * Checking wins when both are linked: it is where the paycheck lands and
   * where the surplus actually accumulates, so it is the balance a threshold
   * alert should watch. Savings is the fallback, and it has to be — every
   * account linked before the roles were split is stored as 'savings', and
   * preferring checking blindly would have blanked their figures on upgrade.
   */
  const cashAccount     = checkingAccount ?? savingsAccount;
  // Unchanged in meaning: mortgage, line, and somewhere to sweep from. Which
  // KIND of cash account satisfies it is deliberately not specified, so a user
  // who links only checking is not told they are missing something.
  const hasAllAccounts  = !!(mortgageAccount && helocAccount && cashAccount);

  return {
    accounts,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
    hasAllAccounts,
    mortgageAccount,
    helocAccount,
    savingsAccount,
    checkingAccount,
    cashAccount,
  };
}
