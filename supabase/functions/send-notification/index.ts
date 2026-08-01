// supabase/functions/send-notification/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { notificationTemplates, sendNotificationToUser } from "../_shared/notifications.ts";
import { requireSelf } from "../_shared/auth.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, type } = await req.json();
    if (!userId) return errorResponse("userId is required");

    // Otherwise anyone with an account can push a notification to anyone else's
    // device. These templates talk about moving money, which makes a spoofed
    // one worth more to an attacker than ordinary spam.
    const denied = await requireSelf(req, userId);
    if (denied) return denied;

    const templateMap: Record<string, () => { title: string; body: string; data: Record<string, string> }> = {
      savings: notificationTemplates.savingsAccountAlert,
      heloc: notificationTemplates.helocDumpAlert,
      mortgage: notificationTemplates.mortgageDumpAlert,
    };

    const templateFn = templateMap[type];
    if (!templateFn) return errorResponse("type must be: savings | heloc | mortgage");

    const tpl = templateFn();
    const result = await sendNotificationToUser(userId, { title: tpl.title, body: tpl.body }, tpl.data);

    if (!result.success) return errorResponse(result.error ?? "Failed to send", 500);
    return jsonResponse({ success: true, messageId: result.messageId });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
