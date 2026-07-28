// hooks/useFinancials.ts — one reading of the user's position, shared by every screen.
//
// Dashboard and Accounts were each deriving balances, limits, rates and equity
// from the same rows with slightly different fallbacks, which is how two
// screens end up disagreeing about a HELOC limit. Everything is resolved once,
// here, with each value's provenance attached.
//
// Provenance is not decoration. This app mixes servicer-reported figures,
// bank-reported balances, user-typed terms and its own arithmetic on one
// screen, and the difference between them is exactly what a user needs to know
// before acting on a recommendation.
import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useAccounts } from './useAccounts';
import { useCashflow } from './useCashflow';
import { useTransactionMeta } from './useTransactionMeta';
import { computeProjection, genericProjection } from '../lib/projections';
import {
  resolveHelocRate, deriveCreditLimit, termsAreStale, drawPeriodStatus,
  type DrawStatus,
} from '../lib/helocTerms';
import {
  resolveMortgage, deriveBaseline, parseDate,
  type ResolvedMortgage, type Baseline, type MortgageLiability,
} from '../lib/mortgage';
import { evaluateMove, type SafeToMove, type Blocker } from '../lib/safeToMove';
import { buildWatchItems, type WatchItem } from '../lib/watchItems';
import {
  compareToEntered, classifyTransactions,
  type DerivedCashflow, type CashflowGap, type TransactionRow, type TransactionClassification,
} from '../lib/cashflow';
import { UTILIZATION, CASHFLOW_MATERIAL_GAP_PCT } from '../lib/config';
import type { LinkedAccount, PayoffProjection, UserProfile } from '../lib/types';

export interface Financials {
  profile: UserProfile | null;
  accounts: LinkedAccount[];
  loading: boolean;
  refreshing: boolean;
  /** Resolves true when the read succeeded. */
  refresh: () => Promise<boolean>;
  /** Why the accounts read failed, or null. Distinct from "no accounts". */
  error: string | null;

  hasLinkedAccounts: boolean;
  /** Most recent successful sync across all linked items. */
  lastSyncedAt: string | null;
  /** True when the figures on screen are the user's own, not a linked bank's. */
  isManual: boolean;
  /** What the balances are "as of". Sync time when linked, else last edit. */
  balanceAsOfDate: Date | null;
  /** False when nothing real is on file and the screen is showing an example. */
  hasRealData: boolean;

  // ── Mortgage ────────────────────────────────────────────────────────────
  mortgage: ResolvedMortgage;
  liability: MortgageLiability | null;
  previousLiability: MortgageLiability | null;
  mortgageBalance: number | null;
  baseline: Baseline;

  // ── HELOC ───────────────────────────────────────────────────────────────
  helocDrawn: number | null;
  helocAvailable: number | null;
  helocLimit: number | null;
  helocLimitSource: 'plaid_limit' | 'derived' | 'user' | 'unknown';
  helocRate: number;
  helocRateAssumed: boolean;
  helocTermsStale: boolean;
  drawStatus: DrawStatus;
  utilization: number | null;

  // ── Cash flow ───────────────────────────────────────────────────────────
  income: number;
  expenses: number;
  payment: number;
  surplus: number;
  surplusBasis: 'entered' | 'trailing';
  liquidCash: number;
  /** Trailing transaction average, when there is enough history to derive one. */
  derivedCashflow: DerivedCashflow | null;
  /** The rows behind that average, for the Cash flow tab's category breakdown. */
  transactions: TransactionRow[];
  /** Which rows are transfers and which inflows are income. One shared answer. */
  transactionClassification: TransactionClassification;
  /** How far the figures in use sit from what the transactions say. */
  cashflowGap: CashflowGap | null;
  awaitingTransactions: boolean;

  // ── Property ────────────────────────────────────────────────────────────
  homeValue: number | null;
  homeValueAsOf: Date | null;
  equity: number | null;
  combinedLTV: number | null;

  // ── Assumptions ─────────────────────────────────────────────────────────
  replenishThreshold: number;
  forwardRateDeltaBps: number;

  // ── Conclusions ─────────────────────────────────────────────────────────
  projection: PayoffProjection;
  safeToMove: SafeToMove;
  watchItems: WatchItem[];
}

export function useFinancials(): Financials {
  const { profile } = useAuth();
  const {
    accounts, loading, refreshing, error, refresh,
    mortgageAccount, helocAccount, savingsAccount,
  } = useAccounts(profile?.id ?? null);

  // Rows the user marked as duplicates. Read HERE, at the top of the shared
  // derivation, rather than in the Cash flow tab — every figure below is summed
  // through the classification these feed, so a screen that applied hides on its
  // own would show a spend total that no longer reconciled with the surplus.
  const { hiddenIds } = useTransactionMeta(profile?.id ?? null);

  // Transactions only exist once something is linked, and linking is Pro-gated,
  // so the presence of an account is the gate — no separate entitlement check.
  const { derived, transactions, awaitingBackfill } =
    useCashflow(profile?.id ?? null, accounts.length > 0, hiddenIds);

  return useMemo(
    () => derive(
      profile, accounts, mortgageAccount, helocAccount, savingsAccount,
      loading, refreshing, error, refresh, derived, transactions, awaitingBackfill,
      hiddenIds,
    ),
    [
      profile, accounts, mortgageAccount, helocAccount, savingsAccount,
      loading, refreshing, error, refresh, derived, transactions, awaitingBackfill,
      hiddenIds,
    ],
  );
}

function derive(
  profile: UserProfile | null,
  accounts: LinkedAccount[],
  mortgageAccount: LinkedAccount | null,
  helocAccount: LinkedAccount | null,
  savingsAccount: LinkedAccount | null,
  loading: boolean,
  refreshing: boolean,
  error: string | null,
  refresh: () => Promise<boolean>,
  derivedCashflow: DerivedCashflow | null,
  transactions: TransactionRow[],
  awaitingTransactions: boolean,
  hiddenIds: Set<string>,
): Financials {
  const hasLinkedAccounts = accounts.length > 0;
  const lastSyncedAt = newestSync(accounts);

  // ── Mortgage ─────────────────────────────────────────────────────────────
  const liability         = firstMortgageLiability(mortgageAccount?.liabilities);
  const previousLiability = firstMortgageLiability(mortgageAccount?.liabilities_prev);
  const liveMortgage      = firstBalance(mortgageAccount);

  const mortgage = resolveMortgage(liability, liveMortgage, {
    balance:              profile?.mortgage_balance ?? null,
    rate:                 profile?.mortgage_rate ?? null,
    monthlyPayment:       profile?.monthly_payment ?? null,
    originationDate:      profile?.mortgage_origination_date ?? null,
    originationPrincipal: profile?.mortgage_origination_principal ?? null,
    termMonths:           profile?.mortgage_term_months ?? null,
    hasPrepaymentPenalty: profile?.mortgage_has_prepayment_penalty ?? null,
    propertyAddress:      profile?.property_address ?? null,
  });
  const mortgageBalance = mortgage.balance.value;

  // ── HELOC ────────────────────────────────────────────────────────────────
  const helocBalances = firstBalances(helocAccount);
  const helocDrawn    = helocBalances?.current ?? null;
  const limitResult   = deriveCreditLimit(helocBalances, profile?.heloc_credit_limit ?? null);
  const helocLimit    = limitResult.limit;
  const helocAvailable = helocBalances?.available
    ?? (helocLimit !== null && helocDrawn !== null ? Math.max(0, helocLimit - helocDrawn) : null);

  const { rate: helocRate, isAssumed: helocRateAssumed } = resolveHelocRate(profile?.heloc_rate);
  const helocTermsStale = termsAreStale(profile?.heloc_terms_updated_at);
  const utilization = helocLimit && helocLimit > 0 && helocDrawn !== null
    ? clamp01(helocDrawn / helocLimit)
    : null;

  // ── Cash flow ────────────────────────────────────────────────────────────
  // These figures are either the user's own estimate or a trailing transaction
  // average they reviewed and adopted (see hooks/useCashflow). Which one it is
  // changes how every surface words itself, so it travels with the numbers.
  const income   = profile?.monthly_income   ?? 0;
  const expenses = profile?.monthly_expenses ?? 0;
  const payment  = mortgage.nextPayment.value ?? profile?.monthly_payment ?? 0;
  const surplus  = income - expenses - payment;
  const liquidCash = firstBalance(savingsAccount) ?? 0;
  const surplusBasis: 'entered' | 'trailing' =
    profile?.cashflow_source === 'derived' ? 'trailing' : 'entered';

  // Deliberately a comparison, never a substitution. The derived figures are
  // shown next to the user's own so they can adopt them; nothing here silently
  // replaces what someone told us about their own life.
  const cashflowGap = derivedCashflow
    ? compareToEntered(derivedCashflow, income, expenses, CASHFLOW_MATERIAL_GAP_PCT)
    : null;

  // ── Property ─────────────────────────────────────────────────────────────
  const homeValue = profile?.home_value && profile.home_value > 0 ? profile.home_value : null;
  const totalSecured = (mortgageBalance ?? 0) + (helocDrawn ?? 0);
  const equity      = homeValue !== null ? homeValue - totalSecured : null;
  const combinedLTV = homeValue !== null && homeValue > 0 ? totalSecured / homeValue : null;

  // ── Assumptions ──────────────────────────────────────────────────────────
  const replenishThreshold  = profile?.replenish_threshold ?? UTILIZATION.replenishThreshold;
  const forwardRateDeltaBps = profile?.forward_rate_delta_bps ?? 0;

  // ── Projection ───────────────────────────────────────────────────────────
  const hasRealData = mortgageBalance !== null && mortgageBalance > 0 && payment > 0;
  const mortgageRate = mortgage.rate.value ?? 0.065;
  const projection: PayoffProjection = hasRealData
    ? computeProjection({
        mortgageBalance: mortgageBalance!,
        mortgageRate,
        monthlyPayment:  payment,
        monthlySurplus:  Math.max(0, surplus),
        helocRate:       helocRate + forwardRateDeltaBps / 10_000,
        helocLimit:      helocLimit ?? undefined,
      })
    : genericProjection();

  const baseline = deriveBaseline(mortgage, mortgageBalance);
  const draw = drawPeriodStatus(profile?.heloc_draw_end_date, projection.acceleratedMonths);

  // ── Safe to move ─────────────────────────────────────────────────────────
  const blockers: Blocker[] = [];
  if (profile?.heloc_payment_type === 'amortizing') blockers.push('amortizing_heloc');
  if (draw.status === 'ended') blockers.push('draw_ended');
  if (mortgage.hasPrepaymentPenalty.value === true) blockers.push('prepayment_penalty');

  const safeToMove = evaluateMove({
    helocLimit,
    helocDrawn,
    avgMonthlySurplus: surplus,
    surplusBasis,
    monthlyExpenses: expenses,
    liquidCash,
    helocRate: helocRate + forwardRateDeltaBps / 10_000,
    mortgageBalance: mortgageBalance ?? 0,
    mortgageRate,
    monthlyPayment: payment,
    replenishThreshold,
    blockers,
  });

  const watchItems = buildWatchItems({
    utilization,
    replenishThreshold,
    lastSyncedAt,
    hasLinkedAccounts,
    liability,
    previousLiability,
    helocDrawEndDate: profile?.heloc_draw_end_date ?? null,
    helocTermsUpdatedAt: profile?.heloc_terms_updated_at ?? null,
    helocTermsStale,
    hasPrepaymentPenalty: mortgage.hasPrepaymentPenalty.value,
    cashflowGap: cashflowGap && derivedCashflow
      ? {
          expenseGap: cashflowGap.expenseGap,
          material:   cashflowGap.material,
          risky:      cashflowGap.risky,
          coverageMonths: derivedCashflow.coverageMonths,
        }
      : null,
  });

  return {
    profile, accounts, loading, refreshing, error, refresh,
    hasLinkedAccounts,
    lastSyncedAt,
    isManual: !hasLinkedAccounts,
    balanceAsOfDate: parseDate(lastSyncedAt) ?? parseDate(profile?.heloc_terms_updated_at ?? null),
    hasRealData,

    mortgage, liability, previousLiability, mortgageBalance, baseline,

    helocDrawn, helocAvailable, helocLimit,
    helocLimitSource: limitResult.source,
    helocRate, helocRateAssumed, helocTermsStale,
    drawStatus: draw.status,
    utilization,

    income, expenses, payment, surplus,
    surplusBasis,
    liquidCash,
    derivedCashflow,
    transactions,
    transactionClassification: classifyTransactions(transactions, { hiddenIds }),
    cashflowGap,
    awaitingTransactions,

    homeValue,
    homeValueAsOf: parseDate(profile?.home_value_as_of ?? null),
    equity, combinedLTV,

    replenishThreshold, forwardRateDeltaBps,

    projection, safeToMove, watchItems,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function firstBalance(account: LinkedAccount | null): number | null {
  if (!account || account.accounts.length === 0) return null;
  return account.accounts[0].balances.current;
}
function firstBalances(account: LinkedAccount | null) {
  if (!account || account.accounts.length === 0) return null;
  const b = account.accounts[0].balances;
  return { current: b.current, available: b.available, limit: b.limit ?? null };
}
function firstMortgageLiability(
  l: { mortgage?: MortgageLiability[] } | null | undefined,
): MortgageLiability | null {
  return l?.mortgage?.[0] ?? null;
}
function newestSync(accounts: LinkedAccount[]): string | null {
  let newest: string | null = null;
  for (const a of accounts) {
    if (!a.accounts_updated_at) continue;
    if (!newest || a.accounts_updated_at > newest) newest = a.accounts_updated_at;
  }
  return newest;
}
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
