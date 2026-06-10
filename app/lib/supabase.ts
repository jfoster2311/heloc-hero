// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl =
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ??
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');

const supabaseAnonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ??
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');

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
