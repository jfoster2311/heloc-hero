// app/modals/settings.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
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
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
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

export default function SettingsModal() {
  const router = useRouter();
  const { profile, tier } = useAuth();
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
          await supabase.auth.signOut();
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile */}
        <SectionHeader title="Account" />
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
                subtitle="Your preferences are saved, but nothing can be delivered until iOS allows it."
                actionLabel="Allow"
                onPress={async () => setNotifStatus(await requestPermission())}
              />
            )}
            {notifStatus === 'unavailable' && (
              <NoticeRow
                icon="phone-portrait-outline"
                label="Reminders need the full app"
                subtitle="Notification scheduling is unavailable in this build. Your preferences are still saved."
              />
            )}

            <ToggleRow
              icon="repeat-outline"
              label="Sweep reminder"
              subtitle="Tell me when my surplus is ready to move to the HELOC"
              value={!!automation.safe_sweep_enabled}
              onChange={v => handleReminderToggle({ safe_sweep_enabled: v }, v)}
            />
            <ToggleRow
              icon="flash-outline"
              label="Dump reminder"
              subtitle="Tell me when the HELOC is replenished enough to dump"
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
                subtitle="Once your HELOC terms are set, we remind you monthly to confirm the rate is still current."
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

        {/* Support */}
        <SectionHeader title="Support" />
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
        <SectionHeader title="Security & Privacy" />
        <View style={styles.card}>
          <View style={[styles.row]}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.rowIcon} />
            <View style={styles.securityText}>
              <Text style={styles.rowLabel}>Encrypted in transit and at rest</Text>
              <Text style={styles.toggleSubtitle}>Powered by Supabase. Your data is never sold.</Text>
            </View>
          </View>
          {lockSupported && (
            <ToggleRow
              icon="finger-print-outline"
              label="Auto Lock"
              subtitle="Require Face ID or passcode after 15 min in background"
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
          <TouchableOpacity style={[styles.row, styles.dangerRow]} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color={Colors.gray400} style={styles.rowIcon} />
            <Text style={styles.dangerText}>Sign Out</Text>
          </TouchableOpacity>
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

        <TouchableOpacity
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
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function SettingRow({
  icon, label, value, onPress, actionLabel, isLast,
}: {
  icon: string; label: string; value: string;
  onPress?: () => void; actionLabel?: string; isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <Ionicons name={icon as any} size={18} color={Colors.textMuted} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {actionLabel && <Text style={styles.rowAction}>{actionLabel}</Text>}
      {onPress && !actionLabel && <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />}
    </TouchableOpacity>
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
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}. ${subtitle}`}
    >
      <Ionicons name={icon as any} size={18} color={Colors.textMuted} style={styles.rowIcon} />
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      {actionLabel && <Text style={styles.rowAction}>{actionLabel}</Text>}
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon, label, subtitle, value, onChange, isLast,
}: {
  icon: string; label: string; subtitle: string;
  value: boolean; onChange: (v: boolean) => void; isLast?: boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Ionicons name={icon as any} size={18} color={Colors.textMuted} style={styles.rowIcon} />
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.gray200, true: Colors.mint400 }}
        thumbColor={value ? Colors.mint600 : Colors.gray400}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
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
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionSubtitle: { fontSize: Typography.xs, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    ...Shadows.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { marginRight: Spacing[3] },
  rowLabel: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  rowValue: { fontSize: Typography.sm, color: Colors.textMuted, marginRight: Spacing[1] },
  rowAction: {
    fontSize: Typography.sm,
    color: Colors.mint600,
    fontWeight: Typography.semibold,
    marginLeft: Spacing[2],
  },
  toggleText: { flex: 1 },
  securityText: { flex: 1 },
  inlineError: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing[2],
    paddingTop: Spacing[2],
  },
  toggleSubtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  dangerRow: { borderBottomWidth: 0 },
  dangerText: {
    fontSize: Typography.base,
    color: Colors.gray400,
    fontWeight: Typography.medium,
  },
  version: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingTop: Spacing[4],
  },
});
