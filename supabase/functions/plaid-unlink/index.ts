// supabase/functions/plaid-unlink/index.ts — disconnect ONE institution.
//
// Deleting the row is the easy half and the wrong half on its own. An access
// token that is dropped from the database but never revoked leaves the Item
// live at Plaid: the user believes they disconnected, and the account keeps
// accruing the Liabilities per-item monthly subscription forever. So
// /item/remove goes first, and the rows come out after.
//
// The token is revoked even when the row delete later fails. The reverse order
// would risk orphaning a billable Item with no record of its token anywhere.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, accountType } = await req.json();
    if (!userId) return errorResponse("userId is required");
    if (!accountType) return errorResponse("accountType is required");

    // The caller's JWT must match the user being modified. This function runs
    // with the service role, so without this check any authenticated user
    // could unlink anyone's accounts.
    const supabase = getAdminClient();
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return errorResponse("Missing authorization", 401);

    const { data: caller, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !caller?.user || caller.user.id !== userId) {
      return errorResponse("Not authorized for this user", 403);
    }

    const { data: stored } = await supabase
      .from("plaid_accounts")
      .select("access_token")
      .eq("user_id", userId)
      .eq("account_type", accountType)
      .maybeSingle();

    // Revoke first, so a later failure cannot leave a billable Item behind.
    let revoked = false;
    let revokeError: string | null = null;
    if (stored?.access_token) {
      try {
        const plaid = new PlaidClient();
        await plaid.removeItem(stored.access_token);
        revoked = true;
      } catch (err) {
        // Already-removed items error here; that is still the desired end state.
        revokeError = err instanceof Error ? err.message : "Unknown Plaid error";
        console.warn("item/remove failed:", revokeError);
      }
    }

    const { error: tokenErr } = await supabase
      .from("plaid_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("account_type", accountType);
    if (tokenErr) return errorResponse(`Failed to remove stored token: ${tokenErr.message}`, 500);

    const { error: linkedErr } = await supabase
      .from("linked_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("account_type", accountType);
    if (linkedErr) return errorResponse(`Failed to remove account: ${linkedErr.message}`, 500);

    // Transactions belong to the connection the user just severed. Keeping them
    // would mean "disconnect" left the most sensitive data in place.
    const { error: txnErr } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId)
      .eq("account_type", accountType);
    if (txnErr) return errorResponse(`Failed to remove transactions: ${txnErr.message}`, 500);

    return jsonResponse({ success: true, revoked, revokeError });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
