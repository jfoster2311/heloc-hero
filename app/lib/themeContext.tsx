// lib/themeContext.tsx — resolving which palette is on screen, and holding it still.
//
// The problem this exists to solve is structural, not stylistic. Every screen in
// this app builds its styles with a module-level `StyleSheet.create`, which runs
// ONCE when the module is first imported and freezes. That is the right default
// — it is why the app has no per-render style allocation anywhere — but it means
// a colour cannot be swapped at runtime by reassigning a token. The sheet was
// built from whatever `Colors` held at import time and will never look again.
//
// So a themed screen has to build its sheet from the palette rather than from
// the module. `createThemedStyles` below is the whole migration path: it keeps
// the create-once property (one sheet per theme, ever, not one per render) while
// making the palette an input.
//
// ── Why the preference is three-valued ─────────────────────────────────────
// 'system' is the default and is not the same as 'light'. Someone on 'system'
// follows iOS when they flip appearance at sunset; someone on 'light' has said
// they want light regardless. Collapsing the two would silently override a
// system-wide accessibility choice, which is exactly what iOS asks apps not to
// do — and would be indistinguishable from a bug the first time their phone
// switched and this app did not.
import {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
  type ReactNode,
} from 'react';
import { useColorScheme, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightTheme, DarkTheme, type Theme, type ThemeMode } from './theme';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Namespaced so it cannot collide with the Supabase session AsyncStorage keys. */
const STORAGE_KEY = 'helochero:appearance';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isPreference(v: string | null): v is ThemePreference {
  return v !== null && (PREFERENCES as readonly string[]).includes(v);
}

interface ThemeContextValue {
  /** The palette to paint with. Always resolved — never null, never 'system'. */
  theme: Theme;
  /** Convenience: `theme.mode`, for the handful of places that branch on it. */
  mode: ThemeMode;
  /** What the USER chose, which may be 'system'. For the Settings control. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /**
   * Whether the stored preference has been read back yet.
   *
   * The root layout holds the splash on this. Without it, someone who chose Dark
   * on a phone set to Light gets a white flash on every cold start while
   * AsyncStorage resolves — a frame of the wrong theme reads as a broken setting,
   * and it would happen on every single launch rather than once.
   */
  hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: LightTheme,
  mode: 'light',
  preference: 'system',
  setPreference: () => {},
  hydrated: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Follows the OS at runtime, not just at launch — this re-renders when the
  // user flips appearance while the app is open, which is the case a
  // launch-time-only read gets wrong.
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => {
        if (cancelled) return;
        if (isPreference(stored)) setPreferenceState(stored);
      })
      // A failed read is not worth surfacing: the default is 'system', which is
      // the right answer for almost everyone and is what an unset install gets.
      .catch(() => {})
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    // State first so the toggle is instant; the write is not on the critical
    // path and a failed write costs one session's preference, not the setting.
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved: ThemeMode =
      preference === 'system'
        ? (systemScheme === 'dark' ? 'dark' : 'light')
        : preference;
    const theme = resolved === 'dark' ? DarkTheme : LightTheme;
    return { theme, mode: resolved, preference, setPreference, hydrated };
  }, [preference, systemScheme, setPreference, hydrated]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The palette. Safe to call from anywhere under the provider. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** For the Settings control and the root layout — the raw three-valued state. */
export function useThemePreference(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Build a screen's StyleSheet from the palette instead of from module scope.
 *
 * Returns a hook. Call it at the top of the component exactly where
 * `const styles = ...` used to sit:
 *
 *     const useStyles = createThemedStyles(t => ({
 *       card: { backgroundColor: t.colors.surface },
 *     }));
 *
 *     function Screen() {
 *       const styles = useStyles();
 *       …
 *     }
 *
 * ── Why a WeakMap and not useMemo ──────────────────────────────────────────
 * `useMemo` would rebuild the sheet once per mounted component per theme. There
 * are exactly two Theme objects in the app and they are module-level constants,
 * so keying a cache on the theme itself means each sheet is built at most twice
 * for the whole process, shared across every instance of the component — the
 * same create-once property the module-level version had. The WeakMap (rather
 * than a Map) keeps this from pinning themes alive if they ever become dynamic.
 */
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T & StyleSheet.NamedStyles<T>,
): () => T {
  const cache = new WeakMap<Theme, T>();

  return function useThemedStyles(): T {
    const theme = useTheme();
    let sheet = cache.get(theme);
    if (!sheet) {
      sheet = StyleSheet.create(factory(theme));
      cache.set(theme, sheet);
    }
    return sheet;
  };
}
