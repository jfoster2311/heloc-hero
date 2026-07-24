// app/auth/signup.tsx — create an account.
//
// Rebuilt alongside login, and for the same reasons. The defects specific to
// this screen:
//
//  · `setError(signUpError.message)` put the raw Supabase string in front of
//    the user. "User already registered" is not an instruction; it does not say
//    "sign in instead", which is the only thing that helps.
//  · No `textContentType="newPassword"`, so iOS offered neither a generated
//    strong password nor a keychain save. On a finance app that is the single
//    most valuable field attribute there is — it is the difference between a
//    user with a unique password and a user reusing one.
//  · Four fields, no keyboard chaining.
//  · Every rule ("8 characters", "passwords match") was enforced only on
//    submit, so the user learned the requirements by failing them.
//
// The confirm field stays. iOS AutoFill fills both boxes when a generated
// password is accepted, so it costs nothing for password-manager users, and it
// still catches a typo for everyone typing by hand.
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AuroraBackground from '../../components/Aurora';
import Logo from '../../components/ui/Logo';
import FormField from '../../components/ui/FormField';
import { auth } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useOnboardingStore } from '../../lib/onboardingStore';
import { describeAuthError, type AuthErrorInfo } from '../../lib/authErrors';
import { hapticLight, hapticError, hapticSuccess } from '../../lib/haptics';
import { Colors, Typography, Spacing, Radius, Aurora, Shadows } from '../../lib/theme';

const MIN_PASSWORD = 8;
const NAVIGATE_TIMEOUT_MS = 12_000;

/**
 * Tells iOS what a valid password looks like here, so the generated one is
 * accepted by our own rule rather than rejected after the user picks it.
 */
const PASSWORD_RULES = `minlength: ${MIN_PASSWORD};`;

export default function SignupScreen() {
  const router = useRouter();
  const { refresh: refreshProfile } = useAuth();
  const { submit: submitOnboarding, update: updateOnboarding } = useOnboardingStore();

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef  = useRef<TextInput>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fullName, setFullName]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [problem, setProblem]           = useState<AuthErrorInfo | null>(null);
  const [confirmationSent, setConfirmationSent] = useState('');

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  // Live, not on submit. Shown only once the field has been engaged with, so
  // the form does not open covered in complaints about empty boxes.
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const confirmMismatch  = confirm.length > 0 && confirm !== password;

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD &&
    confirm === password &&
    !loading;

  async function handleSignUp() {
    if (!canSubmit) return;
    hapticLight();
    setLoading(true);
    setProblem(null);

    let signUpError: unknown = null;
    let result: Awaited<ReturnType<typeof auth.signUp>> | null = null;
    try {
      result = await auth.signUp(email.trim().toLowerCase(), password, fullName.trim());
      signUpError = result.error;
    } catch (err) {
      signUpError = err;
    }

    if (signUpError) {
      const info = describeAuthError(signUpError);
      setProblem(info);
      setLoading(false);
      hapticError();
      if (info.field === 'email') emailRef.current?.focus();
      if (info.field === 'password') passwordRef.current?.focus();
      return;
    }

    const data = result?.data;
    if (!data?.user) {
      setProblem({
        title: 'Account not created',
        message: 'Something went wrong on our end. Please try again in a moment.',
        retryable: true,
      });
      setLoading(false);
      hapticError();
      return;
    }

    if (!data.session) {
      // Confirmation required: no session exists until the link is opened.
      // Navigating anywhere here would strand the user behind the auth guard.
      hapticSuccess();
      setConfirmationSent(email.trim().toLowerCase());
      setLoading(false);
      return;
    }

    updateOnboarding({ fullName: fullName.trim() });
    const { error: submitError } = await submitOnboarding(data.user.id);
    if (submitError) {
      // Without onboarding_complete the layout guard loops back to onboarding,
      // so say what happened rather than bouncing the user silently.
      setProblem({
        title: 'Account created, details not saved',
        message: `${submitError}. Sign in and we will pick up where you left off.`,
        retryable: true,
      });
      setLoading(false);
      hapticError();
      return;
    }

    hapticSuccess();
    await refreshProfile();
    // _layout redirects once profile.onboarding_complete is true. Guard against
    // that not happening rather than spinning indefinitely.
    timeoutRef.current = setTimeout(() => setLoading(false), NAVIGATE_TIMEOUT_MS);
  }

  // ── Confirmation sent ──────────────────────────────────────────────────────
  if (confirmationSent) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AuroraBackground style={styles.confirmRoot}>
          <SafeAreaView style={styles.confirmSafe} edges={['top', 'bottom']}>
            <View style={styles.confirmBody}>
              <View style={styles.confirmIcon}>
                <Ionicons name="mail-outline" size={30} color={Aurora.glowSoft} />
              </View>
              <Text style={styles.confirmTitle} accessibilityRole="header">Check your email</Text>
              <Text style={styles.confirmText}>
                We sent a confirmation link to
              </Text>
              <Text style={styles.confirmEmail}>{confirmationSent}</Text>
              <Text style={styles.confirmText}>
                Open it to activate your account, then come back and sign in.
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmPrimary}
                onPress={() => router.replace('/auth/login')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Go to sign in"
              >
                <Text style={styles.confirmPrimaryText}>Go to sign in</Text>
              </TouchableOpacity>
              <Text style={styles.confirmHint}>
                No email after a minute? Check your spam folder.
              </Text>
            </View>
          </SafeAreaView>
        </AuroraBackground>
      </View>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="light" />

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
            <Text style={styles.headline} accessibilityRole="header">Create your account</Text>
            <Text style={styles.subhead}>Free to start. No card required.</Text>
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
                {problem.field === 'email' && problem.title.includes('already') && (
                  <Link href="/auth/login" asChild>
                    <TouchableOpacity accessibilityRole="link" style={styles.problemAction}>
                      <Text style={styles.problemActionText}>Sign in instead →</Text>
                    </TouchableOpacity>
                  </Link>
                )}
              </View>
            </View>
          )}

          <FormField
            label="Full name"
            value={fullName}
            onChangeText={t => { setFullName(t); if (problem) setProblem(null); }}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            autoComplete="name"
            placeholder="Jane Smith"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            submitBehavior="submit"
            accessibilityLabel="Full name"
          />

          <FormField
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={t => { setEmail(t); if (problem) setProblem(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
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
            // newPassword is what triggers iOS strong-password generation and
            // the offer to save to the keychain.
            textContentType="newPassword"
            passwordRules={PASSWORD_RULES}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            submitBehavior="submit"
            hint={password.length === 0 ? `${MIN_PASSWORD} characters minimum` : undefined}
            error={passwordTooShort
              ? `${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'} needed`
              : undefined}
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

          <FormField
            ref={confirmRef}
            label="Confirm password"
            value={confirm}
            onChangeText={t => { setConfirm(t); if (problem) setProblem(null); }}
            // Mirrors the password field's visibility — one toggle for both, so
            // a user checking their typing does not have to tap twice.
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            passwordRules={PASSWORD_RULES}
            placeholder="Re-enter password"
            returnKeyType="go"
            onSubmitEditing={handleSignUp}
            error={confirmMismatch ? 'These do not match' : undefined}
            accessibilityLabel="Confirm password"
          />

          <TouchableOpacity
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={handleSignUp}
            disabled={!canSubmit}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Create account"
            accessibilityState={{ disabled: !canSubmit, busy: loading }}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.submitText}>Create account</Text>}
          </TouchableOpacity>

          <Text style={styles.terms}>
            By signing up you agree to our{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://helochero.com/terms')}>
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://helochero.com/privacy')}>
              Privacy Policy
            </Text>
            . HELOC Hero provides projections and education, not financial advice,
            and is not a lender.
          </Text>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/auth/login" asChild>
              <TouchableOpacity accessibilityRole="link" accessibilityLabel="Sign in">
                <Text style={styles.footerLink}>Sign in</Text>
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
  headerBody: { paddingHorizontal: Spacing[5], gap: Spacing[3] },
  headline: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: '#ffffff',
    letterSpacing: -0.6,
  },
  subhead: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.62)' },

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
  problemAction: { minHeight: 36, justifyContent: 'center', marginTop: Spacing[1] },
  problemActionText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },

  eye: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },

  submit: {
    backgroundColor: Colors.mint600,
    borderRadius: Radius.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[2],
    ...Shadows.glow,
  },
  submitDisabled: { opacity: 0.4, shadowOpacity: 0 },
  submitText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },

  terms: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: Spacing[5],
  },
  termsLink: { color: Colors.mint700, fontWeight: Typography.medium },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing[5],
    minHeight: 44,
  },
  footerText: { color: Colors.textSecondary, fontSize: Typography.sm },
  footerLink: { color: Colors.mint700, fontSize: Typography.sm, fontWeight: Typography.semibold },

  // ── Confirmation ───────────────────────────────────────────────────────────
  confirmRoot: { flex: 1, backgroundColor: Aurora.deepest },
  confirmSafe: { flex: 1, paddingHorizontal: Spacing[6] },
  confirmBody: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing[3] },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74,222,128,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.28)',
    marginBottom: Spacing[2],
  },
  confirmTitle: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#ffffff',
    textAlign: 'center',
  },
  confirmText: {
    fontSize: Typography.base,
    color: 'rgba(255,255,255,0.66)',
    textAlign: 'center',
    lineHeight: 24,
  },
  confirmEmail: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: '#ffffff',
    textAlign: 'center',
  },
  confirmActions: { paddingBottom: Spacing[4], gap: Spacing[3] },
  confirmPrimary: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.full,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPrimaryText: {
    color: Aurora.deepest,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  confirmHint: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.46)',
    textAlign: 'center',
  },
});
