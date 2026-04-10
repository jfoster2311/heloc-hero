// app/tabs/accounts.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';
import type { LinkedAccount, PlaidAccount } from '../../lib/types';

const ACCOUNT_ICONS: Record<string, string> = {
  mortgage:     'home-outline',
  'home equity': 'card-outline',
  savings:      'wallet-outline',
};

const ACCOUNT_COLORS: Record<string, string> = {
  mortgage:     Colors.info,
  'home equity': Colors.warning,
  savings:      Colors.success,
};

export default function AccountsScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { accounts, loading, refreshing, refresh, hasAllAccounts } = useAccounts(profile?.id ?? null);

  const canLink = tier === 'medium' || tier === 'full';

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Linked Accounts</Text>
        {canLink && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/modals/link-account')}
          >
            <Ionicons name="add" size={20} color={Colors.mint600} />
            <Text style={styles.addBtnText}>Link Account</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.mint600} />
        }
      >
        {/* Lock prompt for free tier */}
        {!canLink && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            onPress={() => router.push('/modals/upgrade')}
          >
            <Ionicons name="lock-closed-outline" size={20} color={Colors.mint600} />
            <Text style={styles.upgradeText}>
              Upgrade to Accelerator to link your real bank accounts
            </Text>
            <Text style={styles.upgradeLink}>Upgrade →</Text>
          </TouchableOpacity>
        )}

        {/* Linked accounts */}
        {accounts.length > 0 ? (
          accounts.map(account => (
            <AccountCard key={account.id} account={account} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color={Colors.gray300} />
            <Text style={styles.emptyTitle}>No accounts linked</Text>
            <Text style={styles.emptySubtitle}>
              {canLink
                ? 'Link your mortgage, HELOC, and savings accounts to get started.'
                : 'Upgrade to link your accounts and unlock your personalized strategy.'}
            </Text>
            {canLink && (
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/modals/link-account')}
              >
                <Text style={styles.emptyBtnText}>Link Your First Account</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Account type checklist */}
        {canLink && (
          <View style={[CommonStyles.card, { marginTop: Spacing[4] }]}>
            <Text style={styles.checklistTitle}>Account Checklist</Text>
            {(['mortgage', 'home equity', 'savings'] as const).map(type => {
              const linked = accounts.some(a => a.account_type === type);
              return (
                <View key={type} style={styles.checklistRow}>
                  <Ionicons
                    name={linked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={linked ? Colors.success : Colors.gray300}
                  />
                  <Text style={[styles.checklistLabel, linked && styles.checklistLabelDone]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                  {!linked && (
                    <TouchableOpacity onPress={() => router.push('/modals/link-account')}>
                      <Text style={styles.checklistLink}>Link →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountCard({ account }: { account: LinkedAccount }) {
  const color = ACCOUNT_COLORS[account.account_type] ?? Colors.gray400;
  const icon = ACCOUNT_ICONS[account.account_type] ?? 'card-outline';
  const lastUpdated = account.accounts_updated_at
    ? new Date(account.accounts_updated_at).toLocaleDateString()
    : 'Never';

  return (
    <View style={[styles.accountCard, Shadows.card]}>
      <View style={styles.accountHeader}>
        <View style={[styles.accountIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.accountMeta}>
          <Text style={styles.accountType}>
            {account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1)}
          </Text>
          {account.institution_name && (
            <Text style={styles.institutionName}>{account.institution_name}</Text>
          )}
        </View>
        <View style={styles.connectedBadge}>
          <Text style={styles.connectedText}>Connected</Text>
        </View>
      </View>

      {account.accounts.map((acct: PlaidAccount) => (
        <View key={acct.account_id} style={styles.subAccount}>
          <View>
            <Text style={styles.subAccountName}>{acct.name}</Text>
            <Text style={styles.subAccountType}>{acct.subtype}</Text>
          </View>
          <View style={styles.balanceCol}>
            <Text style={styles.balanceCurrent}>
              ${acct.balances.current.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </Text>
            {acct.balances.available !== null && acct.balances.available !== acct.balances.current && (
              <Text style={styles.balanceAvail}>
                ${acct.balances.available.toLocaleString('en-US', { maximumFractionDigits: 0 })} avail.
              </Text>
            )}
          </View>
        </View>
      ))}

      <Text style={styles.lastUpdated}>Updated {lastUpdated}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.mint50,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  addBtnText: { color: Colors.mint600, fontSize: Typography.sm, fontWeight: Typography.semibold },
  content: { padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[10] },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  upgradeText: { flex: 1, fontSize: Typography.sm, color: Colors.mint700, lineHeight: 18 },
  upgradeLink: { color: Colors.mint600, fontWeight: Typography.semibold, fontSize: Typography.sm },
  emptyState: { alignItems: 'center', paddingVertical: Spacing[12], gap: Spacing[3] },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary },
  emptySubtitle: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyBtn: {
    marginTop: Spacing[2],
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  emptyBtnText: { color: Colors.white, fontWeight: Typography.semibold, fontSize: Typography.sm },
  accountCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  accountHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountMeta: { flex: 1 },
  accountType: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  institutionName: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  connectedBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  connectedText: { fontSize: Typography.xs, color: Colors.success, fontWeight: Typography.medium },
  subAccount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[1],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  subAccountName: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  subAccountType: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  balanceCol: { alignItems: 'flex-end' },
  balanceCurrent: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  balanceAvail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  lastUpdated: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'right' },
  checklistTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[3],
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  checklistLabel: { flex: 1, fontSize: Typography.base, color: Colors.textSecondary },
  checklistLabelDone: { color: Colors.textPrimary, textDecorationLine: 'line-through' },
  checklistLink: { color: Colors.mint600, fontSize: Typography.sm, fontWeight: Typography.medium },
});
