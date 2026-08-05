// hooks/useAuth.ts — shared auth/profile state.
//
// This used to keep `profile` in per-component useState, which meant every
// caller held its OWN copy. _layout.tsx, reveal.tsx and signup.tsx each ran a
// separate instance, so when reveal called refresh() after submit(), only
// reveal's copy learned that onboarding_complete had become true. The layout
// guard still saw false and redirected straight back to /onboarding/home-info
// — the "finishing onboarding sends me back to onboarding" bug.
//
// State now lives at module scope with subscribers, so one refresh() updates
// every consumer. The hook's API is unchanged.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile, Tier } from '../lib/types';

/**
 * What a write reported. `null` means it landed.
 *
 * This exists because it used to return nothing at all — see updateProfile.
 */
export interface ProfileWriteResult {
  error: string | null;
}

interface AuthState {
  profile: UserProfile | null;
  user: UserProfile | null;
  tier: Tier;
  loading: boolean;
  /**
   * Patch the profile. ALWAYS check the returned error before telling the user
   * it worked — the six screens that call this all record figures a projection
   * is built from.
   */
  updateProfile: (patch: Partial<UserProfile>) => Promise<ProfileWriteResult>;
  /** Re-fetches the profile for the current session. Call after submit() to sync onboarding_complete. */
  refresh: () => Promise<void>;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let sharedProfile: UserProfile | null = null;
let sharedLoading = true;
let initialized = false;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(fn => fn());
}

function setShared(profile: UserProfile | null, loading: boolean): void {
  sharedProfile = profile;
  sharedLoading = loading;
  emit();
}

async function loadProfile(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  // A FAILED read is not the same as "this user has no profile", and the
  // difference is not cosmetic: app/_layout.tsx routes on `profile`, so nulling
  // it sends a signed-in user to /onboarding/welcome. This ignored `error`, so
  // a dropped connection during a refresh looked exactly like being signed out
  // — the app would throw away a perfectly good profile and bounce someone back
  // to onboarding over a moment of bad reception.
  //
  // On error we keep what we already had. At cold start that is still null and
  // the guard behaves as before; on a refresh it is the loaded profile, which
  // is the case worth protecting.
  if (error) {
    setShared(sharedProfile, false);
    return;
  }
  setShared((data as UserProfile | null) ?? null, false);
}

/** Starts the session listener once, no matter how many components mount. */
function init(): void {
  if (initialized) return;
  initialized = true;

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) loadProfile(session.user.id);
    else setShared(null, false);
  });

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      // Supabase fires this before auth.signUp's profile INSERT can complete,
      // creating a race where the fetch finds no row. Upsert with
      // ignoreDuplicates ensures the row exists before we read it; if
      // auth.signUp already created it, this is a no-op.
      await supabase.from('users').upsert(
        {
          id:                  session.user.id,
          email:               session.user.email ?? '',
          full_name:           session.user.user_metadata?.full_name ?? null,
          tier:                'free',
          onboarding_complete: false,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      await loadProfile(session.user.id);
    } else {
      setShared(null, false);
    }
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    init();
    const listener = () => forceRender(n => n + 1);
    listeners.add(listener);
    // A component mounting after init must not sit on a stale first render.
    listener();
    return () => { listeners.delete(listener); };
  }, []);

  /**
   * Patch the profile, and REPORT whether it worked.
   *
   * ── What this used to do ──────────────────────────────────────────────────
   * It destructured only `data` and never `error`, then returned void. A failed
   * write — an RLS denial, a dropped connection, a constraint violation — comes
   * back as `{ data: null, error }`, so the guard below simply did not fire and
   * the function resolved exactly as it does on success.
   *
   * Every one of its six callers then did:
   *
   *     await updateProfile({ ... });
   *     hapticSuccess();
   *     router.back();
   *
   * So a save that failed produced the SUCCESS haptic and closed the sheet. And
   * because the in-memory profile was left untouched rather than corrupted, the
   * app stayed self-consistent — the user had no way to notice until they
   * reopened the screen and found their old figure, or never noticed at all and
   * went on reading a projection built from a mortgage balance they believed
   * they had corrected. That is the honesty rule failing at the one place it
   * matters most: the app's account of the user's own money.
   */
  const updateProfile = useCallback(async (patch: Partial<UserProfile>): Promise<ProfileWriteResult> => {
    const id = sharedProfile?.id;
    // Not a silent no-op any more. Reaching an editor with no profile loaded
    // means the session is not ready, and "nothing happened" is a real outcome
    // the caller has to be able to report.
    if (!id) return { error: 'You are not signed in. Sign in and try again.' };

    const { data, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) return { error: error.message };
    // A write that reports no error but returns no row still changed nothing —
    // the id matched nothing, or RLS filtered the row back out of the SELECT.
    if (!data)  return { error: 'The change did not save. Please try again.' };

    setShared(data as UserProfile, false);
    return { error: null };
  }, []);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await loadProfile(session.user.id);
  }, []);

  const tier: Tier = (sharedProfile?.tier as Tier) ?? 'free';

  return {
    profile: sharedProfile,
    user: sharedProfile,
    tier,
    loading: sharedLoading,
    updateProfile,
    refresh,
  };
}
