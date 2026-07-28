// components/GettingStarted.tsx — where you are, and the one thing to do next.
//
// Two things in one card, deliberately: the readiness score and the six steps.
// They are the same question asked at two resolutions — "am I in shape to do
// this" and "what specifically is missing" — and separating them onto two cards
// would put a number on the Dashboard with its explanation somewhere else.
//
// ── It retires itself ──────────────────────────────────────────────────────
// Once all six steps are done the card returns null. A permanent checklist of
// ticks is clutter on the screen the app most wants to keep sparse, and the
// Dashboard's whole premise is ranking rather than holding everything.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from './ui/primitives';
import { Colors, Typography, Spacing, Radius, CommonStyles } from '../lib/theme';
import { hapticLight } from '../lib/haptics';
import { READY_THRESHOLD } from '../lib/helocScore';
import type { ChecklistState, ChecklistStep } from '../lib/onboardingChecklist';

export interface GettingStartedProps {
  checklist: ChecklistState;
  /** 0–100. */
  score: number;
  /** One sentence from the score. */
  scoreHeadline: string;
  /** True when the score is missing inputs and should not be read as final. */
  scoreIncomplete: boolean;
}

export default function GettingStarted({
  checklist, score, scoreHeadline, scoreIncomplete,
}: GettingStartedProps) {
  const router = useRouter();

  // Nothing left to prompt. See the header note.
  if (checklist.finished) return null;

  const pct = (checklist.completed / checklist.total) * 100;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={CommonStyles.eyebrow}>GETTING STARTED</Text>
        <Text style={styles.progress}>
          {checklist.completed} of {checklist.total}
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, pct)}%` }]} />
      </View>

      {/* ── The score ─────────────────────────────────────────────────────
          A tap target rather than a figure, because the number is close to
          meaningless without the four factors behind it — and the screen it
          opens is where the app says what it is and is not. */}
      <TouchableOpacity
        style={styles.scoreRow}
        onPress={() => { hapticLight(); router.push('/modals/heloc-score' as never); }}
        accessibilityRole="button"
        accessibilityLabel={
          scoreIncomplete
            ? 'HELOC Hero score, not complete yet. Add the missing figures.'
            : `HELOC Hero score ${score} out of 100. ${scoreHeadline}`
        }
        accessibilityHint="Opens the score and how it is worked out"
      >
        <View style={styles.scoreValue}>
          <Text style={styles.scoreNumber}>{scoreIncomplete ? '—' : score}</Text>
          <Text style={styles.scoreOf}>/ {READY_THRESHOLD}</Text>
        </View>
        <View style={styles.scoreBody}>
          <Text style={styles.scoreLabel}>HELOC Hero score</Text>
          <Text style={styles.scoreHeadline} numberOfLines={2}>{scoreHeadline}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.steps}>
        {checklist.steps.map((s, i) => (
          <StepRow
            key={s.id}
            step={s}
            index={i + 1}
            highlighted={checklist.next?.id === s.id}
            onPress={() => { hapticLight(); router.push(s.route as never); }}
          />
        ))}
      </View>
    </Card>
  );
}

/**
 * One step.
 *
 * A blocked step is shown, muted, with the reason — not hidden. Someone who
 * cannot see step 6 does not know the strategy has a step 6, and showing where
 * this is going is most of what the list is for.
 */
function StepRow({ step, index, highlighted, onPress }: {
  step: ChecklistStep;
  index: number;
  highlighted: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.step, highlighted && styles.stepNext]}
      onPress={onPress}
      disabled={step.blocked}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ checked: step.done, disabled: step.blocked }}
      accessibilityLabel={
        `Step ${index}, ${step.title}. ` +
        (step.done ? 'Done. ' : step.blocked ? `Not yet. ${step.blockedReason} ` : '') +
        (step.done ? (step.doneNote ?? '') : step.blocked ? '' : step.body)
      }
    >
      <View
        style={[
          styles.mark,
          step.done && styles.markDone,
          step.blocked && !step.done && styles.markBlocked,
        ]}
      >
        {step.done
          ? <Ionicons name="checkmark" size={14} color={Colors.white} />
          : <Text style={[styles.markText, step.blocked && styles.markTextBlocked]}>{index}</Text>}
      </View>

      <View style={styles.stepBody}>
        <Text
          style={[
            styles.stepTitle,
            step.done && styles.stepTitleDone,
            step.blocked && !step.done && styles.stepTitleBlocked,
          ]}
        >
          {step.title}
        </Text>
        <Text style={styles.stepSub} numberOfLines={2}>
          {step.done
            ? (step.doneNote ?? '')
            : step.blocked
              ? step.blockedReason
              : step.body}
        </Text>
      </View>

      {!step.done && !step.blocked && (
        <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  progress: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textMuted },

  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.gray100,
    overflow: 'hidden',
    marginBottom: Spacing[4],
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: Colors.mint600 },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 64,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    borderRadius: Radius.lg,
    backgroundColor: Colors.mint50,
    borderWidth: 1,
    borderColor: Colors.mint200,
    marginBottom: Spacing[4],
  },
  scoreValue: { flexDirection: 'row', alignItems: 'baseline' },
  scoreNumber: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: Colors.mint700,
    letterSpacing: -0.5,
  },
  scoreOf: { fontSize: Typography.xs, color: Colors.textMuted, marginLeft: 2 },
  scoreBody: { flex: 1, gap: 2 },
  scoreLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  scoreHeadline: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },

  steps: { gap: Spacing[1] },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 56,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.md,
  },
  stepNext: { backgroundColor: Colors.surfaceSunken },

  mark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: { backgroundColor: Colors.mint600, borderColor: Colors.mint600 },
  markBlocked: { borderColor: Colors.gray200 },
  markText: { fontSize: 12, fontWeight: Typography.bold, color: Colors.textSecondary },
  markTextBlocked: { color: Colors.textMuted },

  stepBody: { flex: 1, gap: 1 },
  stepTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  stepTitleDone: { color: Colors.textSecondary },
  stepTitleBlocked: { color: Colors.textMuted },
  stepSub: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
});
