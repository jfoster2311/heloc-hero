// components/ui/ModalHeader.tsx — the title-and-close bar every sheet wears.
//
// ModalScreen already framed the sixteen edit sheets, but four screens are
// structurally different enough that they never adopted it — settings is a long
// nav list with no save button, move-money is a multi-step flow with its own
// keypad accessory, link-account is a Plaid flow with a gated branch, get-heloc
// is a content screen. Each therefore hand-rolled its own header, and by August
// 2026 the five had drifted apart in every dimension a header has:
//
//              title    close target   close icon         status bar
//   ModalScreen  20pt      44x44         22 / secondary     themed
//   get-heloc    18pt      40 (hitSlop)  24 / primary       NONE
//   link-account 18pt      44x44         24 / primary       NONE
//   move-money   20pt      44x44         22 / secondary     NONE
//   settings     18pt      40 (hitSlop)  24 / primary       NONE
//
// Three of those rows are visible side by side within two taps of each other.
//
// Two of them are defects rather than drift:
//
//  · **The 40pt targets.** A 24pt icon with 8pt of hitSlop is a 40pt target,
//    under the 44pt HIG minimum CLAUDE.md requires — and link-account's own
//    style note had already caught this exact bug once ("A 24pt icon with 4pt
//    of padding is a 32pt target"). It came back on two other screens.
//  · **The missing status bar.** Every tab now declares `dark`, so a sheet that
//    declares nothing inherits `dark` — correct on the light theme and
//    invisible on the dark one, where it paints a near-black clock on a
//    near-black sheet. It is the failure ModalScreen's own StatusBar comment
//    describes, and it was live on all four of these.
//
// So the bar is a component, and ModalScreen renders it too. A screen that needs
// its own body keeps its own body; nothing needs its own header.
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Touchable } from './press';
import { Typography, Spacing } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

interface Props {
  title: string;
  /** What the close button announces. Defaults to "Close". */
  closeLabel?: string;
  /**
   * Separates the header from a body that scrolls under it.
   *
   * Off by default: most sheets open onto the page colour, where a rule reads as
   * a seam. On by default would have been the wrong way round — the two screens
   * that want it (settings, link-account) are the two whose body is a dense list
   * that would otherwise start with no boundary at all.
   */
  divider?: boolean;
  /** Rendered between the title and the close button. */
  children?: React.ReactNode;
}

export default function ModalHeader({ title, closeLabel = 'Close', divider, children }: Props) {
  const styles = useStyles();
  const { colors, mode } = useTheme();
  const router = useRouter();

  return (
    <>
      {/* Follows the theme rather than a fixed value — see the file note. A
          sheet slides over a tab that has already set the clock, so declaring
          nothing means inheriting whatever that tab chose. */}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.header, divider && styles.headerDivided]}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {children}
        {/* Owned here rather than passed in, so the haptic lives here too and
            cannot be doubled by a caller supplying its own. Every sheet in the
            app closes through this control. */}
        <Touchable
          onPress={() => { router.back(); }}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Touchable>
      </View>
    </>
  );
}

const useStyles = createThemedStyles(t => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  headerDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.borderSubtle,
  },
  // 20pt. The 18pt the three bespoke sheets used sat below the section titles
  // on their own bodies in two cases, which inverted the hierarchy outright.
  title: {
    flex: 1,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
  },
  // A real 44pt box, never hitSlop around a bare icon. This is the control that
  // dismisses a screen where the app asks for bank credentials.
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
