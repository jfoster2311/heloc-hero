// app/modals/heloc-terms.tsx — capture the HELOC terms Plaid cannot supply.
//
// Plaid's /liabilities/get covers credit(credit card, paypal) and loan(student,
// mortgage) only. A HELOC is in neither bucket, so APR, margin, draw-period end
// and payment type do not arrive from any institution, ever. Balances do.
//
// So this screen exists as a permanent part of the flow, not a fallback for
// unsupported banks. It explains why it is asking, because "enter your rate"
// after linking a bank otherwise reads as the link having failed.
import { useState } from 'react';
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
import { parseNumeric, parsePositive } from '../../lib/parseNumeric';
import {
  deriveCreditLimit, termsFromProfile, daysSinceVerified, TERMS_STALE_DAYS,
  type HelocPaymentType,
} from '../../lib/helocTerms';
import { hapticSuccess } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
import type { LinkedAccount } from '../../lib/types';

export default function HelocTermsModal() {
  const router = useRouter();
  const { profile, refresh } = useAuth();
  const { helocAccount } = useAccounts(profile?.id ?? null);

  const existing = termsFromProfile(profile as unknown as Record<string, unknown>);
  const balances = firstBalances(helocAccount);
  const derived  = deriveCreditLimit(balances, existing.creditLimit);

  const [rate,        setRate]        = useState(existing.rate   != null ? String(round2(existing.rate * 100)) : '');
  const [margin,      setMargin]      = useState(existing.margin != null ? String(round2(existing.margin * 100)) : '');
  const [limit,       setLimit]       = useState(existing.creditLimit != null ? String(existing.creditLimit) : '');
  const [drawMonth,   setDrawMonth]   = useState(monthOf(existing.drawEndDate));
  const [drawYear,    setDrawYear]    = useState(yearOf(existing.drawEndDate));
  const [paymentType, setPaymentType] = useState<HelocPaymentType | null>(existing.paymentType);
  const [saving,      setSaving]      = useState(false);

  const rateNum  = parsePositive(rate);
  const drawDate = buildDate(drawMonth, drawYear);
  const drawInvalid = (drawMonth !== '' || drawYear !== '') && drawDate === null;
  const canSave = rateNum !== null && rateNum > 0 && !drawInvalid;

  const sinceVerified = daysSinceVerified(existing.updatedAt);

  async function handleSave() {
    if (!profile?.id || !canSave) return;
    setSaving(true);

    const marginNum = parseNumeric(margin);
    const limitNum  = parsePositive(limit);

    const { error } = await supabase
      .from('users')
      .update({
        heloc_rate:             rateNum! / 100,
        heloc_margin:           marginNum !== null ? marginNum / 100 : null,
        heloc_credit_limit:     limitNum,
        heloc_draw_end_date:    drawDate,
        heloc_payment_type:     paymentType,
        heloc_terms_updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);

    setSaving(false);

    if (error) {
      Alert.alert('Could not save', `${error.message}\n\nYour terms were not updated.`);
      return;
    }
    await refresh();
    hapticSuccess();
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your HELOC terms</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Why we're asking, so this doesn't read as a broken bank link */}
          <View style={styles.whyCard}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.whyText}>
              Banks share HELOC <Text style={styles.whyBold}>balances</Text> with us automatically, but
              not the terms — no provider offers HELOC rates or draw dates through a bank connection.
              These few fields are what turn balances into a payoff projection.
            </Text>
          </View>

          {sinceVerified !== null && sinceVerified >= TERMS_STALE_DAYS && (
            <View style={styles.staleCard}>
              <Text style={styles.staleText}>
                Last confirmed {sinceVerified} days ago. HELOC rates are variable — worth checking
                your latest statement.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <Field
              label="Current APR"
              suffix="%"
              value={rate}
              onChangeText={setRate}
              hint="From your most recent statement"
              keyboardType="decimal-pad"
            />
            <Field
              label="Margin over index"
              suffix="%"
              value={margin}
              onChangeText={setMargin}
              hint="Optional. Your rate is usually prime plus this margin."
              keyboardType="decimal-pad"
            />
          </View>

          {/* Credit limit — only asked for when it can't be derived from balances */}
          <View style={styles.card}>
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
              <Field
                label="Credit limit"
                prefix="$"
                value={limit}
                onChangeText={setLimit}
                hint="Link your HELOC and this fills in from your balances instead."
              />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Payments during the draw period</Text>
            <Text style={styles.hint}>
              Cycling only works while payments are interest-only. Once a HELOC amortizes, the
              strategy stops working.
            </Text>
            <View style={styles.segment}>
              <SegmentBtn
                label="Interest-only"
                active={paymentType === 'interest_only'}
                onPress={() => setPaymentType('interest_only')}
              />
              <SegmentBtn
                label="Amortizing"
                active={paymentType === 'amortizing'}
                onPress={() => setPaymentType('amortizing')}
              />
            </View>
            {paymentType === 'amortizing' && (
              <Text style={styles.warnText}>
                An amortizing HELOC can&apos;t be cycled. Projections will still calculate, but the
                strategy isn&apos;t a fit for this account.
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Draw period ends</Text>
            <Text style={styles.hint}>
              After this date you can no longer draw, so the plan has to finish before it.
            </Text>
            <View style={styles.dateRow}>
              <TextInput
                style={[styles.input, styles.dateInput]}
                value={drawMonth}
                onChangeText={setDrawMonth}
                placeholder="MM"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Draw period end month"
              />
              <Text style={styles.dateSep}>/</Text>
              <TextInput
                style={[styles.input, styles.dateInputYear]}
                value={drawYear}
                onChangeText={setDrawYear}
                placeholder="YYYY"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel="Draw period end year"
              />
            </View>
            {drawInvalid && (
              <Text style={styles.warnText}>
                Enter a month from 1 to 12 and a four-digit year.
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
            accessibilityLabel="Save HELOC terms"
          >
            {saving
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.saveBtnText}>Save terms</Text>}
          </TouchableOpacity>

          <Text style={styles.footnote}>
            We&apos;ll ask you to confirm these every {TERMS_STALE_DAYS} days, because HELOC rates
            move. Projections built on them are estimates, not guarantees.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label, prefix, suffix, value, onChangeText, hint, keyboardType,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  keyboardType?: 'numeric' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <View style={styles.inputRow}>
        {prefix && <Text style={styles.affix}>{prefix}</Text>}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType ?? 'numeric'}
          placeholder="0"
          placeholderTextColor={Colors.textMuted}
          selectTextOnFocus
          accessibilityLabel={label}
        />
        {suffix && <Text style={styles.affix}>{suffix}</Text>}
      </View>
    </View>
  );
}

function SegmentBtn({ label, active, onPress }: {
  label: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function firstBalances(account: LinkedAccount | null) {
  if (!account || account.accounts.length === 0) return null;
  const b = account.accounts[0].balances;
  return { current: b.current, available: b.available, limit: b.limit ?? null };
}
function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function round2(n: number) { return Math.round(n * 100) / 100; }
function monthOf(iso: string | null) {
  if (!iso) return '';
  const m = iso.split('-')[1];
  return m ? String(Number(m)) : '';
}
function yearOf(iso: string | null) {
  return iso ? iso.split('-')[0] ?? '' : '';
}
/** Returns an ISO date for the first of the month, or null when incomplete/invalid. */
function buildDate(month: string, year: string): string | null {
  if (!month && !year) return null;
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(y) || year.length !== 4) return null;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  headerTitle: { flex: 1, fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[8] },

  whyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  whyText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
  whyBold: { fontWeight: Typography.bold, color: Colors.textPrimary },

  staleCard: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  staleText: { fontSize: Typography.sm, color: Colors.mint700, lineHeight: 20 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing[5],
    ...Shadows.card,
  },
  field: { marginBottom: Spacing[4] },
  label: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  hint: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17, marginTop: Spacing[1] },
  derivedValue: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginTop: Spacing[2],
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    marginTop: Spacing[2],
  },
  affix: { fontSize: Typography.base, color: Colors.textMuted },
  input: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    minHeight: 44,
  },

  segment: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3] },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: { backgroundColor: Colors.mint50, borderColor: Colors.mint600 },
  segmentText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  segmentTextActive: { color: Colors.mint700, fontWeight: Typography.semibold },
  warnText: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing[3] },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: Spacing[3] },
  dateInput: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    textAlign: 'center',
    maxWidth: 80,
  },
  dateInputYear: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    textAlign: 'center',
    maxWidth: 110,
  },
  dateSep: { fontSize: Typography.lg, color: Colors.textMuted },

  saveBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.semibold },

  footnote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
  },
});
