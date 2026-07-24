// components/ui/Logo.tsx — the mark and wordmark, in one place.
//
// ─────────────────────────────────────────────────────────────────────────────
//  SWAP POINT — the mark below is a placeholder, not final artwork.
//
//  When the designed logo arrives, replace ONLY the <Mark /> function. Every
//  surface that shows brand identity goes through this file, so the swap is one
//  edit rather than a hunt. If the final mark ships as an image, drop it in
//  assets/ and render <Image source={require('../../assets/mark.png')} /> with
//  the same width/height props — nothing else here needs to change.
// ─────────────────────────────────────────────────────────────────────────────
//
// The placeholder is not arbitrary. It is the Freedom Board motif compressed to
// nine tiles: four solid (the years you pay), five hollow (the years the
// strategy removes). Splash, dashboard and app icon then all say the same
// thing, and whoever designs the real mark has a concrete idea to work from
// rather than a blank brief.
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Typography, Spacing, Aurora } from '../../lib/theme';

interface Props {
  /** Height of the mark in points. The wordmark scales from it. */
  size?: number;
  /** 'stacked' puts the wordmark under the mark; 'inline' sets them side by side. */
  variant?: 'stacked' | 'inline';
  /** Mark only, no wordmark — for tab bars and nav headers. */
  markOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Logo({
  size = 40,
  variant = 'inline',
  markOnly = false,
  style,
}: Props) {
  return (
    <View
      style={[
        variant === 'stacked' ? s.stacked : s.inline,
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel="HELOC Hero"
    >
      <Mark size={size} />
      {!markOnly && <Wordmark scale={size / 40} />}
    </View>
  );
}

/** PLACEHOLDER ARTWORK — see the swap note at the top of this file. */
function Mark({ size }: { size: number }) {
  const pad = size * 0.16;
  const gap = size * 0.07;
  const cell = (size - pad * 2 - gap * 2) / 3;

  // Reading order, top-left to bottom-right. Solid tiles form the descending
  // step that the dashboard board draws at full length.
  const solid = [true, true, true, true, false, false, false, false, false];

  return (
    <View style={[s.mark, { width: size, height: size, borderRadius: size * 0.26, padding: pad }]}>
      <View style={[s.grid, { gap }]}>
        {solid.map((isSolid, i) => (
          <View
            key={i}
            style={[
              s.cell,
              { width: cell, height: cell, borderRadius: Math.max(1, cell * 0.2) },
              isSolid ? s.cellSolid : s.cellHollow,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function Wordmark({ scale }: { scale: number }) {
  return (
    <View>
      <Text style={[s.kicker, { fontSize: 10 * scale, letterSpacing: 7 * scale }]}>
        HELOC
      </Text>
      <Text style={[s.word, { fontSize: 22 * scale, letterSpacing: 2 * scale }]}>
        HERO
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  stacked: { alignItems: 'flex-start', gap: Spacing[3] },

  mark: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell: { borderWidth: 1 },
  cellSolid: { backgroundColor: Aurora.glow, borderColor: Aurora.glow },
  cellHollow: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.30)' },

  kicker: {
    fontWeight: Typography.extrabold,
    color: 'rgba(255,255,255,0.42)',
  },
  word: {
    fontWeight: Typography.extrabold,
    color: '#ffffff',
    marginTop: 1,
  },
});
