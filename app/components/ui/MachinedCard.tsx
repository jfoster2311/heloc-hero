// components/ui/MachinedCard.tsx — the Machined Silver surface, as a card.
//
// `Card` in primitives.tsx is the app's default surface: a soft white sheet on
// the pale mint page, and every screen that is about the STRATEGY uses it. This
// is the analytical surface — the same object milled from metal instead of
// paper, for the screens that carry dense measured data.
//
// ── This is a surface, not a palette ───────────────────────────────────────
// Nothing here encodes a value and nothing here is an accent. It describes what
// a card is made of, exactly as CLAUDE.md requires. The greens above it still
// carry every meaning on the screen, and the inks that land on this surface are
// the ones RE-MEASURED against it in lib/theme.ts — `accentInk` rather than
// `mint600`, never `neon`, which measures 2.18–2.28 here.
//
// ── Why the gradient never changes angle ───────────────────────────────────
// Top-left to bottom-right, on every instance, matching `Gradients.machined`'s
// own note. Per-card angles read as several light sources and the metal illusion
// collapses immediately — which is the whole reason this exists as a component
// rather than as a style object each screen spreads for itself.
//
// The dark counterpart is graphite and its stops are only 4% apart in luminance,
// same as light. That is deliberate: a stronger ramp stops looking like brushed
// metal and starts looking like a coloured panel.
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Touchable, PressScale } from './press';
import { Spacing, Radius, Gradients } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Drops the padding, for a card that manages its own insets. */
  bare?: boolean;
}

export default function MachinedCard({
  children, style, onPress, accessibilityLabel, bare,
}: Props) {
  const styles = useStyles();
  const { mode } = useTheme();

  const body = (
    <View style={[styles.shell, !bare && styles.padded, style]}>
      <LinearGradient
        colors={mode === 'dark' ? Gradients.machinedDark : Gradients.machined}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );

  if (!onPress) return body;
  return (
    <Touchable
      onPress={onPress}
      scale={PressScale.surface}
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </Touchable>
  );
}

const useStyles = createThemedStyles(t => ({
  shell: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    // 1.18:1 light, 1.39:1 dark. Decorative, and exempt like every other card
    // border — the fill and the ambient glow draw the object, not this.
    borderColor: t.colors.machinedEdge,
    // Wide, faint and green rather than a black drop shadow, which would grey
    // the silver and kill the metal. See Shadows.ambient in lib/theme.ts.
    ...t.shadows.ambient,
  },
  padded: { padding: Spacing[5] },
}));
