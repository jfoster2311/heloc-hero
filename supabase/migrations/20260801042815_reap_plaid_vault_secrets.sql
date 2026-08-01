-- Reap the Vault secret when its plaid_accounts row goes. Phase 2 of 3.
--
-- Applied to the live project 2026-08-01 via apply_migration, and verified.
--
-- Moving the token into Vault split one row into two objects with no database
-- link between them — `access_token_secret_id` is a reference by convention,
-- deliberately not a foreign key, because app tables should not take
-- dependencies on an extension-managed schema.
--
-- The cost of that choice is that nothing cleans up after a delete. Both
-- plaid-unlink and delete-account remove plaid_accounts rows, and without this
-- every unlink and every account deletion would leave a live Plaid credential
-- sitting in vault.secrets with nothing pointing at it and no way to tell which
-- user it belonged to. For delete-account that is the worse failure: the
-- function exists to honour erasure requests, and it would have been quietly
-- retaining the one piece of data that most needs to go.
--
-- A trigger rather than two edits to those functions, because the invariant is
-- "a secret outlives nothing" and that belongs next to the data. Any future
-- caller that deletes a row gets the cleanup for free.
create or replace function public.plaid_reap_access_token_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.access_token_secret_id is not null then
    delete from vault.secrets where id = old.access_token_secret_id;
  end if;
  return old;
end $$;

-- PUBLIC, not just the role names — see 20260801130000. Revoking anon and
-- authenticated by name leaves the default PUBLIC grant in place and silently
-- does nothing.
revoke all on function public.plaid_reap_access_token_secret()
  from public, anon, authenticated;

drop trigger if exists plaid_accounts_reap_secret on public.plaid_accounts;
create trigger plaid_accounts_reap_secret
  after delete on public.plaid_accounts
  for each row execute function public.plaid_reap_access_token_secret();
