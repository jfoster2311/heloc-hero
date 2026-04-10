// app/auth/forgot-password.tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleReset() {
    if (!email) { setError('Please enter your email.'); return; }
    setLoading(true);
    setError('');
    const { error: resetError } = await auth.resetPassword(email.trim());
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.inner}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          We'll send a reset link to your email address.
        </Text>

        {sent ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <Text style={styles.successText}>
              Check your inbox — reset link sent to {email}
            </Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={handleReset}
                returnKeyType="send"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.buttonText}>Send Reset Link</Text>
              }
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.replace('/auth/login')}>
          <Text style={styles.backToLogin}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  back: { padding: Spacing[5], paddingTop: 56 },
  inner: { paddingHorizontal: Spacing[6], flex: 1 },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  subtitle: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    marginBottom: Spacing[6],
    lineHeight: 22,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    backgroundColor: '#f0fdf4',
    borderRadius: Radius.md,
    padding: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
    marginBottom: Spacing[5],
  },
  successText: { flex: 1, fontSize: Typography.sm, color: '#166534', lineHeight: 20 },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: { color: Colors.error, fontSize: Typography.sm },
  inputGroup: { marginBottom: Spacing[5] },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing[2],
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing[4],
    fontSize: Typography.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray50,
  },
  button: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    alignItems: 'center',
    ...Shadows.glow,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.semibold },
  backToLogin: {
    color: Colors.mint600,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    textAlign: 'center',
    marginTop: Spacing[5],
  },
});
