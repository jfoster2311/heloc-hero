// lib/pricing.ts — one source of truth for tiers and prices.
//
// Prices previously appeared in four places with three different answers:
// types.ts said Accelerator was $14.99, settings said $14.99/mo, and the
// paywall rendered $19.99/mo for the same plan. That is a consumer-protection
// problem before it is a code-duplication one.
//
// The model is now two tiers: free, and Pro billed monthly or annually.
// A further tier belongs later, when more of the work is genuinely hands-off.
import type { BillingPeriod, Tier } from './types';

/**
 * US list prices, for display ONLY when StoreKit has not returned a product.
 *
 * Apple requires the price shown to be the price charged, in the user's
 * storefront and currency. So these are never used to price a purchase: when
 * StoreKit is unavailable the purchase button is disabled, and these are shown
 * labelled as US pricing so the screen is not blank.
 */
export const US_LIST_PRICE: Record<BillingPeriod, string> = {
  monthly: '$19.99',
  annual:  '$175',
};

/** Annual framed per-month, for comparison. 175 / 12 = 14.58. */
export const US_LIST_ANNUAL_PER_MONTH = '$14.58';

/** Roughly what the annual plan saves against twelve monthly payments. */
export const ANNUAL_SAVING_PCT = Math.round((1 - 175 / (19.99 * 12)) * 100);

/** RevenueCat package identifiers must contain one of these. */
export const PACKAGE_MATCH: Record<BillingPeriod, string> = {
  monthly: 'month',
  annual:  'annual',
};

/**
 * What Pro actually unlocks today. Every line here is something the app does.
 *
 * Deliberately absent, because none of it exists: automatic transfers, "auto
 * move surplus", "auto-pay HELOC to mortgage", real-time syncing (balance
 * refresh is throttled to roughly twice a day on purpose), and remote push
 * alerts (no delivery pipeline is deployed).
 */
export const PRO_FEATURES: string[] = [
  'Link your mortgage, HELOC and savings for live balances',
  'Alerts on your phone when it is time to move money',
  'Cycle tracking with your real dump history and streak',
  // No ™ — the mark is not registered and nothing else in the app claims one.
  'HELOC Hero score, kept current from your linked accounts',
  'Payoff projections that follow your live balances',
];

/** What stays free forever. Matches the free-tier promise in onboarding. */
export const FREE_FEATURES: string[] = [
  'Payoff calculator and projections',
  'Manual balance entry',
  'Cycle tracking and streaks',
  'Every strategy guide',
];

/** Legacy three-tier values are honoured as Pro so existing rows keep access. */
export function isPaidTier(tier: Tier | null | undefined): boolean {
  return tier === 'pro' || tier === 'medium' || tier === 'full';
}
