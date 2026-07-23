-- HELOC terms must be captured manually and kept fresh.
--
-- Applied to the live project 2026-07-23 via apply_migration.
--
-- Plaid's /liabilities/get covers only account type `credit` with subtype
-- `credit card` or `paypal`, and type `loan` with subtype `student` or
-- `mortgage`. A HELOC is in neither bucket, so APR, margin, draw-period end,
-- minimum payment and origination terms are NOT retrievable for any
-- institution. Balances DO arrive, because `home equity` and `line of credit`
-- are valid account subtypes returned by /accounts/balance/get.
--
-- Onboarding already asked for rate and limit but discarded them — the users
-- update in onboardingStore.submit() omitted every HELOC field — so the app
-- fell back to a hardcoded 8.5% on every screen. These columns give those
-- answers somewhere to live. See lib/helocTerms.ts.
alter table public.users
  add column if not exists heloc_rate              numeric,      -- APR as a decimal, e.g. 0.085
  add column if not exists heloc_margin            numeric,      -- margin over the index, decimal
  add column if not exists heloc_credit_limit      numeric,      -- fallback when Plaid omits limit
  add column if not exists heloc_draw_end_date     date,
  add column if not exists heloc_payment_type      text,
  add column if not exists heloc_terms_updated_at  timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_heloc_payment_type_check'
  ) then
    alter table public.users
      add constraint users_heloc_payment_type_check
      check (heloc_payment_type is null or heloc_payment_type in ('interest_only', 'amortizing'));
  end if;
end $$;

comment on column public.users.heloc_rate is
  'User-entered HELOC APR (decimal). Not available from Plaid — variable, so re-verify periodically.';
comment on column public.users.heloc_draw_end_date is
  'User-entered end of the interest-only draw period. Cycling requires the draw period to outlast the payoff plan.';
comment on column public.users.heloc_terms_updated_at is
  'When the user last confirmed these terms. Drives the stale-terms prompt.';
