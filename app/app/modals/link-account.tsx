// app/modals/link-account.tsx
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { invokeFunction } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
import type { PlaidAccountType } from '../../lib/types';

// NOTE: Install react-native-plaid-link-sdk and follow their Expo setup guide:
// https://github.com/plaid/react-native-plaid-link-sdk
// import { open, LinkSuccess, LinkExit } from 'react-native-plaid-link-sdk';

const ACCOUNT_TYPES: { type: PlaidAccountType; label: string; desc: string; icon: string }[] = [
  {
    type: 'mortgage',
    label: 'Mortgage',
    desc: 'Connect your primary mortgage to track balance reduction',
    icon: 'home-outline',
  },
  {
    type: 'home equity',
    label: 'HELOC',
    desc: 'Connect your Home Equity Line of Credit — the core of the strategy',
    icon: 'card-outline',
  },
  {
    type: 'savings',
    label: 'Savings / Checking',
    desc: 'Connect the account where you receive your paycheck',
    icon: 'wallet-outline',
  },
];

export default function LinkAccountModal() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<PlaidAccountType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLink() {
    if (!selectedType || !user) return;
    setLoading(true);
    setError('');

    try {
      // 1. Create a Plaid link token
      const { link_token } = await invokeFunction<{ link_token: string }>(
        'plaid-create-link-token',
        { userId: user.id },
      );

      // 2. Open Plaid Link SDK
      // open({
      //   tokenConfig: { token: link_token },
      //   onSuccess: async (success: LinkSuccess) => {
      //     // 3. Exchange the public token
      //     await invokeFunction('plaid-exchange-token', {
      //       publicToken: success.publicToken,
      //       accountType: selectedType,
      //       userId: user.id,
      //     });
      //     router.back();
      //   },
      //   onExit: (exit: LinkExit) => {
      //     if (exit.error) setError(exit.error.displayMessage ?? 'Something went wrong');
      //     setLoading(false);
      //   },
      // });

      // ── SANDBOX SIMULATION (remove when Plaid SDK is wired up) ──────────────
      const sandboxResult = await invokeFunction<{ public_token: string }>(
        'plaid-sandbox',
        { action: 'createPublicToken' },
      );

      await invokeFunction('plaid-exchange-token', {
        publicToken: sandboxResult.public_token,
        accountType: selectedType,
        userId: user.id,
      });

      router.back();
      // ────────────────────────────────────────────────────────────────────────

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Link an Account</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Choose which type of account you're connecting. Powered by Plaid — bank-level security.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Account type selection */}
        <View style={styles.typeList}>
          {ACCOUNT_TYPES.map(item => (
            <TouchableOpacity
              key={item.type}
              style={[
                styles.typeItem,
                selectedType === item.type && styles.typeItemSelected,
              ]}
              onPress={() => setSelectedType(item.type)}
            >
              <View style={[
                styles.typeIcon,
                selectedType === item.type && styles.typeIconSelected,
              ]}>
                <Ionicons
                  name={item.icon as any}
                  size={22}
                  color={selectedType === item.type ? Colors.white : Colors.mint600}
                />
              </View>
              <View style={styles.typeText}>
                <Text style={styles.typeLabel}>{item.label}</Text>
                <Text style={styles.typeDesc}>{item.desc}</Text>
              </View>
              {selectedType === item.type && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.mint600} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={Colors.success} />
          <Text style={styles.securityText}>
            256-bit encryption. We never store your bank credentials. Read-only access.
          </Text>
        </View>
      </ScrollView>

      {/* Connect button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.connectBtn,
            (!selectedType || loading) && styles.connectBtnDisabled,
          ]}
          onPress={handleLink}
          disabled={!selectedType || loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="link-outline" size={18} color={Colors.white} />
              <Text style={styles.connectBtnText}>Connect with Plaid</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  closeBtn: { padding: Spacing[1] },
  content: { padding: Spacing[5], gap: Spacing[4] },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: { color: Colors.error, fontSize: Typography.sm },
  typeList: { gap: Spacing[3] },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
  },
  typeItemSelected: {
    borderColor: Colors.mint600,
    backgroundColor: Colors.mint50,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typeIconSelected: { backgroundColor: Colors.mint600 },
  typeText: { flex: 1 },
  typeLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  typeDesc: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
  securityNote: {
    flexDirection: 'row',
    gap: Spacing[2],
    alignItems: 'flex-start',
    backgroundColor: '#f0fdf4',
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  securityText: {
    flex: 1,
    fontSize: Typography.xs,
    color: '#166534',
    lineHeight: 18,
  },
  footer: {
    padding: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  connectBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    ...Shadows.glow,
  },
  connectBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  connectBtnText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.semibold },
});
