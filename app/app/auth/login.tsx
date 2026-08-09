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
  View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Touchable } from '../../components/ui/press';
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
import { Typography, Spacing, Radius, Aurora, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

/**
 * If the auth listener has not navigated within this window, something is
 * wrong. Releasing the button is better than a spinner with no end: the user
 * can retry, and the session may well have succeeded anyway.
 */
const NAVIGATE_TIMEOUT_MS = 12_000;

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [problem, setProblem]           = useState<AuthErrorInfo | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  // ── TEMPORARY DIAGNOSTIC — remove once the keyboard bug is localised ──────
  // One question, answered definitively: is the screen being REMOUNTED (a
  // bundle reload, e.g. the tunnel dropping) or is the field merely losing
  // FOCUS while the screen stays put? Those have completely different fixes and
  // three rounds of reading the code has not separated them.
  //
  //   MOUNT abc / UNMOUNT abc / MOUNT xyz   → reload. Transport problem.
  //   MOUNT abc ... shown ... HIDDEN, id unchanged, no UNMOUNT → blur. App bug.
  const diagId = useRef(Math.random().toString(36).slice(2, 7)).current;
  useEffect(() => {
    console.log(`[kbd] MOUNT ${diagId}`);
    // willHide is the one that decides it. It fires when the dismissal is
    // REQUESTED, so its position relative to `pw FOCUS` separates the two
    // remaining stories:
    //
    //   pw FOCUS then willHide  → something blurred the field after it took
    //                             focus. That is the responder-release branch,
    //                             and keyboardShouldPersistTaps is the fix.
    //   willHide then pw FOCUS  → the keyboard was already going down before
    //                             this field was involved, and the cause is
    //                             upstream of the ScrollView entirely.
    //
    // Heights come along because a `shown` at a different height is the AutoFill
    // bar resizing the keyboard, not a fresh presentation.
    const subs = [
      Keyboard.addListener('keyboardDidShow', e =>
        console.log(`[kbd] shown  ${diagId} h=${Math.round(e.endCoordinates.height)}`)),
      Keyboard.addListener('keyboardWillHide', () => console.log(`[kbd] willHide ${diagId}`)),
      Keyboard.addListener('keyboardDidHide', () => console.log(`[kbd] HIDDEN ${diagId}`)),
    ];
    return () => {
      console.log(`[kbd] UNMOUNT ${diagId}`);
      subs.forEach(s => s.remove());
    };
  }, []);

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
            <Touchable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding/welcome'))}
              style={styles.back}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={24} color={OnDark.primary} />
            </Touchable>
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
          // "always", not "handled", and the difference is the whole bug.
          //
          // On responder release ScrollView runs, in effect:
          //
          //   if (keyboardShouldPersistTaps !== 'always' &&
          //       focused != null && e.target !== focused) blurTextInput(focused)
          //
          // It compares the tap target against the focused input and blurs on a
          // mismatch. It never asks whether the target is ITSELF a text input, so
          // moving between two fields takes that branch: email is focused, the
          // tap lands on password, they differ, email is blurred — while password
          // is taking focus. The keyboard goes down in the gap.
          //
          // That is why the symptom is the PASSWORD field and not the email one.
          // The branch needs something already focused to blur; tapping email
          // first finds `focused == null` and does nothing. A bug that only
          // appears on the second field looks like a bug about passwords, and it
          // is not — it is a bug about there being a previous field at all.
          //
          // The cost of "always" is that tapping the background no longer
          // dismisses the keyboard. On a two-field credential form that is not a
          // loss worth having: return chains email → password, `go` submits, and
          // "always" still lets the Sign in button be tapped with the keyboard up,
          // which is the job "handled" was here to do.
          keyboardShouldPersistTaps="always"
          // NO `keyboardDismissMode="on-drag"` here, deliberately.
          //
          // It is right on the long scrolling tabs — you are reading, and the
          // keyboard is in the way. It is hostile on a credential form: this
          // content barely overflows, so combined with the KeyboardAvoidingView's
          // padding shift the smallest vertical travel counts as a drag, and
          // `on-drag` resigns the responder the moment the scroll view begins
          // tracking. An ordinary tap into a field carries a few points of
          // movement, so the keyboard drops on the way IN to the box just aimed
          // at.
          //
          // The instrument commit (0200e5e) settled which kind of bug this is.
          // Four dismissals, one unchanged instance id, no UNMOUNT between them,
          // and BLUR every time BEFORE the keyboard hid: the screen is not
          // reloading, the field is being un-focused while it sits there. Two of
          // the four were preceded by a second `keyboardDidShow` with no hide in
          // between — the keyboard frame changing under the finger (the AutoFill
          // bar), which is the layout shift that turns a resting thumb into a
          // drag. `on-drag` is the only thing on this screen that dismisses a
          // keyboard, and it is now the only remaining candidate.
          //
          // Removing it did NOT fix the symptom on device — the keyboard still
          // dropped on the way into the password field, which is what sent the
          // hunt to `keyboardShouldPersistTaps` above. It stays off anyway: it is
          // wrong on a credential form for the reason given, and a second
          // dismissal path on this screen is a second thing to rule out next time.
          //
          // This is a SECOND cause of the same symptom d39c265 fixed by scoping
          // GestureHandlerRootView to the tabs. That fix was correct and is still
          // in place; it was not the whole story.
          showsVerticalScrollIndicator={false}
        >
          {problem && (
            <View style={styles.problem} accessibilityLiveRegion="assertive">
              <Ionicons
                name={problem.retryable ? 'cloud-offline-outline' : 'alert-circle-outline'}
                size={18}
                color={colors.textSecondary}
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
            onFocus={() => console.log(`[kbd] email FOCUS ${diagId}`)}
            onBlur={() => console.log(`[kbd] email BLUR  ${diagId}`)}
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
            // TEMPORARY — the other half of the instrument. The first round only
            // watched email, so the handoff INTO this field, which is where the
            // symptom actually lives, was the one transition not being logged.
            onFocus={() => console.log(`[kbd] pw    FOCUS ${diagId}`)}
            onBlur={() => console.log(`[kbd] pw    BLUR  ${diagId}`)}
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            invalid={problem?.field === 'password'}
            accessibilityLabel="Password"
            accessory={
              <Touchable
                onPress={() => { setShowPassword(v => !v); }}
                style={styles.eye}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </Touchable>
            }
          />

          <Link href="/auth/forgot-password" asChild>
            <Touchable
              style={styles.forgot}
              accessibilityRole="link"
              accessibilityLabel="Forgot your password"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Touchable>
          </Link>

          <Touchable
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={handleSignIn}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{ disabled: !canSubmit, busy: loading }}
          >
            {loading
              ? <ActivityIndicator color={colors.onAccent} />
              : <Text style={styles.submitText}>Sign in</Text>}
          </Touchable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to HELOC Hero? </Text>
            <Link href="/auth/signup" asChild>
              <Touchable
                style={styles.footerBtn}
                accessibilityRole="link"
                accessibilityLabel="Create an account"
              >
                <Text style={styles.footerLink}>Create an account</Text>
              </Touchable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  flex: { flex: 1 },

  header: { paddingBottom: Spacing[6], backgroundColor: Aurora.deepest },
  headerBar: { height: 44, justifyContent: 'center', paddingHorizontal: Spacing[2] },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerBody: { paddingHorizontal: Spacing[5], gap: Spacing[4] },
  headline: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: OnDark.primary,
    letterSpacing: -0.6,
  },

  content: { padding: Spacing[5], paddingTop: Spacing[6], paddingBottom: Spacing[10] },

  problem: {
    flexDirection: 'row',
    gap: Spacing[3],
    backgroundColor: t.colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing[4],
    marginBottom: Spacing[5],
    borderLeftWidth: 3,
    borderLeftColor: t.colors.gray400,
  },
  problemIcon: { marginTop: 1 },
  problemTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
  },
  problemText: {
    fontSize: Typography.xs,
    color: t.colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },

  // Laid out inside the field by FormField, so no absolute offsets to keep in
  // sync with the label's height.
  eye: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },

  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing[1] },
  forgotText: { color: t.colors.mint700, fontSize: Typography.sm, fontWeight: Typography.medium },

  submit: {
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[4],
    ...t.shadows.glow,
  },
  submitDisabled: { opacity: 0.4, shadowOpacity: 0 },
  submitText: {
    color: t.colors.onAccent,
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
  footerText: { color: t.colors.textSecondary, fontSize: Typography.sm },
  /**
   * The 44pt already on `footer` was the ROW's height, not the link's.
   *
   * The row centres its children, so the touchable stayed exactly as tall as one
   * line of 14pt text and the other ~24pt of that row belonged to nothing. This
   * stretches the link to fill it — the only route from sign-in to sign-up, on
   * the first screen a new user sees.
   */
  footerBtn: { alignSelf: 'stretch', justifyContent: 'center' },
  footerLink: {
    color: t.colors.mint700,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
}));
