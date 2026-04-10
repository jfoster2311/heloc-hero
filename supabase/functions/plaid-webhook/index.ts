// supabase/functions/plaid-webhook/index.ts
// Deploy with: supabase functions deploy plaid-webhook --no-verify-jwt
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const body = await req.json();
  const { webhook_type, webhook_code, item_id } = body;

  // Only handle balance/transaction updates
  if (webhook_type !== 'TRANSACTIONS' && webhook_type !== 'ITEM') {
    return new Response('ignored', { status: 200 });
  }

  const supabase = createServiceClient();

  // Find the linked account with this item_id
  const { data: account } = await supabase
    .from('linked_accounts')
    .select('id, user_id, plaid_access_token')
    .eq('plaid_item_id', item_id)
    .single();

  if (!account) {
    return new Response('not found', { status: 404 });
  }

  // Re-fetch balances from Plaid and update the record
  const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox';
  const plaidBase = PLAID_ENV === 'production'
    ? 'https://production.plaid.com'
    : PLAID_ENV === 'development'
    ? 'https://development.plaid.com'
    : 'https://sandbox.plaid.com';

  const plaidRes = await fetch(`${plaidBase}/accounts/balance/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('PLAID_CLIENT_ID'),
      secret:    Deno.env.get('PLAID_SECRET'),
      access_token: account.plaid_access_token,
    }),
  });

  const { accounts } = await plaidRes.json();

  await supabase
    .from('linked_accounts')
    .update({ accounts, accounts_updated_at: new Date().toISOString() })
    .eq('id', account.id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
