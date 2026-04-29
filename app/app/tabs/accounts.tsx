// app/tabs/accounts.tsx
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useAppStore,
  LinkedPlaidAccount,
  AccountRole,
} from '../../../lib/appStore';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../../lib/theme';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never synced';
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'Synced just now';
  if (diffMin < 60) return `Synced ${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Synced ${diffH}h ago`;
  return `Synced ${d.toLocaleDateString()}`;
}

function isLiability(account: LinkedPlaidAccount, role: AccountRole | undefined): boolean {
  if (role === 'mortgage' || role === 'heloc') return true;
  if (role === 'checking' || role === 'savings') return false;
  return account.type === 'loan' || account.type === 'line of credit';
}

const ROLE_META: Record<AccountRole, { label: string; color: string; icon: string }> = {
  mortgage:  { label: 'Mortgage',  color: Colors.info,    icon: 'home-outline' },
  heloc:     { label: 'HELOC',     color: Colors.warning, icon: 'card-outline' },
  checking:  { label: 'Checking',  color: Colors.mint600, icon: 'cash-outline' },
  savings:   { label: 'Savings',   color: Colors.success, icon: 'wallet-outline' },
};

const ROLE_OPTIONS: AccountRole[] = ['mortgage', 'heloc', 'checking', 'savings'];

// ── sandbox mock accounts (replace with real Plaid SDK response) ──────────────
const SANDBOX_ACCOUNTS: LinkedPlaidAccount[] = [
  {
    id: 'acct_chk_001',
    name: 'Total Checking',
    institutionName: 'Chase',
    mask: '4521',
    type: 'depository',
    subtype: 'checking',
    balance: 8420,
    available: 8380,
    limit: null,
  },
  {
    id: 'acct_sav_001',
    name: 'Savings',
    institutionName: 'Chase',
    mask: '9847',
    type: 'depository',
    subtype: 'savings',
    balance: 12000,
    available: 12000,
    limit: null,
  },
  {
    id: 'acct_mtg_001',
    name: 'Home Mortgage',
    institutionName: 'First National Bank',
    mask: '1234',
    type: 'loan',
    subtype: 'mortgage',
    balance: 342000,
    available: null,
    limit: null,
  },
  {
    id: 'acct_heloc_001',
    name: 'Home Equity Line',
    institutionName: 'Third Federal',
    mask: '8823',
    type: 'line of credit',
    subtype: 'home_equity',
    balance: 47200,
    available: 32800,
    limit: 80000,
  },
];

// ── screen ────────────────────────────────────────────────────────────────────

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const {
    plaidAccounts,
    plaidLinked,
    accountLabels,
    lastPlaidSync,
    setPlaidAccounts,
    setAccountLabel,
    removeAccount,
    setLastPlaidSync,
  } = useAppStore();

  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [rolePickerId, setRolePickerId] = useState<string | null>(null);

  // ── net worth ─────────────────────────────────────────────────────────────
  let assets = 0;
  let liabilities = 0;
  for (const acct of plaidAccounts) {
    const role = accountLabels[acct.id] as AccountRole | undefined;
    if (isLiability(acct, role)) {
      liabilities += acct.balance;
    } else {
      assets += acct.balance;
    }
  }
  const netWorth = assets - liabilities;
  const netWorthPositive = netWorth >= 0;

  // ── plaid link ────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    setLinking(true);
    setLinkError('');

    try {
      // ── SANDBOX SIMULATION ───────────────────────────────────────────────
      // In production, replace this block with:
      //   const { link_token } = await invokeFunction('plaid-create-link-token', { userId });
      //   open({ tokenConfig: { token: link_token }, onSuccess: async (s) => {
      //     await invokeFunction('plaid-exchange-token', { publicToken: s.publicToken, userId });
      //     const accounts = <parse from edge function response>;
      //     setPlaidAccounts(accounts);
      //     setLastPlaidSync(new Date().toISOString());
      //   }, onExit: (e) => setLinkError(e.error?.displayMessage ?? '') });
      await new Promise<void>((res) => setTimeout(res, 1400));
      setPlaidAccounts(SANDBOX_ACCOUNTS);
      setLastPlaidSync(new Date().toISOString());
      // ─────────────────────────────────────────────────────────────────────

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setLinking(false);
    }
  }, [setPlaidAccounts, setLastPlaidSync]);

  const handleRefresh = useCallback(async () => {
    setLinking(true);
    // In production: re-fetch balances from Plaid via edge function
    await new Promise<void>((res) => setTimeout(res, 900));
    setLastPlaidSync(new Date().toISOString());
    setLinking(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setLastPlaidSync]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Accounts</Text>
            <Text style={styles.headerSubtitle}>{formatSyncTime(lastPlaidSync)}</Text>
          </View>
          {plaidLinked && (
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={handleRefresh}
              disabled={linking}
            >
              {linking ? (
                <ActivityIndicator size="small" color={Colors.mint600} />
              ) : (
                <Ionicons name="refresh-outline" size={20} color={Colors.mint600} />
              )}
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 88 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Net worth hero */}
          {plaidLinked && (
            <View style={[styles.netWorthCard, Shadows.card]}>
              <View style={styles.netWorthHeader}>
                <View style={styles.netWorthIconWrap}>
                  <Ionicons name="trending-up-outline" size={18} color={Colors.mint600} />
                </View>
                <Text style={styles.netWorthLabel}>Net Worth Snapshot</Text>
              </View>

              <Text style={[styles.netWorthAmount, { color: netWorthPositive ? Colors.mint700 : Colors.error }]}>
                {netWorthPositive ? '' : '–'}{formatCurrency(netWorth)}
              </Text>

              <View style={styles.netWorthRow}>
                <View style={styles.netWorthMetaItem}>
                  <View style={[styles.metaDot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.netWorthMetaLabel}>Assets</Text>
                  <Text style={styles.netWorthMetaValue}>{formatCurrency(assets)}</Text>
                </View>
                <View style={styles.netWorthDivider} />
                <View style={styles.netWorthMetaItem}>
                  <View style={[styles.metaDot, { backgroundColor: Colors.error }]} />
                  <Text style={styles.netWorthMetaLabel}>Liabilities</Text>
                  <Text style={styles.netWorthMetaValue}>{formatCurrency(liabilities)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Error banner */}
          {!!linkError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{linkError}</Text>
            </View>
          )}

          {/* Empty state */}
          {!plaidLinked && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="wallet-outline" size={36} color={Colors.mint600} />
              </View>
              <Text style={styles.emptyTitle}>No accounts connected</Text>
              <Text style={styles.emptySubtitle}>
                Link your mortgage, HELOC, and checking accounts to unlock your personalized payoff strategy.
              </Text>
              <TouchableOpacity
                style={[styles.connectBtn, linking && styles.connectBtnDisabled]}
                onPress={handleConnect}
                disabled={linking}
                activeOpacity={0.85}
              >
                {linking ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="link-outline" size={18} color={Colors.white} />
                    <Text style={styles.connectBtnText}>Connect with Plaid</Text>
                  </>
                )}
              </TouchableOpacity>
              <View style={styles.securityNote}>
                <Ionicons name="shield-checkmark-outline" size={14} color={Colors.success} />
                <Text style={styles.securityText}>
                  256-bit encryption · read-only · we never store credentials
                </Text>
              </View>
            </View>
          )}

          {/* Account cards */}
          {plaidAccounts.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>
                {plaidAccounts.length} account{plaidAccounts.length !== 1 ? 's' : ''} linked
              </Text>
              {plaidAccounts.map((acct) => (
                <AccountCard
                  key={acct.id}
                  account={acct}
                  role={accountLabels[acct.id] as AccountRole | undefined}
                  onSetRole={() => setRolePickerId(acct.id)}
                  onDisconnect={removeAccount}
                />
              ))}
            </>
          )}
        </ScrollView>

        {/* Pinned bottom bar — always show connect/add button when linked */}
        {plaidLinked && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing[3] }]}>
            <View style={styles.bottomMeta}>
              <Text style={styles.bottomMetaLabel}>Accounts</Text>
              <Text style={styles.bottomMetaValue}>{plaidAccounts.length} linked</Text>
            </View>
            <TouchableOpacity
              style={[styles.addBtn, linking && styles.connectBtnDisabled]}
              onPress={handleConnect}
              disabled={linking}
              activeOpacity={0.85}
            >
              {linking ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
                  <Text style={styles.addBtnText}>Add Account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Role picker modal */}
        <RolePickerModal
          visible={rolePickerId !== null}
          accountName={plaidAccounts.find((a) => a.id === rolePickerId)?.name ?? ''}
          currentRole={rolePickerId ? (accountLabels[rolePickerId] as AccountRole | undefined) : undefined}
          onSelect={(role) => {
            if (rolePickerId) {
              setAccountLabel(rolePickerId, role);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            setRolePickerId(null);
          }}
          onClose={() => setRolePickerId(null)}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ── account card ──────────────────────────────────────────────────────────────

function AccountCard({
  account,
  role,
  onSetRole,
  onDisconnect,
}: {
  account: LinkedPlaidAccount;
  role: AccountRole | undefined;
  onSetRole: () => void;
  onDisconnect: (id: string) => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const meta = role ? ROLE_META[role] : null;

  const confirmDisconnect = useCallback(() => {
    swipeRef.current?.close();
    Alert.alert(
      'Disconnect Account',
      `Remove ${account.name} (···${account.mask}) from HELOC Hero?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeRef.current?.close() },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDisconnect(account.id);
          },
        },
      ],
    );
  }, [account, onDisconnect]);

  const renderRightActions = useCallback(
    (_: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.6],
        extrapolate: 'clamp',
      });
      return (
        <TouchableOpacity style={styles.deleteAction} onPress={confirmDisconnect}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="unlink-outline" size={22} color={Colors.white} />
          </Animated.View>
        </TouchableOpacity>
      );
    },
    [confirmDisconnect],
  );

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} rightThreshold={40}>
      <View style={[styles.accountCard, Shadows.card]}>
        {/* Top row: icon + name + balance */}
        <View style={styles.accountTop}>
          <View style={[styles.accountIcon, { backgroundColor: meta ? `${meta.color}18` : Colors.gray100 }]}>
            <Ionicons
              name={(meta?.icon ?? 'card-outline') as any}
              size={20}
              color={meta?.color ?? Colors.gray400}
            />
          </View>
          <View style={styles.accountMeta}>
            <Text style={styles.accountName}>{account.name}</Text>
            <Text style={styles.accountInstitution}>
              {account.institutionName} ···{account.mask}
            </Text>
          </View>
          <View style={styles.accountBalanceCol}>
            <Text style={styles.accountBalance}>{formatCurrency(account.balance)}</Text>
            {account.available !== null && account.available !== account.balance && (
              <Text style={styles.accountAvail}>
                {formatCurrency(account.available)} avail
              </Text>
            )}
          </View>
        </View>

        {/* Role row */}
        <View style={styles.roleRow}>
          {role ? (
            <TouchableOpacity
              style={[styles.roleBadge, { backgroundColor: `${meta!.color}18`, borderColor: `${meta!.color}40` }]}
              onPress={onSetRole}
            >
              <Text style={[styles.roleBadgeText, { color: meta!.color }]}>{meta!.label}</Text>
              <Ionicons name="chevron-down" size={12} color={meta!.color} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.setRoleBtn} onPress={onSetRole}>
              <Ionicons name="tag-outline" size={14} color={Colors.warning} />
              <Text style={styles.setRoleBtnText}>Set role</Text>
            </TouchableOpacity>
          )}

          {account.limit !== null && (
            <Text style={styles.limitLabel}>
              Limit {formatCurrency(account.limit)}
            </Text>
          )}
        </View>
      </View>
    </Swipeable>
  );
}

// ── role picker modal ─────────────────────────────────────────────────────────

function RolePickerModal({
  visible,
  accountName,
  currentRole,
  onSelect,
  onClose,
}: {
  visible: boolean;
  accountName: string;
  currentRole: AccountRole | undefined;
  onSelect: (role: AccountRole) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Set account role</Text>
          {accountName ? (
            <Text style={styles.modalSubtitle}>{accountName}</Text>
          ) : null}

          <View style={styles.roleList}>
            {ROLE_OPTIONS.map((role) => {
              const meta = ROLE_META[role];
              const selected = currentRole === role;
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleOption, selected && { borderColor: meta.color, backgroundColor: `${meta.color}0f` }]}
                  onPress={() => onSelect(role)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.roleOptionIcon, { backgroundColor: `${meta.color}18` }]}>
                    <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  </View>
                  <Text style={[styles.roleOptionLabel, selected && { color: meta.color, fontWeight: Typography.semibold }]}>
                    {meta.label}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={20} color={meta.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

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
  headerSubtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.mint200,
  },

  content: { padding: Spacing[4], gap: Spacing[4] },

  // net worth
  netWorthCard: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  netWorthHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  netWorthIconWrap: {
    width: 30,
    height: 30,
    borderRadius: Radius.md,
    backgroundColor: Colors.mint100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  netWorthLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  netWorthAmount: { fontSize: Typography['3xl'], fontWeight: Typography.extrabold },
  netWorthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.mint200,
  },
  netWorthMetaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  metaDot: { width: 8, height: 8, borderRadius: 4 },
  netWorthMetaLabel: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted },
  netWorthMetaValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  netWorthDivider: { width: 1, height: 24, backgroundColor: Colors.mint200, marginHorizontal: Spacing[3] },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: { flex: 1, color: Colors.error, fontSize: Typography.sm },

  // empty state
  emptyState: { alignItems: 'center', paddingVertical: Spacing[8], gap: Spacing[4] },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  emptySubtitle: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint600,
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[4],
    borderRadius: Radius.full,
    minWidth: 200,
    justifyContent: 'center',
  },
  connectBtnDisabled: { opacity: 0.5 },
  connectBtnText: { color: Colors.white, fontWeight: Typography.semibold, fontSize: Typography.base },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingTop: Spacing[2],
  },
  securityText: { fontSize: Typography.xs, color: Colors.textMuted },

  // section
  sectionTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing[2],
  },

  // account card
  accountCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  accountTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountMeta: { flex: 1 },
  accountName: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  accountInstitution: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  accountBalanceCol: { alignItems: 'flex-end' },
  accountBalance: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  accountAvail: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  roleBadgeText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  setRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  setRoleBtnText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.warning },
  limitLabel: { fontSize: Typography.xs, color: Colors.textMuted },

  deleteAction: {
    backgroundColor: Colors.error,
    borderRadius: Radius.lg,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },

  // bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomMeta: { gap: 2 },
  bottomMetaLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  bottomMetaValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint600,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    borderRadius: Radius.full,
  },
  addBtnText: { color: Colors.white, fontWeight: Typography.semibold, fontSize: Typography.base },

  // role picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[8],
    paddingTop: Spacing[3],
    gap: Spacing[4],
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray300,
    marginBottom: Spacing[2],
  },
  modalTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  modalSubtitle: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: -Spacing[2] },
  roleList: { gap: Spacing[2] },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
  },
  roleOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleOptionLabel: { flex: 1, fontSize: Typography.base, color: Colors.textSecondary },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  modalCancelText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.medium },
});
