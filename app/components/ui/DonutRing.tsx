// components/ui/DonutRing.tsx — a segmented ring, without react-native-svg.
//
// Same constraint and same technique as LineChart: react-native-svg is a native
// module, so adding it would force a fresh EAS build on every machine that
// touches this repo. One chart is not worth that, so the arc is approximated by
// a dense run of small rotated Views — each one a short chord of the ring, placed
// by trig and rotated to sit tangent. At 2.5° per tick the seams are invisible
// and the whole ring costs ~144 Views, in the same order as the line chart.
//
// ── Reading the ring ───────────────────────────────────────────────────────
// Segments are ordered largest-first from twelve o'clock and coloured from the
// ramp in that order, so the ring reads as one hue getting lighter as the
// shares get smaller. That is a sequential encoding doing a categorical job,
// which only works because identity never rests on colour alone: every arc
// large enough carries its own icon on the rim, and the list beneath the chart
// repeats every category by name with its amount. Strip the colour out entirely
// and nothing is lost — which is the test.
//
// A 2pt gap is left between neighbouring arcs. Without it two adjacent steps of
// one hue merge into a single band and the count of categories is lost.
//
// ── Selecting an arc ───────────────────────────────────────────────────────
// Pass `onSelect` and the ring becomes a control: tapping an arc reports it,
// tapping the hole clears it, and the caller decides what the centre then says.
// The centre stays a prop rather than something this computes, because the copy
// belongs to the screen — this component knows percentages, not what a category
// is called or which period it was measured over.
//
// Hit testing is geometric, not per-View. An arc is a run of ~40 small rotated
// Views and its group wrapper is a full-box absoluteFill, so putting a touch
// handler on either would make the topmost arc swallow every tap on the ring.
// One transparent overlay converts the touch point to an angle and a radius
// instead, which is both exact and a single node.
import { View, Text, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius, Tracking, type CategoryRampTokens } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

export interface RingSegment {
  key: string;
  label: string;
  /** Share of the whole, 0–100. */
  pct: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface Props {
  segments: RingSegment[];
  /** Small caps above the centre figure. */
  centerLabel: string;
  /** The headline — already formatted, e.g. "$3,482". */
  centerValue: string;
  /** One line beneath it, e.g. the date range. */
  centerSub?: string;
  size?: number;
  thickness?: number;
  /** Key of the arc drawn as selected. Others dim; null draws them all equal. */
  selectedKey?: string | null;
  /**
   * Makes the ring interactive. Called with an arc's key, or null when the tap
   * landed in the hole — which is how a selection is cleared without needing a
   * second control. Omit it and the ring is a static picture as before.
   */
  onSelect?: (key: string | null) => void;
}

/** Degrees per tick. Smaller is smoother and heavier; 2.5 is past the seam. */
const STEP = 2.5;
/** Gap between neighbouring arcs, in degrees — roughly 2pt at this radius. */
const GAP = 2.5;
/** Below this share an arc is too short to hold an icon without collisions. */
const ICON_MIN_PCT = 7;
/** How much the selected arc thickens. Enough to read, not enough to reflow. */
const SELECTED_GROWTH = 7;
/** Unselected arcs, once something else is selected. */
const DIMMED = 0.32;
/**
 * Slop around the band, in points.
 *
 * The band is 20pt and a fingertip is not. Extending the hit ring outward far
 * enough to swallow the rim badges is deliberate: the badge is the part of a
 * thin arc a user can actually see and aim at, so it has to select the arc it
 * labels rather than falling through to "cleared".
 */
const HIT_INNER_SLOP = 8;
const HIT_OUTER_SLOP = 22;

export default function DonutRing({
  segments, centerLabel, centerValue, centerSub, size = 216, thickness = 20,
  selectedKey = null, onSelect,
}: Props) {
  const styles = useStyles();
  const radius = (size - thickness) / 2;
  const center = size / 2;
  // The rim badges sit outside the band, so the box has to make room for them.
  const pad = 20;
  const box = size + pad * 2;

  const total = segments.reduce((s, seg) => s + seg.pct, 0);
  const hasData = total > 0.01;

  // Lay the arcs out first: every tick and every badge is positioned from this,
  // so the geometry is decided once rather than recomputed per element.
  //
  // `rawStart`/`rawEnd` are the sweep BEFORE the cosmetic gap is taken out of
  // it, and they are what hit testing reads. Testing against the drawn bounds
  // would leave a 2.5° dead stripe between every pair of arcs where a tap did
  // nothing at all — the gap exists to separate two colours, not to be a hole.
  const arcs: {
    seg: RingSegment;
    start: number; end: number; mid: number;
    rawStart: number; rawEnd: number;
  }[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const sweep = (seg.pct / 100) * 360;
    // A gap is only honest where there is an arc on both sides of it. Taking it
    // out of a sliver would make small categories look smaller than they are.
    const inset = sweep > GAP * 2 ? GAP / 2 : 0;
    const start = cursor + inset;
    const end   = cursor + sweep - inset;
    if (end > start) {
      arcs.push({
        seg, start, end, mid: (start + end) / 2,
        rawStart: cursor, rawEnd: cursor + sweep,
      });
    }
    cursor += sweep;
  }

  /**
   * Touch point → arc key, or null for the hole.
   *
   * `undefined` means the tap missed the control entirely (the corners of the
   * square box), and the caller is left alone rather than having its selection
   * cleared by a tap that was never on the ring.
   */
  function arcAt(e: GestureResponderEvent): string | null | undefined {
    const { locationX, locationY } = e.nativeEvent;
    const dx = locationX - (pad + center);
    const dy = locationY - (pad + center);
    const r = Math.hypot(dx, dy);

    if (r > radius + thickness / 2 + HIT_OUTER_SLOP) return undefined;
    if (r < radius - thickness / 2 - HIT_INNER_SLOP) return null;

    // Ring space: 0° at twelve o'clock, increasing clockwise, matching the
    // `(a - 90)` used to place every tick above.
    const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    return arcs.find(a => deg >= a.rawStart && deg < a.rawEnd)?.seg.key ?? null;
  }

  function handlePress(e: GestureResponderEvent) {
    if (!onSelect) return;
    const key = arcAt(e);
    if (key === undefined) return;
    // A second tap on the arc already selected clears it, so the gesture that
    // opened the detail is also the one that closes it.
    onSelect(key !== null && key === selectedKey ? null : key);
  }

  return (
    <View style={[styles.box, { width: box, height: box }]}>
      {/* The track. Always drawn, so a partial or empty ring still reads as a
          ring rather than as a broken arc floating in space. */}
      <View
        style={[
          styles.track,
          {
            width: size, height: size, borderRadius: size / 2,
            borderWidth: thickness, top: pad, left: pad,
          },
        ]}
      />

      {hasData && arcs.map(arc => {
        const selected = selectedKey === arc.seg.key;
        // Thickens about its own centre line, so the band's midline — and every
        // badge hung off it — stays exactly where it was.
        const th = selected ? thickness + SELECTED_GROWTH : thickness;
        const ticks: React.ReactNode[] = [];
        for (let a = arc.start; a < arc.end; a += STEP) {
          // Chord length per tick, plus a hair of overlap so no seam shows
          // between ticks of the same colour.
          const w = (2 * Math.PI * radius * (STEP / 360)) + 1.2;
          const rad = (a + STEP / 2 - 90) * (Math.PI / 180);
          ticks.push(
            <View
              key={a}
              style={{
                position: 'absolute',
                width: w,
                height: th,
                left: pad + center + radius * Math.cos(rad) - w / 2,
                top:  pad + center + radius * Math.sin(rad) - th / 2,
                backgroundColor: arc.seg.color,
                transform: [{ rotate: `${a + STEP / 2}deg` }],
              }}
            />,
          );
        }
        return (
          <View
            key={arc.seg.key}
            style={[
              StyleSheet.absoluteFill,
              // Dimming is what makes the selected arc read as selected — the
              // growth alone is too subtle on a two-arc ring. Nothing is
              // hidden: a dimmed arc is still drawn, still measured, and the
              // list beneath the ring is untouched.
              selectedKey !== null && !selected && { opacity: DIMMED },
            ]}
          >
            {ticks}
          </View>
        );
      })}

      {/* Rim badges — the direct labels that keep identity off colour alone.
          Skipped on arcs too short to hold one, where the list below carries it. */}
      {hasData && arcs.filter(a => a.seg.pct >= ICON_MIN_PCT).map(arc => {
        const selected = selectedKey === arc.seg.key;
        const rad = (arc.mid - 90) * (Math.PI / 180);
        const rBadge = radius + thickness / 2 + 6;
        return (
          <View
            key={`badge-${arc.seg.key}`}
            style={[
              styles.badge,
              {
                left: pad + center + rBadge * Math.cos(rad) - 14,
                top:  pad + center + rBadge * Math.sin(rad) - 14,
              },
              selected && styles.badgeSelected,
              selectedKey !== null && !selected && { opacity: DIMMED },
            ]}
            accessibilityLabel={`${arc.seg.label}, ${Math.round(arc.seg.pct)} percent`}
          >
            <Ionicons name={arc.seg.icon} size={14} color={arc.seg.color} />
          </View>
        );
      })}

      {/* The hero number. Text wears text tokens, never a series colour — the
          arcs carry identity, the centre carries the total. */}
      <View style={[styles.center, { top: pad + thickness, left: pad + thickness,
        width: size - thickness * 2, height: size - thickness * 2 }]}>
        <Text style={styles.centerLabel}>{centerLabel}</Text>
        <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {centerValue}
        </Text>
        {centerSub ? <Text style={styles.centerSub}>{centerSub}</Text> : null}
      </View>

      {/* The hit layer, last so it sits over both the arcs and the centre.
          Deliberately NOT accessible: it is one node standing for every arc, so
          a screen reader would announce a single unlabelled button covering the
          whole chart. The rim badges keep their labels underneath it, and the
          category list below the ring is the real accessible path to the same
          selection — it names every category, its amount and its share. */}
      {onSelect && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handlePress}
          accessible={false}
          importantForAccessibility="no"
        />
      )}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  box: { alignSelf: 'center', position: 'relative' },
  track: { position: 'absolute', borderColor: t.categoryRamp.track },
  badge: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.shadows.card,
  },
  // The selected arc's badge gains a ring rather than a fill: the icon inside
  // is already painted in the arc's colour, and filling the badge with that
  // same colour would leave the icon sitting on itself.
  badgeSelected: {
    borderColor: t.colors.accentInk,
    borderWidth: 2,
    transform: [{ scale: 1.12 }],
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
    gap: 2,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  centerValue: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: Tracking.heading,
    textAlign: 'center',
  },
  centerSub: { fontSize: 11, color: t.colors.textMuted, textAlign: 'center' },
}));

/**
 * Assigns ramp colours by rank and folds the tail into one neutral arc.
 *
 * The ramp is a PARAMETER rather than something this reads for itself, because
 * this is a plain helper and not a component — callers invoke it inside `useMemo`
 * and inside `.map`, where a hook would be called conditionally and in a loop.
 * The caller already has the theme in hand; passing `theme.categoryRamp` costs
 * one argument and keeps this a pure function of its inputs, which is also what
 * makes the colour assignment testable.
 */
export function buildSegments<T extends { id: string; label: string; amount: number; pct: number; icon: keyof typeof Ionicons.glyphMap }>(
  categories: T[],
  maxArcs: number,
  ramp: CategoryRampTokens,
): { segments: RingSegment[]; colorFor: Record<string, string>; folded: T[] } {
  const head = categories.slice(0, maxArcs);
  const tail = categories.slice(maxArcs);

  const colorFor: Record<string, string> = {};
  const segments: RingSegment[] = head.map((c, i) => {
    const color = ramp.steps[i] ?? ramp.neutral;
    colorFor[c.id] = color;
    return { key: c.id, label: c.label, pct: c.pct, color, icon: c.icon };
  });

  if (tail.length > 0) {
    const pct = tail.reduce((s, c) => s + c.pct, 0);
    for (const c of tail) colorFor[c.id] = ramp.neutral;
    segments.push({
      key: '__rest',
      label: `${tail.length} smaller categories`,
      pct,
      color: ramp.neutral,
      icon: 'ellipsis-horizontal-outline',
    });
  }

  return { segments, colorFor, folded: tail };
}
