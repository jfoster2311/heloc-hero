// app/_layout.tsx
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { initPurchases, identifyPurchaser } from '../lib/purchases';
import LockGate from '../components/LockGate';

export default function RootLayout() {
  const { profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Init RevenueCat on session load and when auth state changes
  useEffect(() => {
    if (loading) return;
    if (profile?.id) {
      initPurchases(profile.id).then(() => identifyPurchaser(profile.id));
    } else {
      initPurchases();
    }
  }, [profile?.id, loading]);

  useEffect(() => {
    if (loading) return;

    const inAuth       = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    const inTabs       = segments[0] === 'tabs';

    // ── DEV-ONLY BYPASS ───────────────────────────────────────────────────────
    // Skip Supabase auth + onboarding guards in development so every tab is
    // reviewable without an email sign-in. __DEV__ is stripped to false by
    // Metro in production builds — this block is dead code in the App Store.
    if (__DEV__) {
      if (!inTabs) router.replace('/tabs/dashboard');
      return;
    }
    // ── END DEV BYPASS ────────────────────────────────────────────────────────

    if (!profile) {
      // Not signed in — land on the welcome / onboarding flow
      if (!inAuth && !inOnboarding) {
        router.replace('/onboarding/welcome');
      }
    } else if (!profile.onboarding_complete) {
      // Signed in but onboarding not finished.
      // Exception: don't redirect while user is on the signup screen — signup.tsx
      // calls onboardingStore.submit() + refresh() to set onboarding_complete: true
      // before navigating, and we must not interrupt that sequence.
      const inSignup = (segments as string[])[1] === 'signup';
      if (!inOnboarding && !inSignup) {
        router.replace('/onboarding/home-info');
      }
    } else {
      // Fully signed in → main app
      if (!inTabs) {
        router.replace('/tabs/dashboard');
      }
    }
  }, [profile, loading, segments]);

  if (loading) return null;

  return (
    <LockGate>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="tabs" />
        <Stack.Screen
          name="modals/upgrade"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/link-account"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/settings"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/get-heloc"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </LockGate>
  );
}
