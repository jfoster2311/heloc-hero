// supabase/functions/safe-sweep/index.ts
// Runs the Safe Sweep™ + Safe Dump™ automation for a user (Full tier only)
// Called on a schedule via Supabase pg_cron, or manually by the app
// POST body: { userId }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { sendNotificationToUser, notificationTemplates } from "../_shared/notifications.ts";

interface PlaidAccount {
  account_id: string;
  balances: { current: number; available: number | null; limit: number | null };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId } = await req.json();
    if (!userId) return errorResponse("userId is required");

    const supabase = getAdminClient();

    // Verify Full tier
    const { data: user } = await supabase
      .from("users")
      .select("subscription_tier")
      .eq("id", userId)
      .single();

    if (user?.subscription_tier !== "full") {
      return errorResponse("Safe Sweep requires Full tier subscription", 403);
    }

    // Load automation settings + accounts in parallel
    const [settingsRes, accountsRes] = await Promise.all([
      supabase.from("automation_settings").select("*").eq("user_id", userId).single(),
      supabase.from("plaid_accounts").select("*").eq("user_id", userId),
    ]);

    if (!settingsRes.data) {
      return errorResponse("Automation settings not configured", 404);
    }

    const settings = settingsRes.data;
    const accounts = accountsRes.data ?? [];

    const savingsRow = accounts.find((a: any) => a.account_type === "savings");
    const helocRow = accounts.find((a: any) => a.account_type === "home equity");
    const mortgageRow = accounts.find((a: any) => a.account_type === "mortgage");

    const savingsAcct: PlaidAccount | undefined = savingsRow?.accounts?.[0];
    const helocAcct: PlaidAccount | undefined =
      helocRow?.accounts?.find((a: PlaidAccount) => a.balances.limit != null) ??
      helocRow?.accounts?.[0];
    const mortgageAcct: PlaidAccount | undefined = mortgageRow?.accounts?.[0];

    const results: Record<string, unknown> = {};

    // ── Safe Sweep™ ───────────────────────────────────────────────────────────
    if (settings.safe_sweep_enabled && savingsAcct && helocAcct) {
      const available = savingsAcct.balances.available ?? savingsAcct.balances.current;
      const sweepAmount = Math.max(
        0,
        available - settings.buffer_target - settings.upcoming_bills_estimate,
      );

      if (sweepAmount >= 100) {
        // Log the sweep run
        await supabase.from("automation_runs").insert({
          user_id: userId,
          run_type: "sweep",
          amount: sweepAmount,
          status: "completed",
        });

        // Send push notification
        const tpl = notificationTemplates.savingsAccountAlert();
        await sendNotificationToUser(userId, { title: tpl.title, body: tpl.body }, tpl.data);

        results.sweep = { amount: sweepAmount, status: "completed" };
      } else {
        results.sweep = { amount: 0, status: "skipped", reason: "insufficient_surplus" };
      }
    }

    // ── Safe Dump™ ────────────────────────────────────────────────────────────
    if (settings.safe_dump_enabled && helocAcct && mortgageAcct) {
      const helocBalance = helocAcct.balances.current;
      const helocLimit = helocAcct.balances.limit ?? 0;
      const helocAvailable = helocLimit - helocBalance;

      // Get accumulated sweep amount from recent runs
      const { data: recentRuns } = await supabase
        .from("automation_runs")
        .select("amount")
        .eq("user_id", userId)
        .eq("run_type", "sweep")
        .eq("status", "completed")
        .gte("ran_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const accumulated = (recentRuns ?? []).reduce(
        (sum: number, r: { amount: number }) => sum + r.amount, 0,
      );

      const dumpAmount =
        accumulated >= settings.min_dump_amount
          ? Math.min(accumulated, helocAvailable)
          : 0;

      if (dumpAmount >= settings.min_dump_amount) {
        await supabase.from("automation_runs").insert({
          user_id: userId,
          run_type: "dump",
          amount: dumpAmount,
          status: "completed",
        });

        const tpl = notificationTemplates.helocDumpAlert();
        await sendNotificationToUser(userId, { title: tpl.title, body: tpl.body }, tpl.data);

        results.dump = { amount: dumpAmount, status: "completed" };
      } else {
        results.dump = {
          amount: 0,
          status: "skipped",
          reason: `accumulated ${accumulated} < min ${settings.min_dump_amount}`,
        };
      }
    }

    return jsonResponse({ success: true, results });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
