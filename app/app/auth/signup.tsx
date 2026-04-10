// app/auth/signup.tsx
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

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    const { error: signUpError } = await auth.signUp(email.trim(), password, fullName.trim());

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    }
    // useAuth listener handles navigation on success
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
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="At least 8 characters"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="Re-enter password"
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={handleSignUp}
              returnKeyType="go"
            />
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
            By signing up you agree to our Terms of Service and Privacy Policy.
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
    lineHeight: 16,
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
