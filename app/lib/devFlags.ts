// lib/devFlags.ts
// Explicit opt-in switches for development-only shortcuts.
//
// Why this module exists: a shortcut must never be the DEFAULT path. Real auth
// is what ships, so real auth is what dev should exercise unless someone
// deliberately turns it off. The account-deletion breakage (an edge function
// that was never deployed, called via an `undefined/...` URL) survived months
// of review because the auth bypass meant nobody ever signed in for real.
//
// Every flag here is AND-ed with __DEV__, so setting one in app.json can never
// affect a production build — Metro dead-strips the whole thing.
import Constants from 'expo-constants';

function flag(name: string, envValue: string | undefined): boolean {
  const extra = Constants.expoConfig?.extra?.[name] as unknown;
  // app.json -> extra wins, but only when actually set: an empty string there
  // must fall through to the env var rather than shadow it. See lib/supabase.ts,
  // where `??` did not catch "" and silently produced empty Supabase keys.
  const set = typeof extra === 'boolean' || (typeof extra === 'string' && extra !== '');
  const raw = set ? extra : envValue;

  if (typeof raw === 'boolean') return raw;
  return raw === 'true' || raw === '1';
}

/**
 * Skips the Supabase auth + onboarding guards and drops straight into /tabs.
 * OFF by default so dev runs exercise the real sign-in path.
 *
 * To enable: set `extra.devAuthBypass` to true in app.json (or
 * EXPO_PUBLIC_DEV_AUTH_BYPASS=true) and reload. Never active in production.
 */
export const DEV_AUTH_BYPASS =
  __DEV__ && flag('devAuthBypass', process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS);

// Say which mode this run is in, so "why am I on the login screen?" and "why is
// my sign-in not being tested?" are both answerable from the Metro log.
if (__DEV__) {
  console.log(
    DEV_AUTH_BYPASS
      ? '[devFlags] DEV_AUTH_BYPASS ON — auth + onboarding guards skipped.'
      : '[devFlags] DEV_AUTH_BYPASS off — real Supabase sign-in required. ' +
        'Set extra.devAuthBypass=true in app.json to skip it.',
  );
}
