// lib/purchases.ts — RevenueCat wrapper
// react-native-purchases is a native module: dev/prod builds only, not Expo Go.
// All calls are guarded with try/catch; purchasesAvailable() is false in Expo Go.

import Constants from 'expo-constants';

const RC_KEY: string =
  (Constants.expoConfig?.extra?.revenueCatIosKey as string | undefined) ??
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ??
  '';

export const ENTITLEMENT_ID = 'pro';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Purchases = any;
let Purchases: Purchases = null;

function loadModule(): Purchases {
  if (Purchases) return Purchases;
  try {
    Purchases = require('react-native-purchases').default;
  } catch {
    Purchases = null;
  }
  return Purchases;
}

/** Returns false in Expo Go or when the native module is unavailable. */
export function purchasesAvailable(): boolean {
  return !!loadModule();
}

export async function initPurchases(userId?: string): Promise<void> {
  const mod = loadModule();
  if (!mod || !RC_KEY) return;
  try {
    await mod.configure({ apiKey: RC_KEY, appUserID: userId ?? null });
  } catch {
    // silently swallow — native module may not be ready on first mount
  }
}

export async function identifyPurchaser(userId: string): Promise<void> {
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.logIn(userId);
  } catch {
    // no-op
  }
}

export async function isProActive(): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    const info = await mod.getCustomerInfo();
    return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export async function getOfferings(): Promise<unknown> {
  const mod = loadModule();
  if (!mod) return null;
  try {
    return await mod.getOfferings();
  } catch {
    return null;
  }
}

export async function purchasePackage(pkg: unknown): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    const result = await mod.purchasePackage(pkg);
    return !!result?.customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
  } catch (err: unknown) {
    const e = err as { userCancelled?: boolean };
    if (e?.userCancelled) return false;
    throw err;
  }
}

export async function restorePurchases(): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    const info = await mod.restorePurchases();
    return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}
