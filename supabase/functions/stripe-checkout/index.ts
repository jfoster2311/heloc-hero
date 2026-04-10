// supabase/functions/stripe-checkout/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { tier } = await req.json();
  const priceId = tier === 'full'
    ? Deno.env.get('STRIPE_PRICE_FULL')
    : Deno.env.get('STRIPE_PRICE_MEDIUM');

  if (!priceId) return new Response('Invalid tier', { status: 400 });

  const { data: profile } = await supabase.from('users').select('stripe_customer_id, email').eq('id', user.id).single();

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;

  // Create or retrieve Stripe customer
  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const custRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ email: profile?.email ?? user.email ?? '' }),
    });
    const cust = await custRes.json();
    customerId = cust.id;
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  // Create checkout session
  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: 'heloc-hero://upgrade-success',
      cancel_url:  'heloc-hero://upgrade-cancel',
    }),
  });

  const session = await sessionRes.json();

  return new Response(
    JSON.stringify({ url: session.url, session_id: session.id }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
