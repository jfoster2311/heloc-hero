// supabase/functions/delete-account/index.ts
// Deletes all data for the authenticated user then removes the auth account.
// Deploy via Supabase dashboard. Requires service-role key in env.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Missing authorization header', 401);
  }
  const jwt = authHeader.slice(7);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // User-scoped client to resolve the caller's identity from their JWT
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return errorResponse('Unauthorized', 401);
  }
  const userId = user.id;

  // Service-role client to delete data and remove the auth user
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Delete all user data tables. Order matters for FK constraints.
  const tables = [
    'plaid_items',
    'linked_accounts',
    'cycles',
    'automation_settings',
    'subscriptions',
    'user_profiles',
  ];

  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) {
      console.error(`delete-account: failed to delete from ${table}:`, error.message);
    }
  }

  // Remove the auth user last
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return errorResponse(`Failed to delete auth user: ${deleteUserError.message}`, 500);
  }

  return jsonResponse({ success: true });
});
