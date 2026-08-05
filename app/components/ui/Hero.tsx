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
  /**
   * How far the dissolve runs. Defaults to the standard band.
   *
   * A knob rather than a constant because the right length depends on how tall
   * the hero above it is: a hero carrying one numeral ends soon after the eye
   * arrives, and 32pt is plenty to land it on the page. The dashboard's hero
   * also carries a board and a disclaimer, so the field is deep enough that the
   * same 32pt reads as a hard edge with a stripe on it rather than a dissolve.
   */
  fadeHeight?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * `#RRGGBB` → `rgba(r,g,b,a)`, and null for anything it does not recognise.
 *
 * Exists for one reason, which is a real artefact rather than a nicety: a
 * gradient from `rgba(0,0,0,0)` to an opaque colour does NOT fade to that
 * colour — it interpolates through transparent BLACK, so the midpoint of the
 * seam is a half-opaque grey. Over a deep green field dissolving into a pale
 * mint page that lands as a dark smudge across the full width of the screen,
 * about a third of the way down the very band whose entire job is to be
 * invisible. Fading the target colour's own alpha from 0 to 1 has no midpoint
 * to go wrong.
 */
function alphaOf(color: string, a: number): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export default function Hero({
  eyebrow,
  topBar,
  children,
  intensity = 0.9,
  fadeTo,
  insetTop = true,
  fadeHeight = Spacing[8],
  style,
}: HeroProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const target = fadeTo ?? colors.background;
  const clear = alphaOf(target, 0);
  // Three stops rather than two: a straight ramp puts half the colour in the
  // first half of the band, which reads as the field ending early and then a
  // flat strip. Weighting the arrival late keeps the field looking continuous
  // until it is genuinely gone.
  const fadeColors: readonly [string, string, ...string[]] = clear
    ? [clear, alphaOf(target, 0.55)!, target]
    : ['rgba(0,0,0,0)', target, target];

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
        colors={fadeColors}
        locations={[0, 0.62, 1]}
        style={[styles.fade, { height: fadeHeight }]}
        pointerEvents="none"
      />
    </AuroraBackground>
  );
}

/**
 * The display numeral a hero exists to carry.
 *
 * ── Why this is not `allowFontScaling={false}` any more ────────────────────
 * It was, and that traded away the wrong thing. Turning scaling off entirely
 * means a user on Larger Text gets no help at all on the single most important
 * figure in the app — the payoff date, the equity, the projection — while every
 * caption around it grows. That is backwards.
 *
 * The reason it was switched off is real, though: this text is 56pt and the
 * dashboard's own content is a month and a year. "September 2037" at 56pt with
 * display tracking runs about 420pt, against roughly 358pt of usable width on a
 * standard phone — so it was already overflowing at 1.0x, before any
 * accessibility multiplier touched it.
 *
 * So the fix is the one NavTile already uses in this same file's neighbour:
 * let it scale, cap how far, and shrink to fit rather than wrap or clip. A long
 * value now sets a little smaller instead of breaking the hero, and a user who
 * asked for larger text gets larger text.
 */
export function HeroValue({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  const styles = useStyles();
  return (
    <Text
      style={[styles.value, accent && { color: OnDark.accent }]}
      // 1.3x of 56pt is already 73pt. Past that the figure stops being readable
      // as one unit at arm's length, and shrink-to-fit would claw it all back
      // anyway — so the cap is where the two behaviours stop fighting.
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
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
  // Height comes from the fadeHeight prop; everything else is fixed so the
  // band cannot drift between screens.
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
