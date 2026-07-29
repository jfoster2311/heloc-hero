// components/LockGate.tsx — wraps the app; shows lock overlay after 15 min background
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography, Spacing, Gradients, Shadows } from '../lib/theme';
import { createThemedStyles, useTheme } from '../lib/themeContext';
import {
  shouldLock, authenticate, recordBackgroundTime, isLockEnabled,
} from '../lib/appLock';

interface Props { children: React.ReactNode }

export default function LockGate({ children }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  const checkAndLock = useCallback(async () => {
    const needs = await shouldLock();
    if (needs) setLocked(true);
  }, []);

  useEffect(() => {
    checkAndLock();
  }, [checkAndLock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === 'background' || next === 'inactive') {
        const enabled = await isLockEnabled();
        if (enabled) await recordBackgroundTime();
      } else if (next === 'active' && (prev === 'background' || prev === 'inactive')) {
        await checkAndLock();
      }
    });
    return () => sub.remove();
  }, [checkAndLock]);

  async function handleUnlock() {
    setAuthenticating(true);
    try {
      const success = await authenticate();
      if (success) setLocked(false);
    } finally {
      setAuthenticating(false);
    }
  }

  if (!locked) return <>{children}</>;

  return (
    <LinearGradient colors={Gradients.hero} style={styles.overlay}>
      <View style={styles.card}>
        <Ionicons name="lock-closed" size={48} color={colors.accentInk} />
        <Text style={styles.title}>HELOC Hero</Text>
        <Text style={styles.subtitle}>The app has been locked for your security.</Text>
        <TouchableOpacity
          style={styles.unlockBtn}
          onPress={handleUnlock}
          disabled={authenticating}
          accessibilityLabel="Unlock with Face ID or passcode"
        >
          <Ionicons name="finger-print-outline" size={22} color={colors.onAccent} />
          <Text style={styles.unlockText}>
            {authenticating ? 'Authenticating…' : 'Unlock'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const useStyles = createThemedStyles(t => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    alignItems: 'center',
    gap: Spacing[4],
    backgroundColor: t.colors.surface,
    borderRadius: 24,
    padding: Spacing[8],
    marginHorizontal: Spacing[8],
    ...Shadows.modal,
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.sm,
    color: t.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: t.colors.mint600,
    borderRadius: 12,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[8],
    marginTop: Spacing[2],
    ...Shadows.glow,
  },
  unlockText: {
    color: t.colors.onAccent,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
}));
