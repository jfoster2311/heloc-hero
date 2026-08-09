// hooks/useStatusBarStyle.ts — the clock and the battery, per screen.
//
// `app/tabs/_layout` declares `<StatusBar style="light" />` once for all five
// tabs, on the reasoning that every tab opened on the dark aurora. That stopped
// being true the moment a tab replaced its aurora hero with a light surface —
// the dashboard did it first, and the Cash flow tab does it now — and a light
// status bar over a pale canvas is white text on near-white: the time and the
// battery simply vanish.
//
// The obvious fix does not work here. `<StatusBar>` from expo-status-bar applies
// on MOUNT, and React Navigation keeps a tab mounted once it has been visited,
// so a per-screen element would set the style the first time a tab was opened
// and then never correct it on the way back. This drives it off FOCUS instead,
// which is the event that actually corresponds to "this screen is on screen".
//
// Tabs that still open on the aurora need nothing — the layout's declaration is
// their default, and this hook only speaks for the screens that differ.
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle, type StatusBarStyle } from 'expo-status-bar';

export function useStatusBarStyle(style: StatusBarStyle) {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
      // No teardown that restores 'light'. Restoring on blur would race the
      // incoming screen's own call — whichever ran last would win, and the order
      // is not guaranteed. Every screen declaring what it wants on focus is the
      // only version of this that is deterministic.
    }, [style]),
  );
}
