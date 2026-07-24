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
import { useIsPro } from '../../hooks/useIsPro';
import { invokeFunction } from '../../lib/supabase';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';
import type { PlaidAccountType } from '../../lib/types';

// react-native-plaid-link-sdk is a NATIVE module: it exists in dev and prod
// builds and not in Expo Go. It used to be a static top-level import, which is
// the one form that cannot be recovered from — the failure happens while the
// module graph is being built, so the screen cannot render a message about it,
// and depending on the bundler it takes its importers down too. Every other
// native dependency here (purchases, notify, appLock, haptics) is loaded
// through a guarded require for exactly this reason; this one had been missed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlaidLink = { create: (o: any) => void; open: (o: any) => void } | null;

let plaidModule: PlaidLink = null;
let plaidLoaded = false;

function loadPlaid(): PlaidLink {
  if (plaidLoaded) return plaidModule;
  plaidLoaded = true;
  try {
    // Checked both ways: interop can put named exports on the namespace or
    // behind .default depending on how the package ships. Verifying `create` is
    // actually callable is what makes this a real guard rather than a
    // try/catch that hands back an object with no methods on it.
    const mod = require('react-native-plaid-link-sdk');
    const candidate = typeof mod?.create === 'function' ? mod : mod?.default;
    plaidModule =
      typeof candidate?.create === 'function' && typeof candidate?.open === 'function'
        ? candidate
        : null;
  } catch {
    plaidModule = null;
  }
  return plaidModule;
}

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

/**
 * A sentence the user can act on, with the raw detail kept only when it is not
 * already meaningless to them.
 *
 * Every failure here used to surface `err.message` directly, so a dropped
 * connection during the token exchange read as a fetch error — on the screen
 * where someone has just handed over their bank credentials and most wants to
 * know whether it worked.
 */
function describeLinkError(err: unknown, lead: string): string {
  const raw = err instanceof Error ? err.message : '';
  const offline = /network|fetch|timeout|connection/i.test(raw);
  if (offline) {
    return `${lead} Check your internet connection and try again — nothing was changed.`;
  }
  return `${lead} Please try again in a moment.`;
}

export default function LinkAccountModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPro, loading: proLoading } = useIsPro();
  const [selectedType, setSelectedType] = useState<PlaidAccountType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLink() {
    if (!selectedType || !user) return;

    const plaid = loadPlaid();
    if (!plaid) {
      setError(
        'Bank linking needs the full app. This build does not include the Plaid ' +
        'component — everything else still works from figures you enter.',
      );
      hapticError();
      return;
    }

    hapticLight();
    setLoading(true);
    setError('');

    try {
      const { link_token } = await invokeFunction<{ link_token: string }>(
        'plaid-create-link-token',
        { userId: user.id },
      );

      plaid.create({ token: link_token });
      plaid.open({
        onSuccess: async (success: { publicToken: string }) => {
          try {
            await invokeFunction('plaid-exchange-token', {
              publicToken: success.publicToken,
              accountType: selectedType,
              userId: user.id,
            });
            hapticSuccess();
            router.back();
          } catch (err) {
            // The Item exists at Plaid but we failed to store it, which is the
            // one outcome the user cannot see and must not be left guessing at.
            setError(describeLinkError(err, 'We connected to your bank but could not finish saving it.'));
            setLoading(false);
            hapticError();
          }
        },
        onExit: (exit: { error?: { displayMessage?: string } | null }) => {
          // No error means they simply backed out. Saying nothing is correct;
          // an error banner for a deliberate cancel is noise.
          if (exit.error) {
            setError(exit.error.displayMessage ?? 'Your bank ended the session. You can try again.');
            hapticError();
          }
          setLoading(false);
        },
      });
    } catch (err) {
      setError(describeLinkError(err, 'We could not start the secure bank connection.'));
      setLoading(false);
      hapticError();
    }
  }

  async function handleSandboxLink() {
    if (!selectedType || !user) return;
    setLoading(true);
    setError('');
    try {
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
    } catch (err) {
      // Dev-only path, so the raw message is the useful one here.
      setError(err instanceof Error ? err.message : 'Failed to connect account');
    } finally {
      setLoading(false);
    }
  }

  if (!proLoading && !isPro) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Link an Account</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.gateContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.mint400} />
          <Text style={styles.gateTitle}>Pro Feature</Text>
          <Text style={styles.gateBody}>
            Link bank accounts with Plaid and see live balances with a Pro subscription.
          </Text>
          <TouchableOpacity
            style={styles.gateBtn}
            onPress={() => { router.back(); router.push('/modals/upgrade'); }}
          >
            <Text style={styles.gateBtnText}>View Pro Plans</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
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
          <Ionicons name="shield-checkmark-outline" size={16} color={Colors.mint600} />
          <Text style={styles.securityText}>
            256-bit encryption. We never store your bank credentials. Read-only access.
          </Text>
        </View>

        {/* Sandbox quick-link for dev testing */}
        {__DEV__ && (
          <TouchableOpacity
            style={[
              styles.sandboxBtn,
              (!selectedType || loading) && styles.connectBtnDisabled,
            ]}
            onPress={handleSandboxLink}
            disabled={!selectedType || loading}
          >
            <Ionicons name="flask-outline" size={16} color={Colors.mint600} />
            <Text style={styles.sandboxBtnText}>Sandbox Quick-Link (dev only)</Text>
          </TouchableOpacity>
        )}
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
  container: { flex: 1, backgroundColor: Colors.background },
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
  gateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[8],
    gap: Spacing[4],
  },
  gateTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  gateBody: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  gateBtn: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[8],
    marginTop: Spacing[2],
  },
  gateBtnText: { color: Colors.white, fontWeight: Typography.semibold, fontSize: Typography.base },
  content: { padding: Spacing[5], gap: Spacing[4] },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  errorBanner: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: Colors.gray400,
  },
  errorText: { color: Colors.gray400, fontSize: Typography.sm },
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
    backgroundColor: Colors.mint50,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  securityText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.mint700,
    lineHeight: 18,
  },
  sandboxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.mint200,
    backgroundColor: Colors.mint50,
  },
  sandboxBtnText: { color: Colors.mint600, fontSize: Typography.sm, fontWeight: Typography.medium },
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
