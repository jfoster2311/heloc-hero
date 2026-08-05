// components/NotificationPrimer.tsx — the ask, made once, at a moment it earns.
//
// iOS shows the system permission prompt ONCE per install. Spending it badly is
// permanent: a user who declines cannot be re-prompted, only sent to Settings.
// So this sheet exists to make the ask worth answering, and it holds three
// lines of defence against wasting it:
//
//   1. Only when the answer is still 'undetermined'. Re-showing a sheet to
//      someone who already granted is noise, and to someone who denied is a
//      button that does nothing.
//   2. Only when reminders would actually be scheduled — the cycle is
//      Pro-gated and needs real numbers behind it. Asking a user with nothing
//      to be reminded about buys silence and spends the one prompt.
//   3. Truthfully. These are LOCAL reminders computed from the user's own
//      figures. HELOC Hero has no payment rail: nothing "runs", nothing moves
//      money, and the copy must not imply otherwise.
import { useState, useEffect } from 'react';
import { View, Text, Modal, Alert } from 'react-native';
import { Touchable } from './ui/press';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { permissionStatus, requestPermission } from '../lib/notify';
import { supabase } from '../lib/supabase';
import { hapticLight, hapticError } from '../lib/haptics';
import { Typography, Spacing, Radius } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';

const PRIMER_SHOWN_KEY = '@heloc_hero:notification_primer_shown';

interface Props {
  /**
   * True once the user is on a plan that schedules reminders AND has a cycle
   * with something to say. Until then the sheet stays closed.
   */
  eligible: boolean;
  /** Whose preferences to switch on when they accept. */
  userId: string | null;
}

export default function NotificationPrimer({ eligible, userId }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!eligible) return;

    (async () => {
      const [shown, status] = await Promise.all([
        AsyncStorage.getItem(PRIMER_SHOWN_KEY),
        permissionStatus(),
      ]);
      // 'granted' needs no sheet; 'denied' cannot be re-prompted from here;
      // 'unavailable' is Expo Go, where scheduling is a no-op anyway.
      if (!cancelled && !shown && status === 'undetermined') setVisible(true);
    })();

    return () => { cancelled = true; };
  }, [eligible]);

  async function handleEnable() {
    hapticLight();
    await AsyncStorage.setItem(PRIMER_SHOWN_KEY, 'true');
    setVisible(false);

    const status = await requestPermission();
    if (status !== 'granted' || !userId) return;

    // Permission alone schedules nothing: both reminder preferences default to
    // off, so without this the user accepts, iOS grants, and they never hear
    // from the app again. The sheet describes exactly these two reminders, so
    // switching both on is what was agreed to — and Settings → Alerts is where
    // either can be turned back off.
    //
    // Only the two boolean columns are sent. The thresholds are the user's and
    // may already be set; a row created here gets the schema defaults for them
    // rather than having them overwritten.
    const { error } = await supabase
      .from('automation_settings')
      .upsert(
        { user_id: userId, safe_sweep_enabled: true, safe_dump_enabled: true },
        { onConflict: 'user_id' },
      );

    // This write failing silently was a dead end with no way back into it, and
    // every step above has already been spent by the time it runs:
    //
    //   · iOS grants exactly ONE permission prompt per install, and it has just
    //     been used. There is no second chance to ask.
    //   · PRIMER_SHOWN_KEY is already set, so this sheet will not reappear.
    //   · Both preferences default to OFF, so nothing is scheduled.
    //
    // The user has agreed to reminders, granted the system permission, watched
    // the sheet close, and will never hear from the app. Nothing on screen
    // would contradict that until they eventually notice the silence — and the
    // only recovery is a Settings screen they have no reason to open, because
    // as far as they know it worked.
    if (error) {
      hapticError();
      Alert.alert(
        'Reminders are not on yet',
        'Your phone allowed notifications, but we could not save the setting. ' +
        'Turn them on under Settings → Alerts and nothing else needs redoing.',
      );
    }
  }

  async function handleDismiss() {
    // Recorded so the sheet does not reappear on the next dashboard load. The
    // permission itself is untouched and still 'undetermined', so Settings can
    // raise the real prompt later if the user changes their mind.
    await AsyncStorage.setItem(PRIMER_SHOWN_KEY, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconRow}>
            <View style={styles.iconBg}>
              <Ionicons name="notifications-outline" size={32} color={colors.accentInk} />
            </View>
          </View>

          <Text style={styles.title}>We'll tell you when it's time</Text>
          <Text style={styles.body}>
            A dump happens a few times a year, so there is nothing to check most
            weeks. Let us watch the numbers and remind you when your surplus is
            ready to move and when your line is clear again.
          </Text>
          <Text style={styles.fine}>
            Reminders are scheduled on this device from your own figures. You
            make every transfer at your bank — HELOC Hero never moves money.
          </Text>

          <Touchable
            style={styles.primaryBtn}
            onPress={handleEnable}
            accessibilityRole="button"
            accessibilityLabel="Turn on reminders"
          >
            <Text style={styles.primaryBtnText}>Turn on reminders</Text>
          </Touchable>

          <Touchable
            style={styles.secondaryBtn}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </Touchable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles(t => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing[6],
    paddingBottom: Spacing[8],
    gap: Spacing[4],
    alignItems: 'center',
    ...t.shadows.modal,
  },
  iconRow: { marginBottom: Spacing[2] },
  iconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: Typography.base,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  fine: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryBtn: {
    width: '100%',
    minHeight: 44,
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    ...t.shadows.glow,
  },
  primaryBtnText: {
    color: t.colors.onAccent,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  secondaryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing[2],
  },
  secondaryBtnText: {
    fontSize: Typography.base,
    color: t.colors.textMuted,
  },
}));
