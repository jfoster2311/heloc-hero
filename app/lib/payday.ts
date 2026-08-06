// lib/payday.ts — "is a paycheck landing around now?"
//
// Used to label the sweep slider. It is a small claim and an easy one to
// overstate, so the rules are written down rather than left to a call site.
//
// ── What this can and cannot know ───────────────────────────────────────────
// `nextExpected` is a PROJECTION: lastSeen plus the median cadence. It is not
// an observed deposit. So the honest wording anywhere this is true is "payday
// expected", never "payday detected" or "your pay has landed" — the app cannot
// see today's deposit until Plaid reports it, which can lag by a day or more.
import type { RecurringStream } from './cashflow';

/**
 * How close to `nextExpected` still counts.
 *
 * Asymmetric on purpose. Two days AFTER covers a deposit that landed but has
 * not been reported yet, plus weekend drift when a Friday payday clears Monday.
 * One day BEFORE is deliberately tighter: telling someone money is ready to
 * move before it has arrived invites a transfer that overdraws them.
 */
const DAYS_BEFORE = 1;
const DAYS_AFTER = 2;

/** Below this the cadence is a guess dressed as a schedule. Matches lib/cashflow. */
const MIN_OBSERVATIONS = 4;

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * True when at least one income stream is due around now.
 *
 * Returns false — never throws, never guesses — when there is no usable
 * history. A slider that says "ready to move" is more useful than one that
 * says "payday expected" wrongly, so every uncertain case resolves to false.
 */
export function paydayIsExpected(
  streams: RecurringStream[] | null | undefined,
  now = new Date(),
): boolean {
  if (!streams || streams.length === 0) return false;
  const today = startOfDay(now);

  return streams.some((s) => {
    if (!s.nextExpected) return false;
    // A cadence built on two deposits is noise. `buildUpcoming` draws these
    // anyway because it labels them as expected and shows the count; this
    // returns a bare boolean with nowhere to put that caveat, so it is stricter.
    if (s.observations < MIN_OBSERVATIONS) return false;
    if (s.cadenceDays < 1) return false;

    // Same staleness rule as buildUpcoming: a stream that stopped is not a
    // payday. Someone who changed jobs in March must not be told their old
    // salary is landing in July.
    const staleAfter = Math.max(60, s.cadenceDays * 3);
    const lastSeen = startOfDay(new Date(`${s.lastSeen}T00:00:00`));
    if (!Number.isFinite(lastSeen)) return false;
    if ((today - lastSeen) / DAY_MS > staleAfter) return false;

    const expected = startOfDay(new Date(`${s.nextExpected}T00:00:00`));
    if (!Number.isFinite(expected)) return false;

    const deltaDays = (today - expected) / DAY_MS;
    return deltaDays >= -DAYS_BEFORE && deltaDays <= DAYS_AFTER;
  });
}
