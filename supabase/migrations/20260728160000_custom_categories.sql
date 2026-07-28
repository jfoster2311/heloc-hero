-- 20260728160000_custom_categories.sql
--
-- Categories the user makes themselves, and the removal of the two CHECK
-- constraints that made that impossible.
--
-- ── Why the CHECKs have to go ──────────────────────────────────────────────
-- transaction_categories.category and category_budgets.category were both
-- constrained to a fixed list of eight strings. That was the right constraint
-- while the taxonomy was closed: it made an impossible category a write error
-- rather than a row nothing could render. It cannot survive user-created
-- categories, because the valid set is now per-user and unbounded.
--
-- What replaces it is a format check, not an enum: a category is either one of
-- the builtins or 'custom:<uuid>'. That still rejects the failure this was
-- guarding against — a typo, a truncated string, an id from another system —
-- while allowing ids the database cannot enumerate ahead of time. The referenced
-- custom_categories row is NOT enforced by a foreign key, deliberately; see the
-- note on deletion below.

-- ── The categories themselves ───────────────────────────────────────────────
create table if not exists public.custom_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  -- What the user typed. Trimmed and length-capped so a category cannot be
  -- blank or long enough to break every row it appears in.
  label      text not null check (length(btrim(label)) between 1 and 30),
  -- An Ionicons glyph name, chosen from a fixed set in the app. Stored as text
  -- because the set lives in the client and will grow; an invalid name renders
  -- as a blank glyph rather than a crash, which is the right failure here.
  icon       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two categories with the same name are indistinguishable on every screen they
-- appear on, so the second one is a mistake rather than a choice. Case- and
-- whitespace-insensitive, because "Pets" and "pets " are the same mistake.
create unique index if not exists custom_categories_label_unique
  on public.custom_categories (user_id, lower(btrim(label)));

create index if not exists custom_categories_user_idx
  on public.custom_categories (user_id);

alter table public.custom_categories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'custom_categories'
      and policyname = 'custom_categories_rw_own'
  ) then
    create policy custom_categories_rw_own on public.custom_categories
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

comment on table public.custom_categories is
  'User-created spending categories. Referenced from transaction_categories and '
  'category_budgets as ''custom:<id>''. Deliberately no FK from those tables — '
  'deleting a category must not delete the user''s transaction history.';

-- ── Swap the enum checks for format checks ──────────────────────────────────
-- Deleting a custom category leaves rows pointing at an id that no longer
-- exists. That is handled in the app, which resolves an unknown id to "Other"
-- (see categoryMeta in lib/spending.ts), and it is why there is no FK here: a
-- foreign key would either block the delete or, with a cascade, take the user's
-- retagging history with it. Losing the label is acceptable; losing the rows is
-- not.
alter table public.transaction_categories
  drop constraint if exists transaction_categories_category_check;
alter table public.category_budgets
  drop constraint if exists category_budgets_category_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transaction_categories_category_format'
  ) then
    alter table public.transaction_categories
      add constraint transaction_categories_category_format
      check (
        category in (
          'housing', 'dining', 'subscriptions', 'auto', 'entertainment',
          'shopping', 'groceries', 'financial', 'business', 'personal',
          'health', 'travel', 'bills', 'other'
        )
        or category ~ '^custom:[0-9a-f-]{36}$'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'category_budgets_category_format'
  ) then
    alter table public.category_budgets
      add constraint category_budgets_category_format
      check (
        category in (
          'housing', 'dining', 'subscriptions', 'auto', 'entertainment',
          'shopping', 'groceries', 'financial', 'business', 'personal',
          'health', 'travel', 'bills', 'other'
        )
        or category ~ '^custom:[0-9a-f-]{36}$'
      );
  end if;
end $$;

-- No data migration is needed and that is by design: every existing id
-- ('housing', 'auto', 'groceries', 'dining', 'shopping', 'bills', 'health',
-- 'other') is still a valid id in the new taxonomy. Only their LABELS changed,
-- and labels live in the client. Renaming the ids to match the new labels would
-- have orphaned every row already stored.
