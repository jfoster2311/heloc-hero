-- The floor a cash-threshold alert has to clear before it is worth a buzz.
--
-- buffer_target + upcoming_bills_estimate already decide what counts as spare,
-- but "spare" starts at one cent above them. Firing a notification telling
-- someone to go and make a bank transfer of $12 is how an alert gets muted, and
-- a muted alert costs the prompt that actually mattered.
--
-- Default is deliberately low. This gates a suggestion, not a transfer, and a
-- user who wants to hear about smaller amounts should not have to discover a
-- setting to be told about their own money.

alter table public.automation_settings
  add column if not exists min_sweep_amount numeric not null default 100;
