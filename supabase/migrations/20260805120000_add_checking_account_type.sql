-- Split checking out of the combined "Savings / Checking" role.
--
-- The sweep threshold watches the account a paycheck lands in, and that is
-- almost always checking. While both shared one role, `useAccounts` resolved it
-- with a single `.find()` and the balance came from whichever account Plaid
-- happened to return first — so the figure behind every sweep suggestion was
-- decided by ordering, not by the user.
--
-- Existing rows are left as 'savings' deliberately. They are still valid, still
-- resolve as the cash account, and re-labelling someone's account on their
-- behalf would be a guess about which one they linked.

alter table public.linked_accounts
  drop constraint if exists linked_accounts_account_type_check;

alter table public.linked_accounts
  add constraint linked_accounts_account_type_check
  check (account_type in ('mortgage', 'home equity', 'savings', 'checking'));
