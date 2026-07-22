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
    // Modals (link-account, upgrade, settings, get-heloc) are presented on top of
    // the tab stack. They must NEVER be force-closed by the auth/onboarding guard —
    // otherwise every modal open bounces straight back to the dashboard. This was
    // the "Add accounts → dashboard" bug: pushing /modals/link-account changed
    // segments to ['modals', …], the guard saw !inTabs, and replaced it away.
    const inModals     = segments[0] === 'modals';

    // ── DEV-ONLY BYPASS ───────────────────────────────────────────────────────
    // Skip Supabase auth + onboarding guards in development so every tab is
    // reviewable without an email sign-in. __DEV__ is stripped to false by
    // Metro in production builds — this block is dead code in the App Store.
    if (__DEV__) {
      // Allow onboarding screens so the DEV "restart onboarding" button works,
      // and modals so link-account/upgrade/settings/get-heloc can open.
      // Everything else (auth screens, index, etc.) still lands on /tabs/dashboard.
      if (!inTabs && !inOnboarding && !inModals) router.replace('/tabs/dashboard');
      return;
    }
    // ── END DEV BYPASS ────────────────────────────────────────────────────────

    if (!profile) {
      // Not signed in — land on the welcome / onboarding flow
      if (!inAuth && !inOnboarding && !inModals) {
        router.replace('/onboarding/welcome');
      }
    } else if (!profile.onboarding_complete) {
      // Signed in but onboarding not finished.
      // Exception: don't redirect while user is on the signup screen — signup.tsx
      // calls onboardingStore.submit() + refresh() to set onboarding_complete: true
      // before navigating, and we must not interrupt that sequence.
      const inSignup = (segments as string[])[1] === 'signup';
      if (!inOnboarding && !inSignup && !inModals) {
        router.replace('/onboarding/home-info');
      }
    } else {
      // Fully signed in → main app
      if (!inTabs && !inModals) {
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
