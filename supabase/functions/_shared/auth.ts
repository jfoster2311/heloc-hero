// supabase/functions/_shared/auth.ts — who is actually calling.
//
// Every function here runs with the SERVICE ROLE, which bypasses RLS entirely.
// That is necessary — they read Vault secrets and write rows on the user's
// behalf — and it means the row-level policies protecting this data in every
// other context do not apply. The only thing standing between one user's money
// and another's is an explicit check, in the function, that the caller is who
// they say they are.
//
// Four functions did that check and five did not. The five took `userId`
// straight from the request body and acted on it, so any authenticated user
// could name someone else's id. plaid-get-balances was the worst of them: it
// ends by returning the named user's entire `linked_accounts` row set —
// balances, account names, masks, and the servicer liabilities blob with the
// mortgage rate, escrow and next payment due.
//
// The check lives here rather than being copied a sixth time so that the next
// function inherits it instead of re-deciding it.
import { getAdminClient } from "./supabase.ts";
import { errorResponse } from "./cors.ts";

/**
 * The authenticated caller's user id, or a Response to return immediately.
 *
 * Validates the bearer token against Supabase Auth rather than decoding it
 * locally — an unverified JWT is a claim, not an identity.
 */
export async function callerId(req: Request): Promise<string | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return errorResponse("Missing authorization", 401);

  const { data, error } = await getAdminClient().auth.getUser(token);
  if (error || !data?.user) return errorResponse("Invalid authorization", 401);
  return data.user.id;
}

/**
 * Guard for the `{ userId }` request-body pattern.
 *
 * Returns a Response when the request must be refused, or null to proceed.
 * Deliberately does NOT reveal whether the named user exists — the refusal is
 * identical for "not you" and "no such account".
 *
 * Prefer `callerId` for new functions and drop the body field entirely: an id
 * that is never read cannot be forged. This exists for the endpoints whose
 * request shape is already in a shipped client.
 */
export async function requireSelf(req: Request, userId: unknown): Promise<Response | null> {
  const caller = await callerId(req);
  if (caller instanceof Response) return caller;
  if (typeof userId !== "string" || caller !== userId) {
    return errorResponse("Not authorized for this user", 403);
  }
  return null;
}
