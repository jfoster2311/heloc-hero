// app/modals/log-sweep.tsx — the app works out the amount, you make the transfer.
//
// The other half of a cycle. `move-money` handles the DUMP (draw the line, hit
// mortgage principal) and logs it. The sweep — surplus out of checking, onto the
// line — had an `action: 'sweep'` value in the automation_log schema and no
// screen anywhere to produce one. So the half of the loop a user performs every
// month was the half the app could not record.
//
// ── The division of labour, stated rather than hidden ──────────────────────
// This app has no payment rail and will not get one in V1: moving money for
// someone means money-transmitter licensing, and the Learn tab already tells
// users outright that every transfer is one they make themselves. So the screen
// is honest about the split — the app does the arithmetic nobody wants to do by
// hand, the user does the transfer only they can authorise, and then the app
// records it. There is no "Auto-sweep" button here, because there is no
// automation to put behind one.
//
// ── Why the suggested amount is not just "your surplus" ────────────────────
// "Send every spare dollar at the line" is the strategy's own instruction and it
// is what causes the overdraft. The figure here comes from lib/cashRunway.ts,
// which walks the dated bills and paydays in the next fortnight and returns the
// most that can leave today without the projected balance dipping below zero.
// Someone who sweeps their whole surplus on the 28th and has rent leave on the
// 2nd learns one thing from the resulting fee: that this strategy is dangerous.
// They would be right, and they would have learned it from us.
import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ModalScreen from '../../components/ui/ModalScreen';
import { Card, SourceNote } from '../../components/ui/primitives';
import SuccessReveal from '../../components/ui/SuccessReveal';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useCycleHistory, notifyCycleLogged } from '../../hooks/useCycleHistory';
import { supabase } from '../../lib/supabase';
import { computeCashRunway, RUNWAY_HORIZON_DAYS } from '../../lib/cashRunway';
import { detectRecurringExpenses } from '../../lib/recurring';
import { computeStrike } from '../../lib/strike';
import { hapticLight, hapticSuccess } from '../../lib/haptics';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

export default function LogSweepScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { profile } = useAuth();
  const f = useFinancials();
  const history = useCycleHistory(profile?.id);
  const [logging, setLogging] = useState(false);

  const drawn = f.helocDrawn ?? 0;
  const rate  = f.helocRate;

  // Same plumbing the recurring modal uses, so the two screens cannot disagree
  // about what counts as a bill.
  const confirmedIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, m] of Object.entries(f.transactionMeta.meta)) if (m.recurring) set.add(id);
    return set;
  }, [f.transactionMeta.meta]);

  const expenses = useMemo(
    () => detectRecurringExpenses({
      transactions: f.transactions,
      classification: f.transactionClassification,
      confirmedIds,
    }),
    [f.transactions, f.transactionClassification, confirmedIds],
  );

  const runway = useMemo(() => computeCashRunway({
    liquidCash: f.liquidCash,
    expenses,
    income: f.derivedCashflow?.recurringIncome ?? [],
    mortgage: f.mortgage.nextPaymentDueDate.value
      ? { amount: f.payment, dueDate: f.mortgage.nextPaymentDueDate.value }
      : null,
  }), [f.liquidCash, expenses, f.derivedCashflow, f.mortgage.nextPaymentDueDate.value, f.payment]);

  const strike = useMemo(() => computeStrike({
    helocDrawn: f.helocDrawn,
    helocLimit: f.helocLimit,
    monthlySurplus: Math.max(0, f.surplus),
    helocRate: f.helocRate,
    replenishThreshold: f.replenishThreshold,
  }), [f.helocDrawn, f.helocLimit, f.surplus, f.helocRate, f.replenishThreshold]);

  // Never more than is owed on the line, and never more than can leave without
  // putting a dated bill at risk. `freeNow` is null when there is nothing dated
  // to reason from, and then this screen refuses to name a figure rather than
  // guessing one.
  const suggested = runway.freeNow === null
    ? null
    : Math.max(0, Math.min(Math.floor(runway.freeNow), drawn));

  const [amount, setAmount] = useState<number | null>(null);
  const value = amount ?? suggested ?? 0;

  // Arithmetic on the LINE's rate, which is the debt this transfer reduces. Not
  // the mortgage's — a sweep does not touch mortgage principal, and saying it
  // did would be the same error the Learn tab was rewritten to remove.
  const dailyInterestSaved = (value * rate) / 365;

  // Frozen at log time, both of them, and the second is not optional.
  //
  // `logged` is the amount written, so the reward states that rather than
  // whatever the adjust buttons say afterwards. `drawnAtLog` is the line balance
  // BEFORE the refresh fired below — without it, a fast Plaid round trip returns
  // the already-reduced balance, `drawn - logged` subtracts the sweep a second
  // time, and the reward congratulates the user with a figure that is too low by
  // exactly the amount they just moved.
  const [logged, setLogged] = useState<number | null>(null);
  const [drawnAtLog, setDrawnAtLog] = useState(0);
  // Same reason: strike.toGo is derived from helocDrawn, so it moves with the
  // refresh too.
  const [toGoAtLog, setToGoAtLog] = useState(0);
  // And the same reason a third time. `notifyCycleLogged()` makes every mounted
  // history view re-read, including this screen's own — so by the time the
  // reward renders, `history.sweptThisMonth` may or may not have caught up.
  // Freezing the prior total and adding the logged amount to it is right either
  // way; reading the hook here would show a figure that silently changes.
  const [priorThisMonth, setPriorThisMonth] = useState(0);

  async function handleLog() {
    if (!profile?.id || value <= 0) return;
    setLogging(true);
    const { error } = await supabase.from('automation_log').insert({
      user_id: profile.id,
      action:  'sweep',
      amount:  value,
      status:  'success',
      // The wording matters in a table an auditor might read: this row is the
      // user's report of their own transfer, not an action the app took.
      note:    'Recorded by the user after making the transfer at their bank',
    });
    setLogging(false);

    if (error) {
      Alert.alert('Could not record it', `${error.message}\n\nNothing was saved. Please try again.`);
      return;
    }

    setLogged(value);
    setDrawnAtLog(drawn);
    setToGoAtLog(strike.toGo);
    setPriorThisMonth(history.sweptThisMonth);
    hapticSuccess();

    // Safe to call now, and it was not always: useCycleHistory used to select
    // `.eq('action', 'dump')`, so this row was written and then read by nothing.
    // It reads both actions and keeps them in separate buckets — `totalDumped`
    // still excludes sweeps, because a sweep is a repayment on the line rather
    // than a principal payment, and counting it there would inflate the
    // realized-interest figure the dashboard leads with.
    notifyCycleLogged();

    // What genuinely moves after a sweep is the LINE's balance, and that figure
    // comes from Plaid rather than from this log — so the honest way to make the
    // dashboard reflect it is to go and fetch it. Fire-and-forget: the reward
    // below does not wait on the network, and a failed refresh must not turn a
    // recorded transfer into an error.
    void f.refresh();
  }

  // ── The reward ──────────────────────────────────────────────────────────
  // Deliberately a STATE of this sheet rather than a dismiss. Closing straight
  // back to the dashboard was the whole problem: the user performs the work in
  // another app, comes back, taps once, and the sheet vanishes — so the only
  // acknowledgement for the habit was the sheet disappearing.
  //
  // Every row here is arithmetic on figures already on screen. Nothing counts up
  // and nothing claims the balance has changed: the line's balance comes from the
  // bank, so the caption says a fresh read has been requested rather than
  // implying the number in front of them already moved.
  if (logged !== null) {
    const dailyOnLogged = (logged * rate) / 365;
    return (
      <ModalScreen
        title="Sweep recorded"
        save={{ label: 'Done', onPress: () => router.back() }}
        footnote="Your line's balance is reported by your bank, not by this app. We have asked for a fresh read — it will land on the dashboard once your bank returns it."
      >
        <Card>
          <SuccessReveal
            title={`${money(logged)} swept`}
            caption="Logged against your line. That is one cycle closer to the next dump."
            rows={[
              {
                label: 'Interest your line stops charging',
                value: `${money(dailyOnLogged)}/day`,
                emphasis: true,
              },
              {
                label: 'Balance on the line, once your bank reports it',
                value: money(Math.max(0, drawnAtLog - logged)),
              },
              ...(toGoAtLog > 0 ? [{
                label: 'Still to repay before the next dump',
                value: money(Math.max(0, toGoAtLog - logged)),
              }] : []),
              // Only once there is more than this transfer in it. On the first
              // sweep of a month the row would just restate the headline.
              ...(priorThisMonth > 0 ? [{
                label: `Swept in ${monthName()}, this one included`,
                value: money(priorThisMonth + logged),
              }] : []),
            ]}
            announcement={
              `${money(logged)} swept and recorded. That stops about ` +
              `${money(dailyOnLogged)} a day of interest on your line.`
            }
          />
        </Card>
      </ModalScreen>
    );
  }

  return (
    <ModalScreen
      title="Sweep to your line"
      intro="We work out the amount and keep your bills covered. You make the transfer at your bank — this app never moves your money."
      save={value > 0 ? {
        label: logging ? 'Recording…' : 'I have made this transfer',
        onPress: handleLog,
        disabled: logging,
        saving: logging,
      } : undefined}
      footnote="Recording a sweep updates your own ledger only. It does not contact your bank, and nothing here initiates a transfer."
    >
      {/* ── The amount ──────────────────────────────────────────────────────
          Selectable so it can be long-pressed and copied into a banking app.
          Deliberately not a clipboard button: that needs a native module this
          build does not carry, and a button that silently did nothing would be
          worse than a number the user can select. */}
      <Card>
        <Text style={styles.eyebrow}>SAFE TO SWEEP TODAY</Text>
        {suggested === null ? (
          <>
            <Text style={styles.amountUnknown}>—</Text>
            <Text style={styles.body}>
              We cannot see any dated bills or income for the next {RUNWAY_HORIZON_DAYS} days,
              so there is no figure we can stand behind. Link a checking account, or decide the
              amount yourself and record it below.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.amount} selectable>
              ${value.toLocaleString()}
            </Text>
            <Text style={styles.body}>
              {runway.reserved > 0
                ? `Of the ${money(f.liquidCash)} in checking, ${money(runway.reserved)} is spoken for ` +
                  `before ${runway.troughDate ? friendly(runway.troughDate) : 'the end of the fortnight'}. ` +
                  'This is what can leave without putting those payments at risk.'
                : `Nothing is due in the next ${RUNWAY_HORIZON_DAYS} days that this would put at risk.`}
            </Text>

            {/* The single most load-bearing caveat on the screen. */}
            {runway.dependsOnExpectedIncome && (
              <View style={styles.warnRow}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.gray500} />
                <Text style={styles.warnText}>
                  This figure assumes a deposit we have seen before arrives on time. Without it,
                  {' '}{money(runway.freeIfNoIncome ?? 0)} is the amount that stays safe.
                </Text>
              </View>
            )}

            {runway.undatedCount > 0 && (
              <Text style={styles.caveat}>
                {runway.undatedCount} repeating charge{runway.undatedCount === 1 ? '' : 's'} totalling
                about {money(runway.undatedTotal)} could not be dated, so {runway.undatedCount === 1 ? 'it is' : 'they are'} not
                counted above.
              </Text>
            )}
          </>
        )}
      </Card>

      {/* ── What is already on the record this month ────────────────────────
          The reason this screen needed a reader at all. A sweep used to be
          written and never shown again, so someone who swept on the 3rd and
          came back on the 5th had nothing in the app to tell them, and the
          honest options were to log it twice or not at all.

          It does NOT adjust the figure above, and says so. `runway.freeNow` is
          computed from the live checking balance and `drawn` from the live line
          balance — both of which a real transfer has already moved — so
          subtracting the logged amount a second time would understate what is
          free by exactly the amount already swept. This block is the record,
          not an input to the arithmetic. */}
      {history.sweptThisMonth > 0 && (
        <Card>
          <Text style={styles.eyebrow}>ALREADY RECORDED IN {monthName().toUpperCase()}</Text>
          <View style={styles.effectRow}>
            <Text style={styles.effectLabel}>Swept onto your line</Text>
            <Text style={styles.effectValue}>{money(history.sweptThisMonth)}</Text>
          </View>
          {history.lastSweepAt && (
            <Text style={styles.caveat}>
              Most recent {history.lastSweepAt.toLocaleDateString('en-US', {
                weekday: 'short', day: 'numeric', month: 'short',
              })}. The suggested figure at the top of this screen comes from your balances
              as they stand now, so it already accounts for that transfer — this is here so
              you do not record the same one twice.
            </Text>
          )}
        </Card>
      )}

      {/* ── What is due, so the subtraction is checkable ─────────────────── */}
      {runway.events.length > 0 && (
        <Card>
          <Text style={styles.eyebrow}>THE NEXT {RUNWAY_HORIZON_DAYS} DAYS</Text>
          {runway.events.slice(0, 8).map((ev, i) => (
            <View key={`${ev.date}-${ev.label}-${i}`} style={styles.row}>
              <Text style={styles.rowDate}>{friendly(ev.date)}</Text>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {ev.label}{ev.expected ? ' · expected' : ''}
              </Text>
              <Text style={[styles.rowAmount, ev.amount > 0 && styles.rowAmountIn]}>
                {ev.amount > 0 ? '+' : '−'}{money(Math.abs(ev.amount))}
              </Text>
            </View>
          ))}
          <SourceNote>
            Rows marked expected are patterns from your own history extended forward, not
            scheduled payments. The mortgage date is your servicer&apos;s where we have it.
          </SourceNote>
        </Card>
      )}

      {/* ── The handoff ─────────────────────────────────────────────────────
          Numbered because it is a sequence performed in another app, and the
          user has to be able to leave, do it, and come back without losing
          their place. */}
      <Card>
        <Text style={styles.eyebrow}>WHAT TO DO</Text>
        <Step n={1} text="Open your bank's app or website." />
        <Step n={2} text={`Transfer ${money(value)} from checking to your HELOC.`} />
        <Step
          n={3}
          text="Come back and tap the button below, so your ledger and the next dump reflect it."
          last
        />
      </Card>

      {/* ── What it does, honestly ──────────────────────────────────────── */}
      {value > 0 && (
        <Card>
          <Text style={styles.eyebrow}>WHAT THIS CHANGES</Text>
          <View style={styles.effectRow}>
            <Text style={styles.effectLabel}>Interest your line stops charging</Text>
            <Text style={styles.effectValue}>{money(dailyInterestSaved)}/day</Text>
          </View>
          <View style={styles.effectRow}>
            <Text style={styles.effectLabel}>Balance on the line after</Text>
            <Text style={styles.effectValue}>{money(Math.max(0, drawn - value))}</Text>
          </View>
          {strike.toGo > 0 && (
            <View style={styles.effectRow}>
              <Text style={styles.effectLabel}>Still to repay before the next dump</Text>
              <Text style={styles.effectValue}>{money(Math.max(0, strike.toGo - value))}</Text>
            </View>
          )}
          <SourceNote>
            A sweep reduces what your LINE charges, not your mortgage interest. Mortgage interest
            falls when a dump reduces mortgage principal.
          </SourceNote>
        </Card>
      )}

      {/* Adjusting down is the common case — the user moved a round number, or
          held some back. Adjusting up is allowed and unguarded on purpose: it is
          a record of something that already happened, not a recommendation. */}
      {suggested !== null && suggested > 0 && (
        <View style={styles.adjustRow}>
          {[0.5, 0.75, 1].map(pct => {
            const v = Math.floor(suggested * pct);
            const active = value === v;
            return (
              <TouchableOpacity
                key={pct}
                style={[styles.adjustBtn, active && styles.adjustBtnActive]}
                onPress={() => { hapticLight(); setAmount(v); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Set the amount to ${money(v)}`}
              >
                <Text style={[styles.adjustText, active && styles.adjustTextActive]}>
                  {money(v)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

    </ModalScreen>
  );
}

function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.step, last && styles.stepLast]}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function monthName(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long' });
}

/** "Tue 5 Aug" — a date a person can check against their own week. */
function friendly(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

const useStyles = createThemedStyles(t => ({
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing[2],
  },
  amount: {
    fontSize: 40,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: -1,
    marginBottom: Spacing[2],
  },
  amountUnknown: {
    fontSize: 40,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    marginBottom: Spacing[2],
  },
  body: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 20 },

  warnRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: t.colors.borderSubtle,
  },
  warnText: { flex: 1, fontSize: Typography.xs, color: t.colors.gray500, lineHeight: 17 },
  caveat: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: Spacing[2], lineHeight: 17 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  rowDate: { width: 74, fontSize: Typography.xs, color: t.colors.textMuted },
  rowLabel: { flex: 1, fontSize: Typography.sm, color: t.colors.textPrimary },
  rowAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.gray500 },
  rowAmountIn: { color: t.colors.accentInk },

  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  stepLast: { borderBottomWidth: 0, paddingBottom: 0 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: t.colors.mint50,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { fontSize: 11, fontWeight: Typography.extrabold, color: t.colors.mint700 },
  stepText: { flex: 1, fontSize: Typography.sm, color: t.colors.textPrimary, lineHeight: 20 },

  effectRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 34,
  },
  effectLabel: { flex: 1, fontSize: Typography.sm, color: t.colors.textSecondary },
  effectValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },

  adjustRow: { flexDirection: 'row', gap: Spacing[2] },
  adjustBtn: {
    flex: 1, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  adjustBtnActive: { backgroundColor: t.colors.mint50, borderColor: t.colors.mint600 },
  adjustText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary },
  adjustTextActive: { color: t.colors.mint700, fontWeight: Typography.semibold },

}));
