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
  mortgage:      'home-outline',
  'home equity': 'card-outline',
  savings:       'wallet-outline',
};

const ACCOUNT_COLORS: Record<string, string> = {
  mortgage:      Colors.info,
  'home equity': Colors.warning,
  savings:       Colors.success,
};

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never synced';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AccountsScreen() {
  const router = useRouter();
  const { profile, tier } = useAuth();
  const { accounts, loading, refreshing, refresh } = useAccounts(profile?.id ?? null);

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
            <Ionicons name="add" size={18} color={Colors.mint600} />
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
        {/* Upgrade prompt for free tier */}
        {!canLink && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            onPress={() => router.push('/modals/upgrade')}
          >
            <View style={styles.upgradeBannerIcon}>
              <Ionicons name="lock-closed" size={18} color={Colors.mint600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeBannerTitle}>Connect Your Accounts</Text>
              <Text style={styles.upgradeBannerSub}>
                Upgrade to Accelerator to link your mortgage, HELOC & savings
              </Text>
            </View>
            <View style={styles.upgradePill}>
              <Text style={styles.upgradePillText}>Upgrade</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Linked accounts */}
        {accounts.length > 0 ? (
          accounts.map(account => (
            <AccountCard key={account.id} account={account} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconRing}>
              <Ionicons name="wallet-outline" size={32} color={Colors.mint600} />
            </View>
            <Text style={styles.emptyTitle}>No accounts linked yet</Text>
            <Text style={styles.emptySubtitle}>
              {canLink
                ? 'Connect your mortgage, HELOC, and savings to unlock your live payoff strategy.'
                : 'Upgrade your plan to connect real bank accounts and see your actual numbers.'}
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push(canLink ? '/modals/link-account' : '/modals/upgrade')}
            >
              <Ionicons name={canLink ? 'link-outline' : 'star-outline'} size={16} color={Colors.white} />
              <Text style={styles.emptyBtnText}>
                {canLink ? 'Link Your First Account' : 'View Plans'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Account checklist */}
        {canLink && (
          <View style={[CommonStyles.card, { gap: 0 }]}>
            <Text style={styles.checklistTitle}>Account Checklist</Text>
            {(['mortgage', 'home equity', 'savings'] as const).map((type, idx) => {
              const linked = accounts.some(a => a.account_type === type);
              const isLast = idx === 2;
              return (
                <View key={type} style={[styles.checklistRow, isLast && styles.checklistRowLast]}>
                  <View style={[styles.checklistDot, linked && styles.checklistDotDone]}>
                    <Ionicons
                      name={linked ? 'checkmark' : 'add'}
                      size={12}
                      color={linked ? Colors.white : Colors.gray400}
                    />
                  </View>
                  <Text style={[styles.checklistLabel, linked && styles.checklistLabelDone]}>
                    {type === 'home equity' ? 'HELOC' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                  {linked ? (
                    <Text style={styles.checklistLinked}>Connected</Text>
                  ) : (
                    <TouchableOpacity onPress={() => router.push('/modals/link-account')} style={styles.checklistLinkBtn}>
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
  const icon  = ACCOUNT_ICONS[account.account_type]  ?? 'card-outline';

  return (
    <View style={[styles.accountCard, Shadows.card]}>
      <View style={styles.accountHeader}>
        <View style={[styles.accountIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.accountMeta}>
          <Text style={styles.accountType}>
            {account.account_type === 'home equity'
              ? 'HELOC'
              : account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1)}
          </Text>
          {account.institution_name && (
            <Text style={styles.institutionName}>{account.institution_name}</Text>
          )}
        </View>
        <View style={styles.syncBadge}>
          <View style={[styles.syncDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.syncText}>{relativeTime(account.accounts_updated_at)}</Text>
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
            {acct.balances.available !== null &&
             acct.balances.available !== acct.balances.current && (
              <Text style={styles.balanceAvail}>
                ${acct.balances.available.toLocaleString('en-US', { maximumFractionDigits: 0 })} avail.
              </Text>
            )}
          </View>
        </View>
      ))}
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
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
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

  // Upgrade banner
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1.5,
    borderColor: Colors.mint200,
    ...Shadows.card,
  },
  upgradeBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBannerTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  upgradeBannerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  upgradePill: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1] + 2,
  },
  upgradePillText: { color: Colors.white, fontSize: Typography.xs, fontWeight: Typography.semibold },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: Spacing[12], gap: Spacing[3] },
  emptyIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.mint50,
    borderWidth: 2,
    borderColor: Colors.mint200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    ...Shadows.glow,
  },
  emptyBtnText: { color: Colors.white, fontWeight: Typography.semibold, fontSize: Typography.sm },

  // Account card
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
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: Typography.xs, color: Colors.textMuted },
  subAccount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[1],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  subAccountName: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  subAccountType: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  balanceCol: { alignItems: 'flex-end' },
  balanceCurrent: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  balanceAvail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

  // Checklist
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
  checklistRowLast: { borderBottomWidth: 0 },
  checklistDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checklistDotDone: {
    backgroundColor: Colors.mint600,
    borderColor: Colors.mint600,
  },
  checklistLabel: { flex: 1, fontSize: Typography.base, color: Colors.textSecondary },
  checklistLabelDone: { color: Colors.textPrimary, fontWeight: Typography.medium },
  checklistLinked: { fontSize: Typography.xs, color: Colors.success, fontWeight: Typography.medium },
  checklistLinkBtn: { paddingVertical: 2 },
  checklistLink: { color: Colors.mint600, fontSize: Typography.sm, fontWeight: Typography.medium },
});
