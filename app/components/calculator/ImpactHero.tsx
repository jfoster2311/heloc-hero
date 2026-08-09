// components/calculator/ImpactHero.tsx — the live billboard.
//
// There is no Calculate button on this screen and never was: `computeProjection`
// runs in ~0.01ms, so the answer is recomputed on every keystroke and every
// slider frame. What this component adds is that the answer has to be seen
// MOVING. Dragging the surplus from $600 to $1,500 shaves years off a mortgage,
// and a label that swaps between frames does not register as movement — the eye
// reads the new value and never sees the travel.
//
// ── The one contrast rule this surface lives under ─────────────────────────
// The gradient is the SAME pair as the dashboard's MonolithHero, deliberately,
// so its measurements carry over rather than having to be redone (see
// "a token measured on one surface is not measured on another" in lib/theme.ts):
//
//   light  #166534 → #14532D   white 7.13/9.11 · secondary 4.56/5.59 · neon 4.09/5.23
//   dark   #14532D → #0C3D22   white 9.11/12.31 · secondary 5.59/7.17 · neon 5.23/7.06
//
// `neon` at 4.09 on the lighter stop is AA for LARGE text ONLY — >=24pt, or
// >=18.66pt bold. So the payoff figure and the gain line may be neon; the
// eyebrow, the caption and the disclaimer may NOT, and are `OnDark`. Getting
// that backwards is the easiest way to fail this screen, and it is why the gain
// line below is 20pt BOLD rather than a 13pt caption — the size is load-bearing,
// not styling.
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import RollingDuration from '../ui/RollingDuration';
import RollingNumber from '../dashboard/RollingNumber';
import { Typography, Spacing, Radius, Tracking, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { formatMonths } from '../../lib/projections';
import type { PayoffProjection } from '../../lib/types';

export type CalcStatus = 'ok' | 'needs-balance' | 'payment-too-low';

interface Props {
  status: CalcStatus;
  projection: PayoffProjection | null;
  /** The injection covers the whole balance, so there is nothing to accelerate. */
  clearedOutright: boolean;
  /** Cycling actually gets ahead at these numbers. */
  hasGain: boolean;
  /** Years left assumed, for the disclaimer. */
  termYears: number;
  /** True once the user has typed a real payment, which implies the term. */
  paymentTouched: boolean;
  /** Safe-area top, since this bleeds to the top of the screen. */
  topInset: number;
}

export default function ImpactHero({
  status, projection, clearedOutright, hasGain, termYears, paymentTouched, topInset,
}: Props) {
  const styles = useStyles();
  const { colors, mode } = useTheme();

  const gradient: readonly [string, string] =
    mode === 'dark' ? ['#14532D', '#0C3D22'] : ['#166534', '#14532D'];

  const ok = status === 'ok' && projection !== null;
  // Rolling is only honest between two real projections. Under the empty and
  // divergent states there is no figure to travel to, and a counter animating
  // toward a dash would be motion standing in for an answer.
  const rolling = ok && !clearedOutright;

  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.body, { paddingTop: topInset + Spacing[3] }]}>
        <Text style={styles.topTitle}>Calculator</Text>

        <Text style={styles.eyebrow} accessibilityRole="header">
          YOUR PROJECTED PAYOFF
        </Text>

        {rolling ? (
          <RollingDuration
            months={projection!.acceleratedMonths}
            style={styles.figure}
            accessibilityLabel={
              `Projected payoff ${formatMonths(projection!.acceleratedMonths)}, ` +
              `instead of ${formatMonths(projection!.originalMonths)}`
            }
          />
        ) : (
          <Text style={styles.figure}>
            {clearedOutright ? 'Paid off' : ok ? formatMonths(projection!.originalMonths) : '—'}
          </Text>
        )}

        <Text style={styles.caption}>
          {clearedOutright
            ? 'Your one-time injection covers the whole remaining balance, so there is nothing left to accelerate.'
            : ok
              ? hasGain
                ? `instead of ${formatMonths(projection!.originalMonths)} on your current schedule`
                : 'Cycling doesn’t change your payoff at these numbers. Add monthly surplus below — that’s the fuel the strategy runs on.'
              : status === 'needs-balance'
                ? 'Enter your remaining mortgage balance to see a projection.'
                : 'That payment doesn’t cover the monthly interest, so the balance would never fall. Check the payment under Advanced.'}
        </Text>

        {/* ── The gain line ──────────────────────────────────────────────────
            20pt BOLD, which is what makes `neon` legal here — see the header.
            Both halves roll, and they roll off ONE clock each rather than one
            shared one, because months and dollars settle at different rates and
            forcing them to agree would make the cheaper animation wait. */}
        {ok && hasGain && !clearedOutright && (
          <View style={styles.gainRow}>
            <RollingDuration
              months={projection!.monthsSaved}
              style={styles.gain}
              accessibilityLabel={`${formatMonths(projection!.monthsSaved)} sooner`}
            />
            <Text style={styles.gain}> sooner</Text>
            <Text style={styles.gainDot}>·</Text>
            <Text style={styles.gain}>~</Text>
            <RollingNumber
              value={projection!.interestSaved}
              prefix="$"
              style={styles.gain}
              accessibilityLabel={
                `about ${Math.round(projection!.interestSaved).toLocaleString('en-US')} dollars ` +
                'of projected interest avoided'
              }
            />
            <Text style={styles.gain}> interest avoided</Text>
          </View>
        )}

        {/* The assumption is stated where the number is read, not only in a hint
            further down the page. "Projected", never "guaranteed" — this is a
            model output and the honesty rule is not negotiable on it. */}
        <Text style={styles.disclaimer}>
          {ok && !paymentTouched
            ? `Assumes ${termYears} years left at the payment we calculated. Change the term below, or enter your actual payment under Advanced.`
            : 'Projected estimate from the numbers below. Not a guarantee.'}
        </Text>
      </View>

      {/* ── The transition into the instrument panel ──────────────────────────
          The levers below overlap this edge, so the join has to be a real one.
          A hard line would read as two screens stacked; this is the same fade
          the aurora Hero uses, for the same reason — one material becoming
          another rather than two abutting. */}
      <LinearGradient
        colors={['transparent', colors.background]}
        style={styles.fade}
        pointerEvents="none"
      />
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  shell: { overflow: 'hidden' },
  body: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[8],
  },
  topTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: OnDark.secondary,
    marginBottom: Spacing[6],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    letterSpacing: Tracking.monolith,
    // NOT neon. At 11pt this is normal-size text needing 4.5:1 and neon measures
    // 4.09 on the lighter stop. White measures 7.13.
    color: OnDark.secondary,
  },
  figure: {
    fontSize: 56,
    lineHeight: 62,
    fontWeight: Typography.extrabold,
    letterSpacing: Tracking.display,
    color: OnDark.primary,
    marginTop: Spacing[2],
    // Monospaced digits: this figure changes in place on every slider frame, and
    // in a proportional face the whole line re-flows sideways as digits swap.
    ...Typography.tabular,
  },
  caption: {
    fontSize: Typography.sm,
    // `OnDark.faint` is the obvious choice and fails here: composited over the
    // lighter stop it is 3.15:1, and this is 14pt normal text needing 4.5.
    // `secondary` clears at 4.56.
    color: OnDark.secondary,
    lineHeight: 20,
    marginTop: Spacing[2],
  },

  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: Spacing[4],
  },
  gain: {
    fontSize: 20,
    // Bold at 20pt clears the >=18.66pt-bold large-text threshold, which is the
    // only reason `neon` (4.09:1) is permitted on this line. Drop either the
    // size or the weight and this pairing becomes a failure.
    fontWeight: Typography.bold,
    color: OnDark.accent,
    letterSpacing: Tracking.heading,
    ...Typography.tabular,
  },
  gainDot: {
    fontSize: 20,
    fontWeight: Typography.bold,
    color: OnDark.muted,
    paddingHorizontal: Spacing[2],
  },

  disclaimer: {
    fontSize: 11,
    color: OnDark.secondary,
    lineHeight: 16,
    marginTop: Spacing[4],
  },

  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Spacing[8],
  },
}));
