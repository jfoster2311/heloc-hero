-- Let a device actually claim its push token.
--
-- The previous migration created push_tokens with `unique (token)` and argued
-- that a handset handed to another account would "move rather than duplicate".
-- It does not. The client upsert (on conflict token) has to UPDATE a row still
-- owned by the previous user, and the RLS policy's USING clause rejects that:
--
--   42501: new row violates row-level security policy (USING expression)
--
-- So the write failed, the row stayed with the old owner, and the new owner's
-- device was never registered. The consequence is the exact leak the unique
-- constraint was meant to prevent: the previous user's cash alerts — which
-- quote a dollar figure — keep being delivered to a phone somebody else is now
-- holding, and the new user silently gets no alerts at all.
--
-- Fixed with a SECURITY DEFINER claim function rather than by loosening the
-- policy. An UPDATE policy permissive enough to allow the takeover would have
-- to use `using (true)`, which lets any authenticated user reassign any token
-- row they can name. This keeps the table's policy strict and puts the one
-- legitimate cross-user write behind a function that can validate its input.
--
-- Holding the token string is the credential here, and that is sound: Expo
-- issues it to a specific install, and it is the address delivery goes to. A
-- device that can present it is the device that would receive the push anyway.

create or replace function public.register_push_token(
  p_token    text,
  p_platform text default 'ios'
)
returns void
language plpgsql
security definer
-- Pinned so the function cannot be hijacked by a caller-controlled search_path.
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'register_push_token requires an authenticated caller';
  end if;

  -- Shape-checked here as well as in the sender. A malformed recipient makes
  -- Expo reject the entire batch, so one bad row would silence every other
  -- device on the same send.
  if p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then
    raise exception 'not an Expo push token';
  end if;

  if p_platform not in ('ios', 'android') then
    raise exception 'unsupported platform: %', p_platform;
  end if;

  -- The takeover. Removing the stale row first is what stops the old owner's
  -- alerts reaching this handset; it is the whole point of the function.
  delete from public.push_tokens
   where token = p_token
     and user_id <> auth.uid();

  -- Re-registering an unchanged token is the common case (every launch), so it
  -- must not error. Only updated_at moves.
  insert into public.push_tokens (user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update
     set user_id    = excluded.user_id,
         platform   = excluded.platform,
         updated_at = now();
end;
$$;

-- anon is revoked SEPARATELY and that is not redundant: Supabase's default
-- privileges on `public` grant EXECUTE to anon explicitly, and revoking from
-- PUBLIC does not remove an explicit grant to a named role. Without the second
-- line the function stays callable unauthenticated at /rest/v1/rpc/ (it would
-- raise on the null auth.uid(), but the linter flags the grant, correctly).
revoke all     on function public.register_push_token(text, text) from public;
revoke all     on function public.register_push_token(text, text) from anon;
grant  execute on function public.register_push_token(text, text) to authenticated;
