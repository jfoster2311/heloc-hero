// app/tabs/calculator.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { computeProjection, formatMonths } from '../../lib/projections';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';
import type { CalculatorInputs } from '../../lib/types';

// ─── Defaults ────────────────────────────────────────────────────────────────
const GENERIC_DEFAULTS: CalculatorInputs = {
  mortgageBalance: 320000,
  mortgageRate:    6.5,    // displayed as % — divided by 100 before compute
  monthlyPayment:  2100,
  monthlySurplus:  600,    // realistic: $8k income − $5.5k expenses − $2.1k mortgage
  helocRate:       8.5,
};

function firstBalance(accounts: any[], type: string): number | null {
  const linked = accounts.find((a: any) => a.account_type === type);
  return linked?.accounts?.[0]?.balances?.current ?? null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalculatorScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { accounts } = useAccounts(profile?.id ?? null);

  const canPrefill = tier !== 'free';

  // Pre-fill from real data when available.
  // monthlySurplus = income − living expenses − mortgage payment.
  // monthly_expenses from onboarding excludes mortgage, so we subtract it separately.
  const initialInputs: CalculatorInputs = useMemo(() => {
    if (!canPrefill) return GENERIC_DEFAULTS;
    const mb = firstBalance(accounts, 'mortgage');
    const income   = profile?.monthly_income   ?? 0;
    const expenses = profile?.monthly_expenses ?? 0;
    const payment  = profile?.monthly_payment  ?? 0;
    return {
      mortgageBalance: mb ?? GENERIC_DEFAULTS.mortgageBalance,
      mortgageRate:    (profile?.mortgage_rate ?? 0.065) * 100,
      monthlyPayment:  payment || GENERIC_DEFAULTS.monthlyPayment,
      monthlySurplus:  Math.max(0, income - expenses - payment) || GENERIC_DEFAULTS.monthlySurplus,
      helocRate:       GENERIC_DEFAULTS.helocRate,
    };
  }, [canPrefill, accounts, profile]);

  const [inputs, setInputs] = useState<CalculatorInputs>(initialInputs);
  const [calculated, setCalculated] = useState(false);

  const projection = useMemo(() => {
    if (!calculated) return null;
    return computeProjection({
      ...inputs,
      mortgageRate: inputs.mortgageRate / 100,
      helocRate:    inputs.helocRate    / 100,
    });
  }, [inputs, calculated]);

  function updateField(field: keyof CalculatorInputs, raw: string) {
    const num = parseFloat(raw.replace(/,/g, '')) || 0;
    setInputs(prev => ({ ...prev, [field]: num }));
    setCalculated(false);
  }

  function handleCalculate() {
    setCalculated(true);
  }

  function handleReset() {
    setInputs(initialInputs);
    setCalculated(false);
  }

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Payoff Calculator</Text>
          <Text style={styles.headerSub}>See how fast you can pay off your mortgage</Text>
        </View>
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
          {/* Free tier notice */}
          {tier === 'free' && (
            <TouchableOpacity
              style={styles.infoBanner}
              onPress={() => router.push('/modals/upgrade')}
            >
              <Ionicons name="information-circle-outline" size={18} color={Colors.mint600} />
              <Text style={styles.infoBannerText}>
                Using example numbers. Upgrade to pre-fill with your real data.
              </Text>
              <Text style={styles.infoBannerLink}>Upgrade →</Text>
            </TouchableOpacity>
          )}

          {/* Inputs */}
          <View style={CommonStyles.card}>
            <Text style={styles.sectionTitle}>Mortgage Details</Text>

            <CalcInput
              label="Remaining Balance"
              prefix="$"
              value={inputs.mortgageBalance}
              onChangeText={v => updateField('mortgageBalance', v)}
              keyboardType="numeric"
            />
            <CalcInput
              label="Interest Rate"
              suffix="%"
              value={inputs.mortgageRate}
              onChangeText={v => updateField('mortgageRate', v)}
              keyboardType="decimal-pad"
              decimals={2}
            />
            <CalcInput
              label="Monthly Payment (P&I)"
              prefix="$"
              value={inputs.monthlyPayment}
              onChangeText={v => updateField('monthlyPayment', v)}
              keyboardType="numeric"
            />
          </View>

          <View style={CommonStyles.card}>
            <Text style={styles.sectionTitle}>HELOC Strategy</Text>

            <CalcInput
              label="Monthly Surplus to Sweep"
              prefix="$"
              value={inputs.monthlySurplus}
              onChangeText={v => updateField('monthlySurplus', v)}
              keyboardType="numeric"
              hint="Income minus all expenses including your mortgage payment"
            />
            <CalcInput
              label="HELOC Interest Rate"
              suffix="%"
              value={inputs.helocRate}
              onChangeText={v => updateField('helocRate', v)}
              keyboardType="decimal-pad"
              decimals={2}
              hint="Your HELOC's current APR"
            />
          </View>

          {/* Calculate button */}
          <TouchableOpacity style={styles.calcBtn} onPress={handleCalculate}>
            <Ionicons name="flash" size={20} color={Colors.white} />
            <Text style={styles.calcBtnText}>Calculate My Payoff</Text>
          </TouchableOpacity>

          {/* Results */}
          {projection && (
            <>
              {/* Savings summary */}
              <View style={[styles.resultsHero, Shadows.glow]}>
                <Text style={styles.resultsHeroLabel}>You could save</Text>
                <Text style={styles.resultsHeroAmount}>
                  ${projection.interestSaved.toLocaleString()}
                </Text>
                <Text style={styles.resultsHeroSub}>in total interest</Text>
              </View>

              {/* Timeline comparison */}
              <View style={CommonStyles.card}>
                <Text style={styles.sectionTitle}>Payoff Timeline</Text>
                <View style={styles.timelineRow}>
                  <TimelineBox
                    label="Standard"
                    months={projection.originalMonths}
                    date={projection.originalPayoffDate}
                    accent={false}
                  />
                  <View style={styles.timelineVs}>
                    <Ionicons name="arrow-forward" size={24} color={Colors.mint600} />
                  </View>
                  <TimelineBox
                    label="With HELOC"
                    months={projection.acceleratedMonths}
                    date={projection.acceleratedPayoffDate}
                    accent
                  />
                </View>

                <View style={styles.savedRow}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.savedText}>
                    Pay off{' '}
                    <Text style={styles.savedBold}>{formatMonths(projection.monthsSaved)} sooner</Text>
                    {' '}with the HELOC strategy
                  </Text>
                </View>
              </View>

              {/* Monthly breakdown */}
              <View style={CommonStyles.card}>
                <Text style={styles.sectionTitle}>Monthly Breakdown</Text>

                <BreakdownRow
                  label="Monthly surplus swept"
                  value={`$${inputs.monthlySurplus.toLocaleString()}`}
                  icon="repeat-outline"
                  color={Colors.mint600}
                />
                <BreakdownRow
                  label="Annual lump-sum to mortgage"
                  value={`$${(inputs.monthlySurplus * 12).toLocaleString()}`}
                  icon="flash-outline"
                  color={Colors.success}
                />
                <BreakdownRow
                  label="Interest saved per year (est.)"
                  value={`$${Math.round(projection.interestSaved / (projection.monthsSaved / 12 || 1)).toLocaleString()}`}
                  icon="trending-down-outline"
                  color={Colors.info}
                />
              </View>

              {/* CTA */}
              {tier === 'free' && (
                <TouchableOpacity
                  style={styles.ctaBanner}
                  onPress={() => router.push('/modals/upgrade')}
                >
                  <View>
                    <Text style={styles.ctaTitle}>Ready to make this real?</Text>
                    <Text style={styles.ctaSub}>
                      Link your accounts and let Safe Sweep™ do it automatically.
                    </Text>
                  </View>
                  <View style={styles.ctaBtn}>
                    <Text style={styles.ctaBtnText}>Upgrade</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetText}>Reset to defaults</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CalcInput({
  label, prefix, suffix, value, onChangeText, keyboardType, hint, decimals = 0,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: number;
  onChangeText: (v: string) => void;
  keyboardType?: 'numeric' | 'decimal-pad';
  hint?: string;
  decimals?: number;
}) {
  const displayValue = value === 0 ? '' : (decimals > 0 ? value.toString() : Math.round(value).toString());

  return (
    <View style={inputStyles.group}>
      <Text style={inputStyles.label}>{label}</Text>
      {hint && <Text style={inputStyles.hint}>{hint}</Text>}
      <View style={inputStyles.row}>
        {prefix && <Text style={inputStyles.affix}>{prefix}</Text>}
        <TextInput
          style={inputStyles.input}
          value={displayValue}
          onChangeText={onChangeText}
          keyboardType={keyboardType ?? 'numeric'}
          placeholder="0"
          placeholderTextColor={Colors.textMuted}
          selectTextOnFocus
        />
        {suffix && <Text style={inputStyles.affix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  group: { marginBottom: Spacing[4] },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing[1],
  },
  hint: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginBottom: Spacing[2],
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing[3],
  },
  affix: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    paddingVertical: Spacing[3],
  },
  input: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
  },
});

function TimelineBox({ label, months, date, accent }: {
  label: string; months: number; date: Date; accent: boolean;
}) {
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return (
    <View style={[
      timelineStyles.box,
      accent ? timelineStyles.boxAccent : timelineStyles.boxNeutral,
    ]}>
      <Text style={[timelineStyles.boxLabel, accent && timelineStyles.boxLabelAccent]}>
        {label}
      </Text>
      <Text style={[timelineStyles.boxMonths, accent && timelineStyles.boxMonthsAccent]}>
        {formatMonths(months)}
      </Text>
      <Text style={timelineStyles.boxDate}>{dateStr}</Text>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  box: {
    flex: 1,
    borderRadius: Radius.md,
    padding: Spacing[3],
    alignItems: 'center',
    gap: Spacing[1],
  },
  boxNeutral: { backgroundColor: Colors.gray100 },
  boxAccent:  { backgroundColor: Colors.mint50, borderWidth: 1, borderColor: Colors.mint200 },
  boxLabel:       { fontSize: Typography.xs, color: Colors.textMuted },
  boxLabelAccent: { color: Colors.mint700 },
  boxMonths:       { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  boxMonthsAccent: { color: Colors.mint600 },
  boxDate: { fontSize: Typography.xs, color: Colors.textMuted },
});

function BreakdownRow({ label, value, icon, color }: {
  label: string; value: string; icon: string; color: string;
}) {
  return (
    <View style={styles.breakdownRow}>
      <View style={[styles.breakdownIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  headerSub: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  infoBannerText: { flex: 1, fontSize: Typography.xs, color: Colors.mint700 },
  infoBannerLink: { fontSize: Typography.xs, color: Colors.mint600, fontWeight: Typography.semibold },

  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[4],
  },

  calcBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    ...Shadows.glow,
  },
  calcBtnText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },

  resultsHero: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.lg,
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[1],
  },
  resultsHeroLabel: { fontSize: Typography.base, color: 'rgba(255,255,255,0.8)' },
  resultsHeroAmount: {
    fontSize: Typography['4xl'],
    fontWeight: Typography.extrabold,
    color: Colors.white,
  },
  resultsHeroSub: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.7)' },

  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[4],
  },
  timelineVs: { paddingHorizontal: Spacing[1] },

  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#f0fdf4',
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  savedText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 18 },
  savedBold: { fontWeight: Typography.bold, color: Colors.success },

  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  breakdownIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  breakdownValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },

  ctaBanner: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    ...Shadows.glow,
  },
  ctaTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.white },
  ctaSub: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2, lineHeight: 16 },
  ctaBtn: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  ctaBtnText: { color: Colors.mint600, fontWeight: Typography.bold, fontSize: Typography.sm },

  resetBtn: { alignItems: 'center', paddingVertical: Spacing[2] },
  resetText: { color: Colors.textMuted, fontSize: Typography.sm },
});
