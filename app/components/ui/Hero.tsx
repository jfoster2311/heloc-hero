// components/ui/Hero.tsx — the aurora block that opens a screen.
//
// This is the reveal screen's material, generalised. A screen gets exactly one:
// a full-bleed deep-green field carrying the single number that screen is
// about, dissolving into the pale page beneath it rather than ending on a card
// edge. Everything below the fade is white cards on mint.
//
// Why a component and not a style: the fade, the safe-area padding and the
// grain have to be identical everywhere or the seam between the dark field and
// the page becomes visible, which is the one thing that breaks the effect.
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuroraBackground from '../Aurora';
import { Typography, Spacing, Tracking, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

interface HeroProps {
  /** Uppercase micro-label above the figure. */
  eyebrow?: string;
  /** Row rendered at the very top — title left, actions right. */
  topBar?: React.ReactNode;
  children: React.ReactNode;
  /** Scales the mint glow. Lower it when the hero is tall. */
  intensity?: number;
  /**
   * Colour the hero dissolves into. Defaults to the app background.
   *
   * Resolved from the theme inside the component rather than as a default
   * parameter: a default evaluated at module scope would bake in the LIGHT
   * background forever, and the seam this component exists to hide would
   * reappear as a pale band across the bottom of every dark hero.
   */
  fadeTo?: string;
  /** Adds the top safe-area inset. Off when the screen already handled it. */
  insetTop?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Hero({
  eyebrow,
  topBar,
  children,
  intensity = 0.9,
  fadeTo,
  insetTop = true,
  style,
}: HeroProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <AuroraBackground
      style={[styles.root, insetTop && { paddingTop: insets.top + Spacing[3] }, style]}
      intensity={intensity}
    >
      {topBar}
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {children}

      {/* Dissolves into the page instead of stopping at a hard edge. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', fadeTo ?? colors.background]}
        style={styles.fade}
        pointerEvents="none"
      />
    </AuroraBackground>
  );
}

/** The display numeral a hero exists to carry. */
export function HeroValue({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  const styles = useStyles();
  return (
    <Text
      style={[styles.value, accent && { color: OnDark.accent }]}
      allowFontScaling={false}
    >
      {children}
    </Text>
  );
}

/** The sentence directly beneath a hero figure. A bare number is homework. */
export function HeroCaption({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.caption}>{children}</Text>;
}

export function HeroSublabel({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.sublabel}>{children}</Text>;
}

const useStyles = createThemedStyles(t => ({
  root: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[10],
    gap: Spacing[2],
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Spacing[8],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: OnDark.muted,
    letterSpacing: Tracking.eyebrow,
  },
  value: {
    fontSize: Typography.display,
    lineHeight: Typography.display + 6,
    fontWeight: Typography.extrabold,
    color: OnDark.primary,
    letterSpacing: Tracking.display,
  },
  caption: {
    fontSize: Typography.base,
    lineHeight: 23,
    color: OnDark.secondary,
  },
  sublabel: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: OnDark.muted,
    letterSpacing: Tracking.label,
  },
}));
