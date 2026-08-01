-- A hand-entered HELOC balance, because "unknown" was being read as "zero".
--
-- Applied to the live project 2026-07-30 via apply_migration, and verified.
--
-- The drawn balance is the one HELOC figure Plaid does supply, so until now it
-- had no column: it arrived on `linked_accounts` and nowhere else. But linking
-- is Pro-gated and cycle tracking is deliberately free, so a free user could
-- enter a credit limit in /modals/heloc-terms and then had no way at all to say
-- what was drawn against it.
--
-- Every module that reasons about the line coerced the resulting null to zero
-- (`helocDrawn ?? 0`), which is not a neutral default — it is the claim that the
-- line is completely undrawn:
--
--   * lib/safeToMove.ts    utilCeiling = limit * threshold - drawn, so the
--                          recommendation became ~80% of the whole credit
--                          limit, at status CLEAR, for someone who might be
--                          sitting mid-cycle with most of it already drawn.
--   * lib/sweep.ts         every committed figure derives from the balance, so
--                          nothing looked committed and the entire monthly
--                          surplus was reported as free to spend.
--   * lib/strike.ts        progress is measured from the limit down to the
--                          threshold, so the meter read "next dump open".
--
-- Those three now distinguish the two states and refuse to size anything
-- without a balance. This column is how a user answers.
alter table public.users
  add column if not exists heloc_balance             numeric,
  add column if not exists heloc_balance_updated_at  timestamptz;

-- A negative balance is not a state a line of credit can be in, and it would
-- flow straight into a recommended draw amount.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_heloc_balance_check'
  ) then
    alter table public.users
      add constraint users_heloc_balance_check
      check (heloc_balance is null or heloc_balance >= 0);
  end if;
end $$;

comment on column public.users.heloc_balance is
  'User-entered drawn balance on the HELOC. NULL means unknown, which is distinct from 0 and must stay that way — see lib/safeToMove.ts. A live Plaid balance always takes precedence; see hooks/useFinancials.ts.';
comment on column public.users.heloc_balance_updated_at is
  'When the user last confirmed the balance above. A hand-entered balance goes stale after a sweep or a dump.';
