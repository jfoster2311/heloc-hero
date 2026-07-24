// app/auth/login.tsx — sign in.
//
// Rebuilt because this screen predated the design system and was the least
// considered surface in the app, at the moment of highest trust. What was
// wrong, and why each mattered:
//
//  · A LinearGradient "HELOC / HERO" wordmark, when every other screen opens on
//    the aurora. Arriving here from the welcome screen meant the brand changed
//    shape between two consecutive taps.
//  · `paddingTop: 80`, no safe area. Correct on no device in particular.
//  · No `textContentType`, so iOS never offered the saved password. Users with
//    a password manager — which is most people with a bank account — had to
//    type a password they do not know by heart.
//  · No keyboard chaining: email had no return key action, so the flow was
//    type, dismiss keyboard, tap password, type, dismiss, tap button.
//  · Every failure read "Invalid email or password", including a dropped
//    connection. See lib/authErrors — this is the screen that mistake hurt.
//  · The spinner had no exit on success: it relied on the auth listener
//    unmounting the screen, so any hitch left a button spinning forever.
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AuroraBackground from '../../components/Aurora';
import Logo from '../../components/ui/Logo';
import FormField from '../../components/ui/FormField';
import { auth } from '../../lib/supabase';
import { describeAuthError, type AuthErrorInfo } from '../../lib/authErrors';
import { hapticLight, hapticError } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Aurora, Shadows } from '../../lib/theme';

/**
 * If the auth listener has not navigated within this window, something is
 * wrong. Releasing the button is better than a spinner with no end: the user
 * can retry, and the session may well have succeeded anyway.
 */
const NAVIGATE_TIMEOUT_MS = 12_000;

export default function LoginScreen() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [problem, setProblem]           = useState<AuthErrorInfo | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSignIn() {
    if (!canSubmit) return;
    hapticLight();
    setLoading(true);
    setProblem(null);

    // Supabase throws on transport failure rather than returning an error, so
    // the network case only reaches describeAuthError if we catch it.
    let signInError: unknown = null;
    try {
      const { error } = await auth.signIn(email.trim().toLowerCase(), password);
      signInError = error;
    } catch (err) {
      signInError = err;
    }

    if (signInError) {
      const info = describeAuthError(signInError);
      setProblem(info);
      setLoading(false);
      hapticError();
      // Put the cursor where the fix is. Only the password is ever refocused —
      // sending someone back to the email field they typed correctly is noise.
      if (info.field === 'password') {
        setPassword('');
        passwordRef.current?.focus();
      }
      return;
    }

    // Success: the useAuth listener in _layout redirects. Guard against it not
    // happening rather than trusting an unmount we do not control.
    timeoutRef.current = setTimeout(() => setLoading(false), NAVIGATE_TIMEOUT_MS);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* The same field the welcome screen uses, so arriving here is a content
          change rather than a change of app. */}
      <AuroraBackground style={styles.header} intensity={0.75}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerBar}>
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding/welcome'))}
              style={styles.back}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerBody}>
            <Logo size={34} variant="inline" />
            <Text style={styles.headline} accessibilityRole="header">Welcome back</Text>
          </View>
        </SafeAreaView>
      </AuroraBackground>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {problem && (
            <View style={styles.problem} accessibilityLiveRegion="assertive">
              <Ionicons
                name={problem.retryable ? 'cloud-offline-outline' : 'alert-circle-outline'}
                size={18}
                color={Colors.textSecondary}
                style={styles.problemIcon}
              />
              <View style={styles.flex}>
                <Text style={styles.problemTitle}>{problem.title}</Text>
                <Text style={styles.problemText}>{problem.message}</Text>
              </View>
            </View>
          )}

          <FormField
            label="Email"
            value={email}
            onChangeText={t => { setEmail(t); if (problem) setProblem(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            // textContentType is what makes iOS offer the saved credential.
            textContentType="username"
            autoComplete="email"
            placeholder="you@example.com"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
            invalid={problem?.field === 'email'}
            accessibilityLabel="Email address"
          />

          <FormField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={t => { setPassword(t); if (problem) setProblem(null); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            placeholder="Your password"
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            invalid={problem?.field === 'password'}
            accessibilityLabel="Password"
            accessory={
              <TouchableOpacity
                onPress={() => { hapticLight(); setShowPassword(v => !v); }}
                style={styles.eye}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            }
          />

          <Link href="/auth/forgot-password" asChild>
            <TouchableOpacity
              style={styles.forgot}
              accessibilityRole="link"
              accessibilityLabel="Forgot your password"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={handleSignIn}
            disabled={!canSubmit}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{ disabled: !canSubmit, busy: loading }}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.submitText}>Sign in</Text>}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to HELOC Hero? </Text>
            <Link href="/auth/signup" asChild>
              <TouchableOpacity accessibilityRole="link" accessibilityLabel="Create an account">
                <Text style={styles.footerLink}>Create an account</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  header: { paddingBottom: Spacing[6], backgroundColor: Aurora.deepest },
  headerBar: { height: 44, justifyContent: 'center', paddingHorizontal: Spacing[2] },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerBody: { paddingHorizontal: Spacing[5], gap: Spacing[4] },
  headline: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: '#ffffff',
    letterSpacing: -0.6,
  },

  content: { padding: Spacing[5], paddingTop: Spacing[6], paddingBottom: Spacing[10] },

  problem: {
    flexDirection: 'row',
    gap: Spacing[3],
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing[4],
    marginBottom: Spacing[5],
    borderLeftWidth: 3,
    borderLeftColor: Colors.gray400,
  },
  problemIcon: { marginTop: 1 },
  problemTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  problemText: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },

  // Laid out inside the field by FormField, so no absolute offsets to keep in
  // sync with the label's height.
  eye: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },

  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing[1] },
  forgotText: { color: Colors.mint700, fontSize: Typography.sm, fontWeight: Typography.medium },

  submit: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[4],
    ...Shadows.glow,
  },
  submitDisabled: { opacity: 0.4, shadowOpacity: 0 },
  submitText: {
    color: Colors.white,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing[6],
    minHeight: 44,
  },
  footerText: { color: Colors.textSecondary, fontSize: Typography.sm },
  footerLink: {
    color: Colors.mint700,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
});
