// app/modals/heloc-terms.tsx — capture the HELOC terms no provider can supply.
//
// Plaid's /liabilities/get covers credit(credit card, paypal) and loan(student,
// mortgage) only. A HELOC is in neither bucket, so APR, margin, draw-period end,
// payment type, fees and interest calculation do not arrive from any
// institution, ever. Balances do.
//
// So this screen is a permanent part of the flow, not a fallback for
// unsupported banks. It explains why it is asking, because "enter your rate"
// right after linking a bank otherwise reads as the link having failed.
//
// The field that matters most is the one that looks like trivia:
// interest calculation method. Average-daily-balance is what makes cycling
// work; on a statement-balance line the central mechanic does nothing, and a
// projection that ignores the difference is an optimistic number dressed as a
// plan. Given the collateral is a primary residence, that distinction is the
// product.
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import ModalScreen, { Segmented } from '../../components/ui/ModalScreen';
import FormField from '../../components/ui/FormField';
import { Card } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { parseNumeric, parsePositive } from '../../lib/parseNumeric';
import {
  deriveCreditLimit, termsFromProfile, daysSinceVerified, TERMS_STALE_DAYS,
  type HelocPaymentType,
} from '../../lib/helocTerms';
import {
  INTEREST_CALC_LABEL, INTEREST_CALC_EXPLAINER, type InterestCalcMethod,
} from '../../lib/config';
import { hapticSuccess } from '../../lib/haptics';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { LinkedAccount } from '../../lib/types';

const PAYMENT_OPTIONS = [
  { value: 'interest_only' as HelocPaymentType, label: 'Interest-only' },
  { value: 'amortizing'    as HelocPaymentType, label: 'Amortizing' },
];

const CALC_OPTIONS = (Object.keys(INTEREST_CALC_LABEL) as InterestCalcMethod[])
  .map(v => ({ value: v, label: INTEREST_CALC_LABEL[v] }));

export default function HelocTermsModal() {
  const styles = useStyles();
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const { helocAccount } = useAccounts(profile?.id ?? null);

  const existing = termsFromProfile(profile as unknown as Record<string, unknown>);
  const balances = firstBalances(helocAccount);
  const derived  = deriveCreditLimit(balances, existing.creditLimit);

  const [rate,        setRate]        = useState(existing.rate   != null ? String(round2(existing.rate * 100)) : '');
  const [index,       setIndex]       = useState(profile?.heloc_rate_index ?? '');
  const [margin,      setMargin]      = useState(existing.margin != null ? String(round2(existing.margin * 100)) : '');
  const [limit,       setLimit]       = useState(existing.creditLimit != null ? String(existing.creditLimit) : '');
  const [balance,     setBalance]     = useState(profile?.heloc_balance != null ? String(profile.heloc_balance) : '');
  const [drawMonth,   setDrawMonth]   = useState(monthOf(existing.drawEndDate));
  const [drawYear,    setDrawYear]    = useState(yearOf(existing.drawEndDate));
  const [paymentType, setPaymentType] = useState<HelocPaymentType | null>(existing.paymentType);
  const [calcMethod,  setCalcMethod]  = useState<InterestCalcMethod | null>(
    profile?.heloc_interest_calc_method ?? null,
  );
  const [drawFee,     setDrawFee]     = useState(numStr(profile?.heloc_draw_fee));
  const [annualFee,   setAnnualFee]   = useState(numStr(profile?.heloc_annual_fee));
  const [closeFee,    setCloseFee]    = useState(numStr(profile?.heloc_early_closure_fee));
  const [saving,      setSaving]      = useState(false);

  const rateNum     = parsePositive(rate);
  const drawDate    = buildDate(drawMonth, drawYear);
  const drawInvalid = (drawMonth !== '' || drawYear !== '') && drawDate === null;
  const canSave     = rateNum !== null && rateNum > 0 && !drawInvalid;

  const sinceVerified = daysSinceVerified(existing.updatedAt);

  // "0" is a real balance and must survive: parsePositive returns 0 for "0" and
  // null for "", which is exactly the distinction this field turns on.
  const balanceNum = parsePositive(balance);
  const lastBalanceAt = profile?.heloc_balance_updated_at
    ? new Date(profile.heloc_balance_updated_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const marginNum = parseNumeric(margin);
    // Only re-stamp when the figure actually moved. Saving a rate edit must not
    // make a months-old balance claim to have been confirmed today — that
    // timestamp is the only thing telling the user when to distrust it.
    const balanceChanged = balanceNum !== (profile?.heloc_balance ?? null);
    await updateProfile({
      heloc_rate:                 rateNum! / 100,
      heloc_rate_index:           index.trim() || null,
      heloc_margin:               marginNum !== null ? marginNum / 100 : null,
      heloc_credit_limit:         parsePositive(limit),
      heloc_balance:              balanceNum,
      heloc_balance_updated_at:   balanceChanged
        ? new Date().toISOString()
        : profile?.heloc_balance_updated_at ?? null,
      heloc_draw_end_date:        drawDate,
      heloc_payment_type:         paymentType,
      heloc_interest_calc_method: calcMethod,
      heloc_draw_fee:             parsePositive(drawFee),
      heloc_annual_fee:           parsePositive(annualFee),
      heloc_early_closure_fee:    parsePositive(closeFee),
      heloc_terms_updated_at:     new Date().toISOString(),
    });
    setSaving(false);
    hapticSuccess();
    router.back();
  }

  return (
    <ModalScreen
      title="Your HELOC terms"
      intro={
        'Banks share HELOC balances with us automatically, but not the terms — no provider ' +
        'offers HELOC rates or draw dates through a bank connection. These fields are what ' +
        'turn balances into a payoff projection.'
      }
      save={{ label: 'Save terms', onPress: handleSave, disabled: !canSave, saving }}
      footnote={
        `We will ask you to confirm these every ${TERMS_STALE_DAYS} days, because HELOC ` +
        'rates move. Projections built on them are estimates, not guarantees.'
      }
    >
      {sinceVerified !== null && sinceVerified >= TERMS_STALE_DAYS && (
        <View style={styles.staleCard}>
          <Text style={styles.staleText}>
            Last confirmed {sinceVerified} days ago. Is your rate still what it says below?
            Your latest statement will have it.
          </Text>
        </View>
      )}

      {/* ── Rate ────────────────────────────────────────────────────────── */}
      <Card>
        <FormField
          label="Current APR"
          suffix="%"
          value={rate}
          onChangeText={setRate}
          keyboardType="decimal-pad"
          hint="From your most recent statement."
          accessibilityLabel="Current APR"
        />
        <FormField
          label="Rate index"
          value={index}
          onChangeText={setIndex}
          placeholder="Prime"
          hint="Optional. Most HELOCs are the Wall Street Journal prime rate plus a margin."
          accessibilityLabel="Rate index"
        />
        <FormField
          label="Margin over index"
          suffix="%"
          value={margin}
          onChangeText={setMargin}
          keyboardType="decimal-pad"
          hint="Optional. Recorded so a rate change is easy to sanity-check later."
          accessibilityLabel="Margin over index"
        />
      </Card>

      {/* ── Credit limit ────────────────────────────────────────────────── */}
      <Card>
        {derived.source === 'plaid_limit' || derived.source === 'derived' ? (
          <View>
            <Text style={styles.label}>Credit limit</Text>
            <Text style={styles.derivedValue}>${fmt(derived.limit ?? 0)}</Text>
            <Text style={styles.hint}>
              {derived.source === 'derived'
                ? 'Calculated from your linked balance plus available credit, so it stays current.'
                : 'Reported by your bank.'}
            </Text>
          </View>
        ) : (
          <FormField
            label="Credit limit"
            prefix="$"
            value={limit}
            onChangeText={setLimit}
            keyboardType="numeric"
            hint="Link your HELOC and this fills in from your balances instead."
            accessibilityLabel="Credit limit"
          />
        )}
      </Card>

      {/* ── Current balance ──────────────────────────────────────────────────
          Not a term, and on a screen titled "Your HELOC terms" that is worth a
          rule of its own. It is here because it is the field that unblocks
          everything else: a limit without a balance leaves safeToMove, sweep
          and strike with nothing to reason from, and each of them now refuses
          to guess rather than assuming the line is undrawn.

          Hidden entirely when a bank reports it. A hand-entered figure that
          silently loses to a live one is a box someone types into for no
          effect, and a second balance on screen invites the question of which
          one the app believes. */}
      {balances?.current == null && (
        <Card>
          <FormField
            label="Current balance"
            prefix="$"
            value={balance}
            onChangeText={setBalance}
            keyboardType="numeric"
            hint={
              lastBalanceAt
                ? `You last set this ${lastBalanceAt}. Update it after a sweep or a dump so ` +
                  'your next-dump progress stays right.'
                : 'What is drawn on the line today. Without it we cannot tell how far ' +
                  'along the cycle you are, so we will not recommend a move.'
            }
            accessibilityLabel="Current HELOC balance"
          />
          <Text style={styles.hint}>
            Enter 0 if the line is open but untouched — that is a real answer, and it is
            different from leaving this blank.
          </Text>
        </Card>
      )}

      {/* ── How interest is charged — the load-bearing question ─────────── */}
      <Card>
        <Text style={styles.label}>How interest is calculated</Text>
        <Text style={styles.hint}>
          This one term decides whether cycling saves you anything. Your agreement or a call
          to the bank will settle it.
        </Text>
        <View style={{ marginTop: Spacing[3] }}>
          <Segmented options={CALC_OPTIONS} value={calcMethod} onChange={setCalcMethod} />
        </View>
        {calcMethod && (
          <Text style={styles.explainer}>{INTEREST_CALC_EXPLAINER[calcMethod]}</Text>
        )}
        {calcMethod === 'statement_balance' && (
          <Text style={styles.warnText}>
            Projections will still calculate, but they will overstate what cycling does on a
            statement-balance line. Treat the payoff date as a ceiling, not a plan.
          </Text>
        )}
      </Card>

      {/* ── Payment type ────────────────────────────────────────────────── */}
      <Card>
        <Text style={styles.label}>Payments during the draw period</Text>
        <Text style={styles.hint}>
          Cycling only works while payments are interest-only. Once a HELOC amortizes, the
          strategy stops working.
        </Text>
        <View style={{ marginTop: Spacing[3] }}>
          <Segmented options={PAYMENT_OPTIONS} value={paymentType} onChange={setPaymentType} />
        </View>
        {paymentType === 'amortizing' && (
          <Text style={styles.warnText}>
            An amortizing HELOC cannot be cycled. Projections will still calculate, but the
            strategy is not a fit for this account.
          </Text>
        )}
      </Card>

      {/* ── Draw period ─────────────────────────────────────────────────── */}
      <Card>
        <Text style={styles.label}>Draw period ends</Text>
        <Text style={styles.hint}>
          After this date you can no longer draw, so the plan has to finish before it.
        </Text>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Month"
              value={drawMonth}
              onChangeText={setDrawMonth}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="MM"
              style={{ textAlign: 'center' }}
              accessibilityLabel="Draw period end month"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Year"
              value={drawYear}
              onChangeText={setDrawYear}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="YYYY"
              style={{ textAlign: 'center' }}
              error={drawInvalid ? 'Enter a month 1–12 and a four-digit year' : undefined}
              accessibilityLabel="Draw period end year"
            />
          </View>
        </View>
      </Card>

      {/* ── Fees ────────────────────────────────────────────────────────── */}
      <Card>
        <Text style={styles.label}>Fees</Text>
        <Text style={styles.hint}>
          Optional, and worth having: a draw fee charged every cycle is a recurring cost the
          projection would otherwise ignore.
        </Text>
        <View style={{ marginTop: Spacing[3] }}>
          <FormField
            label="Per-draw fee"
            prefix="$"
            value={drawFee}
            onChangeText={setDrawFee}
            keyboardType="numeric"
            accessibilityLabel="Per-draw fee"
          />
          <FormField
            label="Annual fee"
            prefix="$"
            value={annualFee}
            onChangeText={setAnnualFee}
            keyboardType="numeric"
            accessibilityLabel="Annual fee"
          />
          <FormField
            label="Early closure fee"
            prefix="$"
            value={closeFee}
            onChangeText={setCloseFee}
            keyboardType="numeric"
            hint="Charged by some lenders if the line is closed within the first few years."
            accessibilityLabel="Early closure fee"
          />
        </View>
      </Card>
    </ModalScreen>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function firstBalances(account: LinkedAccount | null) {
  if (!account || account.accounts.length === 0) return null;
  const b = account.accounts[0].balances;
  return { current: b.current, available: b.available, limit: b.limit ?? null };
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function numStr(n: number | null | undefined) { return n != null ? String(n) : ''; }
function round2(n: number) { return Math.round(n * 100) / 100; }
function monthOf(iso: string | null) {
  if (!iso) return '';
  const m = iso.split('-')[1];
  return m ? String(Number(m)) : '';
}
function yearOf(iso: string | null) {
  return iso ? iso.split('-')[0] ?? '' : '';
}
function buildDate(month: string, year: string): string | null {
  if (!month && !year) return null;
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(y) || year.length !== 4) return null;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

const useStyles = createThemedStyles(t => ({
  staleCard: { backgroundColor: t.colors.mint50, borderRadius: Radius.lg, padding: Spacing[4] },
  staleText: { fontSize: Typography.sm, color: t.colors.mint700, lineHeight: 20 },

  label: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  hint: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 18, marginTop: Spacing[1] },
  derivedValue: {
    fontSize: Typography.xl, fontWeight: Typography.bold,
    color: t.colors.textPrimary, marginTop: Spacing[2],
  },
  explainer: {
    fontSize: Typography.xs, color: t.colors.textSecondary,
    lineHeight: 18, marginTop: Spacing[3],
  },
  warnText: {
    fontSize: Typography.xs, color: t.colors.textSecondary,
    lineHeight: 18, marginTop: Spacing[3], fontWeight: Typography.medium,
  },
  dateRow: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3] },
}));
