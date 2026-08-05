// app/modals/mortgage-details.tsx — the mortgage facts, for servicers that stay quiet.
//
// Plaid's Liabilities product DOES cover mortgages, so for a participating
// servicer this screen is mostly read-only confirmation. For everyone else it
// is the only way the app learns the loan's original terms — and without those
// there is no baseline to measure the strategy against, only the schedule the
// user is already on, which quietly credits the app with progress made before
// it was installed.
//
// The prepayment-penalty question is asked outright rather than assumed false.
// A penalty can outweigh the interest a principal move saves, which makes it
// the one answer here that can invalidate the whole strategy.
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import ModalScreen, { Segmented } from '../../components/ui/ModalScreen';
import FormField from '../../components/ui/FormField';
import { Card, Chip, DataRow } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { parseDate } from '../../lib/mortgage';
import { parsePositive } from '../../lib/parseNumeric';
import { hapticSuccess, hapticError } from '../../lib/haptics';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

const PENALTY_OPTIONS = [
  { value: 'no'      as const, label: 'No penalty' },
  { value: 'yes'     as const, label: 'Yes, there is one' },
  { value: 'unknown' as const, label: 'Not sure' },
];

export default function MortgageDetailsModal() {
  const { common } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const f = useFinancials();

  const [origMonth, setOrigMonth] = useState(monthOf(profile?.mortgage_origination_date));
  const [origYear,  setOrigYear]  = useState(yearOf(profile?.mortgage_origination_date));
  const [principal, setPrincipal] = useState(
    profile?.mortgage_origination_principal != null ? String(profile.mortgage_origination_principal) : '',
  );
  const [termYears, setTermYears] = useState(
    profile?.mortgage_term_months != null ? String(Math.round(profile.mortgage_term_months / 12)) : '',
  );
  const [penalty, setPenalty] = useState<'yes' | 'no' | 'unknown'>(
    profile?.mortgage_has_prepayment_penalty === true ? 'yes'
      : profile?.mortgage_has_prepayment_penalty === false ? 'no'
      : 'unknown',
  );
  const [saving, setSaving] = useState(false);
  /** Why the last save attempt did not land. Null while it has not failed. */
  const [error, setError] = useState<string | null>(null);

  const origDate     = buildDate(origMonth, origYear);
  const dateInvalid  = (origMonth !== '' || origYear !== '') && origDate === null;
  const principalNum = parsePositive(principal);
  const termNum      = parsePositive(termYears);
  const termInvalid  = termYears !== '' && (termNum === null || termNum < 1 || termNum > 50);
  const canSave      = !dateInvalid && !termInvalid;

  // Anything the servicer already reports is shown rather than asked for. Being
  // asked to type a figure the app is simultaneously displaying reads as the
  // bank link having failed.
  const reported = f.mortgage.isLive;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const { error: saveError } = await updateProfile({
      mortgage_origination_date:       origDate,
      mortgage_origination_principal:  principalNum,
      mortgage_term_months:            termNum !== null ? Math.round(termNum * 12) : null,
      mortgage_has_prepayment_penalty: penalty === 'unknown' ? null : penalty === 'yes',
    });
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
      title="Mortgage details"
      intro={
        reported
          ? 'Your servicer reports most of this already. Anything it does not send is below, ' +
            'and what you enter here is only used where the servicer is silent.'
          : 'Your servicer does not share loan terms through a bank connection, which is ' +
            'common. These few facts are what let the app measure against your original ' +
            'schedule rather than the one you are already ahead of.'
      }
      save={{ label: 'Save', onPress: handleSave, disabled: !canSave, saving, error }}
      footnote="Used to derive your original payoff date and how much of the loan you have retired."
    >
      {reported && (
        <Card>
          <View style={styles.reportedHead}>
            <Text style={styles.reportedTitle}>From your servicer</Text>
            <Chip label="live" icon="shield-checkmark-outline" tone="accent" />
          </View>
          <DataRow label="Balance"
            value={f.mortgage.balance.value !== null ? money(f.mortgage.balance.value) : '—'} />
          <DataRow label="Interest rate"
            value={f.mortgage.rate.value !== null ? `${(f.mortgage.rate.value * 100).toFixed(3)}%` : '—'} />
          <DataRow label="Maturity"
            value={fmtDate(f.mortgage.maturityDate.value)} />
          <DataRow label="Next payment"
            value={f.mortgage.nextPayment.value !== null ? money(f.mortgage.nextPayment.value) : '—'}
            last />
        </Card>
      )}

      <Card>
        <Text style={styles.sectionTitle}>When the loan started</Text>
        <Text style={styles.hint}>
          Origination date and term give the original payoff date without asking you to
          work it out.
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Month"
              value={origMonth}
              onChangeText={setOrigMonth}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="MM"
              style={{ textAlign: 'center' }}
              accessibilityLabel="Origination month"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Year"
              value={origYear}
              onChangeText={setOrigYear}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="YYYY"
              style={{ textAlign: 'center' }}
              error={dateInvalid ? 'Enter a month 1–12 and a four-digit year' : undefined}
              accessibilityLabel="Origination year"
            />
          </View>
        </View>

        <FormField
          label="Term"
          suffix="years"
          value={termYears}
          onChangeText={setTermYears}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="30"
          error={termInvalid ? 'Enter a term between 1 and 50 years' : undefined}
          accessibilityLabel="Loan term in years"
        />

        <FormField
          label="Original amount borrowed"
          prefix="$"
          value={principal}
          onChangeText={setPrincipal}
          keyboardType="numeric"
          placeholder="380000"
          hint="Sets the 'percent of the loan retired' figure on your dashboard."
          accessibilityLabel="Original principal amount"
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Prepayment penalty</Text>
        <Text style={styles.hint}>
          Some loans charge a fee for paying principal ahead of schedule. Where one exists it
          can cost more than the interest a move saves, so the app will warn you rather than
          recommend one. Your closing documents or servicer can confirm it.
        </Text>
        <View style={{ marginTop: Spacing[3] }}>
          <Segmented options={PENALTY_OPTIONS} value={penalty} onChange={setPenalty} columns={3} />
        </View>
        {penalty === 'yes' && (
          <Text style={styles.warn}>
            With a penalty on file, the dashboard will hold rather than recommend principal
            moves until you tell us otherwise.
          </Text>
        )}
      </Card>
    </ModalScreen>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function money(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }
function fmtDate(s: string | null) {
  const d = parseDate(s);
  return d === null ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function monthOf(iso: string | null | undefined) {
  if (!iso) return '';
  const m = iso.split('-')[1];
  return m ? String(Number(m)) : '';
}
function yearOf(iso: string | null | undefined) {
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
  reportedHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: Spacing[3],
  },
  reportedTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  hint: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 18, marginTop: Spacing[1] },
  row: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3] },
  warn: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18, marginTop: Spacing[3] },
}));
