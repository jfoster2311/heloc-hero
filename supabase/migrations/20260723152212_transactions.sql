-- 20260723180000_transactions.sql
--
-- Transaction storage, so monthly surplus stops being a number the user typed
-- once at onboarding and never revisited.
--
-- Why this is worth the privacy surface: surplus is the most load-bearing
-- figure in the app. Payoff date, recommended move size, replenish months and
-- buffer months are all functions of it. Self-reported expenses are
-- systematically LOW — people forget annual insurance, car repairs, December —
-- and low expenses mean high surplus, which means the app recommends a larger
-- draw than the user can replenish, against their house. That is the one
-- direction this product cannot afford to be wrong in.
--
-- Scope discipline: these rows exist to derive one number and to let the user
-- audit how it was derived. They are NOT the seed of a budgeting feature. See
-- app/lib/cashflow.ts.

create table if not exists public.transactions (
  -- Plaid's own id, so re-syncs are idempotent and `removed` events can delete.
  transaction_id  text primary key,
  user_id         uuid not null references public.users(id) on delete cascade,
  account_id      text not null,
  -- Which linked item this arrived on, so unlinking one institution can take
  -- its transactions with it.
  account_type    text not null,
  date            date not null,
  -- Plaid's sign convention, preserved rather than normalised: POSITIVE is
  -- money OUT of the account, negative is money in. Flipping it here would
  -- leave the raw rows disagreeing with every Plaid response and every doc
  -- page someone reads while debugging.
  amount          numeric not null,
  iso_currency_code text,
  name            text,
  merchant_name   text,
  -- Personal Finance Category. Used as a first pass for transfer detection and
  -- never trusted on its own.
  category_primary  text,
  category_detailed text,
  -- Pending rows duplicate the posted row that replaces them, so they are
  -- stored (Plaid sends them) but excluded from every aggregate.
  pending         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);
create index if not exists transactions_user_account_idx
  on public.transactions (user_id, account_type);

alter table public.transactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transactions'
      and policyname = 'transactions_select_own'
  ) then
    create policy transactions_select_own on public.transactions
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Writes come from the sync edge function under the service role only. There is
-- deliberately no insert/update/delete policy for end users: nothing in the app
-- should be able to edit a bank-reported transaction, because the whole value of
-- the derived figure is that the user did not choose it.

-- ── Sync cursor, on the token store ─────────────────────────────────────────
-- /transactions/sync is cursor-based: the cursor is what makes every sync after
-- the first incremental instead of a 24-month re-pull.
alter table public.plaid_accounts
  add column if not exists transactions_cursor      text,
  add column if not exists transactions_synced_at   timestamptz,
  -- The initial historical backfill arrives asynchronously, minutes after link.
  -- The UI needs to distinguish "no spending" from "not arrived yet".
  add column if not exists transactions_backfilled  boolean default false;

-- ── Which figures the user is actually running on ───────────────────────────
alter table public.users
  add column if not exists cashflow_source     text default 'entered',
  add column if not exists cashflow_derived_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_cashflow_source_check'
  ) then
    alter table public.users
      add constraint users_cashflow_source_check
      check (cashflow_source in ('entered', 'derived'));
  end if;
end $$;

comment on column public.users.cashflow_source is
  'Whether monthly_income/monthly_expenses came from the user or from a trailing '
  'transaction average they accepted. Drives whether the UI says "your entered '
  'figures" or "your last N months".';
