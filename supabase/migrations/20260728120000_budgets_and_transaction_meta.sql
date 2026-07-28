-- 20260728120000_budgets_and_transaction_meta.sql
--
-- Two tables, both holding nothing but the user's own judgement about their own
-- rows. Neither is read by lib/cashflow.ts or lib/projections.ts, and that is
-- structural rather than incidental: a payoff date that moved because someone
-- adjusted a grocery budget would be a number nobody could explain.

-- ── Ceilings ────────────────────────────────────────────────────────────────
-- A monthly cap the user sets on one spending category.
--
-- The `month` column carries a sentinel rather than being nullable. A ceiling is
-- either set FOR a specific month ('2026-07') or set as the standing default
-- that carries into every month the user has not touched ('default') — that is
-- the "apply to future months" toggle, stored rather than recomputed. Nullable
-- would have been the tidier schema and the worse one: null is not distinct in a
-- unique index across every Postgres version this may meet, so two rows could
-- silently both claim to be the default and the read would pick one at random.
create table if not exists public.category_budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  -- The app's own taxonomy, matching transaction_categories. Kept in sync by
  -- the same check constraint so a category can never exist in one and not the
  -- other.
  category   text not null,
  -- 'YYYY-MM' for a single month, or the literal 'default' for the standing
  -- ceiling. See above for why this is not nullable.
  month      text not null,
  -- Dollars per month. A ceiling of zero is meaningless — the user either has a
  -- budget or does not — so zero is rejected and "no budget" is the absence of a
  -- row. That keeps "$0 left" and "no budget set" from collapsing into one
  -- state on screen, which are very different things to tell someone.
  ceiling    numeric not null check (ceiling > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'category_budgets_category_check'
  ) then
    alter table public.category_budgets
      add constraint category_budgets_category_check
      check (category in (
        'housing', 'auto', 'groceries', 'dining',
        'shopping', 'bills', 'health', 'other'
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'category_budgets_month_check'
  ) then
    alter table public.category_budgets
      add constraint category_budgets_month_check
      check (month = 'default' or month ~ '^\d{4}-\d{2}$');
  end if;
end $$;

-- One ceiling per category per month. An edit replaces; it never accumulates.
create unique index if not exists category_budgets_unique
  on public.category_budgets (user_id, category, month);

alter table public.category_budgets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'category_budgets'
      and policyname = 'category_budgets_rw_own'
  ) then
    create policy category_budgets_rw_own on public.category_budgets
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

comment on table public.category_budgets is
  'User-set monthly spending ceilings. month = ''YYYY-MM'' for one month or '
  '''default'' for the standing ceiling. Never read by the payoff projection.';

-- ── Per-transaction annotations ─────────────────────────────────────────────
-- Same reasoning as transaction_categories: public.transactions has no user
-- write policy, because the value of a transaction-derived figure is precisely
-- that the user did not choose it. Anything a human wants to record ABOUT a row
-- lives beside it, joined at read time, and the bank-reported row stays as the
-- bank reported it.
create table if not exists public.transaction_meta (
  transaction_id text primary key
    references public.transactions(transaction_id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  -- Excluded from EVERY total in the app — breakdown, budget, heat grid, and
  -- the trailing surplus average. Intended for the duplicate case: a charge
  -- that posts once on the card and again as a bank transfer. The app already
  -- pairs obvious transfers automatically (lib/cashflow.ts); this is the
  -- manual escape hatch for the ones it cannot see.
  hidden    boolean not null default false,
  -- The user's own note. Never sent anywhere, never parsed.
  note      text,
  -- The user asserting this repeats. Distinct from the app's own recurring
  -- DETECTION in lib/cashflow.ts, which is a pattern extended from history —
  -- this is a human saying so, and the two must not be conflated in the UI.
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transaction_meta_user_idx
  on public.transaction_meta (user_id);
-- The hidden set is read on every Cash flow render to build the exclusion set,
-- and it is almost always tiny relative to the table.
create index if not exists transaction_meta_hidden_idx
  on public.transaction_meta (user_id) where hidden;

alter table public.transaction_meta enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transaction_meta'
      and policyname = 'transaction_meta_rw_own'
  ) then
    create policy transaction_meta_rw_own on public.transaction_meta
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

comment on table public.transaction_meta is
  'User annotations layered over bank-reported transactions: hidden (excluded '
  'from every total), a free-text note, and a user-asserted recurring flag. '
  'Never mutates the transaction row itself.';
