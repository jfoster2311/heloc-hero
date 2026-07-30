// components/GettingStarted.tsx — where you are, and the one thing to do next.
//
// Two things in one card, deliberately: the readiness score and the six steps.
// They are the same question asked at two resolutions — "am I in shape to do
// this" and "what specifically is missing" — and separating them onto two cards
// would put a number on the Dashboard with its explanation somewhere else.
//
// ── It retires itself, in two stages ───────────────────────────────────────
// Once all six steps are done the card returns null. A permanent checklist of
// ticks is clutter on the screen the app most wants to keep sparse, and the
// Dashboard's whole premise is ranking rather than holding everything.
//
// Retiring only at 6-of-6 made that a cliff: at 5-of-6 this was still a progress
// bar, a score row and six 56pt step rows sitting above the card that carries
// the actual decision — roughly a third of the first screenful spent on a list
// whose remaining content is one item. So past halfway it collapses to the next
// step alone. The rest stay one tap away rather than gone: someone who cannot
// see step 6 does not know the strategy has a step 6, which is most of what the
// list is for, and that argument does not stop applying at 50%.
//
// The score row survives the collapse on purpose. It is the ONLY route to
// modals/heloc-score anywhere in the app — hiding it behind the toggle would
// make the screen that says what the score is and is not unreachable for the
// users furthest along.
import { useState } from 'react';
import { View, Text, TouchableOpacity, LayoutAnimation, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from './ui/primitives';
import { Typography, Spacing, Radius } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';
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
  const { colors, common } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  // Nothing left to prompt. See the header note.
  if (checklist.finished) return null;

  const pct = (checklist.completed / checklist.total) * 100;

  // Past halfway the list stops being an agenda and becomes mostly a record of
  // what is already done — which is the point to stop spending prime real estate
  // on it. `next` is non-null whenever `finished` is false, so the fallback to
  // the full list is belt-and-braces rather than a reachable state.
  const dense = pct >= 50;
  const collapsed = dense && !expanded;
  const shown = collapsed && checklist.next ? [checklist.next] : checklist.steps;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={common.eyebrow}>GETTING STARTED</Text>
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
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.steps}>
        {shown.map(s => (
          <StepRow
            key={s.id}
            // The step's real position, not its position in what is rendered —
            // collapsed, the one visible row is still "step 6 of 6".
            step={s}
            index={checklist.steps.indexOf(s) + 1}
            highlighted={checklist.next?.id === s.id}
            onPress={() => { hapticLight(); router.push(s.route as never); }}
          />
        ))}
      </View>

      {dense && (
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => {
            hapticLight();
            if (Platform.OS === 'ios') {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
            setExpanded(e => !e);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Show only the next step' : `Show all ${checklist.total} steps`}
        >
          <Text style={styles.toggleText}>
            {expanded ? 'Show less' : `Show all ${checklist.total} steps`}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={colors.accentInk}
          />
        </TouchableOpacity>
      )}
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
  const { colors } = useTheme();
  const styles = useStyles();
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
          ? <Ionicons name="checkmark" size={14} color={colors.onAccent} />
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
        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

const useStyles = createThemedStyles(t => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  progress: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: t.colors.textMuted },

  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: t.colors.gray100,
    overflow: 'hidden',
    marginBottom: Spacing[4],
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: t.colors.mint600 },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 64,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
    marginBottom: Spacing[4],
  },
  scoreValue: { flexDirection: 'row', alignItems: 'baseline' },
  scoreNumber: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: t.colors.mint700,
    letterSpacing: -0.5,
  },
  scoreOf: { fontSize: Typography.xs, color: t.colors.textMuted, marginLeft: 2 },
  scoreBody: { flex: 1, gap: 2 },
  scoreLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  scoreHeadline: { fontSize: 11, color: t.colors.textSecondary, lineHeight: 16 },

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
  stepNext: { backgroundColor: t.colors.surfaceSunken },

  mark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: { backgroundColor: t.colors.mint600, borderColor: t.colors.mint600 },
  markBlocked: { borderColor: t.colors.gray200 },
  markText: { fontSize: 12, fontWeight: Typography.bold, color: t.colors.textSecondary },
  markTextBlocked: { color: t.colors.textMuted },

  stepBody: { flex: 1, gap: 1 },
  stepTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  stepTitleDone: { color: t.colors.textSecondary },
  stepTitleBlocked: { color: t.colors.textMuted },
  stepSub: { fontSize: 11, color: t.colors.textMuted, lineHeight: 16 },

  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    minHeight: 44,
    marginTop: Spacing[1],
  },
  toggleText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.accentInk,
  },
}));
