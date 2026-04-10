// app/auth/login.tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { auth } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSignIn() {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');

    const { error: signInError } = await auth.signIn(email.trim(), password);

    if (signInError) {
      setError('Invalid email or password. Please try again.');
      setLoading(false);
    }
    // useAuth listener in _layout.tsx handles navigation on success
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={Gradients.primary} style={styles.header}>
          <Text style={styles.logoText}>HELOC</Text>
          <Text style={styles.logoSubText}>HERO</Text>
          <Text style={styles.tagline}>Welcome back.</Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.title}>Sign in to your account</Text>

          {!!error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              placeholder="Your password"
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={handleSignIn}
              returnKeyType="go"
            />
          </View>

          <Link href="/auth/forgot-password" style={styles.forgotLink}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Link>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.buttonText}>Sign In</Text>
            }
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/auth/signup">
              <Text style={styles.linkText}>Sign up free</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.background },
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 48,
  },
  logoText: {
    fontSize: 44,
    fontWeight: Typography.extrabold,
    color: Colors.white,
    letterSpacing: 4,
  },
  logoSubText: {
    fontSize: 22,
    fontWeight: Typography.bold,
    color: Colors.mint200,
    letterSpacing: 8,
    marginTop: -6,
  },
  tagline: {
    fontSize: Typography.sm,
    color: Colors.mint100,
    marginTop: Spacing[3],
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Spacing[6],
    marginTop: -Spacing[4],
    ...Shadows.modal,
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[5],
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: { color: Colors.error, fontSize: Typography.sm },
  inputGroup: { marginBottom: Spacing[4] },
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
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: Spacing[4],
    marginTop: -Spacing[2],
  },
  forgotText: { color: Colors.mint600, fontSize: Typography.sm },
  button: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    alignItems: 'center',
    ...Shadows.glow,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing[6],
  },
  footerText: { color: Colors.textSecondary, fontSize: Typography.sm },
  linkText: {
    color: Colors.mint600,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
});
