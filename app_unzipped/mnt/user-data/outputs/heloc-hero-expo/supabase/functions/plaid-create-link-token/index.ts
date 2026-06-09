// supabase/functions/plaid-create-link-token/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PlaidClient } from "../_shared/plaid.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const { userId, products } = await req.json();
    if (!userId) return errorResponse("userId is required");
    const plaid = new PlaidClient();
    return jsonResponse(await plaid.createLinkToken(userId, products));
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
