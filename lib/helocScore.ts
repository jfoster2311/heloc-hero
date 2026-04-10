// lib/helocScore.ts
import type { HelocScore } from './types';
import { Colors } from './theme';

export interface ScoreInputs {
  monthlyIncome: number;
  monthlyExpenses: number;
  helocBalance: number;
  helocLimit: number;
  creditScore: number;
  homeValue: number;
  mortgageBalance: number;
}

/**
 * Computes the HELOC Hero Score™ (0–100) based on four factors:
 *   - Surplus    55 pts: monthly surplus as % of income (50% surplus = full score)
 *   - Utilization 25 pts: HELOC balance / limit (lower = better)
 *   - Credit      20 pts: normalized 580–800
 *   - MTE Modifier ±10:  LTV-based bonus/penalty
 */
export function computeHelocScore(inputs: ScoreInputs): HelocScore {
  const {
    monthlyIncome, monthlyExpenses,
    helocBalance, helocLimit,
    creditScore,
    homeValue, mortgageBalance,
  } = inputs;

  // 1. Surplus score (0–55)
  const surplusPct = monthlyIncome > 0
    ? (monthlyIncome - monthlyExpenses) / monthlyIncome
    : 0;
  // 50% surplus earns the full 55 pts; clamped
  const surplusScore = Math.min(55, Math.round(Math.max(0, surplusPct) * 110));

  // 2. Utilization score (0–25) — lower utilization is better
  const utilization = helocLimit > 0 ? helocBalance / helocLimit : 0;
  const utilizationScore = Math.round((1 - Math.min(utilization, 1)) * 25);

  // 3. Credit score (0–20) — normalized 580–800 range
  const creditNorm = Math.max(0, Math.min(1, (creditScore - 580) / (800 - 580)));
  const creditPoints = Math.round(creditNorm * 20);

  // 4. MTE modifier (-10 to +10) based on LTV
  const ltv = homeValue > 0 ? mortgageBalance / homeValue : 1;
  let mteModifier: number;
  if (ltv <= 0.60) mteModifier = 10;
  else if (ltv <= 0.75) mteModifier = 5;
  else if (ltv <= 0.85) mteModifier = 0;
  else mteModifier = -10;

  const total = Math.max(0, Math.min(100, surplusScore + utilizationScore + creditPoints + mteModifier));

  let label: HelocScore['label'];
  let color: string;
  if (total >= 80)      { label = 'Excellent'; color = Colors.success; }
  else if (total >= 60) { label = 'Good';      color = Colors.mint600; }
  else if (total >= 40) { label = 'Fair';      color = Colors.warning; }
  else                  { label = 'Needs Work'; color = Colors.error;  }

  return { total, surplusScore, utilizationScore, creditPoints, mteModifier, label, color };
}

/** Returns a representative generic score for free-tier users */
export function genericHelocScore(): HelocScore {
  return {
    total: 62,
    surplusScore: 34,
    utilizationScore: 18,
    creditPoints: 12,
    mteModifier: -2,
    label: 'Good',
    color: Colors.mint600,
  };
}
