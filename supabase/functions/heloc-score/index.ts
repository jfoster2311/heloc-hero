// supabase/functions/heloc-score/index.ts
//
// ⚠️ SUPERSEDED AND UNCALLED. Do not deploy or wire this up as-is.
//
// This implements the ORIGINAL score — 55 surplus / 25 utilization / 20 credit
// / ±10 LTV modifier — which app/lib/helocScore.ts no longer uses. The client
// formula was rewritten (45 / 25 / 20 / 10, normalised over applicable factors
// only) and the two now return different numbers for the same user.
//
// Nothing in the app calls this: `grep invokeFunction` finds no reference, and
// the score is computed on-device from figures the client already has. It is
// left in place rather than deleted because it may still be deployed, and a
// deployed-but-absent function is harder to reason about than a marked one.
//
// If a server-side score is ever wanted, the fix is NOT to port the new formula
// here — two implementations of one score is precisely the divergence this
// codebase keeps having to undo. Move `computeHelocScore` somewhere both can
// import, or have the client send its inputs.
//
// Also note: the "™" below is not a mark this project holds. Removed everywhere
// else in the app; left here only because this file is dormant.
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

  // Fetch user profile and accounts
  const [{ data: profile }, { data: accounts }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('linked_accounts').select('*').eq('user_id', user.id),
  ]);

  if (!profile) return new Response('Profile not found', { status: 404 });

  const helocAccount  = (accounts ?? []).find((a: any) => a.account_type === 'home equity');
  const helocBalance  = helocAccount?.accounts?.[0]?.balances?.current ?? 0;
  const helocLimit    = helocAccount?.accounts?.[0]?.balances?.limit ?? 0;

  const monthlyIncome   = profile.monthly_income ?? 0;
  const monthlyExpenses = profile.monthly_expenses ?? 0;
  const creditScore     = profile.credit_score ?? 700;
  const homeValue       = profile.home_value ?? 0;
  const mortgageBalance = (accounts ?? [])
    .find((a: any) => a.account_type === 'mortgage')
    ?.accounts?.[0]?.balances?.current ?? 0;

  // --- Score calculation ---
  const surplusPct      = monthlyIncome > 0 ? (monthlyIncome - monthlyExpenses) / monthlyIncome : 0;
  const surplusScore    = Math.min(55, Math.round(Math.max(0, surplusPct) * 110));
  const utilization     = helocLimit > 0 ? helocBalance / helocLimit : 0;
  const utilizationScore = Math.round((1 - Math.min(utilization, 1)) * 25);
  const creditNorm      = Math.max(0, Math.min(1, (creditScore - 580) / 220));
  const creditPoints    = Math.round(creditNorm * 20);
  const ltv             = homeValue > 0 ? mortgageBalance / homeValue : 1;
  const mteModifier     = ltv <= 0.60 ? 10 : ltv <= 0.75 ? 5 : ltv <= 0.85 ? 0 : -10;
  const total           = Math.max(0, Math.min(100, surplusScore + utilizationScore + creditPoints + mteModifier));

  const label = total >= 80 ? 'Excellent' : total >= 60 ? 'Good' : total >= 40 ? 'Fair' : 'Needs Work';

  return new Response(
    JSON.stringify({ total, surplusScore, utilizationScore, creditPoints, mteModifier, label }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
