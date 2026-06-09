// components/LockGate.tsx — wraps the app; shows lock overlay after 15 min background
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Gradients, Shadows } from '../lib/theme';
import {
  shouldLock, authenticate, recordBackgroundTime, isLockEnabled,
} from '../lib/appLock';

interface Props { children: React.ReactNode }

export default function LockGate({ children }: Props) {
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
        <Ionicons name="lock-closed" size={48} color={Colors.mint600} />
        <Text style={styles.title}>HELOC Hero</Text>
        <Text style={styles.subtitle}>The app has been locked for your security.</Text>
        <TouchableOpacity
          style={styles.unlockBtn}
          onPress={handleUnlock}
          disabled={authenticating}
          accessibilityLabel="Unlock with Face ID or passcode"
        >
          <Ionicons name="finger-print-outline" size={22} color={Colors.white} />
          <Text style={styles.unlockText}>
            {authenticating ? 'Authenticating…' : 'Unlock'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    alignItems: 'center',
    gap: Spacing[4],
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: Spacing[8],
    marginHorizontal: Spacing[8],
    ...Shadows.modal,
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.mint600,
    borderRadius: 12,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[8],
    marginTop: Spacing[2],
    ...Shadows.glow,
  },
  unlockText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
});
