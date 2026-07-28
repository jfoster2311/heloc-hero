// supabase/functions/delete-account/index.ts
// Deletes all data for the authenticated user, revokes their Plaid items,
// then removes the auth account. Requires service-role key in env.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PlaidClient } from "../_shared/plaid.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

// Tables keyed by user_id. plaid_accounts / linked_accounts / automation_settings /
// notifications cascade from public.users, but we delete them explicitly so that
// access tokens are gone even if the auth-user delete later fails.
// user_profiles and plaid_items are legacy tables with no FK cascade.
// `transactions` is listed first and deliberately: it is the most sensitive
// thing the app stores, and "Delete my data" has to be true about it.
const USER_TABLES = [
  // The annotation tables come before `transactions`, which they cascade from.
  // Either order works, but this way each is a real delete rather than a no-op
  // that happens to be covered — the point of listing tables explicitly is that
  // the sweep does not depend on the cascade being right.
  "transaction_meta",
  "transaction_categories",
  "category_budgets",
  "transactions",
  "plaid_accounts",
  "linked_accounts",
  "automation_settings",
  "automation_log",
  "notifications",
  "user_profiles",
  "plaid_items",
] as const;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Missing authorization header", 401);
  }
  const jwt = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  // User-scoped client to resolve the caller's identity from their JWT
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return errorResponse("Unauthorized", 401);
  }
  const userId = user.id;

  const admin = getAdminClient();

  // 1. Revoke Plaid items BEFORE deleting the rows that hold the access tokens.
  //    A failure here must not block deletion — the user's right to erasure does
  //    not depend on a third party being reachable — but it is reported back so
  //    orphaned (and still-billed) items are observable rather than silent.
  let plaidRemoved = 0;
  const plaidFailures: string[] = [];
  try {
    const { data: plaidRows, error: plaidReadErr } = await admin
      .from("plaid_accounts")
      .select("access_token, item_id")
      .eq("user_id", userId);

    if (plaidReadErr) {
      plaidFailures.push(`read plaid_accounts: ${plaidReadErr.message}`);
    } else if (plaidRows?.length) {
      const plaid = new PlaidClient();
      for (const row of plaidRows) {
        if (!row.access_token) continue;
        try {
          await plaid.removeItem(row.access_token);
          plaidRemoved++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown error";
          plaidFailures.push(`item ${row.item_id ?? "?"}: ${msg}`);
          console.error(`delete-account: Plaid item removal failed for ${userId}:`, msg);
        }
      }
    }
  } catch (err) {
    // PlaidClient throws when PLAID_CLIENT_ID / PLAID_SECRET are unset.
    const msg = err instanceof Error ? err.message : "unknown error";
    plaidFailures.push(`plaid client: ${msg}`);
    console.error("delete-account: Plaid client unavailable:", msg);
  }

  // 2. Delete the user's rows. Unlike before, a failure here is fatal: telling a
  //    user their data is gone when it is not would be a false claim.
  for (const table of USER_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) {
      console.error(`delete-account: failed to delete from ${table}:`, error.message);
      return errorResponse(`Failed to delete ${table}: ${error.message}`, 500);
    }
  }

  const { error: usersError } = await admin.from("users").delete().eq("id", userId);
  if (usersError) {
    console.error("delete-account: failed to delete users row:", usersError.message);
    return errorResponse(`Failed to delete profile: ${usersError.message}`, 500);
  }

  // 3. Remove the auth user last, so a failure above leaves the account intact
  //    and the request retryable.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return errorResponse(`Failed to delete auth user: ${deleteUserError.message}`, 500);
  }

  return jsonResponse({
    success: true,
    plaid_items_removed: plaidRemoved,
    plaid_removal_failures: plaidFailures,
  });
});
