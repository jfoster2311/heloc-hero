// app/modals/account-details.tsx — the control room for one connection.
//
// The Accounts tab lists connections and had to carry identity, every sub-account
// balance, a freshness chip and three actions inside one card. This is that card
// given room, and it takes the two MUTATING actions with it: the tab reads, the
// modal changes things. Refresh stays on the card because it changes nothing.
//
// ── Why the balance is not an input ────────────────────────────────────────
// The obvious build for this screen is a big editable balance field, and it is
// wrong for a LINKED account specifically. The balance here arrives from the
// servicer through Plaid. Typing over it would produce a figure that the next
// sync silently discards — a user could correct a number, watch it save, and
// find it reverted hours later with no explanation. Worse, this app draws a hard
// line between figures that are `live` and figures the user `entered`, chips it
// down the Accounts tab, and reasons differently about each. A third category —
// "typed over a live account" — would have no honest label.
//
// So the balance is displayed at the size the design asked for, and the things
// a user genuinely can change about a mortgage or a line — rate, term, penalty,
// limit — hand off to the editors that already own them. Those modals write to
// the profile, which is the store that is meant to hold entered figures.
//
// ── Why "Sync" does not say "sync this account" ────────────────────────────
// `plaid-get-balances` keys off userId and refreshes every linked account in a
// single call — see hooks/useAccounts.ts. A button here labelled "Force Sync"
// would imply a per-account pull that does not exist. It is one call for every
// connection, which is also the cheaper shape: Plaid bills per call.
import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ModalScreen from '../../components/ui/ModalScreen';
import { Card, LinkRow, SourceNote } from '../../components/ui/primitives';
import InstitutionAvatar from '../../components/ui/InstitutionAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useAccounts } from '../../hooks/useAccounts';
import { invokeFunction } from '../../lib/supabase';
import { STALE_SYNC_HOURS } from '../../lib/config';
import { hapticLight, hapticSuccess, hapticError } from '../../lib/haptics';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { PlaidAccountType } from '../../lib/types';

/** Where the entered figures for each account type actually live. */
const EDITOR: Record<PlaidAccountType, { route: string; label: string; sub: string } | null> = {
  'mortgage': {
    route: '/modals/mortgage-details',
    label: 'Mortgage terms',
    sub: 'Rate, term, prepayment penalty — the figures a servicer may not report',
  },
  'home equity': {
    route: '/modals/heloc-terms',
    label: 'HELOC terms',
    sub: 'Limit, rate, draw period and how interest is charged',
  },
  // Nothing to enter. A savings balance is only ever the live figure, and the
  // buffer rules that reason about it are not per-account settings.
  'savings': null,
};

const TYPE_LABEL: Record<PlaidAccountType, string> = {
  'mortgage': 'Mortgage',
  'home equity': 'HELOC',
  'savings': 'Savings',
};

export default function AccountDetailsModal() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { profile } = useAuth();
  const { accounts, loading, refresh } = useAccounts(profile?.id ?? null);

  const [syncing, setSyncing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const account = accounts.find(a => a.account_type === type) ?? null;

  async function handleSync() {
    hapticLight();
    setSyncing(true);
    const ok = await refresh();
    setSyncing(false);
    if (ok) hapticSuccess();
    else {
      hapticError();
      Alert.alert(
        'Could not sync',
        'We could not reach your bank just now. The balances below are the last ones ' +
        'that came through — nothing has been disconnected.',
      );
    }
  }

  function handleDisconnect() {
    if (!account) return;
    hapticLight();
    Alert.alert(
      `Disconnect ${account.institution_name ?? 'this institution'}?`,
      'We will revoke our access at your bank and delete the balances we hold. ' +
      'Anything you entered by hand stays. You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (!profile?.id) return;
            setUnlinking(true);
            try {
              await invokeFunction('plaid-unlink', {
                userId: profile.id,
                accountType: account.account_type,
              });
              await refresh();
              // The subject of this screen no longer exists, so staying on it
              // would leave the user looking at a disconnected account's cached
              // balances with no way to tell they were stale.
              router.back();
            } catch (err) {
              setUnlinking(false);
              Alert.alert(
                'Could not disconnect',
                `${err instanceof Error ? err.message : 'Unknown error'}\n\n` +
                'Your account is still connected. Please try again.',
              );
            }
          },
        },
      ],
    );
  }

  // Three states, and they are not interchangeable: still reading, genuinely
  // gone, and here. Telling someone their connection does not exist because a
  // fetch has not returned is the same class of bug useAccounts documents.
  if (loading && !account) {
    return (
      <ModalScreen title="Connection">
        <View style={styles.centre}>
          <ActivityIndicator color={colors.mint600} />
        </View>
      </ModalScreen>
    );
  }

  if (!account) {
    return (
      <ModalScreen title="Connection">
        <Card>
          <View style={styles.centre}>
            <Ionicons name="unlink-outline" size={24} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              This connection is no longer linked. Nothing else has changed — anything
              you entered by hand is still on file.
            </Text>
          </View>
        </Card>
      </ModalScreen>
    );
  }

  const health = connectionHealth(account.accounts_updated_at);
  const editor = EDITOR[account.account_type];
  // The figure the design wanted at full size. Summed across sub-accounts,
  // because an institution can return several under one item.
  const total = account.accounts.reduce((s, a) => s + (a.balances.current ?? 0), 0);

  return (
    <ModalScreen
      title="Connection"
      footnote="Balances come from your bank through Plaid. We never hold your bank login, and we never move money."
    >
      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <View style={styles.identity}>
        <InstitutionAvatar
          name={account.institution_name}
          accountType={account.account_type}
          size={56}
        />
        <Text style={styles.name}>
          {account.institution_name ?? TYPE_LABEL[account.account_type]}
        </Text>
        <Text style={styles.type}>{TYPE_LABEL[account.account_type]}</Text>
      </View>

      {/* ── The balance, at the size it deserves and not as a field ────────
          Read-only by design — see the note at the top of this file. It is
          labelled with where it came from and when, so the number arrives with
          its provenance rather than looking like something the user set. */}
      <Card>
        <Text style={styles.balanceLabel}>
          {account.accounts.length > 1 ? 'TOTAL BALANCE' : 'CURRENT BALANCE'}
        </Text>
        <View style={styles.balanceRow}>
          <Text style={styles.currency}>$</Text>
          <Text
            style={styles.balance}
            adjustsFontSizeToFit
            numberOfLines={1}
            accessibilityLabel={`Current balance ${Math.round(total).toLocaleString()} dollars`}
          >
            {Math.round(total).toLocaleString()}
          </Text>
        </View>
        <Text style={[styles.provenance, health.stale && styles.provenanceStale]}>
          {health.detail}
        </Text>

        {/* One call refreshes every connection, so the label does not promise a
            per-account pull. See the note at the top of this file. */}
        <TouchableOpacity
          style={[styles.syncBtn, syncing && styles.syncBtnBusy]}
          onPress={handleSync}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync all balances now"
          accessibilityState={{ busy: syncing }}
        >
          {syncing
            ? <ActivityIndicator size="small" color={colors.mint700} />
            : <Ionicons name="refresh-outline" size={16} color={colors.mint700} />}
          <Text style={styles.syncText}>
            {syncing ? 'Syncing…' : 'Sync all balances now'}
          </Text>
        </TouchableOpacity>
      </Card>

      {/* ── What the bank actually returned ───────────────────────────────
          Every sub-account under this item, rather than only the one the app
          reasons about. If a servicer reports two loans, hiding one makes the
          total above unexplainable. */}
      <Card>
        <Text style={styles.sectionLabel}>ACCOUNTS AT THIS INSTITUTION</Text>
        {account.accounts.map((a, i) => (
          <View
            key={a.account_id}
            style={[styles.sub, i === account.accounts.length - 1 && styles.subLast]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.subName} numberOfLines={1}>{a.name}</Text>
              <Text style={styles.subMeta}>
                {a.mask ? `•••• ${a.mask}` : 'no account number reported'}
                {a.subtype ? ` · ${a.subtype}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.subBalance}>
                {a.balances.current !== null
                  ? `$${Math.round(a.balances.current).toLocaleString()}`
                  : '—'}
              </Text>
              {a.balances.available !== null && a.balances.available !== a.balances.current && (
                <Text style={styles.subAvail}>
                  ${Math.round(a.balances.available).toLocaleString()} available
                </Text>
              )}
            </View>
          </View>
        ))}
      </Card>

      {/* ── The figures a user CAN change ────────────────────────────────── */}
      {editor && (
        <Card>
          <LinkRow
            icon="create-outline"
            label={editor.label}
            sub={editor.sub}
            onPress={() => { hapticLight(); router.push(editor.route as never); }}
          />
          <SourceNote>
            Balances above are your bank&apos;s and cannot be edited here — a change would
            be replaced at the next sync. Terms are yours to enter, and many servicers do
            not report them.
          </SourceNote>
        </Card>
      )}

      {/* ── Mutations. Deliberately last, and deliberately not red ────────
          Grey, with the confirmation carrying the weight instead of the colour.
          Disconnecting is a considered choice a user is entitled to make, not an
          error, and this palette has no red in it. The Alert states exactly what
          is revoked and what survives before anything happens. */}
      <Card>
        <LinkRow
          icon="repeat-outline"
          label="Reconnect this institution"
          sub="Re-run the bank login if balances have stopped arriving"
          onPress={() => { hapticLight(); router.push('/modals/link-account' as never); }}
        />
        {unlinking ? (
          <View style={styles.unlinkBusy}>
            <ActivityIndicator size="small" color={colors.gray400} />
            <Text style={styles.unlinkBusyText}>Disconnecting…</Text>
          </View>
        ) : (
          <LinkRow
            icon="unlink-outline"
            label="Disconnect"
            sub="Revokes our access and deletes the balances we hold"
            danger
            onPress={handleDisconnect}
          />
        )}
      </Card>
    </ModalScreen>
  );
}

/**
 * Freshness, from the only thing we actually know: when balances last arrived.
 *
 * Kept in the same shape as the Accounts tab's version, and for the same reason
 * documented there — nothing in this app stores Plaid item error state, so no
 * label here may imply we know a re-authentication is required.
 */
function connectionHealth(syncedAt: string | null): { detail: string; stale: boolean } {
  if (!syncedAt) {
    return { detail: 'No balances have come through from this connection yet.', stale: true };
  }
  const ms = Date.now() - new Date(syncedAt).getTime();
  const hours = ms / 3_600_000;
  // A future timestamp is a clock disagreement, not a prediction.
  if (hours < 0) return { detail: 'Synced just now.', stale: false };
  if (hours > STALE_SYNC_HOURS) {
    return { detail: `Last synced ${relative(ms)} — out of date.`, stale: true };
  }
  return { detail: `Synced ${relative(ms)}.`, stale: false };
}

function relative(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const useStyles = createThemedStyles(t => ({
  centre: { alignItems: 'center', justifyContent: 'center', gap: Spacing[3], paddingVertical: Spacing[6] },
  emptyText: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  identity: { alignItems: 'center', gap: Spacing[2], paddingBottom: Spacing[2] },
  name: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    textAlign: 'center',
  },
  type: { fontSize: Typography.sm, color: t.colors.textMuted },

  balanceLabel: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing[2],
  },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-start' },
  currency: {
    fontSize: 24,
    fontWeight: Typography.bold,
    color: t.colors.textSecondary,
    marginTop: 6,
    marginRight: 2,
  },
  // The "high-fidelity" figure. Shrinks to fit rather than truncating, because a
  // seven-figure mortgage balance clipped to "$1,234,5" is worse than small.
  balance: {
    flex: 1,
    fontSize: 44,
    fontWeight: Typography.extrabold,
    color: t.colors.textPrimary,
    letterSpacing: -1,
  },
  provenance: { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: Spacing[2] },
  provenanceStale: { color: t.colors.gray500, fontWeight: Typography.medium },

  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    minHeight: 44,
    marginTop: Spacing[4],
    borderRadius: Radius.md,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  syncBtnBusy: { opacity: 0.7 },
  syncText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: t.colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing[1],
  },
  sub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  subLast: { borderBottomWidth: 0 },
  subName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textPrimary },
  subMeta: { fontSize: 11, color: t.colors.textMuted, marginTop: 1 },
  subBalance: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  subAvail: { fontSize: 11, color: t.colors.textMuted, marginTop: 1 },

  unlinkBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 56,
  },
  unlinkBusyText: { fontSize: Typography.sm, color: t.colors.textSecondary },
}));
