-- Drop NOT NULL from plaid_accounts.access_token. Phase 2 of 3.
--
-- Applied to the live project 2026-08-01 via apply_migration, and verified.
--
-- Caught by testing plaid_store_access_token against the live schema rather
-- than trusting it: the very first call failed with
--
--   23502: null value in column "access_token" violates not-null constraint
--
-- The column was declared NOT NULL when it was the only place a token lived.
-- Now that new rows carry `access_token_secret_id` and no plaintext at all, the
-- constraint makes the Vault write path impossible — every new bank link would
-- have failed at the point of saving credentials, after the Plaid exchange had
-- already succeeded.
--
-- The column itself goes in phase 3, once the deployed functions have stopped
-- reading it. This only removes the constraint that blocks phase 2.
alter table public.plaid_accounts
  alter column access_token drop not null;
