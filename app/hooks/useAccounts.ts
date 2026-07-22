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
  refresh: () => Promise<void>;
  hasAllAccounts: boolean;
  mortgageAccount: LinkedAccount | null;
  helocAccount: LinkedAccount | null;
  savingsAccount: LinkedAccount | null;
}

export function useAccounts(userId: string | null): AccountsState {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasAutoRefreshed = useRef(false);

  const fetchLocal = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('linked_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    return (data as LinkedAccount[]) ?? [];
  }, [userId]);

  /**
   * Trigger a Plaid balance refresh for all of the user's linked accounts.
   * The plaid-get-balances function keys off userId (optionally accountType) —
   * NOT plaid_item_id — and refreshes every account in a single call.
   */
  async function triggerPlaidRefresh(uid: string): Promise<void> {
    try {
      await invokeFunction('plaid-get-balances', { userId: uid });
    } catch {
      // Ignore — Plaid errors shouldn't break the UI
    }
  }

  const load = useCallback(async (isManualRefresh = false) => {
    if (!userId) { setLoading(false); return; }
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    const fresh = await fetchLocal();
    if (fresh) setAccounts(fresh);

    // Auto-refresh Plaid only on first mount if any account is stale (> 12h)
    // Manual refresh always calls Plaid
    if (fresh && fresh.length > 0) {
      const now = Date.now();
      const toRefresh = fresh.filter(a => {
        if (isManualRefresh) return true;
        if (hasAutoRefreshed.current) return false;
        if (!a.accounts_updated_at) return true;
        return (now - new Date(a.accounts_updated_at).getTime()) > REFRESH_THRESHOLD_MS;
      });

      if (toRefresh.length > 0) {
        hasAutoRefreshed.current = true;
        // One call refreshes every linked account for this user.
        await triggerPlaidRefresh(userId);
        // Re-fetch local after Plaid sync
        const updated = await fetchLocal();
        if (updated) setAccounts(updated);
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [userId, fetchLocal]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: re-fetch local whenever linked_accounts changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`accounts:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'linked_accounts', filter: `user_id=eq.${userId}` },
        () => fetchLocal().then(d => { if (d) setAccounts(d); }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchLocal]);

  const mortgageAccount = accounts.find(a => a.account_type === 'mortgage') ?? null;
  const helocAccount    = accounts.find(a => a.account_type === 'home equity') ?? null;
  const savingsAccount  = accounts.find(a => a.account_type === 'savings') ?? null;
  const hasAllAccounts  = !!(mortgageAccount && helocAccount && savingsAccount);

  return {
    accounts,
    loading,
    refreshing,
    refresh: () => load(true),
    hasAllAccounts,
    mortgageAccount,
    helocAccount,
    savingsAccount,
  };
}
