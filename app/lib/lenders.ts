// lib/lenders.ts — HELOC lender types and hard-filter logic

export type HelocStatus = 'have_one' | 'no_heloc' | 'not_sure';

export interface Lender {
  id: string;
  name: string;
  logoUrl?: string;
  isPartner: boolean;
  disclosure?: string;
  /** True when the lender offers interest-only draw with 10+ year draw period */
  interestOnlyDraw: boolean;
  drawPeriodYears: number;
  /** Approximate APR range for reference only */
  aprRangeText?: string;
  applyUrl?: string;
}

/** An empty roster. Populate only after attorney review of referral disclosures. */
export const LENDERS: Lender[] = [];

/**
 * Hard filter: strategy requires interest-only draw AND 10+ year draw period.
 * A lender that fails either condition must never display.
 */
export function isStrategyFit(lender: Lender): boolean {
  return lender.interestOnlyDraw && lender.drawPeriodYears >= 10;
}

/** Returns lenders that pass the hard filter. */
export function eligibleLenders(): Lender[] {
  return LENDERS.filter(isStrategyFit);
}
