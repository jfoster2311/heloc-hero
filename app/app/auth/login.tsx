// app/auth/login.tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

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
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                placeholder="Your password"
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={handleSignIn}
                returnKeyType="go"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
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
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[4],
    borderLeftWidth: 3,
    borderLeftColor: Colors.gray400,
  },
  errorText: { color: Colors.gray400, fontSize: Typography.sm },
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  eyeBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 0,
    borderTopRightRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing[3],
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
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
