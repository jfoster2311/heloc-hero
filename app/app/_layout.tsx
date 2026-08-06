// app/_layout.tsx
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { initPurchases, identifyPurchaser } from '../lib/purchases';
import { DEV_AUTH_BYPASS } from '../lib/devFlags';
import { loadDevProMode } from '../lib/devPro';
import {
  configureNotificationHandler, addNotificationResponseListener, readLaunchNotification,
} from '../lib/notify';
import LockGate from '../components/LockGate';
import BootSplash from '../components/ui/BootSplash';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useThemePreference } from '../lib/themeContext';

/**
 * The provider has to sit ABOVE the layout that reads it, so the routing shell
 * moved down into RootLayoutInner and this became a wrapper. Nothing else about
 * the auth/onboarding guard below changed.
 */
export default function RootLayout() {
  return (
    // Required by react-native-gesture-handler, and it must be the OUTERMOST
    // view — gestures inside it are dispatched natively, and anything mounted
    // above it never sees them. A pan handler nested outside this simply never
    // fires, with no error to explain why. `flex: 1` is not optional; without
    // it the tree collapses to zero height and the app renders blank.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutInner() {
  const { profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { mode, hydrated } = useThemePreference();

  // Restore the DEV Pro override before gated screens first render. No-op in production.
  useEffect(() => {
    loadDevProMode();
  }, []);

  // Before anything can be delivered. iOS shows nothing for a notification that
  // arrives while the app is open unless a handler says to, and the cash-threshold
  // prompt is always delivered while the app is open — it is evaluated on a
  // foreground balance refresh. Cheap, guarded, and a no-op in Expo Go.
  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // Where a tapped notification lands.
  //
  // The cash alert's body says "open HELOC Hero to see what is worth moving",
  // and without this it opened on whichever screen the user last had — which
  // makes the sentence a small lie. It routes to the dashboard rather than
  // straight into /modals/move-money because the copy promises to SHOW the
  // figure, and the Safe to Sweep card is where that number lives.
  //
  // Held until the session resolves: navigating before then races the auth
  // guard below, which would bounce the user straight back out again.
  useEffect(() => {
    if (loading || !profile) return;
    let cancelled = false;

    const route = (data: Record<string, unknown>) => {
      if (cancelled) return;
      if (data?.type === 'cash_threshold') router.push('/tabs/dashboard' as never);
    };

    // The cold-start case, which for this alert is the NORMAL one: the push
    // exists precisely to reach someone whose app is closed.
    readLaunchNotification().then((data) => { if (data) route(data); });
    const sub = addNotificationResponseListener(route);

    return () => { cancelled = true; sub?.remove(); };
  }, [loading, profile?.id]);

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

    // ── DEV-ONLY BYPASS (opt-in) ──────────────────────────────────────────────
    // Skips auth + onboarding so every tab is reviewable without an email
    // sign-in. OFF by default: when this was unconditionally on in __DEV__, dev
    // review never exercised a real session, which is how a never-deployed
    // delete-account endpoint and a live/repo schema mismatch both went unseen.
    // Enable deliberately via extra.devAuthBypass in app.json. See lib/devFlags.
    if (DEV_AUTH_BYPASS) {
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

  // Never a blank frame. Resolving the session lands the user on either the dark
  // aurora of /onboarding/welcome or the dark hero of /tabs/dashboard, so the
  // hold uses that same field and the handoff is a content change, not a flash.
  //
  // `hydrated` joins the gate so the first painted frame is already in the
  // user's chosen theme. Reading AsyncStorage is faster than resolving the
  // session, so in practice this adds no time to the splash at all — it just
  // guarantees the ordering rather than relying on the race going our way.
  if (loading || !hydrated) {
    return (
      <>
        <StatusBar style="light" />
        <BootSplash />
      </>
    );
  }

  return (
    <LockGate>
      {/* The bar sits over the page, not the aurora, so it follows the theme.
          tabs/_layout re-declares "light" because every tab opens on a hero. */}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
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
        <Stack.Screen
          name="modals/move-money"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/heloc-terms"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/confirm-terms"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/home-value"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/mortgage-details"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/alert-thresholds"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/assumptions"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/activity"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/budget"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/mortgage-payment"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/heloc-score"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/breakdown"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/reports"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/recurring"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/account-details"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="modals/log-sweep"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </LockGate>
  );
}
