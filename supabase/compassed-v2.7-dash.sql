-- ===== Compass Ed v2.7: Compass Dash moves inside Compass Ed =====
-- Run AFTER compassed-v2.6-campus.sql. Safe to run again.
-- Compass Dash now lives at /dash/ on the Compass Ed site and opens inside both portals. It keeps using its own cd_*
-- functions in this same database; this file only adds what the portal needs to sign a linked student into it.

-- The signed-in student's own linked Compass Dash sign-in (code + username), so the portal can sign them into the
-- embedded Compass Dash without typing. Students only; only their own link.
create or replace function public.ed_s_cd_session(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'linked', u.cd_code is not null, 'code', u.cd_code, 'user', u.cd_user);
end $$;

-- School links that pointed at the old Compass Dash address now point at its new home
update public.ed_school set links = replace(links::text, 'https://compassdash.github.io/Compassdash/', 'https://compass-ed.github.io/dash/')::jsonb
  where links::text like '%compassdash.github.io/Compassdash%';

-- Permissions (same rule as before)
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ed\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.name in ('ed_login','ed_signup','ed_claim','ed_logout','ed_me','ed_pw','ed_public','ed_notif_read','ed_board','ed_parent',
                  'ed_code_check','ed_code_login','ed_code_setup','ed_pw_set','ed_consent','ed_links','ed_feedback_send')
       or f.name like 'ed\_s\_%' or f.name like 'ed\_t\_%' or f.name like 'ed\_a\_%' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;
grant usage on schema public to anon, authenticated;
