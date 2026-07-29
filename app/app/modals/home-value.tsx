// app/modals/home-value.tsx — what the home is worth, and how the user knows.
//
// Everything downstream of this number — equity, combined LTV, the ownership
// progress bar — is an estimate built on a figure someone typed. Recording
// WHERE it came from and WHEN is what makes it honest to display: "$540,000
// from a 2023 appraisal" can be judged; "$540,000" cannot.
//
// This is also the ATTOM slot. When an automated valuation is worth paying for,
// it fills these same three fields — value, as-of date, source — and nothing
// downstream changes. Shipping manual entry first is not a placeholder; it is
// the default implementation of an interface that has room for one more.
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import ModalScreen, { Segmented } from '../../components/ui/ModalScreen';
import FormField from '../../components/ui/FormField';
import { Card } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { parsePositive } from '../../lib/parseNumeric';
import { hapticSuccess } from '../../lib/haptics';
import { HOME_VALUE_SOURCE_LABEL, type HomeValueSource } from '../../lib/config';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

const SOURCES = (Object.keys(HOME_VALUE_SOURCE_LABEL) as HomeValueSource[])
  .map(v => ({ value: v, label: HOME_VALUE_SOURCE_LABEL[v] }));

export default function HomeValueModal() {
  const styles = useStyles();
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const f = useFinancials();

  const [value,   setValue]   = useState(profile?.home_value != null ? String(profile.home_value) : '');
  const [source,  setSource]  = useState<HomeValueSource | null>(profile?.home_value_source ?? null);
  const [month,   setMonth]   = useState(monthOf(profile?.home_value_as_of));
  const [year,    setYear]    = useState(yearOf(profile?.home_value_as_of));
  const [address, setAddress] = useState(profile?.property_address ?? '');
  const [saving,  setSaving]  = useState(false);

  const valueNum = parsePositive(value);
  const asOf = buildDate(month, year);
  const dateInvalid = (month !== '' || year !== '') && asOf === null;
  const canSave = valueNum !== null && valueNum > 0 && !dateInvalid;

  // Live preview, so the consequence of the number is visible before saving.
  const debt = (f.mortgageBalance ?? 0) + (f.helocDrawn ?? 0);
  const previewEquity = valueNum !== null ? valueNum - debt : null;
  const previewLtv    = valueNum && valueNum > 0 ? debt / valueNum : null;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    await updateProfile({
      home_value:        valueNum,
      home_value_source: source,
      home_value_as_of:  asOf,
      property_address:  address.trim() || null,
    });
    setSaving(false);
    hapticSuccess();
    router.back();
  }

  return (
    <ModalScreen
      title="Your home's value"
      intro={
        'No bank connection reports what a home is worth, so this one is yours to give. ' +
        'Recording where the figure came from is what lets the equity below be read as an ' +
        'estimate rather than a fact.'
      }
      save={{ label: 'Save', onPress: handleSave, disabled: !canSave, saving }}
      footnote={
        'Equity and loan-to-value derived from this are estimates. A lender or appraiser ' +
        'will reach their own number, and it may differ materially.'
      }
    >
      <Card>
        <FormField
          label="Estimated value"
          prefix="$"
          value={value}
          onChangeText={setValue}
          keyboardType="numeric"
          placeholder="450000"
          hint="Round numbers are fine — this is an estimate either way."
          accessibilityLabel="Estimated home value"
        />

        <Text style={styles.label}>How did you get this?</Text>
        <Text style={styles.hint}>
          Shown next to the value so you can judge it later. An appraisal from last spring
          and a website estimate from this morning are not the same kind of number.
        </Text>
        <View style={{ marginTop: Spacing[3] }}>
          <Segmented options={SOURCES} value={source} onChange={setSource} />
        </View>
      </Card>

      <Card>
        <Text style={styles.label}>As of</Text>
        <Text style={styles.hint}>
          Month and year the figure was current. A three-year-old appraisal is still worth
          having — it just needs saying.
        </Text>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Month"
              value={month}
              onChangeText={setMonth}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="MM"
              style={{ textAlign: 'center' }}
              accessibilityLabel="Value as-of month"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Year"
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="YYYY"
              style={{ textAlign: 'center' }}
              error={dateInvalid ? 'Enter a month 1–12 and a four-digit year' : undefined}
              accessibilityLabel="Value as-of year"
            />
          </View>
        </View>
      </Card>

      <Card>
        <FormField
          label="Property address"
          value={address}
          onChangeText={setAddress}
          placeholder="123 Main St, Springfield, IL"
          hint={
            f.mortgage.propertyAddress.source === 'liability'
              ? 'Your servicer reports this address. Editing it here overrides what we display.'
              : 'Optional. Kept so a valuation lookup has something to work from later.'
          }
          accessibilityLabel="Property address"
        />
      </Card>

      {previewEquity !== null && (
        <Card>
          <Text style={styles.previewLabel}>With this value</Text>
          <Text style={styles.previewValue}>
            ${Math.round(previewEquity).toLocaleString('en-US')} estimated equity
          </Text>
          <Text style={styles.previewSub}>
            {previewLtv !== null
              ? `${Math.round(previewLtv * 100)}% combined loan-to-value against ` +
                `$${Math.round(debt).toLocaleString('en-US')} of secured debt`
              : 'Add your balances to see loan-to-value'}
          </Text>
        </Card>
      )}
    </ModalScreen>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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
  label: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  hint: { fontSize: Typography.xs, color: t.colors.textMuted, lineHeight: 17, marginTop: Spacing[1] },
  dateRow: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3] },
  previewLabel: { fontSize: Typography.xs, color: t.colors.textMuted, fontWeight: Typography.semibold },
  previewValue: {
    fontSize: Typography.xl, fontWeight: Typography.extrabold,
    color: t.colors.textPrimary, marginTop: 2,
  },
  previewSub: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18, marginTop: 2 },
}));
