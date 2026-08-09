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

function on(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  return raw === 'true' || raw === '1';
}

/**
 * On if EITHER source says so, rather than app.json winning outright.
 *
 * The precedence version could not express "off by default, on for my machine".
 * `extra.devAuthBypass` is present and `false` in app.json — the honest way to
 * write a default — and the old rule counted any boolean as "set", so that
 * `false` shadowed the env var and the `EXPO_PUBLIC_…` route this module's own
 * docstring recommends could never turn anything on. Same family of mistake as
 * the empty-string one it was written to avoid: a falsy value that is present
 * still counts as an answer.
 *
 * OR is also the safer shape for a dev shortcut. Neither source can silently
 * DISABLE a flag the other enabled, and the default with both absent is off.
 * It matters because the tracked file is now the one that stays `false`: the
 * switch lives in .env, which is gitignored, so turning a bypass on for an
 * afternoon cannot ride into a commit.
 */
function flag(name: string, envValue: string | undefined): boolean {
  return on(Constants.expoConfig?.extra?.[name]) || on(envValue);
}

/**
 * Skips the Supabase auth + onboarding guards and drops straight into /tabs.
 * OFF by default so dev runs exercise the real sign-in path.
 *
 * To enable: EXPO_PUBLIC_DEV_AUTH_BYPASS=true in app/.env, then RESTART Metro —
 * env is read once at server start, so a reload alone will not pick it up.
 * .env is gitignored, which is why it is the recommended switch over
 * `extra.devAuthBypass` in app.json: a tracked file left on gets committed on.
 * Never active in production.
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
