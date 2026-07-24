// lib/authErrors.ts — turn a Supabase auth failure into something true and useful.
//
// The screens used to collapse every failure into "Invalid email or password."
// That is wrong far more often than it looks: a user on a plane, on hotel
// wi-fi, or hitting a rate limit was told their password was wrong. They then
// do the one thing guaranteed not to help — retype a correct password, fail
// again, and start a password reset they never needed.
//
// Two rules here, and they are the same rule the rest of the app follows:
//   · Never state a cause the response does not establish. If we cannot tell
//     what went wrong, say that plainly instead of guessing at the most
//     embarrassing possibility.
//   · Every message ends in something the user can DO. "Try again" is not an
//     action; "check your connection" and "reset your password" are.

export interface AuthErrorInfo {
  /** Short, plain, no punctuation drama. */
  title: string;
  /** One sentence. What happened, then what to do about it. */
  message: string;
  /**
   * Which field to point at, when the failure is attributable to one. Screens
   * use this to focus the input rather than leaving the user hunting.
   */
  field?: 'email' | 'password';
  /**
   * True when retrying the same input could plausibly work — network blips,
   * rate limits, server errors. Screens keep the form intact and offer a retry
   * instead of implying the credentials were the problem.
   */
  retryable: boolean;
}

/** Anything Supabase or fetch might hand back. */
interface RawAuthError {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

const NETWORK: AuthErrorInfo = {
  title: 'No connection',
  message:
    "We couldn't reach HELOC Hero. Check your internet connection and try again — " +
    'your details were not sent.',
  retryable: true,
};

/**
 * A fetch that never reached the server. Distinguishing this from a rejected
 * credential is the single highest-value thing this module does.
 */
function isNetworkError(err: RawAuthError): boolean {
  const name = (err.name ?? '').toLowerCase();
  const msg  = (err.message ?? '').toLowerCase();
  return (
    name.includes('authretryablefetcherror') ||
    name === 'typeerror' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    // Supabase reports an unreachable server as status 0 / undefined rather
    // than an HTTP code.
    err.status === 0
  );
}

/** Seconds the API asked us to wait, when it says so. */
function retryAfterSeconds(message: string): number | null {
  const m = message.match(/after (\d+) seconds?/i);
  return m ? Number(m[1]) : null;
}

export function describeAuthError(err: unknown): AuthErrorInfo {
  if (!err) {
    return {
      title: 'Something went wrong',
      message: 'Please try again in a moment.',
      retryable: true,
    };
  }

  const e   = err as RawAuthError;
  const msg = (e.message ?? '').toLowerCase();

  if (isNetworkError(e)) return NETWORK;

  // ── Rate limiting ────────────────────────────────────────────────────────
  // Worth its own case because the user is doing nothing wrong and the only
  // useful instruction is a duration.
  if (e.status === 429 || msg.includes('rate limit') || msg.includes('for security purposes')) {
    const secs = retryAfterSeconds(e.message ?? '');
    return {
      title: 'Too many attempts',
      message: secs
        ? `For security, wait ${secs} second${secs === 1 ? '' : 's'} before trying again.`
        : 'Too many attempts in a short time. Wait a minute, then try again.',
      retryable: true,
    };
  }

  // ── Credentials ──────────────────────────────────────────────────────────
  // Deliberately does NOT say which of the two was wrong; that would confirm
  // whether an email has an account here.
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return {
      title: "That didn't match",
      message:
        'We could not sign you in with that email and password. Check them, or reset ' +
        'your password if you are not sure.',
      field: 'password',
      retryable: false,
    };
  }

  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return {
      title: 'Confirm your email first',
      message:
        'We sent a confirmation link when you signed up. Open it, then come back and ' +
        'sign in.',
      field: 'email',
      retryable: false,
    };
  }

  // ── Sign-up ──────────────────────────────────────────────────────────────
  if (
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('user already exists')
  ) {
    return {
      title: 'You already have an account',
      message: 'That email is already registered. Sign in instead, or reset your password.',
      field: 'email',
      retryable: false,
    };
  }

  if (msg.includes('password should be') || msg.includes('password is too weak')) {
    return {
      title: 'Pick a stronger password',
      message: 'Use at least 8 characters. A short phrase you will remember works well.',
      field: 'password',
      retryable: false,
    };
  }

  if (msg.includes('invalid email') || msg.includes('unable to validate email')) {
    return {
      title: 'Check that email address',
      message: "That does not look like an email address we can reach.",
      field: 'email',
      retryable: false,
    };
  }

  // ── Server ───────────────────────────────────────────────────────────────
  if (typeof e.status === 'number' && e.status >= 500) {
    return {
      title: 'Our end, not yours',
      message: 'HELOC Hero is having trouble right now. Please try again in a minute.',
      retryable: true,
    };
  }

  // ── Unknown ──────────────────────────────────────────────────────────────
  // The real message beats an invented one. A user reporting "it said X" is
  // debuggable; a user reporting "it said try again" is not.
  return {
    title: 'Something went wrong',
    message: e.message
      ? `${e.message}. Please try again.`
      : 'Please try again in a moment.',
    retryable: true,
  };
}
