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
  // 50–300 are SURFACES and are green-derived like everything else.
  // 400/500 are the two deliberate neutrals — see the note on `textMuted`.
  white:   '#FFFFFF',
  gray50:  '#F4FAF6',
  gray100: '#E8F3EB',
  gray200: '#DCEDE2',
  gray300: '#C6DDCE',
  gray400: '#9CA3AF',
  gray500: '#6B7280',

  // ── App surfaces ─────────────────────────────────────────────────────────
  //
  // ── Why the text ramp is green and the status greys are not ──────────────
  // Body ink used to be a neutral slate (`#374151`) and muted ink a neutral
  // grey. Both are now green, so the page has no un-derived neutral in it.
  //
  // `gray400`/`gray500` below stay neutral, and that is not an oversight or a
  // leftover. They are the ONLY things in the app allowed to be neutral, and
  // they earn it twice over: CLAUDE.md names those exact hexes for negative
  // numbers, and `Semantic` depends on their neutrality — an over-ceiling bar
  // drawn in the green ramp would sit adjacent to the on-track green, turning
  // "nearly over" and "over" into a judgement about a shade, and a selection
  // drawn in mint would read as approval of whatever is selected. Greening them
  // would not make the app more monochrome; it would make severity unreadable
  // and force the red this palette exists to avoid.
  //
  // The canvas is NOT `#F0FDF4`. That value is already `mint50` above — the
  // wash behind every chip and info row — so using it here would paint those
  // chips in exactly the page colour and delete them. This sits a step deeper,
  // which preserves the same separation the light theme has always had.
  background:    '#ECF7EF',
  surface:       '#FFFFFF',
  surfaceSunken: '#F4FAF6',
  border:        '#D8EDE3',
  borderSubtle:  '#E9F2EC',
  // Measured on white / on the canvas:
  textPrimary:   '#0C2E1A',  // 14.8:1 / 14.1:1 — deep forest, still authoritative
  textSecondary: '#2F6242',  //  7.1:1 /  6.8:1 — moss, comfortable at body size
  // 3.7:1 / 3.5:1. This REPLACES `#9CA3AF`, which measured 2.54:1 on white and
  // had been failing contrast for as long as it has existed — a pre-existing
  // bug found while measuring the greens rather than eyeballing them. Still
  // muted, now legible. Labels and hints only; never a lone value.
  textMuted:     '#6E8C7B',
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

/**
 * The three states that would be hue in a conventional fintech palette.
 *
 * Budgeting UI leans hard on colour: red for over-budget, blue for "linked to an
 * account", grey for "this is the bar you tapped". This app has one hue, so each
 * of those gets a named slot here rather than a colour picked at the call site.
 *
 * Two things this buys, and they are the whole reason the indirection exists:
 *
 *   1. Every over-ceiling mark in the app resolves through `overCeiling`. There
 *      is exactly one place to change if the palette policy ever changes, and
 *      exactly one place to read if you want to know what the policy IS.
 *   2. It documents the intent that the colour cannot. `warning: '#6B7280'`
 *      looks like a mistake; `overCeiling` with this comment does not.
 *
 * ── Why these values and not red/blue ──────────────────────────────────────
 * CLAUDE.md forbids red, amber, blue and purple in production UI, and the
 * reasoning holds under a budgeting feature: this app shows people numbers about
 * their house, and a red bar reads as an error when the user has simply spent
 * more than they planned. So severity is carried the way it is carried
 * everywhere else here — by saturation, by an explicit word, and by an icon.
 *
 * The rule that makes this work: NOTHING may be signalled by these tokens
 * alone. An over-ceiling row is grey AND says "over". A linked-account row has a
 * ring AND an accessibility label. Remove the colour entirely and every state on
 * screen is still legible — which is also what makes it survive colour-blindness
 * and greyscale, so it is not merely a policy workaround.
 */
export const Semantic = {
  /**
   * A category whose spend has passed the ceiling the user set.
   *
   * Muted grey, never red, and never the mint used for on-track — those two must
   * not be adjacent values of one scale, or "nearly over" and "over" become a
   * judgement about a shade. Always paired with the word "over".
   */
  overCeiling: Colors.gray500,
  /** The track a ceiling bar is drawn in, over-budget or not. */
  ceilingTrack: Colors.gray100,
  /** On track, and below the ceiling. The one positive mark on a budget row. */
  underCeiling: Colors.mint600,

  /**
   * Marks a row as tied to a specific linked account.
   *
   * Drawn as a ring rather than a filled dot: a filled mint dot at this size is
   * the same mark the app uses for "on track", and the two appearing in one row
   * would collide. The ring is a different SHAPE, which is what carries it.
   */
  linkedAccount: Colors.mint600,

  /**
   * "This is the bar/month you tapped" — carries no value judgement.
   *
   * Deliberately neutral and deliberately NOT part of the green scale: a
   * selection drawn in mint would read as approval of whatever is selected. An
   * outline, so it layers over a bar whose own fill already means something.
   */
  selected: Colors.gray400,

  /**
   * A row excluded from every total — a duplicate the user has hidden.
   *
   * Opacity, not colour, because the row is not a different KIND of thing; it is
   * the same thing, not counted. Paired with an eye-off icon so the state is
   * still visible to someone who cannot see the dimming.
   */
  hiddenOpacity: 0.4,
} as const;

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

// ─────────────────────────────────────────────────────────────────────────────
// DARK
// ─────────────────────────────────────────────────────────────────────────────
//
// The dark theme is SELECTED, not computed. Nothing below is an inversion of the
// light palette — an inverted `#F0F7F3` page is a grey that has nothing to do
// with this brand, and an inverted text ramp puts pure white on pure black at a
// contrast the eye reads as vibration.
//
// ── The one rule that shapes the whole thing ───────────────────────────────
// The aurora is ALREADY dark, and it has to keep reading as a distinct field
// rather than dissolving into the page behind it. So the dark page sits BELOW
// the aurora's own floor (`#081A0F`) rather than beside it: background `#070E0B`
// is darker and less saturated than anything in the hero, and cards rise off it.
// The result is the same figure-ground relationship as the light theme — a
// distinct hero over a page of raised cards — rather than one flat dark smear.
//
// ── Why the gray ramp is not inverted wholesale ────────────────────────────
// `gray50`–`gray300` are FILLS (tracks, tinted rows, sunken wells) and darken.
// `gray400`/`gray500` are INK — muted labels, and every negative number in the
// app, which CLAUDE.md requires be grey rather than red. Inverting those two
// along with the rest would push them to near-black and make every negative
// figure invisible on a dark card. They lighten instead. The split is semantic,
// not positional, which is exactly why it has to be written down.

/**
 * Structural types for the two token groups declared `as const`.
 *
 * `typeof Semantic` and `typeof CategoryRamp` pin the LIGHT hex strings as
 * literal types, so a dark counterpart annotated with them cannot compile. These
 * describe the shape instead, which is what both themes actually share.
 */
export interface SemanticTokens {
  overCeiling:   string;
  ceilingTrack:  string;
  underCeiling:  string;
  linkedAccount: string;
  selected:      string;
  hiddenOpacity: number;
}

export interface CategoryRampTokens {
  steps:   readonly string[];
  neutral: string;
  track:   string;
}

export const DarkColors: typeof Colors = {
  // ── Brand ramp ───────────────────────────────────────────────────────────
  // The pale end and the deep end swap roles: on a dark card the *tints* are
  // deep greens and the *ink* is the bright mint.
  mint50:  '#0B1F16',  // tint wash behind chips and info rows
  mint100: '#0E2A1D',  // pale accent's counterpart
  mint200: '#1B3B2B',  // hairline borders on tinted surfaces
  mint400: '#4ADE80',  // soft accent, secondary marks — unchanged, reads well on dark
  mint600: '#25D07E',  // THE accent, lifted slightly so it holds against a dark card
  mint700: '#7DE9AE',  // text on mint tints — inverted role: light ink on deep tint

  // 800 and 900 do NOT invert, and this is the exception worth reading.
  //
  // Every other deep-green token here flipped to a light one because its role is
  // ink. These two are FILLS: `mint800` is the active period pill (white label on
  // a solid green), `mint900` is a card that sits on the aurora rather than on
  // the page. Both are meant to read as a filled dark green against a lighter
  // neighbour, and both keep doing that on a dark page. Flipping them would have
  // put white pill text on a pale mint fill — the label disappears — and turned
  // the on-aurora cards into pale blocks floating on a dark field.
  //
  // They are lifted rather than copied, so a filled pill still separates from
  // the darker page behind it instead of merging with it.
  mint800: '#134F32',
  mint900: '#0A2417',

  // ── Status ───────────────────────────────────────────────────────────────
  // Still monochrome. Still no red. Severity is saturation plus the label.
  success: '#25D07E',
  warning: '#98A79F',
  error:   '#98A79F',
  info:    '#4ADE80',

  // ── Neutrals ─────────────────────────────────────────────────────────────
  // 50–300 are fills and darken; 400/500 are ink and lighten. See the note above.
  //
  // `white` stays white in both themes, which looks like an oversight and is not.
  // Every one of its ~31 call sites is `color:` or `thumbColor:` — ink on a
  // FILLED mint control (an active pill, a primary button, a switch thumb), and
  // not one is a background. Those controls are mint in both themes, so their
  // ink is white in both themes. Redefining this to the card colour would have
  // turned every switch thumb into a dark hole and inverted every button label,
  // for the sake of a token that would then no longer mean what it is named.
  white:   '#FFFFFF',
  // These are fills laid ON a card, so on dark they sit slightly ABOVE it, not
  // below. Light's `gray50`/`gray100` are a hair darker than a white card; their
  // counterparts are a hair lighter than a dark one. Copying the direction
  // instead of the role would make every track and tinted row vanish.
  gray50:  '#17251D',
  gray100: '#1C2B22',
  gray200: '#223228',
  // Mixed-role, and pitched for the harder of its two jobs. It is a subtle fill
  // in three places and a deliberately faint MARK in three others — the dashed
  // budget-ceiling line, a recessive chevron, a legend swatch. A value chosen
  // only as a fill would be a shade off the card and those marks would vanish,
  // so this sits high enough to stay visible as ink while still reading as
  // recessive when it is a surface.
  gray300: '#4B6153',
  // ── Why these two are green here and neutral in the light theme ──────────
  // Not an inconsistency, though it looks like one. The LIGHT values are pinned
  // by name: CLAUDE.md specifies `#6B7280`/`#9CA3AF` for negative numbers, so
  // they stay exactly those. No such hex is mandated for dark, so the dark
  // counterparts derive the same ROLE — muted, and unmistakably not the accent —
  // on the brand hue instead of borrowing a slate that belongs to no palette
  // here. At chroma ~0.025 against `mint600`'s 0.177 they remain a seventh as
  // saturated as the accent, which is what the role actually requires.
  gray400: '#899B90',  // muted ink — negative numbers live here
  gray500: '#A0B1A6',  // slightly LIGHTER than gray400, mirroring the light ramp's
                       // relationship where gray500 is the stronger of the two

  // ── App surfaces ─────────────────────────────────────────────────────────
  background:    '#050F09',  // below the aurora's floor, so the hero still reads
  surface:       '#132018',  // the card — the surface every ΔE check below is against
  surfaceSunken: '#0C1811',
  // Stronger against its card than the light border is against white (1.47:1 vs
  // 1.23:1), and deliberately so: in light, a card's edge is drawn by the border
  // AND the shadow together. Here the shadow contributes nothing, so the border
  // has to carry the whole edge on its own.
  // Re-measured after the hue shift rather than assumed. Preserving OKLCH
  // lightness does NOT preserve WCAG luminance once chroma moves, so the first
  // re-derivation quietly dropped this edge from 1.47:1 to 1.25:1 — back to the
  // light theme's strength, on the theme that has no shadow to help it. These
  // two are picked against the ratio directly.
  border:        '#2F4237',  // 1.57:1 vs the card — the edge, doing all the work
  borderSubtle:  '#233229',  // 1.25:1
  // ── The text ramp, re-derived on the brand hue ──────────────────────────
  // This was the least green part of the palette, and the audit is what found
  // it: every dark SURFACE already carried real green (chroma ~0.02) while the
  // ink sat at 0.012 — effectively achromatic. The theme read colder than its
  // light counterpart because the body copy was grey on a green page.
  //
  // Re-derived at hue 158 with the LIGHTNESS PRESERVED, which is what makes the
  // change safe: chroma moves, L does not, so every ratio below is equal to or
  // better than the value it replaced.
  textPrimary:   '#DEF8E8',  // 15.0:1 on the card — not pure white, which vibrates
  textSecondary: '#98C0A7',  //  8.4:1
  textMuted:     '#738E7E',  //  4.7:1 — clears AA, unlike most muted greys
};

/**
 * Elevation on dark, which shadows cannot carry.
 *
 * A drop shadow works by darkening the surface beneath a card. On a near-black
 * page there is nothing left to darken, so the light theme's four shadow tokens
 * render as nothing at all and every card goes flat — including the floating tab
 * bar, which then has no edge against the content scrolling under it.
 *
 * So dark elevation is carried two ways instead, and both are already in the
 * system: the raised surface is LIGHTER than the page, and it wears a hairline.
 * The shadow objects are kept (same keys, so no call site changes) at a much
 * higher opacity — that still does useful work under the one case where a dark
 * card overlaps another dark card, which is the sheets.
 *
 * `#020D08` rather than `#000000`, matching the light theme's green `#0A2A1B`.
 * The honest note: at this darkness the two are within rounding distance of each
 * other — the page itself is at luminance 0.0039 and the shadow at 0.0032, so
 * there is almost no room left to darken and the visible difference is nil. It
 * is green-derived (hue 167) for consistency, and the border above is what
 * actually draws the edge.
 */
export const DarkShadows: typeof Shadows = {
  card: {
    shadowColor: '#020D08',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 2,
  },
  lifted: {
    shadowColor: '#020D08',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 6,
  },
  modal: {
    shadowColor: '#020D08',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.50,
    shadowRadius: 18,
    elevation: 4,
  },
  glow: {
    shadowColor: '#25D07E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 5,
  },
};

/**
 * The dark breakdown ramp — re-derived, not re-tinted.
 *
 * The light ramp cannot be reused here and the failure is not subtle. Measured
 * against the dark card, its darkest step `#08341F` sits at 1.29:1 contrast —
 * invisible — and the ramp as a whole fails the lightness band and the chroma
 * floor. A ring painted in it would render as two arcs and a hole.
 *
 * These four were searched at the brand hue (155–157°, where `mint600` lives)
 * and validated as an ordinal ramp against the card `#151F1A`:
 *
 *   Lightness monotone  PASS — steps read light→dark
 *   Adjacent ΔL         PASS — all gaps >= 0.06
 *   Light-end contrast  PASS — deepest step at 2.13:1, clears the 2:1 floor
 *   Single hue          PASS — hue spread 3°
 *   Normal-vision ΔE    16.6 worst adjacent pair  (light ramp: 16.4)
 *   CVD ΔE              16.1 worst adjacent pair  (light ramp: 16.3)
 *
 * Re-run after any change to `surface`: the light-end check is measured against
 * it, and at 2.13:1 the margin over the floor is thin.
 *
 * Order is reversed against the light ramp, and that is the point rather than an
 * oversight: prominence is what encodes "largest share", and on a white card the
 * most prominent green is the darkest while on a dark card it is the brightest.
 * Assign in order; never cycle, never interpolate. FOUR is still the ceiling.
 */
export const DarkCategoryRamp: CategoryRampTokens = {
  /** Largest share first — brightest first, inverting the light ramp's order. */
  steps: ['#A8FBC5', '#63C88B', '#00974B', '#005E31'] as const,
  /** The aggregated tail. Neutral on purpose — it is not a rank. */
  neutral: '#899B90',
  /** The track behind an empty or partial ring — a shade above the card. */
  track: '#243429',
};

/**
 * Dark `Semantic` — same three slots, same policy, still no red and still no
 * blue. `overCeiling` stays grey and stays paired with the word "over";
 * `linkedAccount` stays a mint RING rather than a filled dot, because the shape
 * is what distinguishes it from the on-track mark at that size.
 */
export const DarkSemantic: SemanticTokens = {
  overCeiling:   DarkColors.gray500,
  ceilingTrack:  DarkColors.gray100,
  underCeiling:  DarkColors.mint600,
  linkedAccount: DarkColors.mint600,
  selected:      DarkColors.gray400,
  hiddenOpacity: 0.4,
} as const;

/**
 * The aurora is theme-independent.
 *
 * It is the app's one fixed material — the reveal screen's deep-green field —
 * and it looks the same in both themes. What changes is the page it sits on.
 */

// ─────────────────────────────────────────────────────────────────────────────
// The bundle a screen consumes
// ─────────────────────────────────────────────────────────────────────────────

function makeCommonStyles(c: typeof Colors, shadows: typeof Shadows) {
  return StyleSheet.create({
    screenContainer: {
      flex: 1,
      backgroundColor: c.background,
    },
    /** The default surface. One border, one soft shadow, generous padding. */
    card: {
      backgroundColor: c.surface,
      borderRadius: Radius.xl,
      padding: Spacing[5],
      borderWidth: 1,
      borderColor: c.borderSubtle,
      ...shadows.card,
    },
    /** Uppercase micro-label above a value or a section. */
    eyebrow: {
      fontSize: 11,
      fontWeight: Typography.extrabold,
      color: c.textMuted,
      letterSpacing: Tracking.eyebrow,
    },
    cardTitle: {
      fontSize: Typography.base,
      fontWeight: Typography.semibold,
      color: c.textPrimary,
    },
    /** The sentence under a figure that states what it means. */
    conclusion: {
      fontSize: Typography.sm,
      color: c.textSecondary,
      lineHeight: 20,
    },
    hint: {
      fontSize: Typography.xs,
      color: c.textMuted,
      lineHeight: 17,
    },
  });
}

/**
 * The light `CommonStyles`, unchanged.
 *
 * Kept as a direct export because ~60 files import it at module scope and are
 * not yet theme-aware. Those screens must render EXACTLY as they do today while
 * the migration is partial, so this is the same StyleSheet it always was — the
 * factory above just builds it now.
 */
export const CommonStyles = makeCommonStyles(Colors, Shadows);
export const DarkCommonStyles = makeCommonStyles(DarkColors, DarkShadows);

/** Which palette a screen is painting with. */
export type ThemeMode = 'light' | 'dark';

/**
 * Everything a themed screen needs, in one object.
 *
 * Type/space/radius/tracking are shared across both themes and stay importable
 * as plain modules — only colour and elevation differ, so only those are here.
 */
export interface Theme {
  mode:         ThemeMode;
  colors:       typeof Colors;
  shadows:      typeof Shadows;
  semantic:     SemanticTokens;
  categoryRamp: CategoryRampTokens;
  common:       typeof CommonStyles;
}

export const LightTheme: Theme = {
  mode:         'light',
  colors:       Colors,
  shadows:      Shadows,
  semantic:     Semantic,
  categoryRamp: CategoryRamp,
  common:       CommonStyles,
};

export const DarkTheme: Theme = {
  mode:         'dark',
  colors:       DarkColors,
  shadows:      DarkShadows,
  semantic:     DarkSemantic,
  categoryRamp: DarkCategoryRamp,
  common:       DarkCommonStyles,
};
