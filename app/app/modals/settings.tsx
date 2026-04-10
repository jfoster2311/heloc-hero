// app/modals/settings.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../lib/automation';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
import type { AutomationSettings } from '../../lib/types';

export default function SettingsModal() {
  const router = useRouter();
  const { profile, tier, updateProfile } = useAuth();
  const [automation, setAutomation] = useState<Partial<AutomationSettings>>(
    DEFAULT_AUTOMATION_SETTINGS,
  );
  const [savingAutomation, setSavingAutomation] = useState(false);

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
    free: 'Free',
    medium: 'Accelerator ($14.99/mo)',
    full: 'Autopilot ($50/mo)',
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile section */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <SettingRow
            icon="person-outline"
            label="Name"
            value={profile?.full_name ?? '—'}
          />
          <SettingRow
            icon="mail-outline"
            label="Email"
            value={profile?.email ?? '—'}
          />
          <SettingRow
            icon="star-outline"
            label="Plan"
            value={tierLabels[tier] ?? tier}
            onPress={() => { router.back(); router.push('/modals/upgrade'); }}
            actionLabel={tier === 'free' ? 'Upgrade' : 'Manage'}
          />
        </View>

        {/* Automation section — Full tier only */}
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
                value={`$${automation.buffer_target?.toLocaleString() ?? 2000}`}
              />
              <SettingRow
                icon="calendar-outline"
                label="Upcoming Bills"
                value={`$${automation.upcoming_bills_estimate?.toLocaleString() ?? 500}`}
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
            subtitle="Get notified when thresholds are crossed"
            value={true}
            onChange={() => {}}
          />
        </View>

        {/* Danger zone */}
        <SectionHeader title="Account Actions" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.dangerRow} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color={Colors.error} />
            <Text style={styles.dangerText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
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
  icon, label, value, onPress, actionLabel,
}: {
  icon: string; label: string; value: string;
  onPress?: () => void; actionLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
    >
      <Ionicons name={icon as any} size={18} color={Colors.textMuted} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      {actionLabel && (
        <Text style={styles.rowAction}>{actionLabel}</Text>
      )}
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon, label, subtitle, value, onChange,
}: {
  icon: string; label: string; subtitle: string;
  value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
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
    paddingTop: Spacing[3],
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
  rowIcon: { marginRight: Spacing[3] },
  rowLabel: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  rowValue: { fontSize: Typography.sm, color: Colors.textMuted },
  rowAction: {
    fontSize: Typography.sm,
    color: Colors.mint600,
    fontWeight: Typography.semibold,
    marginLeft: Spacing[2],
  },
  toggleText: { flex: 1 },
  toggleSubtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
  },
  dangerText: {
    fontSize: Typography.base,
    color: Colors.error,
    fontWeight: Typography.medium,
  },
});
