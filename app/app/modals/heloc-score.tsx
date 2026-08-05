// app/modals/heloc-score.tsx — the readiness score, with its working shown.
//
// ── The honesty constraint on this screen ──────────────────────────────────
// A number between 0 and 100 next to the words "HELOC" and "score" will be read
// as approval odds unless the screen works hard to say otherwise. It is not
// that: there is no underwriting model behind it, and claiming to predict a
// lender's decision would be exactly the kind of statement CLAUDE.md's honesty
// rule exists to prevent.
//
// What defends against that reading is not a disclaimer at the bottom — it is
// that every factor shows its own arithmetic in words the user can check
// against figures they gave us. A score you can recompute yourself cannot be
// mistaken for one a lender computed.
//
// The credit factor is self-reported, from a range the user picks. We never pull
// it and the copy never implies we do; the screen points them at where they can
// get it free instead.
import { View, Text, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import ModalScreen from '../../components/ui/ModalScreen';
import GaugeArc from '../../components/ui/GaugeArc';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { supabase } from '../../lib/supabase';
import { hapticLight, hapticSelection, hapticSuccess } from '../../lib/haptics';
import {
  computeHelocScore, READY_THRESHOLD, CREDIT_RANGES, FREE_CREDIT_REPORT_URL,
  type ScoreFactor,
} from '../../lib/helocScore';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

// The bands and the free-report link both live in lib/helocScore.ts, because
// onboarding collects the same answer and the two had drifted to different
// midpoints for the same band.

export default function HelocScoreScreen() {
  const { colors, common } = useTheme();
  const styles = useStyles();
  const { profile, refresh } = useAuth();
  const f = useFinancials();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const score = useMemo(
    () => computeHelocScore({
      monthlyIncome:   f.income,
      monthlyExpenses: f.expenses,
      monthlyPayment:  f.payment,
      helocBalance:    f.helocDrawn,
      helocLimit:      f.helocLimit,
      creditScore:     profile?.credit_score ?? null,
      homeValue:       f.homeValue,
      mortgageBalance: f.mortgageBalance,
    }),
    [f.income, f.expenses, f.payment, f.helocDrawn, f.helocLimit,
     profile?.credit_score, f.homeValue, f.mortgageBalance],
  );

  async function saveCredit(value: number) {
    if (!profile?.id) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('users')
      .update({ credit_score: value })
      .eq('id', profile.id);
    setSaving(false);
    if (err) {
      setError("Couldn't save that. Check your connection and try again.");
      return;
    }
    hapticSuccess();
    setPicking(false);
    await refresh();
  }

  return (
    <ModalScreen
      title="HELOC Hero score"
      footnote={
        'This is our own readiness check, not a lending decision and not approval odds. ' +
        'It is built only from the figures on this screen, and no lender sees it. ' +
        'Projections are estimates — HELOC Hero is not a lender and this is not ' +
        'financial advice.'
      }
    >
      {f.loading ? (
        <View style={styles.centre}><ActivityIndicator color={colors.accentInk} /></View>
      ) : (
        <>
          <View style={styles.gaugeBlock}>
            <GaugeArc
              pct={score.total}
              color={colors.accentInk}
              label={score.label}
              value={String(score.total)}
              sub={score.ready ? 'ready to cycle' : `${READY_THRESHOLD} is ready`}
              accessibilityLabel={
                `HELOC Hero score ${score.total} out of 100. ${score.label}. ` +
                `${READY_THRESHOLD} or above is ready.`
              }
            />
            <Text style={styles.headline}>{score.headline}</Text>
          </View>

          {/* ── What to do next ────────────────────────────────────────────
              Ordered by how many points each would recover, which is the
              honest ranking — not by what is easiest to write copy for. */}
          {!score.ready && score.improvements.length > 0 && (
            <View style={styles.next}>
              <Text style={common.eyebrow}>WHERE YOU&apos;D GAIN THE MOST</Text>
              {score.improvements.slice(0, 3).map((imp, i) => (
                <View key={imp.id} style={styles.nextRow}>
                  <View style={styles.nextRank}>
                    <Text style={styles.nextRankText}>{i + 1}</Text>
                  </View>
                  <View style={styles.nextBody}>
                    <Text style={styles.nextLabel}>{imp.label}</Text>
                    <Text style={styles.nextAdvice}>{imp.advice}</Text>
                  </View>
                  <Text style={styles.nextPoints}>+{imp.max - imp.points}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── The working ──────────────────────────────────────────────── */}
          <Text style={common.eyebrow}>HOW IT ADDS UP</Text>
          <View style={styles.factors}>
            {score.factors.map(fac => (
              <FactorRow
                key={fac.id}
                factor={fac}
                onPress={fac.id === 'credit' ? () => { hapticLight(); setPicking(p => !p); } : undefined}
              />
            ))}
          </View>

          {/* ── Credit, self-reported ─────────────────────────────────────── */}
          {(picking || profile?.credit_score == null) && (
            <View style={styles.creditBlock}>
              <Text style={styles.creditTitle}>
                {profile?.credit_score == null ? 'Add your credit range' : 'Update your range'}
              </Text>
              <Text style={styles.creditBody}>
                Pick the band you are in. We never pull your credit, and nothing here is
                shared with a lender.
              </Text>

              <View style={styles.ranges}>
                {CREDIT_RANGES.map(r => {
                  const active = profile?.credit_score === r.value;
                  return (
                    <TouchableOpacity
                      key={r.value}
                      style={[styles.range, active && styles.rangeActive]}
                      disabled={saving}
                      onPress={() => { hapticSelection(); saveCredit(r.value); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${r.label}, ${r.range}`}
                    >
                      <View style={styles.rangeBody}>
                        <Text style={styles.rangeLabel}>{r.label}</Text>
                        <Text style={styles.rangeScore}>{r.range}</Text>
                      </View>
                      {active && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.accentInk} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity
                style={styles.link}
                onPress={() => { hapticLight(); Linking.openURL(FREE_CREDIT_REPORT_URL); }}
                accessibilityRole="link"
                accessibilityLabel="Get your credit report free at annualcreditreport.com"
              >
                <Ionicons name="open-outline" size={15} color={colors.mint700} />
                <Text style={styles.linkText}>
                  Don&apos;t know it? Get it free at annualcreditreport.com — the official
                  site, no card needed. Your bank or card issuer likely shows a score too.
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </ModalScreen>
  );
}

/**
 * One factor, its arithmetic, and what it is worth.
 *
 * An inapplicable factor is drawn muted with its points suppressed entirely
 * rather than shown as "0 of 20" — a zero reads as a failure, and "you have not
 * opened a HELOC yet" is not a failure on a screen about getting ready to open
 * one.
 */
function FactorRow({ factor, onPress }: {
  factor: ScoreFactor;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const Row = onPress ? TouchableOpacity : View;
  const pct = factor.max > 0 ? (factor.points / factor.max) * 100 : 0;

  return (
    <Row
      style={styles.factor}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        factor.applicable
          ? `${factor.label}, ${factor.points} of ${factor.max} points. ${factor.detail}`
          : `${factor.label}, not counted yet. ${factor.detail}`
      }
    >
      <View style={styles.factorHead}>
        <Text style={styles.factorLabel}>{factor.label}</Text>
        {factor.applicable ? (
          <Text style={styles.factorPoints}>
            {factor.points}
            <Text style={styles.factorMax}> / {factor.max}</Text>
          </Text>
        ) : (
          <Text style={styles.factorNa}>not counted yet</Text>
        )}
      </View>

      {factor.applicable && (
        <View style={styles.factorTrack}>
          <View style={[styles.factorFill, { width: `${Math.max(1.5, pct)}%` }]} />
        </View>
      )}

      <Text style={styles.factorDetail}>{factor.detail}</Text>
      {onPress && (
        <Text style={styles.factorAction}>
          {factor.applicable ? 'Change my range' : 'Add my range'}
        </Text>
      )}
    </Row>
  );
}

const useStyles = createThemedStyles(t => ({
  centre: { paddingVertical: Spacing[10], alignItems: 'center' },

  gaugeBlock: { alignItems: 'center', gap: Spacing[4] },
  headline: {
    fontSize: Typography.base,
    color: t.colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },

  next: {
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  nextRow: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  nextRank: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: t.colors.mint600,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  nextRankText: { fontSize: 11, fontWeight: Typography.bold, color: t.colors.onAccent },
  nextBody: { flex: 1, gap: 2 },
  nextLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  nextAdvice: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },
  nextPoints: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: t.colors.mint700,
  },

  factors: { gap: Spacing[2] },
  factor: {
    gap: 6,
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
  },
  factorHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  factorLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  factorPoints: { fontSize: Typography.sm, fontWeight: Typography.bold, color: t.colors.textPrimary },
  factorMax: { fontWeight: Typography.regular, color: t.colors.textMuted },
  factorNa: { fontSize: Typography.xs, color: t.colors.textMuted },
  factorTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: t.colors.gray100,
    overflow: 'hidden',
  },
  factorFill: { height: 5, borderRadius: 3, backgroundColor: t.colors.mint600 },
  factorDetail: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },
  factorAction: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
    marginTop: 2,
  },

  creditBlock: {
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  creditTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  creditBody: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },
  ranges: { gap: Spacing[2] },
  range: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 56,
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  rangeActive: { borderColor: t.colors.mint600, backgroundColor: t.colors.mint50 },
  rangeBody: { flex: 1 },
  rangeLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  rangeScore: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: 1 },

  // Two lines of 11pt with no vertical padding is a ~34pt target on the one
  // control that leaves the app. Padding rather than hitSlop, because the row
  // sits at the end of a card where the slop would reach past the card's edge.
  link: {
    flexDirection: 'row',
    gap: Spacing[2],
    alignItems: 'flex-start',
    paddingVertical: Spacing[2],
  },
  linkText: { flex: 1, fontSize: 11, color: t.colors.textSecondary, lineHeight: 17 },

  error: { fontSize: Typography.xs, color: t.colors.textSecondary },
}));
