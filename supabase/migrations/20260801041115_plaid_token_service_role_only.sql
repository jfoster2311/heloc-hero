-- Plaid access tokens were readable — and writable — by the client.
--
-- Applied to the live project 2026-08-01 via apply_migration, and verified.
--
-- `plaid_accounts.access_token` is the credential that authorises every call we
-- make to Plaid on a user's behalf. It is server-side state: the only legitimate
-- readers are the Edge Functions, which hold SUPABASE_SERVICE_ROLE_KEY (see
-- functions/_shared/supabase.ts) and therefore never needed a client-facing
-- grant. It had one anyway.
--
-- What was actually exposed, measured rather than assumed:
--
--   * `authenticated` held table-level SELECT, so any signed-in user could read
--     their own token straight out of the anon-key client. RLS was ON and the
--     policy was correct — `auth.uid() = user_id` — so this was never a
--     cross-user read. It is a credential leaving the server at all.
--   * `authenticated` also held UPDATE. That is the sharper edge: the policy
--     gates WHICH ROW you may write, not what you may put in it, so a user could
--     overwrite their own token with one they obtained elsewhere and point their
--     row at a Plaid item that is not theirs. Balance and transaction syncs then
--     run against it under their user_id.
--   * INSERT was granted, and backed by a "Users can insert own plaid accounts"
--     policy, though no client code has ever inserted here — plaid-exchange-token
--     does it with the service role.
--
-- A token alone is not sufficient to call Plaid (client_id and secret are also
-- required, and those are Edge Function env vars). So this is defence in depth
-- rather than a live breach. It is still a credential that should not be
-- reachable from a mobile bundle, and the UPDATE grant is a genuine integrity
-- hole independent of that.
--
-- ── Why a column grant and not a view ─────────────────────────────────────
-- Exactly one client read touches this table — app/hooks/useCashflow.ts names
-- `transactions_backfilled, transactions_synced_at` explicitly rather than
-- select('*'), so a column-level grant keeps it working untouched. A view would
-- have meant changing that call site for no additional safety.
--
-- NOTE for whoever adds the next column: column grants do not extend to it.
-- A new column will be invisible to the client until it is added to the GRANT
-- below. That is the safe direction to fail, but it fails silently, so add it
-- here in the same migration that adds the column.
--
-- ── The repo schema said this was already handled ─────────────────────────
-- 001_initial_schema.sql:50 declares `plaid_access_token text not null` on
-- `linked_accounts` with the comment "encrypted at rest via Supabase Vault in
-- production". Neither half is true of the live database: the token lives on
-- `plaid_accounts`, and there is no Vault, pgsodium or application-level
-- encryption anywhere in the project. That comment is corrected in the same
-- commit as this migration.

-- ─── plaid_accounts ─────────────────────────────────────────────────────────
-- Drop everything, then hand back only the read the client actually performs.
revoke all on public.plaid_accounts from anon, authenticated;

grant select (
  id,
  user_id,
  account_type,
  item_id,
  accounts,
  accounts_updated_at,
  created_at,
  updated_at,
  transactions_cursor,
  transactions_synced_at,
  transactions_backfilled
) on public.plaid_accounts to authenticated;

-- The SELECT policy stays: the column grant says which columns are legible,
-- RLS still says which rows. Both are load-bearing.
--
-- These two go, because nothing is left to exercise them. A policy that grants
-- a write no role can perform reads as a claim that the write is supported.
drop policy if exists "Users can insert own plaid accounts" on public.plaid_accounts;
drop policy if exists "Users can update own plaid accounts" on public.plaid_accounts;

-- ─── plaid_items ────────────────────────────────────────────────────────────
-- Same token, second table, zero rows and no reader in either the app or the
-- Edge Functions — it predates plaid_accounts. Left in place rather than
-- dropped (that is a separate decision about dead schema), but no client role
-- has any business holding a grant on it.
revoke all on public.plaid_items from anon, authenticated;
