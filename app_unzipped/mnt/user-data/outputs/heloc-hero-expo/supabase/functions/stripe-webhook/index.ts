// supabase/functions/stripe-webhook/index.ts
// Handles Stripe webhook events to update user subscription tiers
// Must be registered in Stripe dashboard as a webhook endpoint
// No JWT verification — Stripe calls this directly

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// Simple Stripe signature verification
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const parts = signature.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.slice(2);
  const v1 = parts.find(p => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return expected === v1;
}

const TIER_MAP: Record<string, string> = {
  [Deno.env.get("STRIPE_PRICE_MEDIUM") ?? ""]: "medium",
  [Deno.env.get("STRIPE_PRICE_FULL") ?? ""]: "full",
};

Deno.serve(async (req: Request) => {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  const isValid = await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(payload);
  const supabase = getAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.supabase_user_id;
      const tier = session.metadata?.tier;

      if (userId && tier) {
        await supabase.from("users")
          .update({ subscription_tier: tier })
          .eq("id", userId);
      }
      break;
    }

    case "customer.subscription.deleted":
    case "customer.subscription.paused": {
      const sub = event.data.object;
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        await supabase.from("users")
          .update({ subscription_tier: "free" })
          .eq("id", userId);
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const userId = sub.metadata?.supabase_user_id;
      const priceId = sub.items?.data?.[0]?.price?.id;
      const newTier = TIER_MAP[priceId];

      if (userId && newTier) {
        await supabase.from("users")
          .update({ subscription_tier: newTier })
          .eq("id", userId);
      }
      break;
    }

    default:
      console.log("Unhandled Stripe event:", event.type);
  }

  return jsonResponse({ received: true });
});
