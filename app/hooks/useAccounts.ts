// hooks/useAccounts.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { LinkedAccount } from '../lib/types';

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

  const fetchAccounts = useCallback(async (isRefresh = false) => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const { data } = await supabase
      .from('linked_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    setAccounts((data as LinkedAccount[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Realtime: re-fetch whenever linked_accounts changes for this user
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`accounts:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'linked_accounts',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchAccounts(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAccounts]);

  const mortgageAccount = accounts.find(a => a.account_type === 'mortgage') ?? null;
  const helocAccount    = accounts.find(a => a.account_type === 'home equity') ?? null;
  const savingsAccount  = accounts.find(a => a.account_type === 'savings') ?? null;
  const hasAllAccounts  = !!(mortgageAccount && helocAccount && savingsAccount);

  return {
    accounts,
    loading,
    refreshing,
    refresh: () => fetchAccounts(true),
    hasAllAccounts,
    mortgageAccount,
    helocAccount,
    savingsAccount,
  };
}
