// lib/seedDemo.ts — populate a believable mid-strategy demo scenario
// Triggered via long-press on the Settings version footer.
// Uses real Supabase setters so data flows through normal validation/hooks.

import { supabase } from './supabase';

const DEMO_PROFILE = {
  full_name:           'Alex Rivera',
  monthly_income:      9500,
  monthly_expenses:    5200,
  home_value:          620_000,
  mortgage_balance:    387_400,
  mortgage_rate:       0.0685,
  monthly_payment:     2540,
  credit_score:        760,
  onboarding_complete: true,
};

const DEMO_AUTOMATION: Record<string, unknown> = {
  safe_sweep_enabled:       true,
  safe_dump_enabled:        false,
  buffer_target:            3000,
  upcoming_bills_estimate:  600,
  min_dump_amount:          5000,
};

// Four months of successful dumps (mid-strategy state)
function demoDumps(userId: string) {
  const now = new Date();
  return [0, 1, 2, 3].map(monthsAgo => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 15);
    return {
      user_id:    userId,
      action:     'dump',
      amount:     6_500,
      status:     'success',
      note:       'Demo: surplus dump',
      created_at: d.toISOString(),
    };
  });
}

export async function loadDemo(userId: string): Promise<{ error: string | null }> {
  // 1. Patch user profile
  const { error: profileErr } = await supabase
    .from('users')
    .update(DEMO_PROFILE)
    .eq('id', userId);
  if (profileErr) return { error: profileErr.message };

  // 2. Upsert automation settings
  const { error: autoErr } = await supabase
    .from('automation_settings')
    .upsert({ user_id: userId, ...DEMO_AUTOMATION });
  if (autoErr) return { error: autoErr.message };

  // 3. Insert demo dump log entries (ignore conflicts)
  const { error: logErr } = await supabase
    .from('automation_log')
    .insert(demoDumps(userId));
  if (logErr) return { error: logErr.message };

  return { error: null };
}

export async function clearDemo(userId: string): Promise<{ error: string | null }> {
  const { error: logErr } = await supabase
    .from('automation_log')
    .delete()
    .eq('user_id', userId)
    .eq('note', 'Demo: surplus dump');
  if (logErr) return { error: logErr.message };

  const { error: profileErr } = await supabase
    .from('users')
    .update({
      full_name:           null,
      monthly_income:      null,
      monthly_expenses:    null,
      home_value:          null,
      mortgage_balance:    null,
      mortgage_rate:       null,
      monthly_payment:     null,
      credit_score:        null,
      onboarding_complete: false,
    })
    .eq('id', userId);
  if (profileErr) return { error: profileErr.message };

  return { error: null };
}
