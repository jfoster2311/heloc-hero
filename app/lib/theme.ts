// lib/theme.ts — the whole app's visual vocabulary.
//
// The reference is the reveal screen: a deep-green aurora field carrying a
// display-scale number, dissolving into a pale mint page of soft white cards.
// Every screen is built from those two materials, so the tokens below are
// grouped that way — `Colors` for the light page, `Aurora`/`OnDark` for the
// dark field, and one shared type/space/radius scale across both.
//
// Palette is monochrome green by policy (see CLAUDE.md). There is no red,
// amber, blue or purple in production UI. Status is carried by a text label
// plus saturation, never by hue alone, and negative numbers are muted grey —
// a person's mortgage balance is not an error state.
import { StyleSheet } from 'react-native';

export const Colors = {
  // ── Brand ramp — one hue, many values ────────────────────────────────────
  mint50:  '#F0FDF4',  // tint wash behind chips and info rows
  mint100: '#E8F9F1',  // pale accent, aurora's lightest note
  mint200: '#D8EDE3',  // hairline borders on tinted surfaces
  mint400: '#4ADE80',  // soft accent, secondary marks
  mint600: '#12B76A',  // THE accent — one per screen, ideally
  mint700: '#0F3D22',  // deep green for text on mint tints
  mint800: '#0C2A18',
  mint900: '#081A0F',  // the aurora's floor

  // ── Status ───────────────────────────────────────────────────────────────
  // Kept as named tokens so intent stays readable, but all resolve inside the
  // monochrome system. Severity reads as saturation; the label carries meaning.
  success: '#12B76A',
  warning: '#6B7280',
  error:   '#6B7280',
  info:    '#4ADE80',

  // ── Neutrals ─────────────────────────────────────────────────────────────
  white:   '#FFFFFF',
  gray50:  '#F7FAF8',
  gray100: '#EEF4F0',
  gray200: '#E3ECE6',
  gray300: '#D1DBD5',
  gray400: '#9CA3AF',
  gray500: '#6B7280',

  // ── App surfaces ─────────────────────────────────────────────────────────
  background:    '#F0F7F3',
  surface:       '#FFFFFF',
  surfaceSunken: '#F7FAF8',
  border:        '#D8EDE3',
  borderSubtle:  '#E9F2EC',
  textPrimary:   '#0A0F0D',
  textSecondary: '#374151',
  textMuted:     '#9CA3AF',
};

/** Text and hairlines for anything sitting on the aurora. */
export const OnDark = {
  primary:   '#FFFFFF',
  secondary: 'rgba(255,255,255,0.72)',
  muted:     'rgba(255,255,255,0.55)',
  faint:     'rgba(255,255,255,0.40)',
  hairline:  'rgba(255,255,255,0.12)',
  fill:      'rgba(255,255,255,0.08)',
  fillStrong:'rgba(255,255,255,0.16)',
  accent:    '#4ADE80',
};

export const Typography = {
  // Font sizes
  xs:    12,
  sm:    14,
  base:  16,
  lg:    18,
  xl:    20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,

  // Display sizes — for the one number a screen is about. The reference
  // fintech screens set a balance at this scale and nothing else near it.
  display:   56,
  displaySm: 40,

  // Font weights (string literals for StyleSheet)
  regular:   '400' as const,
  normal:    '400' as const,
  medium:    '500' as const,
  semibold:  '600' as const,
  bold:      '700' as const,
  extrabold: '800' as const,
};

/** Display numerals are tracked tight; micro-labels are tracked wide. */
export const Tracking = {
  display:  -1.6,
  heading:  -0.6,
  eyebrow:   1.4,
  label:     1.0,
};

export const Spacing = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  9:  36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
} as const;

/**
 * The tab bar floats over content rather than docking under it, so every
 * scrolling tab has to reserve room for it. Lives here rather than in
 * tabs/_layout so screens can import it without depending on a route module —
 * expo-router reserves named exports on route files for its own use.
 */
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + 24;

export const Radius = {
  sm:   8,
  md:   12,
  lg:   18,
  xl:   24,
  '2xl': 32,
  full: 9999,
};

export const Shadows = {
  card: {
    shadowColor: '#0A2A1B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  /** For the one card that should float — pinned actions, sheets. */
  lifted: {
    shadowColor: '#0A2A1B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 6,
  },
  modal: {
    shadowColor: '#0A2A1B',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  glow: {
    shadowColor: '#12B76A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
};

export const Gradients = {
  primary: ['#12B76A', '#0F3D22'] as const,
  hero:    ['#0C2A18', '#081A0F'] as const,
};

/**
 * The spend-breakdown ramp — one hue, dark to light, ordered by magnitude.
 *
 * These are NOT the mint tokens above, and the difference is deliberate. The
 * brand ramp is spaced for surfaces and text, so consecutive steps sit close
 * together in lightness: mint800 against mint700 measures ΔE 6.7 to normal
 * vision, which is below the threshold where two arcs of a chart can be told
 * apart at all. Painting a breakdown in them produces a ring that looks
 * correct and cannot be read.
 *
 * These four are re-stepped in the same green to clear both bars — worst
 * adjacent pair ΔE 16.4 to normal vision, 11.3 under deuteranopia. Verified
 * with a palette validator rather than by eye, because "these look different
 * enough" is exactly the judgement people get wrong.
 *
 * FOUR is the ceiling, not a starting point. A single hue cannot carry eight
 * legible steps — past four, adjacent pairs fall back under the floor no
 * matter how they are spaced. A breakdown with more slices than this puts the
 * tail in `neutral` and names it, which is also better charting.
 */
export const CategoryRamp = {
  /** Largest share first. Assign in order; never cycle, never interpolate. */
  steps: ['#08341F', '#0E7043', '#17A863', '#5FDCA0'] as const,
  /** Reserved for the aggregated tail. Neutral on purpose — it is not a rank. */
  neutral: '#9CA3AF',
  /** The track behind an empty or partial ring. */
  track: '#EEF4F0',
};

/** How many arcs the ring may draw before the rest becomes `neutral`. */
export const CATEGORY_RAMP_MAX = CategoryRamp.steps.length;

// Deep-green aurora used by the full-bleed dark screens and every hero block.
// Layered rather than a single ramp: a dark vertical base, a mint glow raked
// across it, and a pale wash at the very top. Grain sits over the whole stack.
export const Aurora = {
  deepest:  '#081A0F',
  deep:     '#0C2A18',
  mid:      '#0F3D22',
  glow:     '#12B76A',
  glowSoft: '#4ade80',
  pale:     '#E8F9F1',

  base:      ['#081A0F', '#0C2A18', '#0F3D22'] as const,
  glowRake:  ['rgba(18,183,106,0.50)', 'rgba(18,183,106,0.10)', 'rgba(18,183,106,0)'] as const,
  paleWash:  ['rgba(232,249,241,0.40)', 'rgba(232,249,241,0)'] as const,
};

export const CommonStyles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  /** The default surface. One border, one soft shadow, generous padding. */
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Shadows.card,
  },
  /** Uppercase micro-label above a value or a section. */
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: Colors.textMuted,
    letterSpacing: Tracking.eyebrow,
  },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  /** The sentence under a figure that states what it means. */
  conclusion: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  hint: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },
});
