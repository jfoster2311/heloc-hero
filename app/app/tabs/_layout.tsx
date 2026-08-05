// app/tabs/_layout.tsx — a floating bar, not a docked one.
//
// Two reasons this is worth the extra care over the default. The reference
// fintech screens all float the bar over the content, which is what lets a
// hero bleed to the bottom of the viewport instead of stopping at a chrome
// edge. And a floating bar over a scrolling page keeps the content visible
// underneath it, which matters here because the pinned decision on the
// dashboard lives in the same thumb zone.
//
// Because the bar is absolutely positioned, every tab's scroll content must
// clear it — see TAB_BAR_CLEARANCE, which those screens import rather than
// each inventing their own bottom padding.
import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSelection } from '../../lib/haptics';
import { useReduceMotion } from '../../components/ui/press';
import { Typography, Spacing, Radius, TAB_BAR_HEIGHT } from '../../lib/theme';
import { useTheme } from '../../lib/themeContext';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // The bar is the one surface on screen in every single tab, so it was also the
  // most visible thing still painted from the static light palette: in dark mode
  // a white pill floated over five dark screens. Nothing else had to change for
  // that to be wrong everywhere at once.
  const { colors, mode, shadows } = useTheme();

  return (
    <>
      {/* Every tab opens on the aurora, so the clock and battery have to be
          light. Modals re-declare it as dark when they slide over the top. */}
      <StatusBar style="light" />
      <Tabs
      screenOptions={{
        headerShown: false,
        // `accentInk`, not `mint600`, and this is the one control in the app
        // where that distinction is most expensive to get wrong. The tint paints
        // BOTH the icon and a 10pt label — text, at the size that needs 4.5:1 —
        // and `mint600` on the bar's white fill measures 2.62:1. It is the exact
        // failure the token exists for, and it was here on all five tabs of every
        // screen. `accentInk` is 5.00:1 in light and IS `mint600` in dark, so
        // this costs nothing on the theme that already passed at 8.34:1.
        //
        // It also fixes a second thing: at 2.62 against the inactive 2.54 the two
        // states were separated by hue alone. They now differ in luminance too,
        // reinforcing the filled/outline swap below rather than leaning on it.
        tabBarActiveTintColor:   colors.accentInk,
        tabBarInactiveTintColor: colors.gray400,
        tabBarStyle: {
          position: 'absolute',
          left: Spacing[4],
          right: Spacing[4],
          bottom: Math.max(insets.bottom, Spacing[3]),
          height: TAB_BAR_HEIGHT,
          paddingTop: Spacing[2],
          paddingBottom: Spacing[2],
          paddingHorizontal: Spacing[2],
          borderRadius: Radius.full,
          borderTopWidth: 0,
          backgroundColor: colors.surface,
          // The THEME's lifted shadow, not the static one. This read the light
          // token in both themes, and the light token is tuned to darken a pale
          // page — at 0.10 opacity it is invisible over a near-black one, which
          // is exactly why DarkShadows exists at 0.55. The bar floats over
          // scrolling content, so it is the surface with the most to gain from
          // an elevation that actually renders.
          ...shadows.lifted,
          // The hairline stays, and is not now redundant. It was added because
          // the light shadow did nothing here on dark; the dark shadow does the
          // lifting, and the hairline still draws the EDGE — which is the job
          // theme.ts assigns it on a theme where a border carries what a shadow
          // cannot. Together they read as a raised pill rather than a smudge.
          ...(mode === 'dark' ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null),
        },
        tabBarItemStyle: { borderRadius: Radius.full },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: Typography.semibold,
          marginTop: -2,
        },
      }}
      screenListeners={{
        // Selection feedback on every tab change. The bar floats over the
        // content with no chrome edge to press against, so touch is the only
        // confirmation the tap registered — worth more here than on a docked
        // bar. Fires on tabPress rather than on focus so it lands with the
        // finger, and so re-tapping the current tab still responds.
        tabPress: () => hapticSelection(),
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="wallet" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: 'Calculator',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="calculator" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cashflow"
        options={{
          title: 'Cash flow',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="pie-chart" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="book" color={color} focused={focused} />
          ),
        }}
      />
      </Tabs>
    </>
  );
}

/**
 * Filled when active, outline when not.
 *
 * The weight change carries the state on its own, so the mint tint is
 * reinforcement rather than the only signal — which is the same rule the rest
 * of the app follows for status.
 *
 * ── Why it springs ────────────────────────────────────────────────────────
 * The outline→filled swap used to happen on a single frame, which is a state
 * change rather than a response: the most-touched control in the app was also
 * the only one that gave nothing back. A short spring on arrival makes the tap
 * land on something.
 *
 * It animates only INTO focus, never out. Both directions would leave two icons
 * moving at once every time you switch tabs, which reads as the bar being
 * unsettled rather than as the new tab arriving — the departing tab should
 * simply stop being the answer.
 */
function TabIcon({ name, color, focused }: {
  name: 'home' | 'wallet' | 'calculator' | 'pie-chart' | 'book';
  color: string;
  focused: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!focused || reduceMotion) return;
    // From slightly under, not over. Overshooting first reads as a bounce and
    // draws the eye to the chrome; settling UP into place reads as the icon
    // taking its position, which is the thing that actually happened.
    scale.setValue(0.86);
    Animated.spring(scale, {
      toValue: 1,
      speed: 18,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [focused, reduceMotion, scale]);

  return (
    <View style={styles.icon}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={(focused ? name : `${name}-outline`) as never}
          size={21}
          color={color}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center', height: 24 },
});
