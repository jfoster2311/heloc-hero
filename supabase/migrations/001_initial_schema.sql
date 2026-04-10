-- HELOC Hero — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  full_name           text,
  monthly_income      numeric(12,2),
  monthly_expenses    numeric(12,2),
  home_value          numeric(12,2),
  mortgage_balance    numeric(12,2),
  mortgage_rate       numeric(6,4),
  monthly_payment     numeric(12,2),
  credit_score        integer,
  tier                text not null default 'free' check (tier in ('free','medium','full')),
  onboarding_complete boolean not null default false,
  fcm_token           text,
  stripe_customer_id  text,
  stripe_subscription_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- RLS
alter table public.users enable row level security;
create policy "Users can read their own row"   on public.users for select using (auth.uid() = id);
create policy "Users can update their own row" on public.users for update using (auth.uid() = id);
create policy "Users can insert their own row" on public.users for insert with check (auth.uid() = id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

-- ─── Linked Accounts ─────────────────────────────────────────────────────────
create table if not exists public.linked_accounts (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.users(id) on delete cascade,
  account_type        text not null check (account_type in ('mortgage','home equity','savings')),
  institution_name    text,
  plaid_item_id       text not null,
  plaid_access_token  text not null,  -- encrypted at rest via Supabase Vault in production
  accounts            jsonb not null default '[]',
  accounts_updated_at timestamptz,
  created_at          timestamptz not null default now()
);

alter table public.linked_accounts enable row level security;
create policy "Users see own accounts" on public.linked_accounts for select using (auth.uid() = user_id);
create policy "Users insert own accounts" on public.linked_accounts for insert with check (auth.uid() = user_id);
create policy "Users update own accounts" on public.linked_accounts for update using (auth.uid() = user_id);
create policy "Users delete own accounts" on public.linked_accounts for delete using (auth.uid() = user_id);

-- ─── Automation Settings ─────────────────────────────────────────────────────
create table if not exists public.automation_settings (
  user_id                  uuid primary key references public.users(id) on delete cascade,
  safe_sweep_enabled       boolean not null default false,
  safe_dump_enabled        boolean not null default false,
  buffer_target            numeric(12,2) not null default 2000,
  upcoming_bills_estimate  numeric(12,2) not null default 500,
  min_dump_amount          numeric(12,2) not null default 5000,
  updated_at               timestamptz not null default now()
);

alter table public.automation_settings enable row level security;
create policy "Users own automation settings" on public.automation_settings
  for all using (auth.uid() = user_id);

-- ─── Sweep / Dump Log ────────────────────────────────────────────────────────
create table if not exists public.automation_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  action      text not null check (action in ('sweep','dump')),
  amount      numeric(12,2) not null,
  status      text not null default 'pending' check (status in ('pending','success','failed')),
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.automation_log enable row level security;
create policy "Users see own log" on public.automation_log for select using (auth.uid() = user_id);
