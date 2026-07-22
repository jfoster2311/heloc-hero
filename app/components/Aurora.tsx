// components/Aurora.tsx — full-bleed deep-green aurora background with film grain.
//
// Approximates a mesh gradient by stacking three linear passes: a dark vertical
// base, a mint glow raked diagonally across it, and a pale wash at the top edge.
// The tiled noise on top is what keeps it from reading as a flat CSS gradient.
import { View, Image, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Aurora as A } from '../lib/theme';

const NOISE = require('../assets/noise.png');

/** Tiled grain. Kept separate so screens can lay it over their own artwork. */
export function Grain({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Image
        source={NOISE}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFillObject, { opacity }]}
      />
    </View>
  );
}

interface AuroraProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scales the mint glow. 0 gives a near-black field, 1 the full aurora. */
  intensity?: number;
  grain?: number;
}

export default function AuroraBackground({
  children,
  style,
  intensity = 1,
  grain = 0.05,
}: AuroraProps) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient colors={A.base} style={StyleSheet.absoluteFillObject} />

      {/* Mint glow raked from upper-left toward lower-right */}
      <LinearGradient
        colors={A.glowRake}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 0.8 }}
        style={[StyleSheet.absoluteFillObject, { opacity: intensity }]}
      />

      {/* Pale wash along the top edge — the light that makes it read as aurora */}
      <LinearGradient
        colors={A.paleWash}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.42 }}
        style={[StyleSheet.absoluteFillObject, { opacity: intensity }]}
      />

      <Grain opacity={grain} />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
});
