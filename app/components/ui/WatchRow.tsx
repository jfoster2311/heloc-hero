// components/ui/WatchRow.tsx — one line of "worth a look", shared by the tabs.
//
// Dashboard and Accounts both render the same prioritised feed from
// buildWatchItems (lib/watchItems.ts). This used to live privately inside the
// dashboard, which meant a second copy would drift the moment either screen was
// touched. One row, one look, both places.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';
import type { WatchItem } from '../../lib/watchItems';

export default function WatchRow({ item, last, onPress }: {
  item: WatchItem;
  last: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.watchRow, !last && styles.watchRowBorder]}>
      <View style={styles.watchIcon}>
        <Ionicons name={item.icon as never} size={16} color={Colors.textSecondary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.watchTitle}>{item.title}</Text>
        <Text style={styles.watchDetail}>{item.detail}</Text>
        {item.action && <Text style={styles.watchAction}>{item.action.label} →</Text>}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  watchRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    alignItems: 'flex-start',
  },
  watchRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  watchIcon: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  watchTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  watchDetail: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
  watchAction: { fontSize: Typography.xs, color: Colors.mint600, fontWeight: Typography.semibold, marginTop: 2 },
});
