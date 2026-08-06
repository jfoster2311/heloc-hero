// supabase/functions/_shared/notifications.ts — delivering a prompt to a device.
//
// The absence of this file is why HELOC Hero had no push: the old
// `send-notification` function imported it, it did not exist, so that function
// could never deploy — and it was deleted rather than fixed. Reminders were
// local-only as a result, which is fine for anything predictable from a date
// and useless for "your balance just crossed the line".
//
// The caller now is plaid-webhook, which is the right place: it already knows
// the moment a balance moved, so there is nothing for a separate sender to be
// told.
//
// Delivery goes through Expo's push service rather than APNs directly. Expo
// holds the APNs credential, so nothing here handles certificates or JWT
// signing — which matters because an Edge Function is a bad place to keep a
// p8 key.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo caps a request at 100 messages. Chunking is required, not an optimisation. */
const MAX_BATCH = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: number;
  /** Tokens Expo rejected as dead. The caller should delete these. */
  invalidTokens: string[];
  error?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends one message to many tokens.
 *
 * Returns which tokens are dead rather than deleting them here: this module has
 * no database handle by design, so it stays testable and has one job. The
 * caller owns the cleanup.
 *
 * Never throws. A push that fails must not take down the webhook that triggered
 * it — the balance update is the important work, and the notification is the
 * garnish. A thrown error here would return a non-2xx to Plaid and earn a
 * retry of the whole sync.
 */
export async function sendPush(
  tokens: string[],
  message: PushMessage,
): Promise<PushResult> {
  const valid = tokens.filter(isExpoPushToken);
  if (valid.length === 0) return { sent: 0, invalidTokens: [] };

  let sent = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < valid.length; i += MAX_BATCH) {
    const chunk = valid.slice(i, i + MAX_BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Expo compresses responses for large batches; being explicit avoids
          // a surprise when a ticket array comes back gzipped.
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(
          chunk.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            sound: "default",
          })),
        ),
      });

      if (!res.ok) {
        return { sent, invalidTokens, error: `Expo push HTTP ${res.status}` };
      }

      const payload = await res.json() as { data?: ExpoTicket[]; errors?: unknown };
      const tickets = payload.data ?? [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") {
          sent++;
          return;
        }
        // The one error worth acting on. It means the app was uninstalled or
        // the token was reissued; keeping it would send into the void forever
        // and Expo eventually rate-limits a sender that keeps doing so.
        if (ticket.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(chunk[idx]);
        }
      });
    } catch (err) {
      return {
        sent,
        invalidTokens,
        error: err instanceof Error ? err.message : "Push request failed",
      };
    }
  }

  return { sent, invalidTokens };
}

/**
 * Shape check before spending a network round trip.
 *
 * Expo rejects the whole batch if any recipient is malformed, so one bad row in
 * the table would otherwise silence every other device on the same send.
 */
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}
