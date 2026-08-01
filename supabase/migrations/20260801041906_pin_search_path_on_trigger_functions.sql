-- Pin search_path on the two trigger functions, and stop granting them to clients.
--
-- Applied to the live project 2026-08-01 via apply_migration, and verified.
--
-- Both were flagged by the Supabase security advisor. One of the two headline
-- findings does not survive contact with the database, and this migration says
-- so rather than quietly implying it fixed something serious.
--
-- ── What the advisor said, and what is actually true ──────────────────────
-- The advisor reports that `handle_new_user` is a SECURITY DEFINER function
-- executable by `anon` and `authenticated` via /rest/v1/rpc/handle_new_user.
-- The EXECUTE grant is real. The call is not: the function returns `trigger`,
-- and Postgres refuses it before the body runs. Probed on the live database:
--
--   blocked: 0A000 / trigger functions can only be called as triggers
--
-- So there was no callable escalation path here. The grant is still wrong —
-- nothing outside the trigger has any reason to hold it — but it is tidiness,
-- not a breach, and it is worth writing that down so the next person does not
-- go looking for an incident that never happened.
--
-- ── The finding that IS real, and its actual reach ────────────────────────
-- `handle_new_user` is SECURITY DEFINER, owned by `postgres`, and had no
-- `search_path` set. A SECURITY DEFINER function runs with the owner's rights,
-- so anything it resolves through a caller-influenced search_path is a
-- privilege-escalation vector.
--
-- Measured, the reach is small:
--   * the body already schema-qualifies its only table (`public.users`);
--   * neither `anon` nor `authenticated` holds CREATE on public, auth or
--     extensions, so they cannot plant a shadowing object in the search path;
--   * both do hold TEMP, so pg_temp is the one surface left — and reaching it
--     needs a direct Postgres connection running DDL, which PostgREST does not
--     offer.
--
-- Low practical exploitability, then. Pinning search_path costs nothing and
-- removes the class of bug outright, which is the right trade at this size.
--
-- `search_path = ''` is the strict form: every non-pg_catalog reference must be
-- qualified. Both bodies already are — `public.users` in one, and `now()` in
-- the other resolves from pg_catalog, which is always searched implicitly.
--
-- ── Why revoking EXECUTE does not break signup ────────────────────────────
-- Postgres checks EXECUTE on a trigger function at CREATE TRIGGER time, not on
-- each fire. `on_auth_user_created` on auth.users already exists, so it keeps
-- firing for every new signup regardless of what anon and authenticated hold.
-- Verified end-to-end after applying, not assumed — a throwaway auth user was
-- inserted and the matching public.users row appeared with email and full_name
-- carried across.

-- ─── handle_new_user ────────────────────────────────────────────────────────
-- Body unchanged from 20260722120000_reconcile_app_schema.sql; only the
-- search_path binding is added.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

-- PUBLIC, not just the two role names. Postgres grants EXECUTE on a new
-- function to PUBLIC by default, and anon/authenticated inherit it from there,
-- so `revoke ... from anon, authenticated` alone is a silent no-op —
-- has_function_privilege still returned true after it. Revoking PUBLIC is what
-- actually drops it; the role names are listed too so any direct grant made
-- later is caught as well.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ─── handle_updated_at ──────────────────────────────────────────────────────
-- Not SECURITY DEFINER, so it carries none of the escalation risk above; pinned
-- for the same reason and to clear the advisor. Drives users_updated_at and
-- plaid_accounts_updated_at.
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

revoke all on function public.handle_updated_at() from public, anon, authenticated;
