-- 20260723032002_add_pro_tier.sql
--
-- Reconstructed from the live database, where this has been applied since
-- 2026-07-23. It was applied directly and never committed, so version control
-- described a schema that no longer existed: the previous migration's check
-- constraint allows only ('free','medium','full'), and the app has assigned
-- 'pro' to every paid user since the RevenueCat migration.
--
-- Rebuilding from these migrations therefore produced a database that REJECTS
-- the tier the app writes. Nothing would fail until the first upgrade, which
-- would come back as a constraint violation on `users_tier_check` — on the one
-- write that has money attached to it.
--
-- 'medium' and 'full' stay for the legacy rows that still carry them; see
-- `tierLabels` in app/modals/settings.tsx, which renders both as "Pro (legacy
-- plan)", and `isPaidTier` in app/lib/pricing.ts, which treats all three as
-- paid.
--
-- Idempotent, because the live database already has exactly this constraint —
-- re-running must be a no-op rather than an error.

alter table public.users drop constraint if exists users_tier_check;

alter table public.users
  add constraint users_tier_check
  check (tier in ('free', 'pro', 'medium', 'full'));
