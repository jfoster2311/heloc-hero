// hooks/useIsPro.ts — reactive pro-status hook backed by RevenueCat
import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { isProActive, purchasesAvailable } from '../lib/purchases';
import { getDevProMode, subscribeDevPro } from '../lib/devPro';
import { isPaidTier } from '../lib/pricing';
import { useAuth } from './useAuth';

export interface UseIsProResult {
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useIsPro(): UseIsProResult {
  const { tier } = useAuth();

  // Starts locked and resolves from the real entitlement. This used to start at
  // __DEV__ (always Pro in development), which made the locked half of every
  // gate untestable. Use the DEV Pro override in Settings to force either state.
  const [isPro,   setIsPro]   = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const check = useCallback(async () => {
    // DEV-only override; 'auto' (and all production builds) fall through to the
    // real entitlement check below.
    const override = getDevProMode();
    if (override !== 'auto') {
      setIsPro(override === 'pro');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (!purchasesAvailable()) {
        // Fall back to Supabase tier when native module is unavailable (Expo Go)
        setIsPro(isPaidTier(tier));
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

  // Re-evaluate when the DEV override is toggled, so gated screens flip live.
  useEffect(() => subscribeDevPro(check), [check]);

  // Recheck when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return { isPro, loading, refresh: check };
}
