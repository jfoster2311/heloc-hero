// lib/automation.ts
import type { AutomationSettings } from './types';

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  user_id:                  '',
  safe_sweep_enabled:       false,
  safe_dump_enabled:        false,
  buffer_target:            2000,
  upcoming_bills_estimate:  500,
  min_dump_amount:          5000,
  min_sweep_amount:         100,
};

/**
 * How much to move from savings → HELOC this cycle.
 * Leaves bufferTarget + upcomingBills in the savings account.
 */
export function computeSweepAmount(
  savingsBalance:  number,
  bufferTarget:    number,
  upcomingBills:   number,
): number {
  const available = savingsBalance - bufferTarget - upcomingBills;
  return Math.max(0, Math.floor(available));
}

/**
 * How much of the accumulated HELOC balance to dump onto the mortgage principal.
 * Returns 0 if the threshold hasn't been reached.
 */
export function computeDumpAmount(
  accumulated:        number,
  minDump:            number,
  helocAvailableCredit: number,
): number {
  if (accumulated < minDump) return 0;
  return Math.min(accumulated, helocAvailableCredit);
}
