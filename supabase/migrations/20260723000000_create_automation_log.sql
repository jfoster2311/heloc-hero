-- automation_log: the record of sweeps and dumps.
--
-- Applied to the live project 2026-07-23 via apply_migration.
--
-- useStreak has always queried this table, but it was never created — the
-- dashboard streak silently resolved to 0 for every user. It is also the only
-- honest destination for the "I moved $X" action on the decision screen:
-- HELOC Hero has no payment rail, so the user makes the transfer at their bank
-- and records it here.
create table if not exists public.automation_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  action     text not null check (action in ('sweep', 'dump')),
  amount     numeric not null default 0,
  status     text not null default 'success' check (status in ('pending', 'success', 'failed')),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists automation_log_user_created_idx
  on public.automation_log (user_id, created_at desc);

alter table public.automation_log enable row level security;

drop policy if exists "own automation_log select" on public.automation_log;
create policy "own automation_log select" on public.automation_log
  for select using (auth.uid() = user_id);

drop policy if exists "own automation_log insert" on public.automation_log;
create policy "own automation_log insert" on public.automation_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "own automation_log update" on public.automation_log;
create policy "own automation_log update" on public.automation_log
  for update using (auth.uid() = user_id);

drop policy if exists "own automation_log delete" on public.automation_log;
create policy "own automation_log delete" on public.automation_log
  for delete using (auth.uid() = user_id);
