// components/ui/WatchRow.tsx — one line of "worth a look", shared by the tabs.
//
// Dashboard and Accounts both render the same prioritised feed from
// buildWatchItems (lib/watchItems.ts). This used to live privately inside the
// dashboard, which meant a second copy would drift the moment either screen was
// touched. One row, one look, both places.
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import type { WatchItem } from '../../lib/watchItems';

export default function WatchRow({ item, last, onPress }: {
  item: WatchItem;
  last: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const body = (
    <View style={[styles.watchRow, !last && styles.watchRowBorder]}>
      <View style={styles.watchIcon}>
        <Ionicons name={item.icon as never} size={16} color={colors.textSecondary} />
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

const useStyles = createThemedStyles(t => ({
  watchRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    alignItems: 'flex-start',
  },
  watchRowBorder: { borderBottomWidth: 1, borderBottomColor: t.colors.borderSubtle },
  watchIcon: {
    width: 30, height: 30, borderRadius: Radius.sm,
    backgroundColor: t.colors.gray100,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  watchTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  watchDetail: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18 },
  watchAction: { fontSize: Typography.xs, color: t.colors.accentInk, fontWeight: Typography.semibold, marginTop: 2 },
}));
