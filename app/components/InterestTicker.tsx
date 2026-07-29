// components/InterestTicker.tsx — the reason to open the app on a Tuesday.
//
// A HELOC dump happens a few times a year. Everything between them is dead
// time, and an app with nothing to say during that time gets deleted. This is
// the one number that is genuinely different every time someone looks: interest
// they are not paying, accruing by the hour because their principal is lower
// than it would have been.
//
// ── Why this is real and not a motivational animation ───────────────────────
// Every day a dollar is off the mortgage, it does not accrue mortgage interest:
// that is `principalRemoved × rate ÷ 365` per day, arithmetic, not a forecast.
// Against it, every day a dollar sits drawn on the line, it DOES accrue HELOC
// interest. The figure shown is the net, and when the line is expensive enough
// that the net goes negative, it says so in plain words rather than hiding it.
// A ticker that only ever goes up would be a slot machine.
//
// ── On precision ────────────────────────────────────────────────────────────
// Deliberately not animated per-second. At a realistic $7/day the cents move
// about every three minutes, so a 60fps counter would be rendering invented
// decimal places to look busy. It refreshes on a slow interval and on every
// foreground, which is when someone is actually reading it.
import { useState, useEffect, useRef } from 'react';
import { View, Text, AppState } from 'react-native';
import { Typography, Spacing, Tracking } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';

const REFRESH_MS = 15_000;

interface Props {
  /** Sum of every logged principal move. No moves, no ticker. */
  totalMoved: number;
  /** Decimal fraction, e.g. 0.065. */
  mortgageRate: number;
  /** Currently drawn on the line — the cost side of the trade. */
  helocDrawn: number;
  /** Decimal fraction, e.g. 0.085. */
  helocRate: number;
}

/** Fraction of the local day elapsed, 0 at midnight and 1 at the next. */
function dayElapsed(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return (now.getTime() - midnight.getTime()) / 86_400_000;
}

export default function InterestTicker({
  totalMoved, mortgageRate, helocDrawn, helocRate,
}: Props) {
  const styles = useStyles();
  const [now, setNow] = useState(() => new Date());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function start() {
      stop();
      setNow(new Date());
      timer.current = setInterval(() => setNow(new Date()), REFRESH_MS);
    }
    function stop() {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    }

    start();
    // Background timers are throttled to nothing by iOS, so the value would be
    // stale on return. Recompute on foreground rather than trusting the clock.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') start(); else stop();
    });

    return () => { stop(); sub.remove(); };
  }, []);

  if (totalMoved <= 0) return null;

  const avoidedPerDay = (totalMoved * mortgageRate) / 365;
  const costPerDay = (helocDrawn * helocRate) / 365;
  const netPerDay = avoidedPerDay - costPerDay;
  const soFarToday = netPerDay * dayElapsed(now);

  const negative = netPerDay < 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>
        {negative ? 'THE LINE IS COSTING MORE THAN IT SAVES' : 'INTEREST YOU ARE NOT PAYING'}
      </Text>

      <View style={styles.valueRow}>
        <Text style={[styles.value, negative && styles.valueMuted]}>
          {negative ? '−' : ''}${Math.abs(soFarToday).toFixed(2)}
        </Text>
        <Text style={styles.suffix}>so far today</Text>
      </View>

      <Text style={styles.detail}>
        {negative
          ? `At today's balances the line costs ${money(costPerDay)} a day against ` +
            `${money(avoidedPerDay)} of mortgage interest avoided. Replenishing the line ` +
            'turns this positive.'
          : `${money(netPerDay)} a day at today's balances — about ${money(netPerDay * 30)} a month. ` +
            (costPerDay > 0.005
              ? `Already net of ${money(costPerDay)} a day of HELOC interest.`
              : 'Nothing is drawn on your line, so none of it is going back out.')}
      </Text>
    </View>
  );
}

function money(n: number) {
  const abs = Math.abs(n);
  if (abs >= 100) return `$${Math.round(abs).toLocaleString('en-US')}`;
  return `$${abs.toFixed(2)}`;
}

const useStyles = createThemedStyles(t => ({
  wrap: {
    backgroundColor: t.colors.mint50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    padding: Spacing[4],
    gap: Spacing[1],
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: Tracking.label,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing[2] },
  value: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: Tracking.heading,
  },
  // Negative is muted grey, never red — see the palette policy in lib/theme.
  valueMuted: { color: t.colors.gray500 },
  suffix: { fontSize: Typography.xs, color: t.colors.textMuted },
  detail: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },
}));
