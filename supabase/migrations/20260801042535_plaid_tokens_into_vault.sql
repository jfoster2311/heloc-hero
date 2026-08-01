-- Plaid access tokens move into Supabase Vault. Phase 1 of 3: additive only.
--
-- Applied to the live project 2026-08-01 via apply_migration, and verified.
--
-- 20260801120000 stopped the client reaching these tokens. It did not change
-- how they are stored: `plaid_accounts.access_token` is still plaintext, so a
-- database dump, a backup snapshot or anything with read access to the table
-- hands over every linked user's Plaid credentials in the clear. 001's old
-- comment claimed Vault was already doing this. It never was.
--
-- ── Why Vault and not an application-level key ────────────────────────────
-- Chosen deliberately. An AES key held as an Edge Function secret would be
-- strictly stronger — the key would never touch the database, so SQL access
-- alone could not decrypt — but it makes us responsible for rotation, and
-- losing it means every linked user has to re-link their bank. Vault keeps the
-- key outside the database under Supabase's management, which defeats the
-- dump/backup threat that actually applies here, with nothing for a solo
-- operator to lose. Verified on this project before committing to it: a
-- round-trip through vault.create_secret returned the original string while
-- vault.secrets.secret held ciphertext.
--
-- ── Phasing, and why it is three migrations and not one ───────────────────
-- Seven deployed Edge Functions read this token. If the column changed shape in
-- one step, every function still running the old code would break the moment
-- the migration landed, and this project has a documented history of deployment
-- drift. So:
--
--   Phase 1 (this file)  additive. Adds the secret reference, copies the
--                        existing tokens into Vault, and exposes a decrypting
--                        read path. `access_token` keeps its plaintext, so the
--                        currently deployed functions carry on working
--                        untouched. Nothing has to be deployed in step.
--   Phase 2              the functions move to the new read/write path.
--   Phase 3              the plaintext column is cleared, then dropped.
--
-- The view coalesces to the plaintext column precisely so both generations of
-- function code return the same token during the window between phases.

-- ─── 1. Where the Vault reference lives ─────────────────────────────────────
alter table public.plaid_accounts
  add column if not exists access_token_secret_id uuid;

comment on column public.plaid_accounts.access_token_secret_id is
  'FK-by-convention into vault.secrets(id). No real FK: the vault schema is '
  'managed by the extension and should not gain dependencies from app tables. '
  'Read tokens through public.plaid_accounts_secure, never from here.';

-- Deliberately not a foreign key, but the orphan case still needs to be
-- findable, and every read joins on it.
create index if not exists plaid_accounts_access_token_secret_id_idx
  on public.plaid_accounts (access_token_secret_id);

-- ─── 2. Move the existing tokens in ─────────────────────────────────────────
-- Idempotent: only rows that still hold a plaintext token and have no secret
-- yet are touched, so re-running this migration cannot double-create secrets.
do $$
declare
  r   record;
  sid uuid;
begin
  for r in
    select id, access_token
    from public.plaid_accounts
    where access_token is not null
      and access_token_secret_id is null
  loop
    sid := vault.create_secret(
      r.access_token,
      'plaid_access_token_' || r.id::text,
      'Plaid access token for plaid_accounts.id=' || r.id::text
    );
    update public.plaid_accounts
      set access_token_secret_id = sid
      where id = r.id;
  end loop;
end $$;

-- ─── 3. The decrypting read path ────────────────────────────────────────────
-- A view rather than an RPC so the call sites change by exactly one string:
-- .from("plaid_accounts") becomes .from("plaid_accounts_secure") and every
-- existing .select()/.eq() keeps working, column names included.
--
-- security_invoker = off (the default, stated explicitly because it is the
-- whole point) runs the view as its owner, which is what lets it read
-- vault.decrypted_secrets. That is also why the grants below are narrow: this
-- view must never be reachable by a client role.
--
-- coalesce is the phase-1/phase-2 bridge described above. Phase 3 removes it
-- along with the column it falls back to.
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
  coalesce(ds.decrypted_secret, pa.access_token) as access_token
from public.plaid_accounts pa
left join vault.decrypted_secrets ds
  on ds.id = pa.access_token_secret_id;

revoke all on public.plaid_accounts_secure from public, anon, authenticated;
grant select on public.plaid_accounts_secure to service_role;

comment on view public.plaid_accounts_secure is
  'Decrypting read path for Plaid access tokens. service_role only — the Edge '
  'Functions are the only legitimate readers. Runs as owner so it can reach '
  'vault.decrypted_secrets.';

-- ─── 4. The write path ──────────────────────────────────────────────────────
-- plaid-exchange-token used to upsert the token as a column value. It cannot
-- any more: creating the Vault secret and pointing the row at it have to happen
-- together or a re-link leaves an orphaned secret behind. Doing the whole
-- upsert here keeps it atomic.
--
-- Re-linking the same account_type reuses the row (the unique constraint is
-- user_id + account_type), so the secret is UPDATED in place rather than
-- replaced — otherwise every re-link would leak a dead secret into the vault.
create or replace function public.plaid_store_access_token(
  p_user_id      uuid,
  p_account_type text,
  p_item_id      text,
  p_token        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_secret uuid;
  row_id          uuid;
begin
  select id, access_token_secret_id
    into row_id, existing_secret
    from public.plaid_accounts
   where user_id = p_user_id
     and account_type = p_account_type;

  if existing_secret is not null then
    perform vault.update_secret(existing_secret, p_token);
  else
    existing_secret := vault.create_secret(
      p_token,
      'plaid_access_token_' || p_user_id::text || '_' || p_account_type,
      'Plaid access token for ' || p_account_type
    );
  end if;

  insert into public.plaid_accounts (user_id, account_type, item_id, access_token_secret_id)
  values (p_user_id, p_account_type, p_item_id, existing_secret)
  on conflict (user_id, account_type) do update
    set item_id                = excluded.item_id,
        access_token_secret_id = excluded.access_token_secret_id
  returning id into row_id;

  return row_id;
end $$;

revoke all on function public.plaid_store_access_token(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plaid_store_access_token(uuid, text, text, text)
  to service_role;

-- PostgREST caches the schema; without this the new view and function are 404s
-- until the next cache refresh.
notify pgrst, 'reload schema';
