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

interface AuthState {
  profile: UserProfile | null;
  user: UserProfile | null;
  tier: Tier;
  loading: boolean;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
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
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
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

  const updateProfile = useCallback(async (patch: Partial<UserProfile>) => {
    const id = sharedProfile?.id;
    if (!id) return;
    const { data } = await supabase
      .from('users')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (data) setShared(data as UserProfile, false);
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
