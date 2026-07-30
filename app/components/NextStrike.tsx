// components/NextStrike.tsx — the replenishment phase, made watchable.
//
// The long quiet stretch of this strategy is the months after a dump, when the
// only thing to do is send the surplus at the line. The dashboard already knew
// exactly how far there was to go; it just said so in a sentence. This is the
// same number as a position on a track, plus the one figure that actually moves
// between paydays — what the drawn balance costs per day.
//
// ── The word "strike" is not in the UI ─────────────────────────────────────
// The internal name for this phase is fine; the copy is not the place for it.
// "Reload the weapon for your next principal strike" is language that makes a
// leveraged draw against someone's house feel like a game mechanic, and the
// point of the meter is to make waiting legible, not to make drawing exciting.
// So the surface copy says dump, line and repay, the same words as every other
// screen.
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHead } from './ui/primitives';
import { Typography, Spacing, Radius, Tracking } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';
import type { Strike } from '../lib/strike';

export default function NextStrike({
  strike, replenishThreshold, onPress, onEnterBalance,
}: {
  strike: Strike;
  replenishThreshold: number;
  onPress?: () => void;
  /** Where to go to supply a balance, for the `unknown_balance` state. */
  onEnterBalance?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const pct = Math.round(replenishThreshold * 100);

  if (strike.state === 'no_line') {
    return (
      <Card>
        <CardHead title="Your next dump" icon="flag-outline" />
        <Text style={styles.empty}>
          Add your HELOC and this tracks how much has to come off the line before
          your next dump is available.
        </Text>
      </Card>
    );
  }

  // A limit, but no balance. The track is a position between the limit and the
  // threshold, and there is no position to draw — so it draws nothing and asks,
  // rather than falling through to the REPLENISHING chip over an empty meter.
  if (strike.state === 'unknown_balance') {
    return (
      <Card onPress={onEnterBalance} accessibilityLabel="Add your HELOC balance">
        <CardHead title="Your next dump" icon="flag-outline" />
        <Text style={styles.empty}>
          We have your limit but not what is drawn against it, so there is no
          progress to show yet. Add your current balance and this fills in.
        </Text>
        {onEnterBalance && (
          <Text style={styles.emptyAction}>Add your balance</Text>
        )}
      </Card>
    );
  }

  return (
    <Card onPress={onPress} accessibilityLabel="Your next dump">
      <CardHead
        title="Your next dump"
        icon="flag-outline"
        right={
          <Text style={styles.stateChip}>
            {strike.state === 'open' ? 'AVAILABLE'
              : strike.state === 'stalled' ? 'NOT MOVING'
              : 'REPLENISHING'}
          </Text>
        }
      />

      {strike.state === 'open' ? (
        <>
          <Text style={styles.value}>Available now</Text>
          <Text style={styles.caption}>
            Your line is back under {pct}%. Safe to move has the amount.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.value}>${fmt(strike.toGo)}</Text>
          <Text style={styles.caption}>
            still to repay before your next dump opens, at {pct}% of your limit.
          </Text>
        </>
      )}

      {/* The track. Reads left-to-right as "how close am I", and is anchored to
          the limit rather than to wherever the balance last peaked — see the
          note on `progress` in lib/strike.ts for why that matters. */}
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(strike.progress * 100) }}
        accessibilityLabel={
          strike.state === 'open'
            ? 'Your next dump is available'
            : `${Math.round(strike.progress * 100)} percent replenished, ` +
              `${fmt(strike.toGo)} dollars to go`
        }
      >
        <View style={[styles.fill, { width: `${Math.max(2, strike.progress * 100)}%` }]} />
      </View>

      <View style={styles.trackEnds}>
        <Text style={styles.endLabel}>${fmtK(strike.drawn)} drawn</Text>
        <Text style={styles.endLabel}>opens at ${fmtK(strike.target)}</Text>
      </View>

      {strike.state === 'replenishing' && strike.monthsToGo !== null && (
        <Text style={styles.eta}>
          About {strike.monthsToGo} month{strike.monthsToGo === 1 ? '' : 's'} at the
          ${fmt(strike.netRepayment)} a month your surplus leaves after interest.
        </Text>
      )}

      {strike.state === 'stalled' && (
        <View style={styles.note}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.textSecondary} />
          {/* Shortened, not softened. Both facts stay: the balance is growing,
              and waiting will not fix it. */}
          <Text style={styles.noteText}>
            Your surplus does not cover this line&apos;s ${fmt(strike.monthlyInterest)} of
            monthly interest, so the balance is growing. Your next dump gets no
            closer until that changes.
          </Text>
        </View>
      )}

      {/* ── What it costs per day ──────────────────────────────────────────
          The figure that moves between paydays, and the honest form of it: this
          is what the balance is being CHARGED, not a saving being claimed. It
          falls as the balance falls, which is the thing worth watching. */}
      {strike.drawn > 0 && (
        <View style={styles.daily}>
          <View style={styles.dailyRow}>
            <Text style={styles.dailyLabel}>Costing you today</Text>
            <Text style={styles.dailyValue}>${strike.dailyCost.toFixed(2)}/day</Text>
          </View>
          {strike.netRepayment > 0 && (
            <Text style={styles.dailyCaption}>
              Sweeping this month&apos;s surplus brings that to{' '}
              ${strike.dailyCostNextMonth.toFixed(2)} a day.
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return fmt(n);
}

const useStyles = createThemedStyles(t => ({
  empty: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  emptyAction: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
    marginTop: Spacing[3],
    minHeight: 22,
  },
  stateChip: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    letterSpacing: Tracking.label,
    color: t.colors.textMuted,
  },
  // Tier 2. The dashboard keeps one display-size figure — Safe to move, which
  // is a decision — and every card reporting a position sits a step under it.
  value: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: Tracking.heading,
  },
  caption: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    marginTop: 2,
  },

  track: {
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: t.semantic.ceilingTrack,
    overflow: 'hidden',
    marginTop: Spacing[4],
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: t.colors.mint600,
  },
  trackEnds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing[2],
  },
  endLabel: { fontSize: 11, color: t.colors.textMuted },
  eta: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 20,
    marginTop: Spacing[3],
  },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: Spacing[3],
  },
  noteText: { flex: 1, fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },

  daily: {
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
    marginTop: Spacing[4],
    paddingTop: Spacing[3],
  },
  dailyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dailyLabel: { fontSize: Typography.sm, color: t.colors.textSecondary },
  dailyValue: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  dailyCaption: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 17,
    marginTop: Spacing[1],
  },
}));
