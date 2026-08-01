-- 20260723120000_terms_property_and_liabilities.sql
--
-- Adds the facts the dashboard and Accounts screens are built on that no bank
-- connection can supply, plus storage for the mortgage liability object that
-- one can.
--
-- Three groups:
--   1. HELOC terms beyond rate/margin/draw-end. Plaid's /liabilities/get covers
--      credit(credit card, paypal) and loan(student, mortgage) only, so a HELOC
--      never reports terms through any provider. interest_calc_method in
--      particular decides whether the strategy works at all.
--   2. Property value provenance. v1 is user-entered with a stated source; the
--      columns are shaped so an AVM can later fill the same fields.
--   3. Mortgage fallbacks, for servicers that do not participate in Liabilities,
--      and the liability snapshots themselves. `liabilities_prev` exists so
--      escrow and rate CHANGES can be detected by comparison rather than
--      guessed at — Plaid publishes no schedule of future changes.
--
-- Additive only. Nothing is dropped or rewritten.

-- ── 1. HELOC terms ──────────────────────────────────────────────────────────
alter table public.users
  add column if not exists heloc_rate_index            text,
  add column if not exists heloc_interest_calc_method  text,
  add column if not exists heloc_draw_fee              numeric,
  add column if not exists heloc_annual_fee            numeric,
  add column if not exists heloc_early_closure_fee     numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_heloc_interest_calc_method_check'
  ) then
    alter table public.users
      add constraint users_heloc_interest_calc_method_check
      check (heloc_interest_calc_method in ('average_daily_balance', 'statement_balance'));
  end if;
end $$;

-- ── 2. Property value ───────────────────────────────────────────────────────
alter table public.users
  add column if not exists home_value_as_of   date,
  add column if not exists home_value_source  text,
  add column if not exists property_address   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_home_value_source_check'
  ) then
    alter table public.users
      add constraint users_home_value_source_check
      check (home_value_source in
        ('appraisal', 'assessment', 'online_estimate', 'purchase_price'));
  end if;
end $$;

-- ── 3. Mortgage fallbacks + assumptions ─────────────────────────────────────
alter table public.users
  add column if not exists mortgage_origination_date       date,
  add column if not exists mortgage_origination_principal  numeric,
  add column if not exists mortgage_term_months            integer,
  add column if not exists mortgage_has_prepayment_penalty boolean,
  -- User-adjustable utilization the app is allowed to draw the line up to.
  add column if not exists replenish_threshold             numeric default 0.80,
  -- Rate-stress assumption, in basis points added to the HELOC rate.
  add column if not exists forward_rate_delta_bps          integer default 0,
  add column if not exists auto_apply_surplus              boolean default false;

-- ── 4. Liability snapshots on the linked account ────────────────────────────
alter table public.linked_accounts
  add column if not exists liabilities       jsonb,
  add column if not exists liabilities_prev  jsonb;

comment on column public.linked_accounts.liabilities_prev is
  'Previous /liabilities/get snapshot. Escrow and rate changes are detected by '
  'comparing this to `liabilities`; Plaid exposes no forward schedule of either.';
