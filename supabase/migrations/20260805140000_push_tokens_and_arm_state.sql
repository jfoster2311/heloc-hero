-- Push delivery: somewhere to send to, and somewhere to remember what was sent.
--
-- Until now every prompt was scheduled ON the device, which cannot see a bank
-- balance while the app is closed. Plaid already tells us when balances move
-- (plaid-webhook), so the only missing pieces are a token to deliver to and a
-- record of what has already been said.

create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  -- An Expo push token ("ExponentPushToken[...]"), not a raw APNs device token.
  -- Expo's service holds the APNs credential, which is what lets this ship
  -- without certificate handling in an Edge Function.
  token       text not null,
  platform    text not null default 'ios' check (platform in ('ios', 'android')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- On the TOKEN, not on (user_id, token). Expo reissues a token to whichever
  -- install currently owns it, so the same string can migrate between users
  -- when a device is handed on or an account is switched. Keyed by user too,
  -- the old row would survive and that person's alerts would keep arriving on
  -- someone else's phone.
  unique (token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Users manage their own tokens; the sender runs as service_role and bypasses
-- this entirely. No policy grants cross-user reads, so one account cannot
-- enumerate another's devices.
drop policy if exists "Users own push tokens" on public.push_tokens;
create policy "Users own push tokens"
  on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Arm state moves server-side, because the sender does.
--
-- The device-local version (AsyncStorage, lib/notify.ts) records what THIS
-- install has said. Once a server sends, that is the wrong scope: two devices
-- would each fire for a single crossing. One row per user is the right grain,
-- and automation_settings already has exactly that.
alter table public.automation_settings
  add column if not exists cash_alert_armed boolean not null default true;

alter table public.automation_settings
  add column if not exists cash_alert_last_fired_at timestamptz;
