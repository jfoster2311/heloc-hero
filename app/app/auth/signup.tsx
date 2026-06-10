// app/auth/signup.tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { Colors, Typography, Spacing, Radius, Shadows, Gradients } from '../../lib/theme';

export default function SignupScreen() {
  const router = useRouter();
  const { refresh: refreshProfile }              = useAuth();
  const { submit: submitOnboarding, update: updateOnboarding } = useOnboardingStore();
  const [fullName, setFullName]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  async function handleSignUp() {
    if (!fullName || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signUpError, data } = await auth.signUp(email.trim(), password, fullName.trim());

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data?.user) {
      // Carry the name from this form into the onboarding store so submit() persists it.
      updateOnboarding({ fullName: fullName.trim() });
      // Persist onboarding answers + set onboarding_complete: true in Supabase.
      await submitOnboarding(data.user.id);
      // Re-fetch profile so _layout.tsx sees onboarding_complete: true and routes to tabs.
      await refreshProfile();
    }
    // _layout.tsx redirect fires once profile.onboarding_complete is true.
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
          <Text style={styles.tagline}>Start paying off your home faster.</Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Free forever. Upgrade when you're ready.</Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              placeholder="Jane Smith"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

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
                autoComplete="new-password"
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.textMuted}
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

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                placeholder="Re-enter password"
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={handleSignUp}
                returnKeyType="go"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirm(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.buttonText}>Create Free Account</Text>
            }
          </TouchableOpacity>

          <Text style={styles.terms}>
            By signing up you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://helochero.com/terms')}
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://helochero.com/privacy')}
            >
              Privacy Policy
            </Text>
            .
          </Text>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/auth/login">
              <Text style={styles.linkText}>Sign in</Text>
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
    paddingTop: 64,
    paddingBottom: 40,
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
    marginBottom: Spacing[1],
  },
  subtitle: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
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
  button: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    padding: Spacing[4],
    alignItems: 'center',
    marginTop: Spacing[2],
    ...Shadows.glow,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  terms: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing[3],
    lineHeight: 18,
  },
  termsLink: {
    color: Colors.mint600,
    fontWeight: Typography.medium,
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing[5],
  },
  footerText: { color: Colors.textSecondary, fontSize: Typography.sm },
  linkText: {
    color: Colors.mint600,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
});
