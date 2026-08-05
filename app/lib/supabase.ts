// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

/**
 * app.json `extra` first, then the environment.
 *
 * The `??` this replaces only falls through on null/undefined, so an EMPTY
 * STRING in `extra` — the natural thing to leave behind when moving a value out
 * to env vars — shadowed the fallback instead of deferring to it. The app then
 * built a client on `''`, which fails at import with "supabaseUrl is required"
 * and points at nothing.
 *
 * Trimming and treating blank as absent makes that trap unreachable rather than
 * merely documented.
 */
function resolveConfig(extraKey: string, envValue: string | undefined): string {
  const fromExtra = Constants.expoConfig?.extra?.[extraKey] as string | undefined;
  return fromExtra?.trim() || envValue?.trim() || '';
}

const supabaseUrl     = resolveConfig('supabaseUrl', process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = resolveConfig('supabaseAnonKey', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// Named plainly, and at import, because the alternative is every request in the
// app failing separately with an error that never mentions configuration.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase is not configured: set supabaseUrl and supabaseAnonKey in app.json ' +
    'extra, or EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the ' +
    'environment. Nothing that talks to the server will work until one is set.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export const auth = {
  signUp: async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (!error && data.user) {
      // Upsert profile row — ignoreDuplicates guards against the DB trigger
      // or onAuthStateChange creating the row first (signup race condition).
      //
      // ── This error is ignored ON PURPOSE, and it is the one place in the
      //    codebase where that is the right answer ─────────────────────────
      // The obvious fix is to fold it into the returned `error`. That would be
      // wrong and actively harmful: by this line the AUTH account already
      // exists, so reporting a failure would send signup.tsx into its "Account
      // not created" branch, the user would retry, and Supabase would tell them
      // they already have an account — a dead end manufactured out of a
      // recoverable hiccup.
      //
      // It is recoverable because three independent things create this row: the
      // DB trigger, useAuth's onAuthStateChange upsert, and this. And the one
      // write that genuinely must land — the onboarding figures — goes through
      // submitOnboarding, which DOES report its error and is checked in
      // signup.tsx. So a failure here is either already fixed by a sibling or
      // surfaced a moment later by something that can act on it.
      await supabase.from('users').upsert(
        { id: data.user.id, email, full_name: fullName, tier: 'free', onboarding_complete: false },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    }

    return { data, error };
  },

  signIn: async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  },

  signOut: async () => {
    return supabase.auth.signOut();
  },

  resetPassword: async (email: string) => {
    return supabase.auth.resetPasswordForEmail(email);
  },

  /**
   * Send the sign-up confirmation link again.
   *
   * The screen that tells someone to go and open that email had no way to send
   * another one — a confirmation that never arrives ended the account-creation
   * flow outright, with "check your spam folder" as the only suggestion.
   *
   * Supabase rate-limits this hard (one per 60s by default) and reports it as a
   * 429, which describeAuthError already turns into a duration the user can
   * read. The caller does not need to special-case it.
   */
  resendConfirmation: async (email: string) => {
    return supabase.auth.resend({ type: 'signup', email });
  },
};

// ─── Edge Function helper ─────────────────────────────────────────────────────

/**
 * Calls a Supabase Edge Function with the current user's auth token.
 * Throws on network error or non-2xx response.
 */
export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body,
  });

  if (error) throw new Error(error.message);
  if (data === null) throw new Error(`Function ${name} returned no data`);

  return data;
}
