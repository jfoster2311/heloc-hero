// supabase/functions/_shared/plaidWebhook.ts — proving a webhook came from Plaid.
//
// plaid-webhook is deployed --no-verify-jwt, because Plaid is not a Supabase
// user and cannot present a Supabase JWT. That makes it a PUBLIC endpoint: it
// looks an item up by the `item_id` in the body and then syncs transactions and
// mutates item state. Without this check, anyone who presents a valid item_id
// drives that machinery.
//
// ── The algorithm, and the three ways to get it wrong ──────────────────────
// Plaid signs each webhook with an ES256 JWT in the `Plaid-Verification`
// header. Verifying it means:
//
//   1. read `kid` from the JWT header and fetch that public key from Plaid
//   2. verify the signature against it
//   3. compare the `request_body_sha256` claim to a hash of the body
//
// Each step has a trap:
//
//   · Step 1 must REJECT any `alg` other than ES256 before doing anything else.
//     A JWT header is attacker-controlled; honouring `alg: none`, or treating
//     an HS256 token as valid by verifying it against the public key as a
//     shared secret, is the classic algorithm-confusion forgery.
//
//   · Step 3 must hash the RAW request body — the exact bytes Plaid signed.
//     Parsing to JSON and re-serialising produces a different string (key
//     order, whitespace, unicode escapes) and a hash that never matches, so
//     the caller has to read the body as text ONCE and pass that same string
//     both here and to JSON.parse.
//
//   · A signature that verifies is not enough on its own. Without the body
//     hash, any past webhook's header could be replayed over a new body; and
//     without the `iat` window, a captured webhook could be replayed verbatim
//     for as long as its key lives.
//
// Failure is CLOSED. A key we cannot fetch means a webhook we cannot trust,
// and Plaid retries on a non-2xx, so a transient outage costs a delay rather
// than data.
// `import type`, not a value import. PlaidClient is only ever a parameter type
// here, and a value import would pull in plaid.ts — which reads Deno.env at
// module scope — making this file impossible to exercise outside the Deno
// runtime. Erased at compile time, so this module has no runtime imports at all
// and can be tested against a stub client.
import type { PlaidClient, PlaidJwk } from "./plaid.ts";

/** How far out of date `iat` may be. Plaid's own guidance is five minutes. */
const MAX_AGE_SECONDS = 5 * 60;

/**
 * Cache of imported keys, by kid.
 *
 * Plaid rotates keys rather than reissuing them, so a kid maps to one key
 * forever and this never needs invalidating on content — only on age, to bound
 * how long a compromised-then-rotated key stays usable here. Without a cache
 * every webhook costs a round trip to Plaid before any work begins.
 */
const KEY_TTL_MS = 60 * 60 * 1000;
const keyCache = new Map<string, { key: CryptoKey; fetchedAt: number }>();

export interface VerificationResult {
  valid: boolean;
  /** Why it failed, for the log. Never returned to the caller of the webhook. */
  reason?: string;
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function base64UrlToJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(input))) as T;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Length-independent equality.
 *
 * These are hashes rather than secrets, so a timing leak here is of little
 * use to an attacker — but the cost of doing it properly is four lines.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function importKey(jwk: PlaidJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    // Only the four members that define the public point. Plaid also returns
    // `use`, `alg` and `ext`, and passing those through invites WebCrypto to
    // cross-check them against the import parameters — an `ext: true` on a key
    // imported as non-extractable is the kind of mismatch some runtimes reject
    // outright. Nothing here needs them.
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

async function keyFor(plaid: PlaidClient, kid: string): Promise<CryptoKey | null> {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) return cached.key;

  const jwk = await plaid.getWebhookVerificationKey(kid);
  // A rotated-out key still verifies webhooks signed before the rotation, which
  // is why Plaid keeps returning it. It is not a reason to refuse — `iat` below
  // is what bounds how old a signature may be.
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256") return null;

  const key = await importKey(jwk);
  keyCache.set(kid, { key, fetchedAt: Date.now() });
  return key;
}

/**
 * Verify a Plaid webhook.
 *
 * `rawBody` MUST be the exact string read off the request — see the note at the
 * top of this file about re-serialisation.
 */
export async function verifyPlaidWebhook(
  req: Request,
  rawBody: string,
  plaid: PlaidClient,
): Promise<VerificationResult> {
  const token = req.headers.get("Plaid-Verification");
  if (!token) return { valid: false, reason: "missing Plaid-Verification header" };

  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed JWT" };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  try {
    header = base64UrlToJson(headerB64);
  } catch {
    return { valid: false, reason: "unreadable JWT header" };
  }

  // BEFORE anything else. See the algorithm-confusion note at the top.
  if (header.alg !== "ES256") return { valid: false, reason: `unsupported alg ${header.alg}` };
  if (!header.kid) return { valid: false, reason: "no kid" };

  let key: CryptoKey | null;
  try {
    key = await keyFor(plaid, header.kid);
  } catch (err) {
    // Fail closed: an unreachable Plaid means an unverifiable webhook. Plaid
    // retries on non-2xx, so this costs a delay rather than the update.
    return { valid: false, reason: `key fetch failed: ${err instanceof Error ? err.message : err}` };
  }
  if (!key) return { valid: false, reason: "unusable verification key" };

  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  // WebCrypto expects the raw r‖s pair for ECDSA, which is exactly how JWS
  // encodes an ES256 signature — no DER unwrapping needed.
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlToBytes(signatureB64),
    signed,
  );
  if (!ok) return { valid: false, reason: "bad signature" };

  let payload: { iat?: number; request_body_sha256?: string };
  try {
    payload = base64UrlToJson(payloadB64);
  } catch {
    return { valid: false, reason: "unreadable JWT payload" };
  }

  // Replay window. A valid signature stays valid for the life of its key, so
  // without this a captured webhook could be resent verbatim for months.
  const age = Math.floor(Date.now() / 1000) - (payload.iat ?? 0);
  if (!payload.iat || age > MAX_AGE_SECONDS) {
    return { valid: false, reason: `stale webhook (${age}s old)` };
  }

  // Binds the signature to THIS body. Without it, a genuine header from any
  // past webhook could be replayed over an attacker's payload.
  if (!payload.request_body_sha256) return { valid: false, reason: "no body hash in claim" };
  const actual = await sha256Hex(rawBody);
  if (!timingSafeEqual(actual, payload.request_body_sha256)) {
    return { valid: false, reason: "body hash mismatch" };
  }

  return { valid: true };
}
