// app/modals/settings.tsx
//
// ── Deep links ─────────────────────────────────────────────────────────────
// Callers can open this screen at a section: `/modals/settings?section=support`.
// The Accounts tab needs it — its "Support" and "Delete my data" rows promise
// something specific and used to land at the top of a six-section screen,
// leaving the user to go and find what they had just asked for.
//
// It scrolls rather than filtering, deliberately. Rendering only the requested
// section would make Settings' shape depend on how you arrived, so a user who
// opened it from Accounts would never learn the rest exists.
import {
  View, Text, ScrollView, Switch, Alert, Linking,
  type LayoutChangeEvent,
} from 'react-native';
import { Touchable } from '../../components/ui/press';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, invokeFunction } from '../../lib/supabase';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../lib/automation';
import { isPaidTier } from '../../lib/pricing';
import {
  permissionStatus, requestPermission,
  type PermissionStatus,
} from '../../lib/notify';
import {
  isLockEnabled, setLockEnabled, deviceSupportsLock, lockModuleAvailable,
} from '../../lib/appLock';
import { loadDemo, clearDemo } from '../../lib/seedDemo';
import { getDevProMode, setDevProMode, subscribeDevPro, type DevProMode } from '../../lib/devPro';
import { createThemedStyles, type ThemePreference, useTheme, useThemePreference } from '../../lib/themeContext';
import { hapticSelection } from '../../lib/haptics';

/**
 * System is first and is the default, because it is not the same as Light.
 * Someone on System follows their phone when it switches at sunset; someone on
 * Light has said they want light regardless. Offering only two options would
 * silently override a system-wide accessibility choice.
 */
const APPEARANCE_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  a11y: string;
}[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline', a11y: 'Match my phone' },
  { value: 'light',  label: 'Light',  icon: 'sunny-outline',          a11y: 'Always light' },
  { value: 'dark',   label: 'Dark',   icon: 'moon-outline',           a11y: 'Always dark' },
];
import { Typography, Spacing, Radius } from '../../lib/theme';
import type { AutomationSettings } from '../../lib/types';

// Tapping the DEV Pro Override row cycles through these, so both sides of every
// paywall gate can be checked in seconds without a purchase or a rebuild.
const NEXT_DEV_PRO: Record<DevProMode, DevProMode> = {
  auto: 'pro',
  pro:  'free',
  free: 'auto',
};
const DEV_PRO_LABELS: Record<DevProMode, string> = {
  auto: 'Auto (real entitlement)',
  pro:  'Forced Pro',
  free: 'Forced Free',
};

/** The anchors `?section=` accepts. Anything else is ignored, not guessed at. */
const SECTIONS = ['account', 'alerts', 'appearance', 'support', 'security'] as const;
type SettingsSection = typeof SECTIONS[number];

function parseSection(v: string | string[] | undefined): SettingsSection | null {
  const s = Array.isArray(v) ? v[0] : v;
  return SECTIONS.includes(s as SettingsSection) ? (s as SettingsSection) : null;
}

export default function SettingsModal() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const target = parseSection(useLocalSearchParams<{ section?: string }>().section);
  const [automation, setAutomation] = useState<Partial<AutomationSettings>>(
    DEFAULT_AUTOMATION_SETTINGS,
  );
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  // null until the first check resolves. Seeding it with a real status would
  // flash a notice about a state we have not actually confirmed yet.
  const [notifStatus, setNotifStatus] = useState<PermissionStatus | null>(null);
  const [autoLock, setAutoLock] = useState(false);
  const [lockSupported, setLockSupported] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [devPro, setDevPro] = useState<DevProMode>(getDevProMode());

  // DEV Pro override — keep the row in sync with the module's state.
  useEffect(() => subscribeDevPro(() => setDevPro(getDevProMode())), []);

  // ── Landing on the requested section ────────────────────────────────────
  // Driven by onLayout rather than a one-shot effect, because the sections
  // ABOVE the target keep changing height after first paint: the notification
  // notices resolve async, and the automation row's saved figures arrive from a
  // query. A single scroll on mount would be correct for one frame and then
  // silently wrong. Re-applying on layout keeps the target where it was put.
  //
  // Not animated: this is where the screen opens, not somewhere it travels to,
  // and a scroll that starts at the top and slides down implies the user could
  // have stopped it.
  //
  // A section near the bottom does NOT end up at the top of the viewport, and
  // that is the platform's behaviour rather than a bug to work around: there is
  // less content below `security` than a phone screen is tall, so scrollTo
  // clamps at the end of the list and the header lands part-way down. The
  // section is fully on screen either way, which is the promise this makes.
  // Pinning it to the top would mean padding the bottom of Settings with blank
  // space for every user in order to serve a deep link, which is the wrong
  // trade. `?section=security` is the case to look at on device.
  const scrollRef = useRef<ScrollView>(null);
  // The user's scroll always wins. Without this, an async layout pass a second
  // after they started reading would yank the page back under their thumb.
  const userTookOver = useRef(false);

  // Returns undefined for every section but the target, so React attaches no
  // handler at all to the other four rather than measuring the whole screen.
  function anchor(section: SettingsSection) {
    if (section !== target) return undefined;
    return (e: LayoutChangeEvent) => {
      if (userTookOver.current) return;
      // Less the content container's own top padding, so a section lands with
      // exactly the breathing room the screen opens with. Without it, every
      // target sits 16pt high — including `account`, which is already at the
      // top and would scroll its own padding off screen for no reason.
      const y = e.nativeEvent.layout.y - Spacing[4];
      scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false });
    };
  }

  useEffect(() => {
    async function loadLockState() {
      const supported = lockModuleAvailable() && await deviceSupportsLock();
      setLockSupported(supported);
      if (supported) setAutoLock(await isLockEnabled());
    }
    loadLockState();
  }, []);

  async function handleAutoLockToggle(value: boolean) {
    const success = await setLockEnabled(value);
    if (success) {
      setAutoLock(value);
    } else {
      Alert.alert(
        'Not Available',
        'Auto-lock requires Face ID or a passcode to be set up on your device.',
      );
    }
  }

  // maybeSingle, not single: a user who has never touched these settings has no
  // row, and `single` treats that as an error and leaves the defaults unread.
  const loadAutomation = useCallback(() => {
    if (!profile?.id) return;
    supabase
      .from('automation_settings')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setAutomation(data); });
  }, [profile?.id]);

  // Both re-run on focus, not just on mount: the thresholds sheet writes the
  // same row, and "Open Settings" leaves the app entirely — the answer the user
  // gives over in iOS has to land back here on return.
  useFocusEffect(useCallback(() => {
    loadAutomation();
    permissionStatus().then(setNotifStatus);
  }, [loadAutomation]));

  async function saveAutomation(patch: Partial<AutomationSettings>) {
    if (!profile?.id) return;
    const previous = automation;
    const updated  = { ...automation, ...patch };
    setAutomation(updated);
    setSavingAutomation(true);
    setAutomationError(null);

    // Columns listed explicitly, and user_id taken from the session rather than
    // from `updated`. Spreading the whole object put DEFAULT_AUTOMATION_SETTINGS'
    // placeholder user_id ('') into the payload for anyone who had no row yet,
    // so the very first toggle a new user flipped upserted an empty uuid, failed,
    // and — before the rollback above — stayed on regardless.
    const { error } = await supabase.from('automation_settings').upsert(
      {
        user_id:                 profile.id,
        safe_sweep_enabled:      !!updated.safe_sweep_enabled,
        safe_dump_enabled:       !!updated.safe_dump_enabled,
        buffer_target:           updated.buffer_target ?? DEFAULT_AUTOMATION_SETTINGS.buffer_target,
        upcoming_bills_estimate: updated.upcoming_bills_estimate ?? DEFAULT_AUTOMATION_SETTINGS.upcoming_bills_estimate,
        min_dump_amount:         updated.min_dump_amount ?? DEFAULT_AUTOMATION_SETTINGS.min_dump_amount,
      },
      { onConflict: 'user_id' },
    );
    setSavingAutomation(false);

    // A switch that flips, fails to persist and stays flipped is a lie the user
    // only discovers when the reminder never arrives. Put it back.
    if (error) {
      setAutomation(previous);
      setAutomationError(error.message);
    }
  }

  /**
   * Turning a reminder on is also the moment to ask for permission — iOS grants
   * exactly one prompt, and this is the point where the user has said what they
   * want it for. A denial does not block the preference from being saved; the
   * banner below states plainly that nothing will be delivered.
   */
  async function handleReminderToggle(patch: Partial<AutomationSettings>, on: boolean) {
    if (on && notifStatus === 'undetermined') {
      setNotifStatus(await requestPermission());
    }
    await saveAutomation(patch);
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete My Account',
      'This will permanently delete your account and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // invokeFunction resolves the project URL from app.json -> extra and
              // attaches the session token; a raw process.env URL is undefined in
              // release builds.
              await invokeFunction('delete-account');
              // The error IS deliberately ignored here, unlike handleSignOut
              // below — noting it so this does not get "fixed" into reporting a
              // failure that would be a lie. By this line the account is gone
              // server-side, so the local session is already dead whether or
              // not clearing it succeeded, and the only honest thing left to do
              // is leave. Surfacing "could not sign out" would tell someone
              // their deletion had not worked when it had.
              await supabase.auth.signOut();
              router.replace('/auth/login');
            } catch (err) {
              Alert.alert(
                'Could not delete account',
                err instanceof Error
                  ? `${err.message}\n\nYour account was not deleted. Please try again or contact support.`
                  : 'Your account was not deleted. Please try again or contact support.',
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          // Navigating regardless would be theatre: app/_layout.tsx routes on
          // the session, so a sign-out that failed leaves it intact and the
          // guard sends the user straight back to the tabs. They would see
          // themselves land on the dashboard still signed in, with no
          // explanation — which reads as the app refusing to let them leave.
          if (error) {
            Alert.alert(
              'Could not sign out',
              `${error.message}\n\nYou are still signed in. Please try again.`,
            );
            return;
          }
          router.replace('/auth/login');
        },
      },
    ]);
  }

  const anyReminderOn = !!automation.safe_sweep_enabled || !!automation.safe_dump_enabled;

  const tierLabels: Record<string, string> = {
    free:   'Free Plan',
    pro:    'Pro',
    medium: 'Pro (legacy plan)',
    full:   'Pro (legacy plan)',
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Touchable
          onPress={() => { router.back(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Touchable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onScrollBeginDrag={() => { userTookOver.current = true; }}
      >
        {/* Profile */}
        <SectionHeader title="Account" onLayout={anchor('account')} />
        <View style={styles.card}>
          <SettingRow icon="person-outline" label="Name" value={profile?.full_name ?? '—'} />
          <SettingRow icon="mail-outline" label="Email" value={profile?.email ?? '—'} />
          <SettingRow
            icon="star-outline"
            label="Plan"
            value={tierLabels[tier] ?? tier}
            onPress={() => { router.back(); router.push('/modals/upgrade'); }}
            actionLabel={tier === 'free' ? 'Upgrade →' : 'Manage'}
            isLast
          />
        </View>

        {/* Alerts. One section, not two — the old split put a decorative
            "Balance alerts" switch beside the real reminder preferences, and
            the decorative one was the only control a free user could see.
            These decide when the user is PROMPTED; the app never moves money,
            so there is nothing here to automate. */}
        <SectionHeader
          title="Alerts"
          subtitle={
            savingAutomation ? 'Saving…' : 'Reminders to act. You make every transfer.'
          }
          onLayout={anchor('alerts')}
        />
        {isPaidTier(tier) ? (
          <View style={styles.card}>
            {/* Delivery reality first, so the switches below are read in its
                light rather than taken as a promise. */}
            {notifStatus === 'denied' && (
              <NoticeRow
                icon="notifications-off-outline"
                label="Notifications are off for HELOC Hero"
                subtitle="iOS asks only once. Turn them on in Settings and reminders resume."
                actionLabel="Open Settings"
                onPress={() => Linking.openSettings()}
              />
            )}
            {notifStatus === 'undetermined' && anyReminderOn && (
              /* Reachable after a reinstall: the preference lives on the server
                 and survives, iOS permission does not. Without this the user
                 sees two switches set to ON that can deliver nothing. */
              <NoticeRow
                icon="notifications-outline"
                label="Allow notifications to receive these"
                subtitle="Saved, but nothing can be delivered until iOS allows it."
                actionLabel="Allow"
                onPress={async () => setNotifStatus(await requestPermission())}
              />
            )}
            {notifStatus === 'unavailable' && (
              <NoticeRow
                icon="phone-portrait-outline"
                label="Reminders need the full app"
                subtitle="Unavailable in this build. Your preferences are still saved."
              />
            )}

            <ToggleRow
              icon="repeat-outline"
              label="Sweep reminder"
              subtitle="When my surplus is ready to move"
              value={!!automation.safe_sweep_enabled}
              onChange={v => handleReminderToggle({ safe_sweep_enabled: v }, v)}
            />
            <ToggleRow
              icon="flash-outline"
              label="Dump reminder"
              subtitle="When the line is replenished enough to dump"
              value={!!automation.safe_dump_enabled}
              onChange={v => handleReminderToggle({ safe_dump_enabled: v }, v)}
            />
            {/* Not a toggle: a HELOC rate is variable and no bank reports it, so
                once terms are entered we book a monthly "still correct?" nudge
                on the same notification consent. Stated so it is not a surprise. */}
            {notifStatus === 'granted' && (
              <NoticeRow
                icon="pricetag-outline"
                label="Monthly terms check"
                subtitle="Monthly, once your HELOC terms are set."
              />
            )}
            <SettingRow
              icon="shield-outline"
              label="What to leave behind"
              value={
                `$${Number(automation.buffer_target ?? DEFAULT_AUTOMATION_SETTINGS.buffer_target)
                  .toLocaleString()} + ` +
                `$${Number(automation.upcoming_bills_estimate ?? DEFAULT_AUTOMATION_SETTINGS.upcoming_bills_estimate)
                  .toLocaleString()}`
              }
              onPress={() => router.push('/modals/alert-thresholds')}
              isLast
            />
          </View>
        ) : (
          <View style={styles.card}>
            <SettingRow
              icon="notifications-outline"
              label="Reminders come with Pro"
              value=""
              onPress={() => { router.back(); router.push('/modals/upgrade'); }}
              actionLabel="See Pro →"
              isLast
            />
          </View>
        )}
        {automationError && (
          <Text style={styles.inlineError}>Not saved: {automationError}</Text>
        )}

        {/* Appearance */}
        <SectionHeader
          title="Appearance"
          subtitle="Cash flow follows this today. The rest of the app is still light."
          onLayout={anchor('appearance')}
        />
        <View style={styles.card}>
          <View style={[styles.row, styles.rowLast, styles.appearanceRow]}>
            {APPEARANCE_OPTIONS.map(opt => {
              const active = preference === opt.value;
              return (
                <Touchable
                  haptic="selection"
                  key={opt.value}
                  style={[styles.appearancePill, active && styles.appearancePillActive]}
                  onPress={() => { setPreference(opt.value); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.a11y}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? colors.white : colors.textSecondary}
                  />
                  <Text style={[styles.appearanceText, active && styles.appearanceTextActive]}>
                    {opt.label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        {/* Support */}
        <SectionHeader title="Support" onLayout={anchor('support')} />
        <View style={styles.card}>
          <SettingRow
            icon="help-circle-outline"
            label="Help & FAQ"
            value=""
            onPress={() => { router.back(); router.push('/tabs/learn'); }}
          />
          <SettingRow
            icon="document-text-outline"
            label="Terms of Service"
            value=""
            onPress={() => Linking.openURL('https://helochero.com/terms')}
          />
          <SettingRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            value=""
            onPress={() => Linking.openURL('https://helochero.com/privacy')}
            isLast
          />
        </View>

        {/* Security & Privacy */}
        <SectionHeader title="Security & Privacy" onLayout={anchor('security')} />
        <View style={styles.card}>
          <View style={[styles.row]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.rowIcon} />
            <View style={styles.securityText}>
              <Text style={styles.rowLabel}>Encrypted in transit and at rest</Text>
              <Text style={styles.toggleSubtitle}>Powered by Supabase. Your data is never sold.</Text>
            </View>
          </View>
          {lockSupported && (
            <ToggleRow
              icon="finger-print-outline"
              label="Auto Lock"
              subtitle="Face ID or passcode after 15 min in background"
              value={autoLock}
              onChange={handleAutoLockToggle}
            />
          )}
          <SettingRow
            icon="trash-outline"
            label={deleting ? 'Deleting…' : 'Delete My Account'}
            value=""
            onPress={deleting ? undefined : handleDeleteAccount}
            isLast
          />
        </View>

        {/* Danger zone */}
        <SectionHeader title="Account Actions" />
        <View style={styles.card}>
          <Touchable
            style={[styles.row, styles.dangerRow]}
            onPress={() => { handleSignOut(); }}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={18} color={colors.gray400} style={styles.rowIcon} />
            <Text style={styles.dangerText}>Sign Out</Text>
          </Touchable>
        </View>

        {/* Debug builds only — __DEV__ is false in release, so Metro strips this. */}
        {__DEV__ && (
          <>
            <SectionHeader
              title="Developer"
              subtitle="Debug builds only — never present in the App Store build"
            />
            <View style={styles.card}>
              <SettingRow
                icon="flask-outline"
                label="Pro Override"
                value={DEV_PRO_LABELS[devPro]}
                onPress={() => setDevProMode(NEXT_DEV_PRO[devPro])}
                isLast
              />
            </View>
          </>
        )}

        <Touchable
          onLongPress={() => {
            if (!profile?.id) return;
            Alert.alert('Demo Data', 'Load or clear demo scenario?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Load Demo',
                onPress: async () => {
                  const { error } = await loadDemo(profile.id);
                  if (error) Alert.alert('Error', error);
                  else router.replace('/tabs/dashboard');
                },
              },
              {
                text: 'Clear All',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await clearDemo(profile.id);
                  if (error) Alert.alert('Error', error);
                  else router.replace('/onboarding/welcome');
                },
              },
            ]);
          }}
        >
          <Text style={styles.version}>HELOC Hero v1.0 · © 2026</Text>
        </Touchable>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * `onLayout` is how `?section=` finds its target.
 *
 * The header is measured rather than a wrapper around the header and its card,
 * because the header IS the top of a section — its offset is the one to scroll
 * to, and hanging the anchor here leaves the screen's structure untouched.
 */
function SectionHeader({ title, subtitle, onLayout }: {
  title: string;
  subtitle?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeader} onLayout={onLayout}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

/**
 * Haptics live in these three row components rather than at each call site.
 *
 * This screen had fifteen controls and two buzzes — the appearance pills — so
 * every other row on the app's densest settings surface felt inert next to
 * them. Putting it here fixes all of them at once and keeps the next row added
 * from starting out silent.
 */
function SettingRow({
  icon, label, value, onPress, actionLabel, isLast,
}: {
  icon: string; label: string; value: string;
  onPress?: () => void; actionLabel?: string; isLast?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Touchable
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label}${value ? `, ${value}` : ''}` : undefined}
    >
      <Ionicons name={icon as any} size={18} color={colors.textMuted} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {actionLabel && <Text style={styles.rowAction}>{actionLabel}</Text>}
      {onPress && !actionLabel && <Ionicons name="chevron-forward" size={16} color={colors.gray300} />}
    </Touchable>
  );
}

/**
 * A statement of fact, optionally with a way out of it. Not a control — it
 * never renders a switch, because the thing it describes is not ours to set.
 */
function NoticeRow({
  icon, label, subtitle, actionLabel, onPress,
}: {
  icon: string; label: string; subtitle: string;
  actionLabel?: string; onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Touchable
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}. ${subtitle}`}
    >
      <Ionicons name={icon as any} size={18} color={colors.textMuted} style={styles.rowIcon} />
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      {actionLabel && <Text style={styles.rowAction}>{actionLabel}</Text>}
    </Touchable>
  );
}

function ToggleRow({
  icon, label, subtitle, value, onChange, isLast,
}: {
  icon: string; label: string; subtitle: string;
  value: boolean; onChange: (v: boolean) => void; isLast?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Ionicons name={icon as any} size={18} color={colors.textMuted} style={styles.rowIcon} />
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={v => { hapticSelection(); onChange(v); }}
        trackColor={{ false: colors.gray200, true: colors.mint400 }}
        thumbColor={value ? colors.mint600 : colors.gray400}
        accessibilityLabel={label}
        accessibilityHint={subtitle}
      />
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  container: { flex: 1, backgroundColor: t.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: t.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: t.colors.textPrimary },
  content: { padding: Spacing[4], gap: Spacing[2], paddingBottom: Spacing[10] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[2],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
  },
  sectionTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: t.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionSubtitle: { fontSize: Typography.xs, color: t.colors.textMuted },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.lg,
    ...t.shadows.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.gray100,
  },
  rowLast: { borderBottomWidth: 0 },
  appearanceRow: { gap: Spacing[2] },
  appearancePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    minHeight: 44,
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  appearancePillActive: {
    backgroundColor: t.colors.mint800,
    borderColor: t.colors.mint800,
  },
  appearanceText: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textSecondary,
  },
  appearanceTextActive: { color: t.colors.white, fontWeight: Typography.semibold },
  rowIcon: { marginRight: Spacing[3] },
  rowLabel: { flex: 1, fontSize: Typography.base, color: t.colors.textPrimary },
  rowValue: { fontSize: Typography.sm, color: t.colors.textMuted, marginRight: Spacing[1] },
  rowAction: {
    fontSize: Typography.sm,
    color: t.colors.accentInk,
    fontWeight: Typography.semibold,
    marginLeft: Spacing[2],
  },
  toggleText: { flex: 1 },
  securityText: { flex: 1 },
  inlineError: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    paddingHorizontal: Spacing[2],
    paddingTop: Spacing[2],
  },
  toggleSubtitle: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: 2 },
  dangerRow: { borderBottomWidth: 0 },
  // Still grey rather than red, per the palette rule — but gray400 is a
  // decorative tint at 2.54:1, and this is the label on a destructive action.
  dangerText: {
    fontSize: Typography.base,
    color: t.colors.gray500,
    fontWeight: Typography.medium,
  },
  version: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    textAlign: 'center',
    paddingTop: Spacing[4],
  },
}));
