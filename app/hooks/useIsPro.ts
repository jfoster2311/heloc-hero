// hooks/useIsPro.ts — reactive pro-status hook backed by RevenueCat
import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { isProActive, purchasesAvailable } from '../lib/purchases';
import { useAuth } from './useAuth';

export interface UseIsProResult {
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useIsPro(): UseIsProResult {
  const { tier } = useAuth();
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      if (!purchasesAvailable()) {
        // Fall back to Supabase tier when native module is unavailable (Expo Go)
        setIsPro(tier === 'medium' || tier === 'full');
        return;
      }
      const active = await isProActive();
      setIsPro(active);
    } finally {
      setLoading(false);
    }
  }, [tier]);

  useEffect(() => {
    check();
  }, [check]);

  // Recheck when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return { isPro, loading, refresh: check };
}
