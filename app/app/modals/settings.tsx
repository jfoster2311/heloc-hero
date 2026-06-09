// app/modals/settings.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../lib/automation';
import {
  isLockEnabled, setLockEnabled, deviceSupportsLock, lockModuleAvailable,
} from '../../lib/appLock';
import { loadDemo, clearDemo } from '../../lib/seedDemo';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
import type { AutomationSettings } from '../../lib/types';

export default function SettingsModal() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const [automation, setAutomation] = useState<Partial<AutomationSettings>>(
    DEFAULT_AUTOMATION_SETTINGS,
  );
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoLock, setAutoLock] = useState(false);
  const [lockSupported, setLockSupported] = useState(false);

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

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('automation_settings')
      .select('*')
      .eq('user_id', profile.id)
      .single()
      .then(({ data }) => { if (data) setAutomation(data); });
  }, [profile?.id]);

  async function saveAutomation(patch: Partial<AutomationSettings>) {
    if (!profile?.id) return;
    const updated = { ...automation, ...patch };
    setAutomation(updated);
    setSavingAutomation(true);
    await supabase.from('automation_settings').upsert({
      user_id: profile.id,
      ...updated,
    });
    setSavingAutomation(false);
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
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) return;
              const res = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                },
              );
              if (!res.ok) throw new Error('Failed to delete account');
              await supabase.auth.signOut();
              router.replace('/auth/login');
            } catch {
              Alert.alert('Error', 'Could not delete account. Please contact support.');
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

  const tierLabels: Record<string, string> = {
    free:   'Free Plan',
    medium: 'Accelerator ($14.99/mo)',
    full:   'Autopilot ($50/mo)',
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

        {/* Automation — Full tier only */}
        {tier === 'full' && (
          <>
            <SectionHeader title="Automation" subtitle={savingAutomation ? 'Saving…' : undefined} />
            <View style={styles.card}>
              <ToggleRow
                icon="repeat-outline"
                label="Safe Sweep™"
                subtitle="Auto-move surplus to your HELOC"
                value={!!automation.safe_sweep_enabled}
                onChange={v => saveAutomation({ safe_sweep_enabled: v })}
              />
              <ToggleRow
                icon="flash-outline"
                label="Safe Dump™"
                subtitle="Auto-dump HELOC balance to mortgage"
                value={!!automation.safe_dump_enabled}
                onChange={v => saveAutomation({ safe_dump_enabled: v })}
              />
              <SettingRow
                icon="shield-outline"
                label="Cash Buffer"
                value={`$${(automation.buffer_target ?? 2000).toLocaleString()}`}
              />
              <SettingRow
                icon="calendar-outline"
                label="Upcoming Bills"
                value={`$${(automation.upcoming_bills_estimate ?? 500).toLocaleString()}`}
                isLast
              />
            </View>
          </>
        )}

        {/* Notifications */}
        <SectionHeader title="Notifications" />
        <View style={styles.card}>
          <ToggleRow
            icon="notifications-outline"
            label="Balance Alerts"
            subtitle="HELOC/savings threshold crossing notifications"
            value={notificationsEnabled}
            onChange={setNotificationsEnabled}
            isLast
          />
        </View>

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
            onPress={() => Linking.openURL('https://helochair.com/terms')}
          />
          <SettingRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            value=""
            onPress={() => Linking.openURL('https://helochair.com/privacy')}
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
            label="Delete My Account"
            value=""
            onPress={handleDeleteAccount}
            isLast
          />
        </View>

        {/* Danger zone */}
        <SectionHeader title="Account Actions" />
        <View style={styles.card}>
          <TouchableOpacity style={[styles.row, styles.dangerRow]} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color={Colors.error} style={styles.rowIcon} />
            <Text style={styles.dangerText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

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
  toggleSubtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  dangerRow: { borderBottomWidth: 0 },
  dangerText: {
    fontSize: Typography.base,
    color: Colors.error,
    fontWeight: Typography.medium,
  },
  version: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingTop: Spacing[4],
  },
});
