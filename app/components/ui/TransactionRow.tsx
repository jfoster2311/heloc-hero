// components/ui/TransactionRow.tsx — one transaction, rendered the same way
// everywhere it appears.
//
// This row shows up in six places: the Latest Activity widget, the full Activity
// list, the day-detail sheet behind a calendar cell, the category sheet, the
// merchant sheet, and the largest-draws list. They were on their way to being
// six slightly different rows — which is how an amount ends up right-aligned in
// five of them and centred in the sixth, and how a "hidden" row keeps its
// dimming in one list and loses it in another.
//
// So the props here are STATE, not styling. A caller says the row is hidden; it
// does not say the row is 40% opacity. That keeps the decision about what hidden
// looks like in one file, which is the only way it stays consistent.
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Touchable } from './press';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { hapticLight, hapticSelection } from '../../lib/haptics';

export interface TransactionRowProps {
  /** Payee, or the raw description when the bank sent no merchant. */
  name: string;
  /** Already-formatted, e.g. "Jul 14". The row does not know about dates. */
  meta: string;
  /** Plaid's sign convention: POSITIVE is money out. */
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;

  /**
   * Excluded from every total because the user marked it a duplicate.
   *
   * Dimmed AND given an eye-off glyph. Two cues rather than one, because
   * opacity alone is invisible to anyone who has not seen the un-dimmed row for
   * comparison — which is everyone opening the screen for the first time.
   */
  hidden?: boolean;
  /** The bank has not posted this yet, so the amount may still change. */
  pending?: boolean;
  /** This row is tied to a specific linked account. Drawn as a ring. */
  linkedAccount?: boolean;
  /** The user placed this row in its category, rather than the bank. */
  overridden?: boolean;
  /** The user marked this as repeating. */
  recurring?: boolean;

  /** Shows a spinner in place of the amount while a write is in flight. */
  saving?: boolean;
  onPress?: () => void;
  /** Appended to the row's accessibility label — e.g. its category. */
  accessibilityExtra?: string;

  /**
   * Swipe right to re-assign this row's category.
   *
   * Opt-in, and it has to stay opt-in for a structural reason: gesture-handler
   * is rooted at `app/tabs/_layout` and NOT at the app root — it was moved there
   * because at the root it broke text entry on the auth screens. So a pan inside
   * a modal route has no handler above it and would silently never fire. Only
   * callers rendering inside the tabs may pass this; everywhere else the row is
   * exactly the plain row it has always been, with no gesture attached and no
   * dead affordance suggesting one.
   *
   * The tap target is unaffected — a swipe is a shortcut for something the
   * detail sheet already does, never the only way to reach it, which is also
   * what keeps the row usable with a screen reader.
   */
  onSwipeCategorize?: () => void;
}

/** How far the row travels before the action arms, in points. */
const SWIPE_ARM = 76;
/**
 * Resistance past the arming point.
 *
 * Without it the row slides as far as the finger goes and the gesture stops
 * feeling like a control with a limit. 0.3 is enough drag to read as a spring
 * being stretched rather than as the row having come loose.
 */
const SWIPE_RESIST = 0.3;
/** The house spring, matching SweepSlider — one physics for the whole app. */
const SPRING = { stiffness: 250, damping: 30, mass: 1 };

export default function TransactionRow({
  name, meta, amount, icon,
  hidden, pending, linkedAccount, overridden, recurring,
  saving, onPress, accessibilityExtra, onSwipeCategorize,
}: TransactionRowProps) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  // Money IN, in Plaid's convention. Shown with an explicit plus, because the
  // sign is the only thing separating a $40 refund from a $40 purchase and the
  // colour cannot carry it — mint means "on track" elsewhere in this app.
  const inflow = amount < 0;
  const magnitude = Math.abs(amount);

  const body = (
    <>
      <View style={[styles.icon, hidden && styles.iconHidden]}>
        <Ionicons
          name={hidden ? 'eye-off-outline' : icon}
          size={17}
          color={hidden ? colors.textMuted : colors.mint700}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, hidden && styles.dimText]} numberOfLines={1}>
            {name}
          </Text>
          {recurring && !hidden && (
            <Ionicons name="repeat" size={13} color={colors.textMuted} />
          )}
        </View>
        <Text style={[styles.meta, hidden && styles.dimText]} numberOfLines={1}>
          {meta}
          {pending ? ' · Pending' : ''}
          {overridden ? ' · you categorised this' : ''}
          {hidden ? ' · hidden from totals' : ''}
        </Text>
      </View>

      <View style={styles.amountBlock}>
        {saving ? (
          <ActivityIndicator size="small" color={colors.accentInk} />
        ) : (
          <Text
            style={[
              styles.amount,
              inflow && styles.amountIn,
              hidden && styles.dimText,
              // A hidden row's amount is struck through as well as dimmed: it
              // is the figure that is NOT being counted, and that is the whole
              // meaning of the state.
              hidden && styles.amountStruck,
            ]}
          >
            {inflow ? '+' : ''}${fmtCents(magnitude)}
          </Text>
        )}
        {linkedAccount && !hidden && (
          // A ring, not a filled dot. A filled mint dot at this size is the
          // same mark this app uses for "on track", and the two appearing in
          // one row would collide. See semantic.linkedAccount in lib/theme.
          <View
            style={[styles.accountDot, { borderColor: semantic.linkedAccount }]}
            accessibilityElementsHidden
          />
        )}
      </View>

      {onPress && (
        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
      )}
    </>
  );

  const label =
    `${name}, ${inflow ? 'credit of ' : ''}$${fmtCents(magnitude)}, ${meta}` +
    (pending ? ', pending' : '') +
    (recurring ? ', recurring' : '') +
    (linkedAccount ? ', linked account' : '') +
    (hidden ? ', hidden from totals' : '') +
    (accessibilityExtra ? `, ${accessibilityExtra}` : '');

  const surface = !onPress ? (
    <View style={[styles.row, hidden && styles.rowHidden]} accessible accessibilityLabel={label}>
      {body}
    </View>
  ) : (
    <Touchable
      style={[styles.row, hidden && styles.rowHidden]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        onSwipeCategorize
          ? 'Opens the details for this transaction. Swipe right to change its category.'
          : 'Opens the details for this transaction'
      }
      // The gesture is invisible to a screen reader, so the same destination is
      // published as a custom action rather than left as a hidden shortcut.
      accessibilityActions={onSwipeCategorize ? [{ name: 'categorise', label: 'Change category' }] : undefined}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'categorise') onSwipeCategorize?.();
      }}
    >
      {body}
    </Touchable>
  );

  if (!onSwipeCategorize) return surface;
  return <SwipeToCategorize onTrigger={onSwipeCategorize}>{surface}</SwipeToCategorize>;
}

/**
 * The swipe layer — a green field with a tag on it, revealed from behind.
 *
 * ── Why the row springs shut rather than staying open ──────────────────────
 * A row that latches open is a second state the user now has to dismiss, and
 * with a list of them it is a screen full of half-open rows. Here the gesture IS
 * the action: cross the arming point, let go, and the row closes as the category
 * sheet comes up. Under the arming point it snaps back with the tension of a
 * physical switch, so an accidental brush costs nothing and teaches the limit.
 *
 * The pan is constrained to the horizontal on purpose. Without the activation
 * window it would swallow every attempt to scroll the list it lives in, which is
 * the failure mode that makes swipe rows feel broken.
 */
function SwipeToCategorize({ children, onTrigger }: {
  children: React.ReactNode;
  onTrigger: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);

  const arm = () => { hapticSelection(); };
  const fire = () => { hapticLight(); onTrigger(); };

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onUpdate(e => {
      // One direction only. A left swipe here would be an unlabelled second
      // action, and the one thing worse than a hidden gesture is two of them.
      const raw = Math.max(0, e.translationX);
      x.value = raw <= SWIPE_ARM ? raw : SWIPE_ARM + (raw - SWIPE_ARM) * SWIPE_RESIST;

      const nowArmed = raw >= SWIPE_ARM;
      if (nowArmed !== armed.value) {
        armed.value = nowArmed;
        if (nowArmed) runOnJS(arm)();
      }
    })
    .onEnd(() => {
      if (armed.value) runOnJS(fire)();
      armed.value = false;
      x.value = withSpring(0, SPRING);
    })
    .onFinalize(() => {
      armed.value = false;
      x.value = withSpring(0, SPRING);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // The tag fades and grows in as the row uncovers it, so the affordance is
  // legible before the user has committed to anything.
  const tagStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [8, SWIPE_ARM * 0.7], [0, 1], Extrapolation.CLAMP),
    transform: [{
      scale: interpolate(x.value, [8, SWIPE_ARM], [0.7, 1], Extrapolation.CLAMP),
    }],
  }));

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeBack} pointerEvents="none">
        <Animated.View style={tagStyle}>
          <Ionicons name="pricetag" size={18} color={colors.onAccent} />
        </Animated.View>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

function fmtCents(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const useStyles = createThemedStyles(t => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    // 44pt is the floor; these carry two lines of text, so they sit above it.
    minHeight: 60,
    paddingVertical: Spacing[2],
  },
  rowHidden: { opacity: t.semantic.hiddenOpacity },

  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHidden: { backgroundColor: t.colors.gray100 },

  body: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: {
    flexShrink: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textPrimary,
  },
  meta: { fontSize: 11, color: t.colors.textMuted },
  dimText: { color: t.colors.textMuted },

  amountBlock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amount: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  amountIn: { color: t.colors.accentInk },
  amountStruck: { textDecorationLine: 'line-through' },

  accountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },

  // The revealed field. `overflow: hidden` on the wrapper is what stops the row
  // sliding out over its neighbours when the finger runs past the arming point.
  swipeWrap: { overflow: 'hidden', borderRadius: Radius.md },
  swipeBack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    justifyContent: 'center',
    paddingLeft: Spacing[5],
  },
}));
