// components/ui/BootSplash.tsx — what the app shows before it knows who you are.
//
// The root layout used to `return null` while the session resolved, so every
// cold start was: native splash, then a blank frame, then whichever route won.
// Signed-out users then landed on the dark aurora of /onboarding/welcome, which
// meant the blank frame was also a white flash between two dark screens. On a
// slow network — restoring a session on hotel wi-fi — that blank frame is not
// a flicker, it is the first second of the app.
//
// So the hold renders the SAME aurora field the welcome screen and every tab
// hero use. The handoff is then invisible: the background never changes, only
// the content on top of it. That is the whole trick, and it is why this cannot
// be a spinner on a grey page.
//
// No spinner for the first beat, deliberately. A session restore is usually
// imperceptible, and a spinner that appears and vanishes in 80ms reads as a
// glitch. It fades in only if we are still waiting long enough for the user to
// wonder — at which point it is information rather than noise.
import { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, ActivityIndicator, AccessibilityInfo } from 'react-native';
import AuroraBackground from '../Aurora';
import Logo from './Logo';
import { Aurora, Spacing } from '../../lib/theme';

/** How long the app may take before we admit to the user that we are waiting. */
const SPINNER_DELAY_MS = 600;

export default function BootSplash() {
  const logoOpacity    = useRef(new Animated.Value(0)).current;
  const spinnerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (cancelled) return;

      if (reduced) {
        logoOpacity.setValue(1);
      } else {
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }).start();
      }

      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(spinnerOpacity, {
          toValue: 1,
          duration: reduced ? 0 : 240,
          useNativeDriver: true,
        }).start();
      }, SPINNER_DELAY_MS);
    });

    return () => { cancelled = true; clearTimeout(timer); };
  }, [logoOpacity, spinnerOpacity]);

  return (
    <AuroraBackground style={styles.root}>
      <View
        style={styles.center}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading HELOC Hero"
      >
        <Animated.View style={{ opacity: logoOpacity }}>
          <Logo size={46} variant="stacked" />
        </Animated.View>

        <Animated.View style={[styles.spinner, { opacity: spinnerOpacity }]}>
          <ActivityIndicator color={Aurora.glowSoft} />
        </Animated.View>
      </View>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Aurora.deepest },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Reserved height, so the spinner appearing does not shift the logo.
  spinner: { height: 24, justifyContent: 'center', marginTop: Spacing[6] },
});
