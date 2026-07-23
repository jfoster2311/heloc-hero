// lib/watchItems.ts — the short list of things that actually need attention.
//
// Every item here is sourceable from data the app really holds today. That
// constraint is the whole design: an alerts feed padded with things the app
// cannot detect teaches the user that its silence means nothing.
//
// Deliberately NOT here: automatic Prime-rate change detection. Plaid does not
// publish it, and inventing "your rate probably went up" would be a guess
// wearing an alert's clothes. It is handled instead as a periodic prompt to
// re-confirm the APR (`terms_stale`), which is honest about who knows the
// answer. FRED's bank-prime series is the free path to the real thing later.
import {
  UTILIZATION, STALE_SYNC_HOURS, DRAW_LOOKAHEAD_MONTHS,
  PAYMENT_DUE_LOOKAHEAD_DAYS, ESCROW_CHANGE_MIN,
} from './config';
import { daysBetween, monthsBetween, parseDate, type MortgageLiability } from './mortgage';

export type WatchKind =
  | 'utilization_breach'
  | 'stale_connection'
  | 'payment_due'
  | 'past_due'
  | 'escrow_change'
  | 'rate_change'
  | 'draw_period_approaching'
  | 'draw_period_ended'
  | 'terms_stale'
  | 'prepayment_penalty';

export interface WatchItem {
  kind: WatchKind;
  title: string;
  detail: string;
  icon: string;
  /** Higher sorts first. Structural risks outrank housekeeping. */
  weight: number;
  action?: { label: string; route: string };
}

export interface WatchInputs {
  utilization: number | null;
  replenishThreshold: number;
  lastSyncedAt: string | null;
  hasLinkedAccounts: boolean;
  liability: MortgageLiability | null;
  /** The previous liability snapshot, for change detection. */
  previousLiability: MortgageLiability | null;
  helocDrawEndDate: string | null;
  helocTermsUpdatedAt: string | null;
  helocTermsStale: boolean;
  hasPrepaymentPenalty: boolean | null;
  now?: Date;
}

export function buildWatchItems(i: WatchInputs): WatchItem[] {
  const now = i.now ?? new Date();
  const items: WatchItem[] = [];

  // ── Structural risk to the strategy ──────────────────────────────────────
  if (i.hasPrepaymentPenalty === true) {
    items.push({
      kind: 'prepayment_penalty',
      title: 'Prepayment penalty on this mortgage',
      detail:
        'Your servicer reports a penalty for paying ahead of schedule. Check what it ' +
        'costs before making principal moves — it can outweigh the interest saved.',
      icon: 'alert-circle-outline',
      weight: 100,
      action: { label: 'Review mortgage', route: '/tabs/accounts' },
    });
  }

  const drawEnd = parseDate(i.helocDrawEndDate);
  if (drawEnd) {
    const months = monthsBetween(now, drawEnd);
    if (months <= 0) {
      items.push({
        kind: 'draw_period_ended',
        title: 'Draw period has closed',
        detail:
          'You can no longer draw on this line, so the cycling strategy has stopped. ' +
          'Projections that assume future draws no longer apply.',
        icon: 'lock-closed-outline',
        weight: 95,
        action: { label: 'Update terms', route: '/modals/heloc-terms' },
      });
    } else if (months <= DRAW_LOOKAHEAD_MONTHS) {
      items.push({
        kind: 'draw_period_approaching',
        title: `Draw period ends in ${months} month${months === 1 ? '' : 's'}`,
        detail:
          `Your line closes to new draws in ${formatMonthYear(drawEnd)}. Any plan that ` +
          'runs past that date needs a renewal or a different line.',
        icon: 'time-outline',
        weight: 80,
        action: { label: 'Update terms', route: '/modals/heloc-terms' },
      });
    }
  }

  // ── Money due ────────────────────────────────────────────────────────────
  const pastDue = i.liability?.past_due_amount;
  if (typeof pastDue === 'number' && pastDue > 0) {
    items.push({
      kind: 'past_due',
      title: `${money(pastDue)} past due`,
      detail: 'Your servicer reports an overdue balance. Clear it before moving money to principal.',
      icon: 'warning-outline',
      weight: 90,
    });
  }

  const dueDate = parseDate(i.liability?.next_payment_due_date);
  if (dueDate) {
    const days = daysBetween(now, dueDate);
    if (days >= 0 && days <= PAYMENT_DUE_LOOKAHEAD_DAYS) {
      const amt = i.liability?.next_monthly_payment;
      items.push({
        kind: 'payment_due',
        title: days === 0 ? 'Mortgage payment due today' : `Mortgage payment due in ${days} day${days === 1 ? '' : 's'}`,
        detail: typeof amt === 'number'
          ? `${money(amt)} due ${formatDayMonth(dueDate)}, per your servicer.`
          : `Due ${formatDayMonth(dueDate)}, per your servicer.`,
        icon: 'calendar-outline',
        weight: 70,
      });
    }
  }

  // ── Observed changes ─────────────────────────────────────────────────────
  // Detected by comparing snapshots, not predicted. Plaid exposes no schedule
  // of future rate changes, so claiming one would be a fabrication.
  const escrowNow  = i.liability?.escrow_balance;
  const escrowPrev = i.previousLiability?.escrow_balance;
  if (typeof escrowNow === 'number' && typeof escrowPrev === 'number') {
    const delta = escrowNow - escrowPrev;
    if (Math.abs(delta) >= ESCROW_CHANGE_MIN) {
      items.push({
        kind: 'escrow_change',
        title: `Escrow ${delta > 0 ? 'up' : 'down'} ${money(Math.abs(delta))}`,
        detail:
          `Your escrow balance moved from ${money(escrowPrev)} to ${money(escrowNow)}. ` +
          'A change here usually means taxes or insurance were re-assessed, which can ' +
          'change your monthly payment.',
        icon: 'swap-vertical-outline',
        weight: 50,
      });
    }
  }

  const rateNow  = i.liability?.interest_rate?.percentage;
  const ratePrev = i.previousLiability?.interest_rate?.percentage;
  if (typeof rateNow === 'number' && typeof ratePrev === 'number' && Math.abs(rateNow - ratePrev) >= 0.01) {
    items.push({
      kind: 'rate_change',
      title: `Mortgage rate changed to ${rateNow.toFixed(3)}%`,
      detail:
        `Your servicer now reports ${rateNow.toFixed(3)}%, up from ${ratePrev.toFixed(3)}%. ` +
        'Your payoff projection has been recalculated on the new rate.',
      icon: 'trending-up-outline',
      weight: 60,
    });
  }

  // ── Data freshness ───────────────────────────────────────────────────────
  if (i.hasLinkedAccounts) {
    const synced = parseDate(i.lastSyncedAt);
    const hours = synced ? (now.getTime() - synced.getTime()) / 3_600_000 : Infinity;
    if (hours > STALE_SYNC_HOURS) {
      items.push({
        kind: 'stale_connection',
        title: synced ? 'Balances are out of date' : 'Accounts have never synced',
        detail: synced
          ? `Last successful sync was ${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? '' : 's'} ago. ` +
            'Recommendations on this screen are built on those balances.'
          : 'No balances have come through yet, so nothing on this screen reflects live accounts.',
        icon: 'cloud-offline-outline',
        weight: 65,
        action: { label: 'Reconnect', route: '/tabs/accounts' },
      });
    }
  }

  if (i.utilization !== null && i.utilization > Math.max(i.replenishThreshold, UTILIZATION.caution)) {
    items.push({
      kind: 'utilization_breach',
      title: `Line at ${Math.round(i.utilization * 100)}% utilization`,
      detail:
        'Above your replenish threshold. Direct surplus at the line rather than at ' +
        'principal until it comes back down.',
      icon: 'speedometer-outline',
      weight: 75,
    });
  }

  if (i.helocTermsStale) {
    items.push({
      kind: 'terms_stale',
      title: i.helocTermsUpdatedAt ? 'Is your HELOC rate still current?' : 'Add your HELOC rate',
      detail: i.helocTermsUpdatedAt
        ? 'HELOC rates are variable and no bank shares them through a connection, so ' +
          'this one is only as current as the last time you checked a statement.'
        : 'Without your APR the payoff projection runs on an assumed rate.',
      icon: 'help-circle-outline',
      weight: 40,
      action: { label: 'Confirm terms', route: '/modals/heloc-terms' },
    });
  }

  return items.sort((a, b) => b.weight - a.weight);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function formatDayMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
