// hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile, Tier } from '../lib/types';

interface AuthState {
  /** The logged-in user's profile row from the `users` table */
  profile: UserProfile | null;
  /** Alias for profile — used by screens that call it `user` */
  user: UserProfile | null;
  tier: Tier;
  loading: boolean;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
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

    // Keep in sync with auth state changes (sign-in / sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
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

  const tier: Tier = (profile?.tier as Tier) ?? 'free';

  return { profile, user: profile, tier, loading, updateProfile };
}
