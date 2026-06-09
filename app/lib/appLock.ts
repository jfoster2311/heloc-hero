// lib/appLock.ts — auto-lock state and logic
// expo-local-authentication is a native module: dev/prod builds only.
// All calls are guarded; module unavailability is handled gracefully.

import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCK_ENABLED_KEY = '@heloc_hero:auto_lock_enabled';
const BG_TIMESTAMP_KEY = '@heloc_hero:bg_timestamp';
const LOCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LocalAuth = any;
let LocalAuthentication: LocalAuth = null;

function loadModule(): LocalAuth {
  if (LocalAuthentication) return LocalAuthentication;
  try {
    LocalAuthentication = require('expo-local-authentication');
  } catch {
    LocalAuthentication = null;
  }
  return LocalAuthentication;
}

/** True only when the native module is available (dev/prod build). */
export function lockModuleAvailable(): boolean {
  return !!loadModule();
}

/** True when the device has biometrics or a passcode enrolled. */
export async function deviceSupportsLock(): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  try {
    const enrolled = await mod.isEnrolledAsync();
    return !!enrolled;
  } catch {
    return false;
  }
}

/** Returns the persisted enabled state. */
export async function isLockEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

/**
 * Enable or disable auto-lock. Refuses to enable if device has no
 * biometrics/passcode enrolled — returns false in that case.
 */
export async function setLockEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    const supported = await deviceSupportsLock();
    if (!supported) return false;
  }
  await AsyncStorage.setItem(LOCK_ENABLED_KEY, enabled ? 'true' : 'false');
  return true;
}

/** Call when the app goes to background to record the timestamp. */
export async function recordBackgroundTime(): Promise<void> {
  await AsyncStorage.setItem(BG_TIMESTAMP_KEY, Date.now().toString());
}

/** Returns true if enough time has elapsed to require re-authentication. */
export async function shouldLock(): Promise<boolean> {
  const enabled = await isLockEnabled();
  if (!enabled) return false;
  try {
    const raw = await AsyncStorage.getItem(BG_TIMESTAMP_KEY);
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) >= LOCK_THRESHOLD_MS;
  } catch {
    return false;
  }
}

/**
 * Prompt biometric/passcode auth. Returns true on success.
 * Always returns true when native module is unavailable.
 */
export async function authenticate(): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return true;
  try {
    const result = await mod.authenticateAsync({
      promptMessage: 'Unlock HELOC Hero',
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use Passcode',
      disableDeviceFallback: false,
    });
    return result.success === true;
  } catch {
    return false;
  }
}
