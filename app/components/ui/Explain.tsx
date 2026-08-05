// components/ui/Explain.tsx — the paragraph that used to sit on the canvas.
//
// The app had a habit: every section carried a title, its control, and then two
// or three lines of prose explaining why the control existed. Individually each
// paragraph was well-judged. Stacked eight to a screen they turned a settings
// sheet into an essay, and the figure the user actually came for competed with
// the explanation of the figure.
//
// The fix is the one primitives' Disclosure already applies to ROWS, quoted from
// its own comment: the right amount of detail for the one day someone doubts a
// number, and far too much for the other three hundred. Nothing is deleted; it
// sits one tap down.
//
// ── The line this draws, which matters legally ─────────────────────────────
// CLAUDE.md's honesty rule is about what the product CLAIMS, not about how many
// words it uses to claim it. A label plus a reachable disclosure is exactly as
// honest as a resident paragraph. So the split is by ROLE, and it is not a
// judgement call left to each call site:
//
//   PEDAGOGY  — why the feature exists, how the arithmetic works, what the
//               strategy is. Belongs behind the ⓘ. The user who wants it will
//               look for it; the user who has read it once should never be made
//               to read it again.
//
//   CAVEAT    — anything that would change the decision being made ON THIS
//               SCREEN. "Assumes a deposit we have seen before arrives." "This
//               is an estimate, not a guarantee." Stays on the canvas, cut to
//               one line, because a disclosure the user has to go looking for is
//               not a disclosure at the moment money moves.
//
// If you cannot tell which a string is, ask whether someone who never opened the
// sheet could be misled. If yes, it is a caveat and it stays.
import { useState, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable } from './press';
import DetailSheet from './DetailSheet';
import { Typography, Spacing, Tracking } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

export interface ExplainContent {
  /** Sheet header. Tracked caps, so keep it short — "REPLENISH THRESHOLD". */
  title: string;
  /** One string per paragraph. Prose that was on the canvas goes here whole. */
  body: string[];
}

/**
 * The ⓘ itself, standalone.
 *
 * Visually 24pt so it sits quietly beside a label, with hitSlop taking the real
 * target to HIG's 44 — inflating the box instead would push every eyebrow row
 * 20pt taller and undo the density this component exists to buy.
 */
export function ExplainButton({ title, body }: ExplainContent) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Touchable
        style={styles.button}
        onPress={() => { setOpen(true); }}
        haptic="selection"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        // Spoken as a question because that is what the control answers. The
        // bare title would read as though the button navigated somewhere.
        accessibilityLabel={`About ${title.toLowerCase()}`}
        accessibilityHint="Opens an explanation"
      >
        <Ionicons name="information-circle-outline" size={17} color={colors.textMuted} />
      </Touchable>

      <DetailSheet
        visible={open}
        title={title}
        onClose={() => { setOpen(false); }}
      >
        <View style={styles.prose}>
          {body.map((p, i) => (
            <Text key={i} style={styles.proseText}>{p}</Text>
          ))}
        </View>
      </DetailSheet>
    </>
  );
}

/**
 * An eyebrow with its explanation parked on the right.
 *
 * Replaces the `<Text style={styles.eyebrow}>` + paragraph pair that opened most
 * cards in the modals. Where a card had a sentence-case section title rather
 * than tracked caps, pass `caps={false}`.
 */
export function SectionHead({ label, explain, right, caps = true }: {
  label: string;
  /** Omit and the row is just a label — no ⓘ is drawn. */
  explain?: ExplainContent;
  /** A chip or count that belongs on the same line, left of the ⓘ. */
  right?: ReactNode;
  caps?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.head}>
      <Text style={[caps ? styles.eyebrow : styles.title, styles.headLabel]}>
        {caps ? label.toUpperCase() : label}
      </Text>
      {right}
      {explain ? <ExplainButton {...explain} /> : null}
    </View>
  );
}

/**
 * A caveat that stays on the canvas.
 *
 * One line by default and clipped rather than wrapped — a caveat that runs to
 * four lines is pedagogy wearing a caveat's clothes, and belongs in an
 * ExplainButton with a shorter summary left here. `lines` is an escape hatch for
 * the few that genuinely cannot be said in one, not a default to raise.
 */
export function Caveat({ children, lines = 1 }: { children: ReactNode; lines?: number }) {
  const styles = useStyles();
  return (
    <Text style={styles.caveat} numberOfLines={lines}>
      {children}
    </Text>
  );
}

const useStyles = createThemedStyles(t => ({
  // Card has padding but no gap, so its children space themselves. Owning the
  // bottom margin HERE rather than on each card's first control is what stops
  // twenty screens from each picking their own — the drift that had three modals
  // on different touch-target heights before ModalScreen existed.
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 24,
    marginBottom: Spacing[3],
  },
  headLabel: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: Tracking.eyebrow,
  },
  title: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  button: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // textSecondary rather than textMuted: this is the primary content of the
  // sheet it sits in, not an aside inside a denser screen.
  prose: { gap: Spacing[4] },
  proseText: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 22,
  },

  caveat: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 17,
    marginTop: Spacing[2],
  },
}));
