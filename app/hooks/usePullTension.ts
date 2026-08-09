// hooks/usePullTension.ts — the pull itself, felt.
//
// `RefreshControl` gives you a spinner and a callback and nothing in between, so
// the most physical gesture in the app — dragging a screen down to force a
// refresh — had no feedback until the moment it fired. The user pulls into
// silence, and the only confirmation arrives after the decision was already
// made.
//
// This reads the overscroll off the ScrollView and ticks a selection haptic
// every `PULL_DETENT` points, so the pull feels like tension building against a
// spring. It stops ticking at the trigger point rather than continuing forever:
// the ticks are saying "you are getting there", and past there they would be
// saying it about something that has already happened.
//
// ── Why this is not on the UI thread ───────────────────────────────────────
// Every other gesture in this app runs through Reanimated worklets, and this one
// deliberately does not. `RefreshControl` is a platform component whose pull
// distance is not exposed to the UI thread at all — reproducing it with a pan
// would mean rebuilding the whole refresh affordance, including its spinner, its
// interaction with the scroll bounce, and its accessibility behaviour, in order
// to add haptics to it. `onScroll` at 16ms is accurate enough for a detent every
// 14 points, and the haptic call itself has to hop to the JS thread regardless.
import { useCallback, useRef } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { hapticSelection } from '../lib/haptics';

/**
 * Points of pull per tick.
 *
 * 14 is the same reasoning as SweepSlider's 12px detent: small enough that a
 * deliberate pull ticks several times, large enough that it reads as notches
 * rather than as a buzz. Tuned against a ~90pt typical trigger distance, which
 * gives about six ticks across the gesture.
 */
const PULL_DETENT = 14;

/**
 * Where the ticking stops, in points of overscroll.
 *
 * iOS does not publish RefreshControl's trigger distance, so this is an
 * approximation of it rather than a reading. It only has to be close: being a
 * few points out means the last tick lands slightly before or after the
 * spinner engages, which nobody can perceive. Being absent means the ticks run
 * on into a gesture that has already committed, which everybody can.
 */
const PULL_TRIGGER = 96;

export function usePullTension(enabled = true) {
  const lastDetent = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!enabled) return;
    // Negative y is overscroll at the top. Anything at or below zero is ordinary
    // scrolling and resets the ladder, so a long scroll back up to the top does
    // not arrive with a stale detent count and swallow the first tick.
    const pull = -e.nativeEvent.contentOffset.y;
    if (pull <= 0) { lastDetent.current = 0; return; }

    const detent = Math.min(
      Math.floor(PULL_TRIGGER / PULL_DETENT),
      Math.floor(pull / PULL_DETENT),
    );
    if (detent > lastDetent.current) {
      lastDetent.current = detent;
      hapticSelection();
    } else if (detent < lastDetent.current) {
      // Easing back up re-arms the ticks already passed, so a pull that is
      // released halfway and pulled again feels the same both times.
      lastDetent.current = detent;
    }
  }, [enabled]);

  return { onScroll, scrollEventThrottle: 16 as const };
}
