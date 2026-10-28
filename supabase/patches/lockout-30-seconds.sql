-- ===== Sign-in lockout: 30 seconds instead of 15 minutes =====
-- Run ONCE in the Compass Dash Supabase project (SQL Editor). Safe to run again.
-- The guard is shared by Compass Dash and CompassED: after 5 wrong sign-ins from one connection
-- it locks that connection. This patch keeps the 5-attempt rule but shortens the lock to 30 seconds.
-- Note: a shorter lock makes guessing 4-digit codes easier; the original 15 minutes is the safer setting.
-- To go back, run compass-dash-v2.6.6-features.sql section 2 again.

create or replace function public.cd_guard_fail(p_what text) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.cd_guard as g (ip, fails, first_at) values (public.cd_ip(), 1, now())
    on conflict (ip) do update set
      fails    = case when g.first_at < now() - interval '15 minutes' then 1 else g.fails + 1 end,
      first_at = case when g.first_at < now() - interval '15 minutes' then now() else g.first_at end
    returning fails into n;
  if n >= 5 then
    update public.cd_guard set lock_until = now() + interval '30 seconds', fails = 0, first_at = now() where ip = public.cd_ip();
  end if;
  delete from public.cd_guard where coalesce(lock_until, first_at) < now() - interval '1 day';
end $$;
revoke all on function public.cd_guard_fail(text) from public, anon, authenticated;
