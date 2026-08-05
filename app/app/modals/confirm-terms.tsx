// app/modals/confirm-terms.tsx — the monthly "still correct?" in one tap.
//
// A HELOC rate is variable and no provider reports it, so the figure behind
// every projection drifts silently and has to be re-checked by a human. The
// full editor (modals/heloc-terms) is the right place to CHANGE a term, but the
// common case is that nothing changed — and asking someone to re-open a
// nine-field form to tell us "still the same" is how re-verification quietly
// stops happening.
//
// So this screen does one thing: it shows the terms we hold, and lets the user
// confirm them as current with a single tap. That tap only bumps
// `heloc_terms_updated_at` — it changes no figure — which is exactly why it is
// safe to make it this easy. If something HAS changed, "Update terms" hands off
// to the editor.
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import ModalScreen from '../../components/ui/ModalScreen';
import { Card, DataRow, LinkRow } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { daysSinceVerified } from '../../lib/helocTerms';
import { parseDate } from '../../lib/mortgage';
import { INTEREST_CALC_LABEL } from '../../lib/config';
import { hapticSuccess, hapticError } from '../../lib/haptics';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

export default function ConfirmTermsModal() {
  const styles = useStyles();
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const f = useFinancials();
  const [saving, setSaving] = useState(false);
  /** Why the last save attempt did not land. Null while it has not failed. */
  const [error, setError] = useState<string | null>(null);

  const since = daysSinceVerified(profile?.heloc_terms_updated_at);
  const drawEnd = parseDate(profile?.heloc_draw_end_date);

  async function handleConfirm() {
    setSaving(true);
    // Only the confirmation date moves. No term is touched — this is a signature,
    // not an edit.
    const { error: saveError } = await updateProfile({ heloc_terms_updated_at: new Date().toISOString() });
    setSaving(false);

    // Never close on a failed write. The figures the user just typed are
    // still on screen and the fix is to press the same button again.
    if (saveError) {
      hapticError();
      setError(saveError);
      return;
    }

    setError(null);
    hapticSuccess();
    router.back();
  }

  return (
    <ModalScreen
      title="Confirm your HELOC terms"
      intro={
        since === null
          ? 'These are the terms your projections run on. Take a look — if they match your ' +
            'latest statement, confirm them so the app knows they are current.'
          : `You last confirmed these ${since} day${since === 1 ? '' : 's'} ago. HELOC rates ` +
            'move, so a quick look against your latest statement keeps every projection honest.'
      }
      save={{ label: 'Yes, these are still correct', onPress: handleConfirm, saving, error }}
      footnote="Confirming updates the date only — it changes none of your figures. Projections are estimates, not guarantees."
    >
      <Card>
        <DataRow
          label="Credit limit"
          value={f.helocLimit !== null ? money(f.helocLimit) : '—'}
        />
        <DataRow
          label="Current APR"
          value={f.helocRateAssumed ? 'not set' : rate(f.helocRate)}
          hint={f.helocRateAssumed ? 'Projections assume 8.5% until you set it' : undefined}
        />
        <DataRow
          label="Payments"
          value={
            profile?.heloc_payment_type === 'interest_only' ? 'Interest-only'
              : profile?.heloc_payment_type === 'amortizing' ? 'Amortizing' : '—'
          }
        />
        <DataRow
          label="Interest charged on"
          value={
            profile?.heloc_interest_calc_method
              ? INTEREST_CALC_LABEL[profile.heloc_interest_calc_method]
              : 'not set'
          }
        />
        <DataRow
          label="Draw period ends"
          value={drawEnd ? fmtMonthYear(drawEnd) : '—'}
          last
        />
      </Card>

      <Text style={styles.helper}>Something changed since your last statement?</Text>
      <Card>
        <LinkRow
          icon="create-outline"
          label="Update terms"
          sub="Open the editor to change a rate, limit, draw date or fee"
          onPress={() => router.replace('/modals/heloc-terms' as never)}
        />
      </Card>
    </ModalScreen>
  );
}

function money(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }
function rate(d: number) { return `${(d * 100).toFixed(2)}%`; }
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const useStyles = createThemedStyles(t => ({
  helper: {
    fontSize: Typography.xs, color: t.colors.textMuted,
    lineHeight: 18, marginTop: Spacing[2], marginBottom: -Spacing[1],
  },
}));
