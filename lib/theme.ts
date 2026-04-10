// lib/theme.ts
import { StyleSheet } from 'react-native';

export const Colors = {
  // Brand — mint/teal palette
  mint50:  '#f0faf7',
  mint100: '#d1f0e8',
  mint200: '#a3e0d1',
  mint400: '#4db89f',
  mint600: '#1a9e7a',
  mint700: '#147a5e',

  // Status
  success: '#22c55e',
  warning: '#f59e0b',
  error:   '#ef4444',
  info:    '#3b82f6',

  // Neutrals
  white:   '#ffffff',
  gray50:  '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',

  // App surfaces
  background:    '#f5f7fa',
  surface:       '#ffffff',
  border:        '#e5e7eb',
  textPrimary:   '#111827',
  textSecondary: '#374151',
  textMuted:     '#9ca3af',
};

export const Typography = {
  // Font sizes
  xs:    12,
  sm:    14,
  base:  16,
  lg:    18,
  xl:    20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,

  // Font weights (string literals for StyleSheet)
  regular:   '400' as const,
  normal:    '400' as const,
  medium:    '500' as const,
  semibold:  '600' as const,
  bold:      '700' as const,
  extrabold: '800' as const,
};

export const Spacing = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  9:  36,
  10: 40,
  12: 48,
} as const;

export const Radius = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   20,
  full: 9999,
};

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  glow: {
    shadowColor: '#1a9e7a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const Gradients = {
  primary: ['#1a9e7a', '#0d7a5e'] as const,
  hero:    ['#1a9e7a', '#147a5e'] as const,
};

export const CommonStyles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    ...Shadows.card,
  },
});
