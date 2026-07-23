// app/modals/move-money.tsx — the "should I move money?" decision.
//
// The most consequential screen in the app, and the one where standard growth
// tactics are the wrong instinct.
//
// Principles it is built to:
//  · Show the reasoning, don't issue a verdict. The screen states the numbers
//    it is reasoning from — current utilization, the surplus, where the move
//    lands you, how long replenishing takes — so the user builds judgement
//    about their own cash flow instead of learning to obey a button.
//  · The recommended action is never the only visually available one. "Move"
//    and "Not now" are the same size and weight, differing only in fill. In a
//    product where the strategy carries real rate and liquidity risk, a single
//    glowing button is a nudge not worth owning.
//  · The downside is as legible as the upside — same card, same type size.
//  · Postel's Law on the amount: "$4,000", "4k" and "4 000" all parse.
//
// HONESTY: HELOC Hero has no payment rail. It cannot move money, so nothing
// here claims to. The action records a transfer the user makes at their own
// bank, and is labelled as exactly that.
import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { supabase } from '../../lib/supabase';
import { parsePositive } from '../../lib/parseNumeric';
import { analyzeMove, suggestedMove, CAUTION_UTILIZATION } from '../../lib/moveDecision';
import { bufferMonths } from '../../lib/safeToMove';
import { BUFFER } from '../../lib/config';
import { resolveHelocRate, deriveCreditLimit } from '../../lib/helocTerms';
import { formatMonths } from '../../lib/projections';
import { hapticLight, hapticSuccess } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
import type { LinkedAccount } from '../../lib/types';

export default function MoveMoneyModal() {
  const router = useRouter();
  const { profile } = useAuth();
  const { mortgageAccount, helocAccount, savingsAccount } = useAccounts(profile?.id ?? null);

  const helocBalance = firstBalance(helocAccount);
  const helocLimit   = deriveCreditLimit(
    firstBalances(helocAccount),
    profile?.heloc_credit_limit ?? null,
  ).limit;
  const { rate: helocRate, isAssumed: helocRateAssumed } =
    resolveHelocRate(profile?.heloc_rate);
  const mortgageBal  = firstBalance(mortgageAccount) ?? profile?.mortgage_balance ?? 0;

  const income   = profile?.monthly_income   ?? 0;
  const expenses = profile?.monthly_expenses ?? 0;
  const payment  = profile?.monthly_payment  ?? 0;
  const surplus  = Math.max(0, income - expenses - payment);

  const drawn = helocBalance ?? 0;
  const limit = helocLimit ?? 0;
  const hasLimit = limit > 0;

  const suggested = useMemo(
    () => suggestedMove(limit, drawn, surplus),
    [limit, drawn, surplus],
  );

  const [amount, setAmount] = useState<number>(suggested);
  const [draft, setDraft]   = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const analysis = useMemo(() => analyzeMove({
    helocLimit: limit,
    helocDrawn: drawn,
    moveAmount: amount,
    monthlySurplus: surplus,
    helocRate,
    mortgageBalance: mortgageBal,
    mortgageRate: profile?.mortgage_rate ?? 0.065,
    monthlyPayment: payment || 2_000,
  }), [limit, drawn, amount, surplus, helocRate, mortgageBal, profile?.mortgage_rate, payment]);

  const canLog = amount > 0 && !analysis.exceedsLimit;

  // Liquidity, before and after. Available credit counts because on a HELOC it
  // IS the emergency fund — which is the whole reason drawing it down has a
  // cost worth stating next to the interest saved.
  const liquidCash    = firstBalance(savingsAccount) ?? 0;
  const bufferBefore  = bufferMonths(liquidCash, Math.max(0, limit - drawn), expenses);
  const bufferAfter   = bufferMonths(liquidCash, analysis.availableAfter, expenses);

  async function handleLogMove() {
    if (!profile?.id || !canLog) return;
    setLogging(true);
    const { error } = await supabase.from('automation_log').insert({
      user_id: profile.id,
      action:  'dump',
      amount,
      status:  'success',
      note:    'Logged manually from the move decision screen',
    });
    setLogging(false);

    if (error) {
      Alert.alert('Could not record it', `${error.message}\n\nNothing was saved. Please try again.`);
      return;
    }
    hapticSuccess();
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Move money to your mortgage?</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeBtn}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Amount ────────────────────────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.label}>How much?</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={draft ?? (amount > 0 ? amount.toLocaleString('en-US') : '')}
                onChangeText={(t) => {
                  setDraft(t);
                  const n = parsePositive(t);
                  if (n !== null) setAmount(Math.round(n));
                }}
                onBlur={() => setDraft(null)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                selectTextOnFocus
                accessibilityLabel="Amount to move"
              />
            </View>
            {suggested > 0 && amount !== suggested && (
              <TouchableOpacity
                onPress={() => { hapticLight(); setDraft(null); setAmount(suggested); }}
                style={styles.suggestBtn}
                accessibilityLabel={`Use suggested amount of ${suggested} dollars`}
              >
                <Text style={styles.suggestText}>
                  Use ${suggested.toLocaleString()} — the most that stays under{' '}
                  {Math.round(CAUTION_UTILIZATION * 100)}% utilization
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── The reasoning, in plain sentences ─────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>What this is based on</Text>

            <Reason
              text={hasLimit
                ? `Your HELOC is at ${fmtPct(analysis.utilBefore)} — $${fmt(drawn)} drawn of a $${fmt(limit)} limit.`
                : `You have $${fmt(drawn)} drawn. We don't know your credit limit, so utilization isn't shown.`}
            />
            <Reason
              text={surplus > 0
                ? `You told us your monthly surplus is $${fmt(surplus)}. That's what replenishes the HELOC.`
                : `Your stated income minus expenses and mortgage payment leaves no surplus, so there's nothing to replenish a draw with.`}
            />
            {amount > 0 && hasLimit && (
              <Reason
                text={`A $${fmt(amount)} move puts you at ${fmtPct(analysis.utilAfter)}` +
                  (analysis.replenishable
                    ? `, and takes about ${analysis.replenishMonths} month${analysis.replenishMonths === 1 ? '' : 's'} to replenish.`
                    : `, which your current surplus cannot repay.`)}
              />
            )}

            {helocBalance === null && (
              <Text style={styles.estimateNote}>
                Based on the figures you entered, not live balances. Link your accounts for real numbers.
              </Text>
            )}
            {/* The HELOC rate drives every cost figure below. If we're guessing
                it, say so where the guess is being used. */}
            {helocRateAssumed && (
              <TouchableOpacity
                onPress={() => router.push('/modals/heloc-terms' as never)}
                style={styles.rateWarnBtn}
                accessibilityLabel="Add your HELOC rate"
              >
                <Text style={styles.rateWarnText}>
                  Interest below assumes an 8.5% APR. No bank shares HELOC rates —
                  add yours for accurate costs.
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Upside and downside, same card and same type size ─────────── */}
          {amount > 0 && (
            <View style={styles.card}>
              <View style={styles.ledger}>
                <View style={styles.ledgerCol}>
                  <Text style={styles.ledgerHead}>What you gain</Text>
                  <LedgerItem
                    value={analysis.mortgageStalls ? '—' : formatMonths(analysis.monthsOffPayoff)}
                    label="off your payoff"
                  />
                  <LedgerItem
                    value={analysis.mortgageStalls ? '—' : `$${fmt(analysis.mortgageInterestSaved)}`}
                    label="mortgage interest avoided"
                  />
                </View>

                <View style={styles.ledgerDivider} />

                <View style={styles.ledgerCol}>
                  <Text style={styles.ledgerHead}>What you give up</Text>
                  <LedgerItem
                    value={hasLimit ? `$${fmt(analysis.availableAfter)}` : '—'}
                    label="credit left for emergencies"
                  />
                  <LedgerItem
                    value={analysis.replenishable
                      ? `$${fmt(analysis.helocInterestCost)}`
                      : `$${fmt(analysis.monthlyInterestAtNewBalance)}/mo`}
                    label={analysis.replenishable ? 'HELOC interest to repay it' : 'HELOC interest, indefinitely'}
                  />
                </View>
              </View>

              {analysis.replenishable && !analysis.mortgageStalls && (
                <Text style={styles.netLine}>
                  Net of HELOC interest, this move is projected to save{' '}
                  <Text style={styles.netBold}>${fmt(analysis.netInterestSaved)}</Text>.
                </Text>
              )}

              {/* The liquidity consumed, stated as precisely as the interest
                  saved. Without this the ledger above is only half a trade. */}
              {bufferAfter !== null && (
                <Text style={styles.netLine}>
                  Cash plus remaining credit would cover{' '}
                  <Text style={styles.netBold}>{bufferAfter.toFixed(1)} months</Text> of expenses
                  {bufferBefore !== null && `, down from ${bufferBefore.toFixed(1)}`}.
                </Text>
              )}
            </View>
          )}

          {/* ── Cautions. Stated plainly, never hidden behind the CTA. ────── */}
          {analysis.exceedsLimit && (
            <Caution text={`$${fmt(amount)} is more than your remaining credit. Lower the amount.`} />
          )}
          {!analysis.exceedsLimit && analysis.crossesCaution && (
            <Caution
              text={`This puts you above ${Math.round(CAUTION_UTILIZATION * 100)}% utilization, leaving ` +
                `$${fmt(analysis.availableAfter)} for an emergency. A high balance also costs more if your rate rises.`}
            />
          )}
          {!analysis.replenishable && amount > 0 && (
            <Caution
              text="Your surplus can't repay this draw, so the cycle never completes and the balance keeps costing interest."
            />
          )}
          {bufferAfter !== null && bufferAfter < BUFFER.minMonths && amount > 0 && (
            <Caution
              text={`This leaves under ${BUFFER.minMonths} months of expenses in cash and available credit. ` +
                'An unexpected bill afterwards would have to go on something more expensive than this line.'}
            />
          )}
          {analysis.mortgageStalls && (
            <Caution text="Your mortgage payment doesn't cover its interest, so payoff figures can't be projected." />
          )}

          {/* ── Two real choices, equal weight ────────────────────────────── */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.choice, styles.choiceSecondary]}
              onPress={() => { hapticLight(); router.back(); }}
              accessibilityLabel="Not now"
            >
              <Text style={styles.choiceSecondaryText}>Not now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choice, styles.choicePrimary, !canLog && styles.choiceDisabled]}
              onPress={handleLogMove}
              disabled={!canLog || logging}
              accessibilityLabel={`Record a ${amount} dollar transfer`}
            >
              {logging
                ? <ActivityIndicator color={Colors.mint700} />
                : <Text style={styles.choicePrimaryText}>I moved ${fmt(amount)}</Text>}
            </TouchableOpacity>
          </View>

          <Text style={styles.footnote}>
            HELOC Hero doesn&apos;t move money. Make the transfer with your bank, then record it
            here so your cycle and payoff stay accurate. Projections are estimates, not advice.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Reason({ text }: { text: string }) {
  return (
    <View style={styles.reasonRow}>
      <View style={styles.reasonDot} />
      <Text style={styles.reasonText}>{text}</Text>
    </View>
  );
}

function LedgerItem({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.ledgerItem}>
      <Text style={styles.ledgerValue}>{value}</Text>
      <Text style={styles.ledgerLabel}>{label}</Text>
    </View>
  );
}

function Caution({ text }: { text: string }) {
  return (
    <View style={styles.caution}>
      <Ionicons name="alert-circle-outline" size={18} color={Colors.textSecondary} />
      <Text style={styles.cautionText}>{text}</Text>
    </View>
  );
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
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtPct(v: number) { return `${Math.round(v * 100)}%`; }

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[8] },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Shadows.card,
  },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[3],
  },
  label: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
  },
  amountPrefix: { fontSize: Typography['2xl'], color: Colors.textMuted },
  amountInput: {
    flex: 1,
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    minHeight: 44,
  },
  suggestBtn: { marginTop: Spacing[3], minHeight: 44, justifyContent: 'center' },
  suggestText: { fontSize: Typography.sm, color: Colors.mint600, lineHeight: 20 },

  reasonRow: { flexDirection: 'row', gap: Spacing[3], marginBottom: Spacing[3] },
  reasonDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.gray400,
    marginTop: 7,
  },
  reasonText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
  estimateNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[1] },
  rateWarnBtn: { marginTop: Spacing[2], minHeight: 44, justifyContent: 'center' },
  rateWarnText: { fontSize: Typography.xs, color: Colors.mint600, lineHeight: 17 },

  // Upside and downside share a row, a type size and a weight. Neither is
  // styled to be more appealing than the other.
  ledger: { flexDirection: 'row', alignItems: 'flex-start' },
  ledgerCol: { flex: 1, gap: Spacing[3] },
  ledgerDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.gray100,
    marginHorizontal: Spacing[4],
  },
  ledgerHead: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: 0.6,
  },
  ledgerItem: { gap: 2 },
  ledgerValue: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  ledgerLabel: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
  netLine: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: Spacing[4],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  netBold: { fontWeight: Typography.bold, color: Colors.textPrimary },

  caution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  cautionText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  // Equal footprint; only the fill differs.
  actions: { flexDirection: 'row', gap: Spacing[3] },
  choice: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[3],
    borderWidth: 1,
  },
  choiceSecondary: { backgroundColor: Colors.surface, borderColor: Colors.border },
  choiceSecondaryText: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
  },
  choicePrimary: { backgroundColor: Colors.mint50, borderColor: Colors.mint200 },
  choicePrimaryText: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },
  choiceDisabled: { opacity: 0.5 },

  footnote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
  },
});
