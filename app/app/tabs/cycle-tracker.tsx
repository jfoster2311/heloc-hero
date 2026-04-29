// app/tabs/cycle-tracker.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppStore, CycleEntry } from '../../../lib/appStore';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../../lib/theme';

// In production these come from the linked HELOC account
const HELOC_LIMIT = 80_000;
const HELOC_BALANCE = 62_000;
const MONTHLY_SURPLUS = 4_200;
const UTILIZATION_WARN = 0.8;

function formatCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never synced';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'Synced just now';
  if (diffMin < 60) return `Synced ${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Synced ${diffH}h ago`;
  return `Synced ${d.toLocaleDateString()}`;
}

export default function CycleTrackerScreen() {
  const insets = useSafeAreaInsets();
  const { cycles, syncedAt, addCycle, deleteCycle } = useAppStore();

  const utilization = HELOC_BALANCE / HELOC_LIMIT;
  const utilizationPct = Math.round(utilization * 100);
  const isWarning = utilization >= UTILIZATION_WARN;
  const fillColor = isWarning ? Colors.warning : Colors.success;

  const prevUtilRef = useRef(utilization);
  useEffect(() => {
    if (prevUtilRef.current < UTILIZATION_WARN && utilization >= UTILIZATION_WARN) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    prevUtilRef.current = utilization;
  }, [utilization]);

  const handleLogSweep = useCallback(() => {
    addCycle({
      date: new Date().toISOString(),
      swept: MONTHLY_SURPLUS,
      helocBalance: HELOC_BALANCE + MONTHLY_SURPLUS,
      helocLimit: HELOC_LIMIT,
      interestSaved: Math.round((MONTHLY_SURPLUS * 0.085) / 12),
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [addCycle]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Cycle Tracker</Text>
            <Text style={styles.headerSubtitle}>{formatSyncTime(syncedAt)}</Text>
          </View>
          <View style={styles.syncDot} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Safe to Move card */}
          <View style={[CommonStyles.card, styles.safeCard, Shadows.card]}>
            <View style={styles.safeHeader}>
              <View style={styles.safeIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.success} />
              </View>
              <Text style={styles.safeLabel}>Safe to Move</Text>
            </View>
            <Text style={styles.safeAmount}>{formatCurrency(MONTHLY_SURPLUS)}</Text>
            <Text style={styles.safeSub}>
              Monthly surplus available to sweep into your HELOC this cycle
            </Text>
            <View style={styles.safeRow}>
              <View style={styles.safeMetaItem}>
                <Text style={styles.safeMetaLabel}>Available credit</Text>
                <Text style={styles.safeMetaValue}>
                  {formatCurrency(HELOC_LIMIT - HELOC_BALANCE)}
                </Text>
              </View>
              <View style={styles.safeMetaDivider} />
              <View style={styles.safeMetaItem}>
                <Text style={styles.safeMetaLabel}>Limit</Text>
                <Text style={styles.safeMetaValue}>{formatCurrency(HELOC_LIMIT)}</Text>
              </View>
            </View>
          </View>

          {/* Utilization fill bar */}
          <View style={[CommonStyles.card, Shadows.card]}>
            <View style={styles.utilizationHeader}>
              <Text style={styles.cardTitle}>HELOC Utilization</Text>
              <View style={[styles.utilizationBadge, { backgroundColor: isWarning ? '#fff7ed' : '#f0fdf4' }]}>
                <Text style={[styles.utilizationBadgeText, { color: fillColor }]}>
                  {utilizationPct}%
                </Text>
              </View>
            </View>

            <View style={styles.fillTrack}>
              {/* 80% warning marker */}
              <View style={styles.warnMarker} />
              <View
                style={[
                  styles.fillBar,
                  {
                    width: `${Math.min(utilizationPct, 100)}%` as any,
                    backgroundColor: fillColor,
                  },
                ]}
              />
            </View>

            <View style={styles.fillLabels}>
              <Text style={styles.fillLabelLeft}>
                {formatCurrency(HELOC_BALANCE)} balance
              </Text>
              <Text style={styles.fillLabelRight}>
                {formatCurrency(HELOC_LIMIT)} limit
              </Text>
            </View>

            {isWarning && (
              <View style={styles.warnBanner}>
                <Ionicons name="warning-outline" size={14} color={Colors.warning} />
                <Text style={styles.warnText}>
                  Above 80% — consider a paydown before your next sweep
                </Text>
              </View>
            )}
          </View>

          {/* Cycle history */}
          <Text style={styles.sectionTitle}>Sweep History</Text>

          {cycles.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="repeat-outline" size={40} color={Colors.gray300} />
              <Text style={styles.emptyTitle}>No sweeps logged yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap "Log Sweep" below after you move money to your HELOC
              </Text>
            </View>
          ) : (
            cycles.map((cycle) => (
              <CycleRow key={cycle.id} cycle={cycle} onDelete={deleteCycle} />
            ))
          )}
        </ScrollView>

        {/* Pinned bottom bar */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing[3] }]}>
          <View style={styles.bottomMeta}>
            <Text style={styles.bottomMetaLabel}>Total saved</Text>
            <Text style={styles.bottomMetaValue}>
              {formatCurrency(cycles.reduce((s, c) => s + c.interestSaved, 0))}
            </Text>
          </View>
          <TouchableOpacity style={styles.logBtn} onPress={handleLogSweep} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
            <Text style={styles.logBtnText}>Log Sweep</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function CycleRow({
  cycle,
  onDelete,
}: {
  cycle: CycleEntry;
  onDelete: (id: string) => void;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const confirmDelete = useCallback(() => {
    swipeRef.current?.close();
    Alert.alert('Delete Sweep', 'Remove this entry from your history?', [
      { text: 'Cancel', style: 'cancel', onPress: () => swipeRef.current?.close() },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onDelete(cycle.id);
        },
      },
    ]);
  }, [cycle.id, onDelete]);

  const renderRightActions = useCallback(
    (_: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.6],
        extrapolate: 'clamp',
      });
      return (
        <TouchableOpacity style={styles.deleteAction} onPress={confirmDelete}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="trash-outline" size={22} color={Colors.white} />
          </Animated.View>
        </TouchableOpacity>
      );
    },
    [confirmDelete],
  );

  const utilization = cycle.helocBalance / cycle.helocLimit;
  const fillColor = utilization >= UTILIZATION_WARN ? Colors.warning : Colors.success;
  const date = new Date(cycle.date);

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} rightThreshold={40}>
      <View style={[styles.cycleRow, Shadows.card]}>
        <View style={styles.cycleLeft}>
          <Text style={styles.cycleDate}>
            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Text style={styles.cycleSwept}>
            Swept {formatCurrency(cycle.swept)}
          </Text>
          <View style={styles.cycleMiniTrack}>
            <View
              style={[
                styles.cycleMiniBar,
                {
                  width: `${Math.min(Math.round(utilization * 100), 100)}%` as any,
                  backgroundColor: fillColor,
                },
              ]}
            />
          </View>
        </View>
        <View style={styles.cycleRight}>
          <Text style={styles.cycleSaved}>+{formatCurrency(cycle.interestSaved)}</Text>
          <Text style={styles.cycleSavedLabel}>saved</Text>
        </View>
      </View>
    </Swipeable>
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
  headerSubtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },

  content: { padding: Spacing[4], gap: Spacing[4] },

  safeCard: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    gap: Spacing[3],
  },
  safeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  safeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  safeAmount: { fontSize: Typography['3xl'], fontWeight: Typography.extrabold, color: Colors.success },
  safeSub: { fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 20 },
  safeRow: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: '#bbf7d0' },
  safeMetaItem: { flex: 1, alignItems: 'center', gap: 2 },
  safeMetaDivider: { width: 1, height: 28, backgroundColor: '#bbf7d0' },
  safeMetaLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  safeMetaValue: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },

  cardTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  utilizationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  utilizationBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing[3], paddingVertical: 3 },
  utilizationBadgeText: { fontSize: Typography.sm, fontWeight: Typography.bold },

  fillTrack: {
    height: 12,
    backgroundColor: Colors.gray100,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  fillBar: { height: 12, borderRadius: 6 },
  warnMarker: {
    position: 'absolute',
    left: '80%',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.warning,
    zIndex: 1,
    opacity: 0.6,
  },
  fillLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing[2],
  },
  fillLabelLeft: { fontSize: Typography.xs, color: Colors.textMuted },
  fillLabelRight: { fontSize: Typography.xs, color: Colors.textMuted },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#fff7ed',
    borderRadius: Radius.sm,
    padding: Spacing[3],
    marginTop: Spacing[2],
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  warnText: { flex: 1, fontSize: Typography.xs, color: Colors.warning, lineHeight: 16 },

  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginTop: Spacing[2],
  },

  emptyState: { alignItems: 'center', paddingVertical: Spacing[10], gap: Spacing[3] },
  emptyTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  emptySubtitle: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 },

  cycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  cycleLeft: { flex: 1, gap: Spacing[1] },
  cycleDate: { fontSize: Typography.xs, color: Colors.textMuted },
  cycleSwept: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cycleMiniTrack: {
    height: 4,
    backgroundColor: Colors.gray100,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: Spacing[1],
  },
  cycleMiniBar: { height: 4, borderRadius: 2 },
  cycleRight: { alignItems: 'flex-end', gap: 2 },
  cycleSaved: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.success },
  cycleSavedLabel: { fontSize: Typography.xs, color: Colors.textMuted },

  deleteAction: {
    backgroundColor: Colors.error,
    borderRadius: Radius.lg,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },

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
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint600,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    borderRadius: Radius.full,
  },
  logBtnText: { color: Colors.white, fontWeight: Typography.semibold, fontSize: Typography.base },
});
