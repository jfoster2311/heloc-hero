// components/ui/primitives.tsx — the pieces every screen is assembled from.
//
// Having these in one place is what makes the app feel like one product rather
// than five screens that were each styled once. If a screen needs a card, a
// label, a meter or a status, it comes from here.
import {
  View, Text, StyleSheet, TouchableOpacity,
  type ViewStyle, type StyleProp, type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors, Typography, Spacing, Radius, Shadows, Tracking, OnDark,
} from '../../lib/theme';

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
  return (
    <View style={styles.cardHead}>
      <View style={styles.cardHeadLeft}>
        {icon ? <Ionicons name={icon} size={16} color={Colors.textMuted} /> : null}
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
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

// ─── Labels and chips ─────────────────────────────────────────────────────────

export function Chip({ label, icon, tone = 'neutral', onPress }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'neutral' | 'accent' | 'onDark';
  onPress?: () => void;
}) {
  const isAccent = tone === 'accent';
  const isDark   = tone === 'onDark';
  const color = isDark ? OnDark.secondary : isAccent ? Colors.mint700 : Colors.textMuted;
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
  const dot =
    status === 'clear'   ? Colors.mint600 :
    status === 'caution' ? Colors.mint400 :
                           Colors.gray400;
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
  const body = (
    <View style={[styles.dataRow, last && styles.dataRowLast]}>
      <View style={styles.dataRowLabel}>
        <Text style={styles.dataLabel}>{label}</Text>
        {hint ? <Text style={styles.dataHint}>{hint}</Text> : null}
      </View>
      <View style={styles.dataRowValue}>
        <Text style={styles.dataValue}>{value}</Text>
        {onPress ? <Ionicons name="chevron-forward" size={15} color={Colors.gray400} /> : null}
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
  const pct = clamp01(value) * 100;
  const fill = tone === 'accent' ? Colors.mint600 : Colors.gray400;
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
                backgroundColor: onDark ? Colors.mint900 : Colors.surface,
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
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.actionBtnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
      {icon ? <Ionicons name={icon} size={18} color={Colors.white} /> : null}
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
  return (
    <TouchableOpacity
      style={styles.linkRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? (
        <View style={styles.linkIcon}>
          <Ionicons name={icon} size={18} color={Colors.textSecondary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.linkLabel, danger && styles.linkLabelDanger]}>{label}</Text>
        {sub ? <Text style={styles.linkSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
    </TouchableOpacity>
  );
}

/** Empty state that says what is missing and offers the one way to fix it. */
export function EmptyState({ icon, title, body, action }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyRing}>
        <Ionicons name={icon} size={26} color={Colors.mint600} />
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: Spacing[3],
    ...Shadows.card,
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
    color: Colors.textPrimary,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: Colors.textMuted,
    letterSpacing: Tracking.eyebrow,
    marginTop: Spacing[2],
  },
  divider: { height: 1, backgroundColor: Colors.borderSubtle },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing[3],
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
  },
  chipAccent: { backgroundColor: Colors.mint50, borderWidth: 1, borderColor: Colors.mint200 },
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
    color: Colors.textPrimary,
    letterSpacing: 0.4,
  },

  sourceNote: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  statValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  statValueDark:  { color: OnDark.primary },
  statValueMuted: { color: Colors.gray400 },
  statLabel:      { fontSize: Typography.xs, color: Colors.textMuted },
  statLabelDark:  { color: OnDark.muted },
  statSub:        { fontSize: Typography.xs, color: Colors.textMuted },

  tile: {
    flex: 1,
    backgroundColor: Colors.mint900,
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
    borderBottomColor: Colors.borderSubtle,
  },
  dataRowLast:   { borderBottomWidth: 0 },
  dataRowLabel:  { flex: 1, gap: 2 },
  dataRowValue:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  dataLabel:     { fontSize: Typography.sm, color: Colors.textSecondary },
  dataHint:      { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
  dataValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    textAlign: 'right',
  },

  meterTrack: {
    backgroundColor: Colors.gray100,
    overflow: 'hidden',
    position: 'relative',
  },
  meterFill: { position: 'absolute', left: 0, top: 0 },
  meterMark: { position: 'absolute', top: 0, width: 2 },
  meterMarkLabels: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing[1] },
  meterMarkLabel: { fontSize: Typography.xs, color: Colors.textMuted },

  actionPair: { flexDirection: 'row', gap: Spacing[3] },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
    textAlign: 'center',
  },

  primaryBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
  },
  primaryBtnText: {
    color: Colors.white,
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
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  linkLabel: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  linkLabelDanger: { color: Colors.gray500 },
  linkSub:   { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

  empty: { alignItems: 'center', paddingVertical: Spacing[10], gap: Spacing[2] },
  emptyRing: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.mint50,
    borderWidth: 1, borderColor: Colors.mint200,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  emptyTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  emptyBody: {
    fontSize: Typography.sm, color: Colors.textMuted,
    textAlign: 'center', lineHeight: 20, maxWidth: 300,
  },
});
