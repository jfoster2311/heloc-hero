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
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSelection } from '../../lib/haptics';
import { Typography, Spacing, Radius, Shadows, TAB_BAR_HEIGHT } from '../../lib/theme';
import { useTheme } from '../../lib/themeContext';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // The bar is the one surface on screen in every single tab, so it was also the
  // most visible thing still painted from the static light palette: in dark mode
  // a white pill floated over five dark screens. Nothing else had to change for
  // that to be wrong everywhere at once.
  const { colors, mode } = useTheme();

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
          ...Shadows.lifted,
          // A drop shadow is what lifts the pill off the page in light mode, and
          // it does almost nothing on a dark canvas — dark-on-dark has no
          // contrast to cast. A hairline does that job instead, so the bar keeps
          // an edge rather than dissolving into the screen behind it.
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
 */
function TabIcon({ name, color, focused }: {
  name: 'home' | 'wallet' | 'calculator' | 'pie-chart' | 'book';
  color: string;
  focused: boolean;
}) {
  return (
    <View style={styles.icon}>
      <Ionicons
        name={(focused ? name : `${name}-outline`) as never}
        size={21}
        color={color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center', height: 24 },
});
