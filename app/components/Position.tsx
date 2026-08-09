// components/Position.tsx — what you own, what you owe, grouped by their job.
//
// The Accounts tab used to group by PROVENANCE — linked accounts in one block,
// figures you typed in another. That is how the data arrives, not how anyone
// thinks about it. This groups by role in the strategy instead: the house and
// the cash on one side, the mortgage and the drawn line on the other, and the
// difference between them stated rather than left to be worked out.
//
// ── Why the drawn line sits with the mortgage and not against the cash ─────
// It is the most consequential placement on the screen. Mid-cycle the line is
// drawn and the cash is up, and a layout that netted those two against each
// other would show a user in the middle of a dump that nothing had changed.
// Debt is debt. The line's balance belongs with the mortgage it was drawn to
// attack, which is also the framing the dashboard's unified figure uses — the
// two screens have to agree about this or neither is trustworthy.
//
// ── Cash is shown, never recommended, and never counted ───────────────────
// The liquidity row exists because the buffer is what `safeToMove` reasons
// about, so a user should be able to see it. It carries no target, no ring and
// no "you could move this" prompt: that judgement belongs to Safe to Move,
// which weighs it against the buffer rules, and duplicating it here as a bare
// number would invite exactly the move the buffer rules exist to prevent.
//
// It also sits BELOW the net figure rather than inside "what you own", because
// home equity does not include your savings. Cash in the assets group made the
// group total home + cash, and the difference against the debts was then no
// longer equity — a figure the hero states in the same breath under the same
// word. Two numbers, one label, one screen. Now the groups net to exactly the
// figure above them and cash is stated as context beneath it.
//
// ── The net figure is passed in, not derived here ──────────────────────────
// `net` comes from useFinancials, which is what the hero renders too. Position
// summing its own rows was the whole bug: a second implementation of equity
// that could drift from the first any time a row was added. This component
// lays out the arithmetic; it does not own it.
import { View, Text } from 'react-native';
import { Touchable } from './ui/press';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui/primitives';
import { Typography, Spacing, Radius, Tracking } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';

export interface PositionRow {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Rate, source, limit — whatever qualifies the figure. */
  sub?: string;
  /** Null renders an em dash and a muted "add this" affordance. */
  amount: number | null;
  emptyLabel?: string;
  onPress?: () => void;

  /**
   * Where this figure came from, which changes what the row OFFERS.
   *
   * 'live'   — a linked account is keeping it current. Nothing to do, and the
   *            row says so rather than inviting an edit that would be
   *            overwritten by the next sync.
   * 'manual' — the user typed it, and it goes stale silently. This is the one
   *            state that earns a button: a figure nobody is maintaining, on a
   *            screen whose whole job is to be trusted.
   * undefined — not applicable (a home value has no "sync" concept).
   *
   * This lives on the shared row rather than at the call site because the fork
   * is a rule about figures, not about this screen, and the moment it is
   * written twice the two copies disagree about what "stale" looks like.
   */
  source?: 'live' | 'manual';
  /** The manual fork's action. Ignored when `source` is 'live'. */
  action?: { label: string; onPress: () => void };
}

export default function Position({
  assets, debts, net, netLabel, netHint, aside, onPressNet,
}: {
  assets: PositionRow[];
  debts: PositionRow[];
  /** The authoritative figure, from useFinancials. Null when it cannot be known. */
  net: number | null;
  netLabel?: string;
  /** Why the figure is what it is, when the groups alone do not show it. */
  netHint?: string;
  /** Stated below the net, deliberately outside its arithmetic. */
  aside?: PositionRow;
  onPressNet?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <Card>
      <Group title="WHAT YOU OWN" total={sumKnown(assets)} rows={assets} />
      <View style={styles.gap} />
      <Group title="WHAT YOU OWE" total={sumKnown(debts)} rows={debts} negative />

      <View style={styles.netRule} />
      <View style={styles.netRow}>
        <Text style={styles.netLabel}>{netLabel ?? 'Your equity'}</Text>
        <Text style={[styles.netValue, net !== null && net < 0 && styles.netValueMuted]}>
          {net === null ? '—' : `${net < 0 ? '−' : ''}$${fmt(Math.abs(net))}`}
        </Text>
      </View>
      {netHint ? <Text style={styles.netSub}>{netHint}</Text> : null}
      {onPressNet && (
        <Touchable
          onPress={onPressNet}
          accessibilityRole="button"
          accessibilityLabel="How your equity is worked out"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.netHint}>How this is worked out</Text>
        </Touchable>
      )}

      {/* Outside the figure above, and said so. Not an asset row: savings are
          not home equity, and the buffer is Safe to Move's call, not a total. */}
      {aside && (
        <View style={styles.aside}>
          <View style={styles.asideIcon}>
            <Ionicons name={aside.icon} size={15} color={colors.textMuted} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.asideLabel} numberOfLines={1}>{aside.label}</Text>
            {aside.sub ? <Text style={styles.rowSub} numberOfLines={1}>{aside.sub}</Text> : null}
          </View>
          <Text style={styles.asideAmount}>
            {aside.amount === null ? (aside.emptyLabel ?? '—') : `$${fmt(aside.amount)}`}
          </Text>
        </View>
      )}
    </Card>
  );
}

function Group({ title, total, rows, negative }: {
  title: string;
  total: number | null;
  rows: PositionRow[];
  negative?: boolean;
}) {
  const styles = useStyles();
  const { colors, semantic } = useTheme();

  return (
    <View>
      <View style={styles.groupHead}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupTotal}>
          {total === null ? '—' : `${negative ? '−' : ''}$${fmt(total)}`}
        </Text>
      </View>

      {rows.map((r, i) => {
        const body = (
          <View style={[styles.row, i === rows.length - 1 && styles.rowLast]}>
            <View style={styles.iconWrap}>
              <Ionicons name={r.icon} size={17} color={colors.mint700} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel} numberOfLines={1}>{r.label}</Text>
              {r.sub ? <Text style={styles.rowSub} numberOfLines={1}>{r.sub}</Text> : null}
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowAmount, r.amount === null && styles.rowAmountEmpty]}>
                {r.amount === null
                  ? (r.emptyLabel ?? 'Add')
                  : `${negative ? '−' : ''}$${fmt(r.amount)}`}
              </Text>
              {/* A ring, not a filled dot. A filled mint dot at this size is the
                  mark this app uses for "on track", and the two appearing in one
                  row would collide — see `Semantic.linkedAccount`. */}
              {r.source === 'live' && (
                <View
                  style={[styles.liveRing, { borderColor: semantic.linkedAccount }]}
                  accessibilityElementsHidden
                />
              )}
              {r.onPress && (
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              )}
            </View>
          </View>
        );

        // ── The manual fork ────────────────────────────────────────────────
        // A figure the user typed has no one keeping it current, so the row
        // carries its own way to fix that rather than making them remember
        // which modal owns it. Rendered UNDER the row rather than inside it:
        // the row is already a 44pt target that opens the editor, and nesting
        // a second button inside a button gives VoiceOver two overlapping
        // controls with no way to tell them apart.
        const withAction = (node: React.ReactNode) => {
          if (r.source !== 'manual' || !r.action) return node;
          return (
            <View key={r.key}>
              {node}
              <Touchable
                style={styles.updateBtn}
                onPress={r.action.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${r.action.label} for ${r.label}`}
              >
                <Ionicons name="create-outline" size={14} color={colors.onAccent} />
                <Text style={styles.updateBtnText}>{r.action.label}</Text>
              </Touchable>
            </View>
          );
        };

        // A real button when it goes somewhere, a plain row when it does not.
        // `onTouchEnd` on a View would fire without press feedback, without a
        // role, and without cancelling when the finger slides off — which on a
        // row that opens an editor is a tap the user did not mean to make.
        if (!r.onPress) return withAction(<View key={r.key}>{body}</View>);
        return withAction(
          <Touchable
            key={r.key}
            onPress={r.onPress}
            accessibilityRole="button"
            accessibilityLabel={
              (r.amount === null
                ? `${r.label}, not set`
                : `${r.label}, ${negative ? 'minus ' : ''}${fmt(r.amount)} dollars`) +
              (r.source === 'live' ? ', kept current by a linked account' : '') +
              (r.source === 'manual' ? ', entered by you' : '')
            }
          >
            {body}
          </Touchable>,
        );
      })}
    </View>
  );
}

/** Null when NOTHING in the group is known; otherwise sums what is. */
function sumKnown(rows: PositionRow[]): number | null {
  const known = rows.filter(r => r.amount !== null);
  if (known.length === 0) return null;
  return known.reduce((s, r) => s + (r.amount ?? 0), 0);
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  gap: { height: Spacing[5] },

  groupHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: Tracking.eyebrow,
  },
  groupTotal: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textPrimary,
  },
  rowSub: { fontSize: 11, color: t.colors.textMuted, marginTop: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  liveRing: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    marginLeft: 2,
  },
  updateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    // Indented to the row's text column, so it reads as belonging to the row
    // above rather than to the group.
    marginLeft: 34 + Spacing[3],
    borderRadius: Radius.full,
    backgroundColor: t.colors.mint600,
  },
  updateBtnText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    // `onAccent`, never white — white on a mint600 fill is 2.62:1.
    color: t.colors.onAccent,
  },
  rowAmount: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  rowAmountEmpty: {
    color: t.colors.mint700,
    fontWeight: Typography.medium,
  },

  netRule: {
    height: 1,
    backgroundColor: t.colors.border,
    marginTop: Spacing[4],
    marginBottom: Spacing[3],
  },
  netRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  netLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  netValue: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: Tracking.heading,
  },
  // Negative equity is grey, never red — a person underwater on their house is
  // not an error state, and the figure is severe enough without the colour.
  netValueMuted: { color: t.colors.gray500 },
  netSub: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    marginTop: Spacing[1],
    lineHeight: 16,
  },
  netHint: {
    fontSize: Typography.xs,
    color: t.colors.mint700,
    fontWeight: Typography.medium,
    marginTop: Spacing[2],
  },

  // Visually demoted on purpose — muted icon, no chevron, no mint. It reads as
  // a footnote to the figure above rather than another line in the sum.
  aside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: Spacing[4],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
  asideIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: t.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  asideLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textSecondary,
  },
  asideAmount: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textSecondary,
  },
}));
