-- Drop the plaintext token column. Phase 3 of 3 — the one that finishes the job.
--
-- Applied to the live project 2026-08-01 via apply_migration, and verified.
--
-- Phases 1 and 2 put every token in Vault and moved all seven Edge Functions
-- onto the decrypting view. Until this migration the plaintext was still
-- sitting in `plaid_accounts.access_token` as the coalesce fallback, which
-- means the original problem — a dump or backup handing over live Plaid
-- credentials in the clear — was still entirely present. Everything before this
-- was scaffolding; this is the fix.
--
-- Checked immediately before applying, not assumed:
--   4 rows, 4 with a Vault secret, 4 where the decrypted secret equals the
--   plaintext exactly, 0 missing. The tokens are safe to drop because Vault
--   demonstrably holds the same values.
--
-- The view loses its coalesce in the same statement, because the column it
-- falls back to is about to stop existing. After this the ONLY path to a token
-- is vault.decrypted_secrets, which is what makes the encryption real rather
-- than nominal — while the fallback existed, a reader could still have been
-- served plaintext without anyone noticing.
--
-- Not reversible. Rolling back means re-linking every account, because there is
-- no plaintext left to restore from. That is the intended end state.
drop view if exists public.plaid_accounts_secure;
create view public.plaid_accounts_secure with (security_invoker = off) as
select
  pa.id,
  pa.user_id,
  pa.account_type,
  pa.item_id,
  pa.accounts,
  pa.accounts_updated_at,
  pa.created_at,
  pa.updated_at,
  pa.transactions_cursor,
  pa.transactions_synced_at,
  pa.transactions_backfilled,
  ds.decrypted_secret as access_token
from public.plaid_accounts pa
left join vault.decrypted_secrets ds
  on ds.id = pa.access_token_secret_id;

revoke all on public.plaid_accounts_secure from public, anon, authenticated;
grant select on public.plaid_accounts_secure to service_role;

comment on view public.plaid_accounts_secure is
  'Decrypting read path for Plaid access tokens. service_role only — the Edge '
  'Functions are the only legitimate readers. Runs as owner so it can reach '
  'vault.decrypted_secrets. This is the only way to obtain a token; no '
  'plaintext copy exists anywhere.';

alter table public.plaid_accounts drop column access_token;

notify pgrst, 'reload schema';
