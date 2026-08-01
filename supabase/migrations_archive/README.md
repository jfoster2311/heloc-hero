# Archived migrations

Not a migrations directory. The Supabase CLI reads `supabase/migrations/*.sql`
and never looks here, which is the point.

## `001_initial_schema.sql`

**Never applied to project `lpsqrjwlleewckucdlhz`, and it must never be.**

It was written for a schema this project does not have. The live database grew
from a different, older backend, and was brought into line with the app in
`20260722014342_reconcile_app_schema.sql` — an *additive* migration that alters
what is already there. `001` instead creates those tables from scratch.

Two things made leaving it in place dangerous:

- It sorted **first**. `001` orders before `2026…` lexically, so any tool that
  replays this directory in order would have run it before the reconcile.
- Its `users_tier_check` allows only `('free','medium','full')`. The live
  constraint allows `'pro'`, which is the tier the app assigns to every paid
  user.

It is kept rather than deleted because it is the only written record of what the
schema was originally intended to look like, and the reconcile migration reads
as a diff against something. That something is this file.

## If you are rebuilding from scratch

Do not start here. Start at `20260722014342_reconcile_app_schema.sql` — but read
it first: it is `alter table ... add column if not exists` throughout, so it
assumes the legacy tables exist. A genuine from-nothing rebuild needs a new
consolidated baseline dumped from the live database (`supabase db dump`), not
this file.
