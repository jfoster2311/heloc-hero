// components/ui/primitives.tsx — the pieces every screen is assembled from.
//
// Having these in one place is what makes the app feel like one product rather
// than five screens that were each styled once. If a screen needs a card, a
// label, a meter or a status, it comes from here.
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform,
  type ViewStyle, type StyleProp, type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius, Tracking, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

// ─── Surfaces ─────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Sits on the aurora rather than the page. */
  onDark?: boolean;
}

export function Card({ children, style, onPress, accessibilityLabel, onDark }: CardProps) {
  const styles = useStyles();
  const body = <View style={[onDark ? styles.cardDark : styles.card, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </TouchableOpacity>
  );
}

/** Card header: title on the left, an optional status or control on the right. */
export function CardHead({ title, right, icon }: {
  title: string;
  right?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.cardHead}>
      <View style={styles.cardHeadLeft}>
        {icon ? <Ionicons name={icon} size={16} color={colors.textMuted} /> : null}
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Uppercase label that opens a section of a long screen. */
export function SectionLabel({ children, style }: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.divider, style]} />;
}

// ─── Labels and chips ─────────────────────────────────────────────────────────

export function Chip({ label, icon, tone = 'neutral', onPress }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'neutral' | 'accent' | 'onDark';
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isAccent = tone === 'accent';
  const isDark   = tone === 'onDark';
  const color = isDark ? OnDark.secondary : isAccent ? colors.mint700 : colors.textMuted;
  const body = (
    <View style={[styles.chip, isAccent && styles.chipAccent, isDark && styles.chipDark]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </TouchableOpacity>
  );
}

export type StatusTone = 'clear' | 'caution' | 'hold';

/**
 * Status always carries its word, not just its colour. Colour alone fails for
 * colour-blind users and fails harder in a monochrome palette, where the only
 * available difference is saturation.
 */
export function StatusPill({ status, label }: { status: StatusTone; label: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const dot =
    status === 'clear'   ? colors.mint600 :
    status === 'caution' ? colors.mint400 :
                           colors.gray400;
  return (
    <View style={styles.statusPill} accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

/** A value that came from somewhere the user should know about. */
export function SourceNote({ children, style }: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  return <Text style={[styles.sourceNote, style]}>{children}</Text>;
}

// ─── Data display ─────────────────────────────────────────────────────────────

/** Label above, value below. The unit of every stat row in the app. */
export function Stat({ label, value, sub, align = 'left', onDark, muted }: {
  label: string;
  value: string;
  sub?: string;
  align?: 'left' | 'right' | 'center';
  onDark?: boolean;
  muted?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={{ flex: 1, alignItems: alignToFlex(align), gap: 2 }}>
      <Text style={[styles.statValue, onDark && styles.statValueDark, muted && styles.statValueMuted]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, onDark && styles.statLabelDark]}>{label}</Text>
      {sub ? <Text style={[styles.statSub, onDark && styles.statLabelDark]}>{sub}</Text> : null}
    </View>
  );
}

/** Dark tile carrying a figure, as in the reference loan screens. */
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue} allowFontScaling={false}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
    </View>
  );
}

/** `Label ......... value` — the workhorse of the Accounts screen. */
export function DataRow({ label, value, hint, onPress, last }: {
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const body = (
    <View style={[styles.dataRow, last && styles.dataRowLast]}>
      <View style={styles.dataRowLabel}>
        <Text style={styles.dataLabel}>{label}</Text>
        {hint ? <Text style={styles.dataHint}>{hint}</Text> : null}
      </View>
      <View style={styles.dataRowValue}>
        <Text style={styles.dataValue}>{value}</Text>
        {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.gray400} /> : null}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </TouchableOpacity>
  );
}

// ─── Meters ───────────────────────────────────────────────────────────────────

export interface MeterMark {
  /** Position 0..1 along the track. */
  at: number;
  label?: string;
}

/**
 * A track with a fill and optional marks.
 *
 * Marks are positioned from their own value, never drawn at a fixed coordinate
 * — a threshold gauge that always renders the notch at 80% of the width is a
 * picture of a gauge, not a gauge.
 */
export function Meter({
  value, marks = [], tone = 'accent', height = 10, onDark,
}: {
  value: number;                 // 0..1
  marks?: MeterMark[];
  tone?: 'accent' | 'muted';
  height?: number;
  onDark?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const pct = clamp01(value) * 100;
  const fill = tone === 'accent' ? colors.mint600 : colors.gray400;
  return (
    <View>
      <View style={[
        styles.meterTrack,
        { height, borderRadius: height / 2 },
        onDark && { backgroundColor: OnDark.fill },
      ]}>
        <View style={[
          styles.meterFill,
          { width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: fill },
        ]} />
        {marks.map((m, i) => (
          <View
            key={i}
            style={[
              styles.meterMark,
              {
                left: `${clamp01(m.at) * 100}%`,
                height,
                backgroundColor: onDark ? colors.mint900 : colors.surface,
              },
            ]}
          />
        ))}
      </View>
      {marks.some(m => m.label) && (
        <View style={styles.meterMarkLabels}>
          {marks.filter(m => m.label).map((m, i) => (
            <Text
              key={i}
              style={[styles.meterMarkLabel, onDark && { color: OnDark.muted }]}
            >
              {m.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Two actions at equal visual weight.
 *
 * Deliberately NOT a primary/ghost pair. When the app suggests moving money
 * against a primary residence, styling the suggestion as the only real button
 * is a nudge the product has not earned.
 */
export function ActionPair({ primary, secondary }: {
  primary:   { label: string; onPress: () => void; disabled?: boolean };
  secondary: { label: string; onPress: () => void };
}) {
  const styles = useStyles();
  return (
    <View style={styles.actionPair}>
      <TouchableOpacity
        style={[styles.actionBtn, primary.disabled && styles.actionBtnDisabled]}
        onPress={primary.onPress}
        disabled={primary.disabled}
        accessibilityRole="button"
        accessibilityLabel={primary.label}
      >
        <Text style={styles.actionBtnText}>{primary.label}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={secondary.onPress}
        accessibilityRole="button"
        accessibilityLabel={secondary.label}
      >
        <Text style={styles.actionBtnText}>{secondary.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Filled action for the one place a screen genuinely has a primary path. */
export function PrimaryButton({ label, onPress, icon, disabled, style }: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.actionBtnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
      {icon ? <Ionicons name={icon} size={18} color={colors.onAccent} /> : null}
    </TouchableOpacity>
  );
}

/** Tappable line with a chevron — "everything else behind a tap". */
export function LinkRow({ label, sub, icon, onPress, danger }: {
  label: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={styles.linkRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? (
        <View style={styles.linkIcon}>
          <Ionicons name={icon} size={18} color={colors.textSecondary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.linkLabel, danger && styles.linkLabelDanger]}>{label}</Text>
        {sub ? <Text style={styles.linkSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
    </TouchableOpacity>
  );
}

/**
 * A figure that is also a door.
 *
 * The dashboard's job is to rank, not to hold everything: each tile states one
 * number and hands off to the tab that can explain it. Sized so two sit in a
 * row within the thumb zone, and the whole tile is the target rather than the
 * chevron — a 44pt hit area is the floor, not the goal.
 */
export function NavTile({ eyebrow, value, sub, icon, onPress, muted, accessibilityHint }: {
  eyebrow: string;
  value: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Renders the value in grey. For a figure that is real but not good news. */
  muted?: boolean;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={styles.navTile}
      onPress={onPress}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${value}`}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.navTileHead}>
        {icon ? <Ionicons name={icon} size={13} color={colors.textMuted} /> : null}
        <Text style={styles.navTileEyebrow} numberOfLines={1}>{eyebrow}</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.gray300} />
      </View>
      <Text
        style={[styles.navTileValue, muted && styles.navTileValueMuted]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      {sub ? <Text style={styles.navTileSub} numberOfLines={2}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

/**
 * Detail that stays on the screen without leading it.
 *
 * The Accounts tab renders every figure the app holds, with its provenance, and
 * that is the right amount of detail for the one day someone doubts a number —
 * and far too much for the other three hundred. Nothing is deleted; the rows
 * that answer "where did this come from" simply sit one tap down from the rows
 * that answer "what is it".
 *
 * The label counts what is hidden. "Show more" is a shrug; "Show 8 more details"
 * tells someone whether the tap is worth it.
 */
export function Disclosure({ count, children, label = 'details' }: {
  count: number;
  children: React.ReactNode;
  label?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;
  return (
    <>
      {open ? children : null}
      <TouchableOpacity
        style={styles.disclosure}
        onPress={() => {
          if (Platform.OS === 'ios') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }
          setOpen(o => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Hide ${label}` : `Show ${count} more ${label}`}
      >
        <Text style={styles.disclosureText}>
          {open ? 'Show less' : `Show ${count} more ${label}`}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={15}
          color={colors.accentInk}
        />
      </TouchableOpacity>
    </>
  );
}

/** Empty state that says what is missing and offers the one way to fix it. */
export function EmptyState({ icon, title, body, action }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyRing}>
        <Ionicons name={icon} size={26} color={colors.accentInk} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? (
        <PrimaryButton label={action.label} onPress={action.onPress} style={{ marginTop: Spacing[2] }} />
      ) : null}
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function alignToFlex(a: 'left' | 'right' | 'center') {
  return a === 'left' ? 'flex-start' : a === 'right' ? 'flex-end' : 'center';
}

const useStyles = createThemedStyles(t => ({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    gap: Spacing[3],
    ...t.shadows.card,
  },
  cardDark: {
    backgroundColor: OnDark.fill,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: OnDark.hairline,
    gap: Spacing[3],
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
  },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flex: 1 },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: Tracking.eyebrow,
    marginTop: Spacing[2],
  },
  divider: { height: 1, backgroundColor: t.colors.borderSubtle },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing[3],
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: t.colors.gray100,
  },
  chipAccent: { backgroundColor: t.colors.mint50, borderWidth: 1, borderColor: t.colors.mint200 },
  chipDark:   { backgroundColor: OnDark.fill, borderWidth: 1, borderColor: OnDark.hairline },
  chipText:   { fontSize: 11, fontWeight: Typography.semibold },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
    letterSpacing: 0.4,
  },

  sourceNote: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 17 },

  statValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  statValueDark:  { color: OnDark.primary },
  statValueMuted: { color: t.colors.gray400 },
  statLabel:      { fontSize: Typography.xs, color: t.colors.textMuted },
  statLabelDark:  { color: OnDark.muted },
  statSub:        { fontSize: Typography.xs, color: t.colors.textMuted },

  tile: {
    flex: 1,
    backgroundColor: t.colors.mint900,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[4],
    gap: 3,
  },
  tileValue: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: OnDark.accent,
    letterSpacing: -0.5,
  },
  tileLabel: { fontSize: 11, color: OnDark.muted, fontWeight: Typography.semibold },
  tileSub:   { fontSize: 11, color: OnDark.faint },

  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[4],
    paddingVertical: Spacing[3],
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  dataRowLast:   { borderBottomWidth: 0 },
  dataRowLabel:  { flex: 1, gap: 2 },
  dataRowValue:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  dataLabel:     { fontSize: Typography.sm, color: t.colors.textSecondary },
  dataHint:      { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 16 },
  dataValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    textAlign: 'right',
  },

  meterTrack: {
    backgroundColor: t.colors.gray100,
    overflow: 'hidden',
    position: 'relative',
  },
  meterFill: { position: 'absolute', left: 0, top: 0 },
  meterMark: { position: 'absolute', top: 0, width: 2 },
  meterMarkLabels: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing[1] },
  meterMarkLabel: { fontSize: Typography.xs, color: t.colors.textMuted },

  actionPair: { flexDirection: 'row', gap: Spacing[3] },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
    textAlign: 'center',
  },

  primaryBtn: {
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
  },
  primaryBtnText: {
    // Deep green, not white: white on mint600 measures 2.62:1 light and 2.02:1
    // dark, both under the 3:1 that 16pt bold needs. See `onAccent` in theme.ts.
    color: t.colors.onAccent,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    minHeight: 48,
  },
  linkIcon: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: t.colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  linkLabel: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textPrimary },
  linkLabelDanger: { color: t.colors.gray500 },
  linkSub:   { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: 2, lineHeight: 16 },

  navTile: {
    flex: 1,
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    padding: Spacing[4],
    gap: Spacing[1],
    minHeight: 96,
    ...t.shadows.card,
  },
  navTileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  navTileEyebrow: {
    flex: 1,
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: Tracking.label,
  },
  navTileValue: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  navTileValueMuted: { color: t.colors.gray400 },
  navTileSub: { fontSize: 11, color: t.colors.textMuted, lineHeight: 15 },

  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    minHeight: 44,
  },
  disclosureText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },

  empty: { alignItems: 'center', paddingVertical: Spacing[10], gap: Spacing[2] },
  emptyRing: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: t.colors.mint50,
    borderWidth: 1, borderColor: t.colors.mint200,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  emptyTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  emptyBody: {
    fontSize: Typography.sm, color: t.colors.textMuted,
    textAlign: 'center', lineHeight: 20, maxWidth: 300,
  },
}));
