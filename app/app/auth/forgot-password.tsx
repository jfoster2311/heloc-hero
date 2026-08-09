// app/auth/forgot-password.tsx — request a reset link.
//
// Rebuilt with login and signup so the three screens are one flow rather than
// three eras of the codebase. Beyond the shared fixes (aurora header, safe
// areas, FormField, honest errors, haptics), one change specific to this
// screen:
//
// The old success copy read "reset link sent to {email}". That confirms whether
// an address has an account here, to anyone holding the phone. Supabase's
// resetPasswordForEmail deliberately succeeds either way for exactly that
// reason, so the UI was leaking a distinction the API was careful not to make.
// The copy is now conditional — "if an account exists" — which is both safer
// and, unlike the old line, true.
import { useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Touchable } from '../../components/ui/press';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AuroraBackground from '../../components/Aurora';
import FormField from '../../components/ui/FormField';
import { auth } from '../../lib/supabase';
import { describeAuthError, type AuthErrorInfo } from '../../lib/authErrors';
import { hapticLight, hapticError, hapticSuccess } from '../../lib/haptics';
import { Typography, Spacing, Radius, Aurora, OnDark } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState('');
  const [problem, setProblem] = useState<AuthErrorInfo | null>(null);

  const canSubmit = email.trim().length > 0 && !loading;

  async function handleReset() {
    if (!canSubmit) return;
    hapticLight();
    setLoading(true);
    setProblem(null);

    const address = email.trim().toLowerCase();
    let resetError: unknown = null;
    try {
      const { error } = await auth.resetPassword(address);
      resetError = error;
    } catch (err) {
      resetError = err;
    }
    setLoading(false);

    if (resetError) {
      setProblem(describeAuthError(resetError));
      hapticError();
      return;
    }
    hapticSuccess();
    setSent(address);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <AuroraBackground style={styles.header} intensity={0.75}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerBar}>
            <Touchable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/auth/login'))}
              style={styles.back}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={24} color={OnDark.primary} />
            </Touchable>
          </View>
          <View style={styles.headerBody}>
            <Text style={styles.headline} accessibilityRole="header">Reset your password</Text>
            <Text style={styles.subhead}>
              We'll email you a link to set a new one.
            </Text>
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
          // NO `keyboardDismissMode="on-drag"` here, deliberately.
          //
          // It is right on the long scrolling tabs — you are reading, and the
          // keyboard is in the way. It is actively hostile on a credential
          // form: this content barely overflows, so combined with the
          // KeyboardAvoidingView's padding shift the smallest vertical travel
          // counts as a drag. That includes the few points of movement in an
          // ordinary tap into a field, so the keyboard dismisses on the way IN
          // to the box the user just aimed at.
          //
          // `keyboardShouldPersistTaps` below is the one that matters here: it
          // is what lets the submit button be tapped while the keyboard is up.
          //
          // This is a SECOND cause of the same symptom d39c265 fixed by scoping
          // GestureHandlerRootView to the tabs. That fix was correct and is
          // still in place; it was not the whole story.
          showsVerticalScrollIndicator={false}
        >
          {sent ? (
            <>
              <View style={styles.sent} accessibilityLiveRegion="polite">
                <Ionicons name="mail-outline" size={20} color={colors.accentInk} style={styles.sentIcon} />
                <View style={styles.flex}>
                  <Text style={styles.sentTitle}>Check your inbox</Text>
                  <Text style={styles.sentText}>
                    If an account exists for {sent}, a reset link is on its way. It
                    expires in an hour.
                  </Text>
                </View>
              </View>

              <Touchable
                style={styles.submit}
                onPress={() => { router.replace('/auth/login'); }}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
              >
                <Text style={styles.submitText}>Back to sign in</Text>
              </Touchable>

              <Touchable
                style={styles.secondary}
                onPress={() => { setSent(''); setProblem(null); }}
                accessibilityRole="button"
                accessibilityLabel="Use a different email address"
              >
                <Text style={styles.secondaryText}>Use a different email</Text>
              </Touchable>
            </>
          ) : (
            <>
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
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                placeholder="you@example.com"
                returnKeyType="send"
                onSubmitEditing={handleReset}
                invalid={problem?.field === 'email'}
                accessibilityLabel="Email address"
              />

              <Touchable
                style={[styles.submit, !canSubmit && styles.submitDisabled]}
                onPress={handleReset}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Send reset link"
                accessibilityState={{ disabled: !canSubmit, busy: loading }}
              >
                {loading
                  ? <ActivityIndicator color={colors.onAccent} />
                  : <Text style={styles.submitText}>Send reset link</Text>}
              </Touchable>

              <Touchable
                style={styles.secondary}
                onPress={() => { router.replace('/auth/login'); }}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
              >
                <Text style={styles.secondaryText}>Back to sign in</Text>
              </Touchable>
            </>
          )}
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
  headerBody: { paddingHorizontal: Spacing[5], gap: Spacing[2] },
  headline: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: OnDark.primary,
    letterSpacing: -0.4,
  },
  subhead: { fontSize: Typography.sm, color: OnDark.secondary, lineHeight: 20 },

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
  problemTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.textPrimary },
  problemText: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18, marginTop: 2 },

  sent: {
    flexDirection: 'row',
    gap: Spacing[3],
    backgroundColor: t.colors.mint50,
    borderRadius: Radius.md,
    padding: Spacing[4],
    marginBottom: Spacing[5],
    borderLeftWidth: 3,
    borderLeftColor: t.colors.mint600,
  },
  sentIcon: { marginTop: 1 },
  sentTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: t.colors.mint700 },
  sentText: { fontSize: Typography.xs, color: t.colors.textSecondary, lineHeight: 18, marginTop: 2 },

  submit: {
    backgroundColor: t.colors.mint600,
    borderRadius: Radius.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[2],
    ...t.shadows.glow,
  },
  submitDisabled: { opacity: 0.4, shadowOpacity: 0 },
  submitText: { color: t.colors.onAccent, fontSize: Typography.base, fontWeight: Typography.bold },

  secondary: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[3],
  },
  secondaryText: { color: t.colors.mint700, fontSize: Typography.sm, fontWeight: Typography.semibold },
}));
