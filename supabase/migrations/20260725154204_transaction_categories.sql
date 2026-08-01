-- 20260725120000_transaction_categories.sql
--
-- User-assigned spending categories, as a layer OVER the bank-reported rows.
--
-- Why a separate table rather than a column on public.transactions: that table
-- deliberately has no insert/update/delete policy for end users, because the
-- value of a transaction-derived figure is precisely that the user did not
-- choose it. A retag must not be able to rewrite what the bank reported, or the
-- audit trail behind the surplus figure stops being an audit trail.
--
-- So the override lives here, joined at read time. Plaid's own
-- personal_finance_category stays untouched and remains the default; this table
-- only ever records a human disagreeing with it.

create table if not exists public.transaction_categories (
  -- One override per transaction. Re-tagging replaces, never accumulates.
  transaction_id text primary key
    references public.transactions(transaction_id) on delete cascade,
  user_id  uuid not null references public.users(id) on delete cascade,
  -- The app's own taxonomy, not Plaid's. Deliberately small: a category set a
  -- user has to scroll is a category set they will not maintain.
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transaction_categories_category_check'
  ) then
    alter table public.transaction_categories
      add constraint transaction_categories_category_check
      check (category in (
        'housing', 'auto', 'groceries', 'dining',
        'shopping', 'bills', 'health', 'other'
      ));
  end if;
end $$;

create index if not exists transaction_categories_user_idx
  on public.transaction_categories (user_id);

alter table public.transaction_categories enable row level security;

-- Unlike public.transactions, the user DOES own these rows outright: this table
-- holds nothing but their own judgement, so they may write and withdraw it.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transaction_categories'
      and policyname = 'transaction_categories_rw_own'
  ) then
    create policy transaction_categories_rw_own on public.transaction_categories
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

comment on table public.transaction_categories is
  'User overrides for spending category. Layered over Plaid personal_finance_category '
  'at read time; never mutates the bank-reported transaction row.';
