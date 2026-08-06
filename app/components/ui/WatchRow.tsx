// components/ui/WatchRow.tsx — one line of "worth a look", shared by the tabs.
//
// Dashboard and Accounts both render the same prioritised feed from
// buildWatchItems (lib/watchItems.ts). This used to live privately inside the
// dashboard, which meant a second copy would drift the moment either screen was
// touched. One row, one look, both places.
import { View, Text } from 'react-native';
import { Touchable } from './press';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { isAdministrative, type WatchItem } from '../../lib/watchItems';

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
        <View style={styles.titleRow}>
          <Text style={[styles.watchTitle, { flex: 1 }]}>{item.title}</Text>
          {/* The one non-green mark in the app. It says "two seconds of admin",
              which is why it only appears on kinds the user can actually clear
              — see isAdministrative. It is never the only signal: the row
              carries a title, a detail and an action label regardless, so
              nothing here depends on distinguishing a colour. */}
          {isAdministrative(item.kind) && (
            <View
              style={styles.sentinelDot}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
        </View>
        <Text style={styles.watchDetail}>{item.detail}</Text>
        {item.action && <Text style={styles.watchAction}>{item.action.label} →</Text>}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
      {body}
    </Touchable>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  sentinelDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    // A UI indicator under WCAG 1.4.11, needing 3:1 — measured 3.36-3.68 on the
    // light surfaces and 6.31-7.66 on dark. Never text.
    backgroundColor: t.colors.sentinel,
  },
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
