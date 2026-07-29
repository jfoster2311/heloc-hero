// app/modals/alert-thresholds.tsx — the two figures that decide what a sweep leaves behind.
//
// These sat in Settings as read-only rows for as long as they have existed,
// which made them the worst kind of number: one the app reasons from and the
// user cannot correct. Cash buffer and upcoming bills are the entire definition
// of "safe" in `computeSweepAmount` — everything above them is what the app is
// willing to call spare. A stale $2,000 default silently authorises a sweep
// that empties an account someone was counting on.
//
// So they are editable, and the consequence is shown while it is being edited
// rather than discovered later on the decision screen.
import { useState, useEffect } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import ModalScreen from '../../components/ui/ModalScreen';
import FormField from '../../components/ui/FormField';
import { Card } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { supabase } from '../../lib/supabase';
import { parsePositive } from '../../lib/parseNumeric';
import { computeSweepAmount, DEFAULT_AUTOMATION_SETTINGS } from '../../lib/automation';
import { hapticSuccess } from '../../lib/haptics';
import { Typography } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { LinkedAccount } from '../../lib/types';

const DEFAULT_BUFFER = DEFAULT_AUTOMATION_SETTINGS.buffer_target;
const DEFAULT_BILLS  = DEFAULT_AUTOMATION_SETTINGS.upcoming_bills_estimate;

export default function AlertThresholdsModal() {
  const styles = useStyles();
  const router = useRouter();
  const { profile } = useAuth();
  const { savingsAccount } = useAccounts(profile?.id ?? null);

  const [buffer, setBuffer] = useState(String(DEFAULT_BUFFER));
  const [bills,  setBills]  = useState(String(DEFAULT_BILLS));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Seed from the stored row once. Saving is held until this lands, so a slow
  // read cannot overwrite what the user typed — and cannot let them save the
  // defaults over figures they had already set.
  useEffect(() => {
    let cancelled = false;
    if (!profile?.id) return;

    supabase
      .from('automation_settings')
      .select('buffer_target, upcoming_bills_estimate')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setBuffer(String(data.buffer_target ?? DEFAULT_BUFFER));
          setBills(String(data.upcoming_bills_estimate ?? DEFAULT_BILLS));
        }
        setLoaded(true);
      });

    return () => { cancelled = true; };
  }, [profile?.id]);

  const bufferNum = parsePositive(buffer);
  const billsNum  = parsePositive(bills);
  const canSave   = loaded && bufferNum !== null && billsNum !== null;

  // Preview against the real balance when one is linked. Without it the numbers
  // are still meaningful — they just cannot be turned into a dollar figure, and
  // inventing a balance to fill the space would be the dishonest option.
  const savings = firstBalance(savingsAccount);
  const setAside = bufferNum !== null && billsNum !== null ? bufferNum + billsNum : null;
  const preview =
    savings !== null && bufferNum !== null && billsNum !== null
      ? computeSweepAmount(savings, bufferNum, billsNum)
      : null;

  async function handleSave() {
    if (!profile?.id || bufferNum === null || billsNum === null) return;
    setSaving(true);
    setError(null);

    const { error: err } = await supabase
      .from('automation_settings')
      .upsert(
        {
          user_id:                 profile.id,
          buffer_target:           bufferNum,
          upcoming_bills_estimate: billsNum,
        },
        { onConflict: 'user_id' },
      );

    setSaving(false);
    if (err) {
      // A silent failure here means every later recommendation is computed from
      // thresholds the user believes they changed.
      setError(err.message);
      return;
    }
    hapticSuccess();
    router.back();
  }

  return (
    <ModalScreen
      title="What to leave behind"
      intro={
        'Before HELOC Hero calls any money spare, it sets these two amounts aside. ' +
        'Raise them and it suggests smaller moves; lower them and it suggests bigger ones.'
      }
      save={{ label: 'Save', onPress: handleSave, disabled: !canSave, saving }}
      footnote={
        'These shape a suggestion, not a transfer. HELOC Hero never moves money — ' +
        'you make every transfer at your bank.'
      }
    >
      <Card>
        <FormField
          label="Cash buffer"
          prefix="$"
          value={buffer}
          onChangeText={setBuffer}
          keyboardType="numeric"
          placeholder={String(DEFAULT_BUFFER)}
          hint="Your floor. Nothing is ever suggested that would dip below it."
          error={buffer.trim() !== '' && bufferNum === null ? 'Enter a dollar amount' : undefined}
          accessibilityLabel="Cash buffer"
        />
      </Card>

      <Card>
        <FormField
          label="Upcoming bills"
          prefix="$"
          value={bills}
          onChangeText={setBills}
          keyboardType="numeric"
          placeholder={String(DEFAULT_BILLS)}
          hint="What is due before your next payday, on top of the buffer."
          error={bills.trim() !== '' && billsNum === null ? 'Enter a dollar amount' : undefined}
          accessibilityLabel="Upcoming bills estimate"
        />
      </Card>

      <Card>
        <Text style={styles.previewLabel}>With these figures</Text>
        {preview !== null && savings !== null && setAside !== null ? (
          <>
            <Text style={styles.previewValue}>${preview.toLocaleString('en-US')} spare</Text>
            <Text style={styles.previewSub}>
              {preview > 0
                ? `Of the $${Math.round(savings).toLocaleString('en-US')} in your linked savings, ` +
                  `$${setAside.toLocaleString('en-US')} stays put.`
                : `Your linked savings holds $${Math.round(savings).toLocaleString('en-US')}, at or ` +
                  'below what you have asked to keep. Nothing would be suggested today.'}
            </Text>
          </>
        ) : (
          <Text style={styles.previewSub}>
            Link a savings account to see what these leave spare. Until then they still
            apply — the app just cannot put a figure on them.
          </Text>
        )}
      </Card>

      {error ? <Text style={styles.error}>Not saved: {error}</Text> : null}
    </ModalScreen>
  );
}

function firstBalance(account: LinkedAccount | null | undefined): number | null {
  if (!account || account.accounts.length === 0) return null;
  return account.accounts[0].balances.current;
}

const useStyles = createThemedStyles(t => ({
  previewLabel: { fontSize: Typography.xs, color: t.colors.textMuted, fontWeight: Typography.semibold },
  previewValue: {
    fontSize: Typography.xl, fontWeight: Typography.extrabold,
    color: t.colors.textPrimary, marginTop: 2,
  },
  previewSub: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18, marginTop: 2 },
  error: { fontSize: Typography.xs, color: t.colors.textSecondary, textAlign: 'center' },
}));
