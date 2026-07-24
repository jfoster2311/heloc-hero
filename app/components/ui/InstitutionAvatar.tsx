// components/ui/InstitutionAvatar.tsx — the circle next to a linked account.
//
// The reference apps show real bank logos. We cannot yet: linked_accounts
// stores institution_name and nothing else — no institution_id, no logo, no
// brand colour. Plaid does return all three from /institutions/get_by_id with
// include_optional_metadata, but wiring that up needs a column, a migration and
// an edge-function change. Until then this is the honest stand-in.
//
// Deliberately NOT an approximation of a bank's logo. Drawing a blue circle
// with a "C" for Chase is trade dress worn without permission, and getting it
// slightly wrong looks worse than not trying. This is plainly the app's own
// object: a monogram on a tint from the app's own green ramp, with the
// institution's real name always shown beside it.
//
// The tint is derived from the name so it is stable — Chase is the same shade
// every launch and across devices — and picked from a fixed palette so it can
// never land outside the monochrome-green system.
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '../../lib/theme';
import type { PlaidAccountType } from '../../lib/types';

/** Tints from the brand ramp only. Index chosen by a hash of the name. */
const TINTS = [
  { bg: '#0F3D22', fg: '#4ADE80' },
  { bg: '#0C2A18', fg: '#12B76A' },
  { bg: '#12B76A', fg: '#062D18' },
  { bg: '#4ADE80', fg: '#0C2A18' },
  { bg: '#081A0F', fg: '#4ADE80' },
] as const;

/** Stable across launches and devices: same name in, same tint out. */
function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

/**
 * Up to two initials. "Bank of America" → "BA", "Chase" → "CH".
 *
 * Skips the filler words that would otherwise produce a meaningless "OF".
 */
function initialsFor(name: string): string {
  const skip = new Set(['of', 'the', 'and', 'bank', 'credit', 'union', 'fcu', 'na']);
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  const meaningful = words.filter(w => !skip.has(w.toLowerCase()));
  const use = meaningful.length > 0 ? meaningful : words;

  if (use.length === 0) return '?';
  if (use.length === 1) return use[0].slice(0, 2).toUpperCase();
  return (use[0][0] + use[1][0]).toUpperCase();
}

const TYPE_ICON: Record<PlaidAccountType, keyof typeof Ionicons.glyphMap> = {
  mortgage: 'home',
  'home equity': 'card',
  savings: 'wallet',
};

export default function InstitutionAvatar({ name, accountType, size = 40 }: {
  /** The institution's real name. Null falls back to the account-type icon. */
  name: string | null;
  accountType: PlaidAccountType;
  size?: number;
}) {
  const tint = tintFor(name ?? accountType);

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {name ? (
        <Text
          style={[styles.initials, { color: tint.fg, fontSize: size * 0.36 }]}
          allowFontScaling={false}
        >
          {initialsFor(name)}
        </Text>
      ) : (
        <Ionicons name={TYPE_ICON[accountType]} size={size * 0.44} color={tint.fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  initials: {
    fontWeight: Typography.extrabold,
    letterSpacing: 0.3,
  },
});
