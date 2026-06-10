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

  // Dev bypass: Pro always active in __DEV__ builds so all gated screens are testable
  // without a RevenueCat purchase. Production builds are unaffected — __DEV__ is false.
  const [isPro,   setIsPro]   = useState<boolean>(__DEV__);
  const [loading, setLoading] = useState<boolean>(!__DEV__);

  const check = useCallback(async () => {
    if (__DEV__) return; // Dev bypass — isPro stays true, loading stays false
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
