// hooks/useInterestToday.ts — the live "interest you are not paying" figure.
//
// Extracted from components/InterestTicker so the dashboard's Cash Shield and
// the ticker inside the Interest card cannot drift apart. They are the same
// claim at two sizes; two copies of this arithmetic would eventually disagree
// on the same screen, and the user would have no way to tell which to believe.
//
// ── Why this is real and not a motivational animation ──────────────────────
// Every day a dollar is off the mortgage it does not accrue mortgage interest:
// `principalRemoved × rate ÷ 365` per day. Against it, every day a dollar sits
// drawn on the line it DOES accrue HELOC interest. What this returns is the
// NET, and it goes negative when the line is expensive enough — a figure that
// only ever rises would be a slot machine.
import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Deliberately not per-second.
 *
 * At a realistic $7/day the cents move about every three minutes, so a 60fps
 * counter would be rendering digits finer than the inputs justify — the
 * mortgage rate alone is frequently an estimate. This refreshes often enough to
 * move while someone watches and no finer than the arithmetic supports.
 */
const REFRESH_MS = 15_000;

export interface InterestToday {
  /** Net interest accrued so far today. Negative when the line costs more. */
  soFarToday: number;
  /** Net per day at the current balances. */
  netPerDay: number;
  /** Mortgage interest avoided per day, before the line's cost. */
  avoidedPerDay: number;
  /** What the drawn balance charges per day. Zero when unknown — see below. */
  costPerDay: number;
  /**
   * True when there is a line whose balance we do not have.
   *
   * The cost side cannot be subtracted, so `soFarToday` is a GROSS figure
   * wearing a net label. Every caller has to say so rather than presenting it
   * as the net — which is why this is returned instead of being folded away.
   */
  costUnknown: boolean;
  negative: boolean;
}

/** Fraction of the local day elapsed, 0 at midnight and 1 at the next. */
function dayElapsed(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return (now.getTime() - midnight.getTime()) / 86_400_000;
}

export function useInterestToday(
  totalMoved: number,
  mortgageRate: number,
  helocDrawn: number | null,
  helocRate: number,
): InterestToday {
  const [now, setNow] = useState(() => new Date());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function stop() {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    }
    function start() {
      stop();
      setNow(new Date());
      timer.current = setInterval(() => setNow(new Date()), REFRESH_MS);
    }

    start();
    // iOS throttles background timers to nothing, so the value would be stale
    // on return. Recompute on foreground rather than trusting the clock.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') start(); else stop();
    });

    return () => { stop(); sub.remove(); };
  }, []);

  const avoidedPerDay = totalMoved > 0 ? (totalMoved * mortgageRate) / 365 : 0;
  const costUnknown = helocDrawn === null;
  const costPerDay = costUnknown ? 0 : (helocDrawn * helocRate) / 365;
  const netPerDay = avoidedPerDay - costPerDay;

  return {
    soFarToday: netPerDay * dayElapsed(now),
    netPerDay,
    avoidedPerDay,
    costPerDay,
    costUnknown,
    negative: netPerDay < 0,
  };
}
