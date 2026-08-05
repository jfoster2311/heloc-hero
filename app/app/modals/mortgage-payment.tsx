// app/modals/mortgage-payment.tsx — which of these is your mortgage?
//
// The payment is the largest committed outflow most users have, and two things
// depend on the app knowing which transactions it is:
//
//   · `computeProjection` subtracts the payment. If the same rows are ALSO
//     counted as spending, it comes out of the surplus twice, and every
//     recommendation is smaller than it should be.
//   · The figure itself drives the payoff date. An out-of-date payment — escrow
//     moved, a recast, a servicer transfer — quietly makes that date wrong.
//
// ── This screen proposes; the user decides ─────────────────────────────────
// lib/mortgagePayments.ts ranks candidates and shows its reasoning next to each
// one. Nothing is confirmed by default, including high-confidence matches,
// because the cost of a wrong confirmation is asymmetric: excluding an ordinary
// expense overstates surplus, and an overstated surplus oversizes a draw taken
// against the user's house. A pre-ticked box is an answer the user did not give.
import { View, Text, ActivityIndicator } from 'react-native';
import { Touchable } from '../../components/ui/press';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import ModalScreen from '../../components/ui/ModalScreen';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { hapticSelection, hapticSuccess } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import {
  detectMortgagePayments, checkPaymentAmount, type PaymentCandidate,
} from '../../lib/mortgagePayments';
import { Typography, Spacing, Radius, Semantic } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

export default function MortgagePaymentScreen() {
  const { colors, common } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { profile, refresh } = useAuth();
  const f = useFinancials();
  const meta = f.transactionMeta;

  const [savingAmount, setSavingAmount] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  const candidates = useMemo(
    () => detectMortgagePayments({
      transactions: f.transactions,
      expectedPayment: profile?.monthly_payment ?? null,
      confirmedIds: meta.mortgagePaymentIds,
    }),
    [f.transactions, profile?.monthly_payment, meta.mortgagePaymentIds],
  );

  const confirmed = candidates.filter(c => c.confirmed);
  const check = useMemo(
    () => checkPaymentAmount(confirmed, profile?.monthly_payment ?? null),
    [confirmed, profile?.monthly_payment],
  );

  /** Adopt the observed figure as the payment the projection runs on. */
  async function adoptAmount(amount: number) {
    if (!profile?.id) return;
    setSavingAmount(true);
    setAmountError(null);
    const { error } = await supabase
      .from('users')
      .update({ monthly_payment: Math.round(amount * 100) / 100 })
      .eq('id', profile.id);
    setSavingAmount(false);
    if (error) {
      setAmountError("Couldn't save that. Check your connection and try again.");
      return;
    }
    hapticSuccess();
    await refresh();
  }

  return (
    <ModalScreen
      title="Your mortgage payment"
      intro={
        'Your payment is modelled separately by your payoff plan, so it should not also ' +
        'count as spending. Confirm which of these is your mortgage and we will leave it ' +
        'out of your totals.'
      }
      footnote={
        'Confirming changes what counts as spending. It does not touch what your bank ' +
        'reported, and you can undo it here at any time.'
      }
    >
      {f.loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={colors.accentInk} />
        </View>
      ) : !f.hasLinkedAccounts ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateBody}>
            Link an account and we&apos;ll look through your transactions for the payment.
            Until then your payoff plan runs on the figure you entered.
          </Text>
          <Touchable
            style={styles.stateBtn}
            onPress={() => { router.push('/modals/link-account' as never); }}
            accessibilityRole="button"
            accessibilityLabel="Link an account"
          >
            <Text style={styles.stateBtnText}>Link an account</Text>
          </Touchable>
        </View>
      ) : candidates.length === 0 ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateBody}>
            Nothing in your transactions looks like a mortgage payment. That is common when
            the payment comes from an account you haven&apos;t linked — your payoff plan
            still runs on the ${fmt(profile?.monthly_payment ?? 0)} you entered.
          </Text>
        </View>
      ) : (
        <>
          {/* ── Does the figure on file still hold? ───────────────────────
              Reported, never applied. The entered payment is what the payoff
              date is computed from, and replacing it silently would move that
              date without the user asking. */}
          {check?.material && (
            <View style={styles.check}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <View style={styles.checkBody}>
                <Text style={styles.checkTitle}>
                  Your payments are clearing at ${fmt(check.observed)}
                </Text>
                <Text style={styles.checkText}>
                  Your plan is running on ${fmt(check.onFile)} a month —
                  {check.difference > 0 ? ' less' : ' more'} than you are actually paying.
                  Escrow changes do this. Updating it here keeps your payoff date honest.
                </Text>
                <Touchable
                  style={styles.checkBtn}
                  onPress={() => adoptAmount(check.observed)}
                  disabled={savingAmount}
                  accessibilityRole="button"
                  accessibilityLabel={`Use $${fmt(check.observed)} as my monthly payment`}
                >
                  {savingAmount
                    ? <ActivityIndicator size="small" color={colors.mint700} />
                    : <Text style={styles.checkBtnText}>Use ${fmt(check.observed)}</Text>}
                </Touchable>
                {amountError && <Text style={styles.error}>{amountError}</Text>}
              </View>
            </View>
          )}

          {check && !check.material && (
            <View style={styles.confirmedNote}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.mint700} />
              <Text style={styles.confirmedNoteText}>
                Your payments match the ${fmt(check.onFile)} your plan is running on.
              </Text>
            </View>
          )}

          <Text style={common.eyebrow}>WHAT WE FOUND</Text>

          {candidates.map(c => (
            <CandidateRow
              key={c.key}
              candidate={c}
              busy={meta.saving !== null}
              onToggle={() => {
                hapticSelection();
                meta.setMortgagePayments(c.transactionIds, !c.confirmed);
              }}
            />
          ))}

          {meta.error && <Text style={styles.error}>{meta.error}</Text>}
        </>
      )}
    </ModalScreen>
  );
}

/**
 * One payee, with the evidence for it.
 *
 * The reasons are not decoration. The user is the only one who knows the answer,
 * and they can only check the app's guess if they can see what it rests on —
 * "your bank labels this a mortgage payment" is checkable, a confidence score
 * is not.
 */
function CandidateRow({ candidate, busy, onToggle }: {
  candidate: PaymentCandidate;
  busy: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Touchable
      style={[styles.row, candidate.confirmed && styles.rowConfirmed]}
      onPress={onToggle}
      disabled={busy}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: candidate.confirmed }}
      accessibilityLabel={
        `${candidate.name}, $${fmt(candidate.typicalAmount)} a month, ` +
        `seen ${candidate.occurrences} times. ${candidate.reasons.join('. ')}`
      }
      accessibilityHint={
        candidate.confirmed
          ? 'Removes this from your mortgage payment'
          : 'Marks this as your mortgage payment'
      }
    >
      <View style={[styles.box, candidate.confirmed && styles.checkboxOn]}>
        {candidate.confirmed && <Ionicons name="checkmark" size={15} color={colors.onAccent} />}
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{candidate.name}</Text>
        <Text style={styles.rowMeta}>
          ${fmt(candidate.typicalAmount)} · seen {candidate.occurrences} time
          {candidate.occurrences === 1 ? '' : 's'}
        </Text>
        {candidate.reasons.map((r, i) => (
          <View key={i} style={styles.reason}>
            <Ionicons name="ellipse" size={4} color={colors.textMuted} />
            <Text style={styles.reasonText}>{r}</Text>
          </View>
        ))}
      </View>
    </Touchable>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }

const useStyles = createThemedStyles(t => ({
  centre: { paddingVertical: Spacing[10], alignItems: 'center' },

  stateBlock: { gap: Spacing[4], paddingVertical: Spacing[4] },
  stateBody: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },
  stateBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    backgroundColor: t.colors.mint50,
  },
  stateBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },

  check: {
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.gray100,
    borderWidth: 1,
    borderColor: t.colors.gray200,
  },
  checkBody: { flex: 1, gap: Spacing[2] },
  checkTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  checkText: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },
  checkBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    backgroundColor: t.colors.mint50,
  },
  checkBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },

  confirmedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: t.colors.mint50,
  },
  confirmedNoteText: { flex: 1, fontSize: Typography.xs, color: t.colors.mint700, lineHeight: 17 },

  row: {
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
  },
  rowConfirmed: { borderColor: t.colors.mint600, backgroundColor: t.colors.mint50 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: t.colors.mint600, borderColor: t.colors.mint600 },
  rowBody: { flex: 1, gap: 3 },
  rowName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  rowMeta: { fontSize: Typography.xs, color: t.colors.textMuted },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  reasonText: { flex: 1, fontSize: 11, color: t.colors.textSecondary, lineHeight: 16 },

  error: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 17 },
}));
