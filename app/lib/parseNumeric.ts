// lib/parseNumeric.ts
// Postel's Law for money and rate fields: accept anything a person might
// reasonably type, never reject a value over formatting.
//
// "$4,000", "4000", "4k", "4.5K", "1 000", "£4,000" all mean 4000.

/**
 * Parses a loosely-typed numeric string.
 * Returns null when there is no number to read (empty, or pure junk), so the
 * caller can distinguish "not a number yet" from a real zero.
 */
export function parseNumeric(raw: string): number | null {
  if (typeof raw !== 'string') return null;

  let s = raw.trim().toLowerCase();
  if (!s) return null;

  // Currency symbols, thousands separators and stray spacing carry no meaning.
  s = s.replace(/[$£€¥,\s_]/g, '');
  if (!s) return null;

  // Shorthand multipliers: 4k -> 4000, 1.2m -> 1200000.
  let multiplier = 1;
  const shorthand = s.match(/^(-?\d*\.?\d*)(k|m)$/);
  if (shorthand) {
    s = shorthand[1];
    multiplier = shorthand[2] === 'k' ? 1_000 : 1_000_000;
  }

  // A lone "." or "-" is mid-typing, not a number.
  if (!/^-?\d*\.?\d+$/.test(s)) return null;

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;

  return n * multiplier;
}

/** parseNumeric clamped to >= 0 — for amounts that cannot be negative. */
export function parsePositive(raw: string): number | null {
  const n = parseNumeric(raw);
  return n === null ? null : Math.max(0, n);
}
