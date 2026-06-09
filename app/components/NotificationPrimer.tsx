// components/NotificationPrimer.tsx — value-first sheet before iOS permission prompt
// Shows once after first dashboard load. Fires real iOS prompt only on "Enable".
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius, Shadows } from '../lib/theme';

const PRIMER_SHOWN_KEY = '@heloc_hero:notification_primer_shown';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Notifications = any;
let Notifications: Notifications = null;

function loadModule(): Notifications {
  if (Notifications) return Notifications;
  try {
    Notifications = require('expo-notifications');
  } catch {
    Notifications = null;
  }
  return Notifications;
}

async function requestPermission(): Promise<void> {
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.requestPermissionsAsync();
  } catch {
    // silently ignore — native module may not be available in Expo Go
  }
}

interface Props {
  /** Pass a key that changes after the first dashboard load to trigger the check. */
  triggerKey: string | null;
}

export default function NotificationPrimer({ triggerKey }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!triggerKey) return;
    AsyncStorage.getItem(PRIMER_SHOWN_KEY).then(shown => {
      if (!shown) setVisible(true);
    });
  }, [triggerKey]);

  async function handleEnable() {
    await AsyncStorage.setItem(PRIMER_SHOWN_KEY, 'true');
    setVisible(false);
    await requestPermission();
  }

  async function handleDismiss() {
    await AsyncStorage.setItem(PRIMER_SHOWN_KEY, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconRow}>
            <View style={styles.iconBg}>
              <Ionicons name="notifications-outline" size={32} color={Colors.mint600} />
            </View>
          </View>

          <Text style={styles.title}>Stay on top of your strategy</Text>
          <Text style={styles.body}>
            Get notified when Safe Sweep™ or Safe Dump™ runs, or when your HELOC
            balance crosses a threshold. One alert at a time — no noise.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleEnable}>
            <Text style={styles.primaryBtnText}>Enable Notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleDismiss}>
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing[6],
    paddingBottom: Spacing[8],
    gap: Spacing[4],
    alignItems: 'center',
    ...Shadows.modal,
  },
  iconRow: { marginBottom: Spacing[2] },
  iconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    ...Shadows.glow,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  secondaryBtn: {
    paddingVertical: Spacing[2],
  },
  secondaryBtnText: {
    fontSize: Typography.base,
    color: Colors.textMuted,
  },
});
