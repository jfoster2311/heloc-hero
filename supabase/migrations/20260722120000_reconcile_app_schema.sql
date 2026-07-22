-- 20260722120000_reconcile_app_schema.sql
--
-- Reconciles the LIVE Supabase database (originally provisioned by the legacy
-- "heloc-hero-back" backend) with what THIS repo's RN app + Plaid edge functions
-- actually read and write.
--
-- Properties:
--   • ADDITIVE + IDEMPOTENT — safe to run more than once. No table is dropped.
--   • Legacy tables (user_profiles, plaid_items) are left untouched.
--   • plaid_accounts already matches the edge functions — left as-is.
--
-- What it does:
--   1. users            → add the profile/financial columns the app reads/writes
--   2. handle_new_user  → also populate email + full_name on new auth signups
--   3. linked_accounts  → create (app reads it; Plaid functions write it)
--   4. automation_settings → create (settings modal reads/writes it)
--   5. notifications    → create (plaid-webhook writes it)
--   6. backfill         → carry the 2 existing user_profiles rows into users
--
-- NOT covered here (separate follow-ups, out of scope for auth + account linking):
--   • automation_log vs automation_runs naming conflict (safe-sweep is not deployed)
--   • fixing supabase/functions/delete-account to target the real tables
--
-- Apply via: Supabase Dashboard → SQL Editor (per CLAUDE.md), or reviewed apply_migration.

begin;

-- ─── 1) users: profile + financial columns the app expects ───────────────────
alter table public.users add column if not exists email               text;
alter table public.users add column if not exists full_name           text;
alter table public.users add column if not exists monthly_income      numeric(12,2);
alter table public.users add column if not exists monthly_expenses    numeric(12,2);
alter table public.users add column if not exists home_value          numeric(12,2);
alter table public.users add column if not exists mortgage_balance    numeric(12,2);
alter table public.users add column if not exists mortgage_rate       numeric(6,4);   -- decimal, e.g. 0.0650
alter table public.users add column if not exists monthly_payment     numeric(12,2);
alter table public.users add column if not exists credit_score        integer;
alter table public.users add column if not exists tier                text    not null default 'free';
alter table public.users add column if not exists onboarding_complete boolean not null default false;

-- tier domain check (guarded so re-runs don't error)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_tier_check') then
    alter table public.users add constraint users_tier_check check (tier in ('free','medium','full'));
  end if;
end $$;

-- RLS: the app reads/writes its own row with the user's JWT
alter table public.users enable row level security;
drop policy if exists "Users can read their own row"   on public.users;
drop policy if exists "Users can update their own row" on public.users;
drop policy if exists "Users can insert their own row" on public.users;
create policy "Users can read their own row"   on public.users for select using (auth.uid() = id);
create policy "Users can update their own row" on public.users for update using (auth.uid() = id);
create policy "Users can insert their own row" on public.users for insert with check (auth.uid() = id);

-- ─── 2) new-signup trigger: also carry email + full_name from auth ───────────
-- (The live trigger currently inserts only id, which would leave email null.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

-- ─── 3) linked_accounts: app reads this; Plaid functions write it ────────────
-- Tokens live in plaid_accounts, so there is intentionally NO access_token here.
create table if not exists public.linked_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  account_type        text not null check (account_type in ('mortgage','home equity','savings')),
  institution_name    text,
  plaid_item_id       text,
  accounts            jsonb not null default '[]',
  accounts_updated_at timestamptz,
  created_at          timestamptz not null default now()
);

-- Required for the edge functions' upsert(onConflict: 'user_id,account_type')
create unique index if not exists linked_accounts_user_type_uidx
  on public.linked_accounts (user_id, account_type);

alter table public.linked_accounts enable row level security;
drop policy if exists "Users see own accounts"    on public.linked_accounts;
drop policy if exists "Users insert own accounts" on public.linked_accounts;
drop policy if exists "Users update own accounts" on public.linked_accounts;
drop policy if exists "Users delete own accounts" on public.linked_accounts;
create policy "Users see own accounts"    on public.linked_accounts for select using (auth.uid() = user_id);
create policy "Users insert own accounts" on public.linked_accounts for insert with check (auth.uid() = user_id);
create policy "Users update own accounts" on public.linked_accounts for update using (auth.uid() = user_id);
create policy "Users delete own accounts" on public.linked_accounts for delete using (auth.uid() = user_id);

-- Realtime: useAccounts subscribes to postgres_changes on linked_accounts
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='linked_accounts'
     )
  then
    alter publication supabase_realtime add table public.linked_accounts;
  end if;
end $$;

-- ─── 4) automation_settings: settings modal reads/writes (full tier) ─────────
create table if not exists public.automation_settings (
  user_id                 uuid primary key references public.users(id) on delete cascade,
  safe_sweep_enabled      boolean       not null default false,
  safe_dump_enabled       boolean       not null default false,
  buffer_target           numeric(12,2) not null default 2000,
  upcoming_bills_estimate numeric(12,2) not null default 500,
  min_dump_amount         numeric(12,2) not null default 5000,
  updated_at              timestamptz   not null default now()
);
alter table public.automation_settings enable row level security;
drop policy if exists "Users own automation settings" on public.automation_settings;
create policy "Users own automation settings" on public.automation_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── 5) notifications: written by plaid-webhook (service role) ────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  title      text not null,
  body       text,
  type       text,
  data       jsonb not null default '{}',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "Users see own notifications" on public.notifications;
create policy "Users see own notifications" on public.notifications
  for select using (auth.uid() = user_id);
-- Inserts happen via the service-role key in edge functions, which bypasses RLS.

-- ─── 6) Backfill existing rows (test data: 4 users, 2 profiles) ──────────────
-- Give every user their auth email.
update public.users u
set email = a.email
from auth.users a
where a.id = u.id and u.email is null;

-- Carry the 2 legacy user_profiles rows into users. Only fills nulls.
-- mortgage_rate is normalized to a decimal (6.5 -> 0.065; 0.065 stays 0.065)
-- because the app treats mortgage_rate as a decimal fraction.
update public.users u
set
  onboarding_complete = u.onboarding_complete or (up.onboarding_completed_at is not null),
  home_value          = coalesce(u.home_value,       up.home_value),
  mortgage_balance    = coalesce(u.mortgage_balance, up.mortgage_balance),
  monthly_payment     = coalesce(u.monthly_payment,  up.monthly_payment),
  mortgage_rate       = coalesce(
                          u.mortgage_rate,
                          case when up.mortgage_rate > 1 then up.mortgage_rate / 100 else up.mortgage_rate end
                        )
from public.user_profiles up
where u.id = up.user_id;

commit;
