// hooks/useAuth.ts
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

export function useAuth(): AuthState {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Hydrate from the current session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          // Supabase fires this event before auth.signUp's profile INSERT can complete,
          // creating a race where fetchProfile finds no row. Upsert with ignoreDuplicates
          // ensures the row exists before we read it; if auth.signUp already created it,
          // this is a no-op.
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
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const updateProfile = useCallback(async (patch: Partial<UserProfile>) => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('users')
      .update(patch)
      .eq('id', profile.id)
      .select()
      .single();
    if (data) setProfile(data as UserProfile);
  }, [profile?.id]);

  // Re-fetches the current user's profile. Use after onboardingStore.submit() to
  // sync onboarding_complete: true into memory so _layout.tsx routes correctly.
  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await fetchProfile(session.user.id);
  }, [fetchProfile]);

  const tier: Tier = (profile?.tier as Tier) ?? 'free';

  return { profile, user: profile, tier, loading, updateProfile, refresh };
}
