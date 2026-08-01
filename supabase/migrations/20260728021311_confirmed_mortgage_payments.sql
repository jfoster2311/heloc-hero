-- 20260728180000_confirmed_mortgage_payments.sql
--
-- One more annotation on transaction_meta: the user telling us a transaction is
-- their mortgage payment.
--
-- ── Why this is stored and not inferred every time ─────────────────────────
-- lib/cashflow.ts already excludes rows Plaid labels
-- LOAN_PAYMENTS_MORTGAGE_PAYMENT, because computeProjection subtracts the
-- payment separately and counting it in spending too would subtract it twice.
-- That label is missing on plenty of real payments — bill-pay, a servicer the
-- institution does not recognise, escrow bundled in — and the app must not
-- guess, because guessing wrong in one direction overstates surplus and
-- oversizes a draw taken against someone's house.
--
-- So detection (lib/mortgagePayments.ts) only ever proposes. This column is the
-- user's answer, and it is what classifyTransactions actually reads.
alter table public.transaction_meta
  add column if not exists mortgage_payment boolean not null default false;

-- Read on every classification pass to build the exclusion set, and true for a
-- handful of rows out of thousands.
create index if not exists transaction_meta_mortgage_idx
  on public.transaction_meta (user_id) where mortgage_payment;

comment on column public.transaction_meta.mortgage_payment is
  'User confirmed this transaction is their mortgage payment. Excluded from '
  'spending totals because computeProjection models the payment directly. '
  'Proposed by lib/mortgagePayments.ts; never set without the user saying so.';
