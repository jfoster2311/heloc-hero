// lib/devPro.ts
// DEV-only override for Pro entitlement state, so BOTH sides of every paywall
// gate are reviewable without a purchase.
//
// Why: useIsPro used to initialise `isPro` to `__DEV__`, so development was
// permanently Pro and the LOCKED state — the half actually worth testing —
// was unreachable. Testing a gate does not require paying for anything; it
// requires being able to see it closed.
//
// Default is 'auto', which runs the real RevenueCat/tier logic. Nothing here
// affects production: every entry point is gated on __DEV__, and Metro
// dead-strips the module's effect in release builds.
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 'auto' = real entitlement logic · 'pro'/'free' = forced, dev only. */
export type DevProMode = 'auto' | 'pro' | 'free';

const STORAGE_KEY = 'dev.proOverride';

let mode: DevProMode = 'auto';
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** Current override. Always 'auto' in production. */
export function getDevProMode(): DevProMode {
  return __DEV__ ? mode : 'auto';
}

/** Restores the persisted override. Call once at app start. */
export async function loadDevProMode(): Promise<void> {
  if (!__DEV__) return;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'auto' || stored === 'pro' || stored === 'free') {
      mode = stored;
    }
  } catch {
    // Non-fatal — fall back to 'auto'.
  }
  notify();
}

export async function setDevProMode(next: DevProMode): Promise<void> {
  if (!__DEV__) return;
  mode = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Non-fatal — the in-memory value still applies for this session.
  }
  notify();
}

/** Subscribes to override changes. Returns an unsubscribe function. */
export function subscribeDevPro(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
