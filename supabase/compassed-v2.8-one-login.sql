-- ===== Compass Ed v2.8: one sign-in for Compass Ed and Compass Dash =====
-- Run AFTER compassed-v2.7-dash.sql (and after Compass Dash's own v2.8.0 teacher-accounts file). Safe to run again.
-- Compass Dash opens with the Compass Ed account. Students: their Compass Dash account is made the first time they
-- open it (or the one they already linked is used). Staff: the Teacher Panel opens without a password once they
-- have signed in to it one time from inside Compass Ed. Nothing here is callable without a Compass Ed session.

alter table public.ed_user add column if not exists cd_tid int;   -- the Compass Dash teacher seat this staff member uses

-- Compass Dash side: make a signed-up student account for a trusted caller (never the browser; revoked below).
-- Same rows Compass Dash's own codes and sign-up make, minus the per-connection limit, which is for guessing codes.
create or replace function public.cd_sso_student(p_name text, p_house text, p_year int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare base text := btrim(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9_]+', '_', 'g'), 12), '_'); u text; c text; i int := 1;
  h text := upper(nullif(btrim(coalesce(p_house, '')), '')); y int := case when p_year between 7 and 9 then p_year end;
begin
  if length(base) < 3 or not public.cd_clean(base) then base := 'student'; end if;
  if h is not null and h not in ('N','E','S','W') then h := null; end if;
  u := base;
  while exists (select 1 from public.cd_codes where lower(username) = lower(u) or lower(prev_user) = lower(u)) loop
    i := i + 1; if i > 500 then return json_build_object('ok', false, 'error', 'name_taken'); end if;
    u := base || i::text;   -- at most 12 + 3 characters, inside Compass Dash's 3-16 rule
  end loop;
  c := public.cd_new_code(); if c is null then return json_build_object('ok', false, 'error', 'no_codes'); end if;
  insert into public.cd_codes (code, username, used_at, house, year) values (c, u, now(), h, y);
  return json_build_object('ok', true, 'code', c, 'username', u);
exception when unique_violation then
  return json_build_object('ok', false, 'error', 'name_taken');
end $$;
revoke all on function public.cd_sso_student(text, text, int) from public, anon, authenticated;

-- Student: the Compass Dash account to sign in with, made on first use. Gives back Compass Dash's own sign-in answer
-- ("info"), so the app signs in without asking again. A link whose account was removed in Compass Dash is replaced.
create or replace function public.ed_s_cd_session(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); r json; made boolean := false;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  if not public.ed_cd_on() then return json_build_object('ok', true, 'on', false); end if;
  select * into u from public.ed_user where id = u.id for update;   -- two tabs at once make one account, not two
  if u.cd_code is not null then
    r := public.ed_cd_call('cd_login', jsonb_build_object('p_code', u.cd_code, 'p_user', u.cd_user));
    if r is null or (r->>'error') in ('locked', 'busy') then return public.ed_err('cd_busy'); end if;
    if (r->>'ok')::boolean is not true then update public.ed_user set cd_code = null, cd_user = null where id = u.id; u.cd_code := null; end if;
  end if;
  if u.cd_code is null then
    r := public.cd_sso_student(u.username, u.house, u.year);
    if (r->>'ok')::boolean is not true then return public.ed_err('cd_' || coalesce(r->>'error', 'failed')); end if;
    r := public.ed_cd_call('cd_login', jsonb_build_object('p_code', r->>'code', 'p_user', r->>'username'));
    if r is null or (r->>'ok')::boolean is not true then return public.ed_err('cd_busy'); end if;
    made := true;
  end if;
  update public.ed_user set cd_code = r->>'code', cd_user = r->>'username',
    house = case when house is null and (r->>'house') in ('N','E','S','W') then r->>'house' else house end
   where id = u.id and (cd_code is distinct from r->>'code' or cd_user is distinct from r->>'username' or house is null);
  return json_build_object('ok', true, 'on', true, 'made', made, 'code', r->>'code', 'user', r->>'username', 'info', r);
end $$;

-- Staff: a fresh Teacher Panel session for the linked seat, or linked:false.
create or replace function public.ed_t_cd_session(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); t record;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if to_regclass('public.cd_teacher') is null or u.cd_tid is null then return json_build_object('ok', true, 'linked', false); end if;
  select * into t from public.cd_teacher where id = u.cd_tid;
  if t.id is null or t.disabled or t.username is null then
    update public.ed_user set cd_tid = null where id = u.id; return json_build_object('ok', true, 'linked', false);
  end if;
  return json_build_object('ok', true, 'linked', true, 'tok', public.cd_tsess_new(t.id),
    't', json_build_object('id', t.id, 'subj', t.subj, 'seat', t.seat, 'name', t.name, 'username', t.username));
end $$;

-- Staff: remember the Teacher Panel seat they just signed in to (p_tkey is that Compass Dash session, which proves it).
create or replace function public.ed_t_cd_link(p_key text, p_tkey text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); t record;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if to_regclass('public.cd_teacher') is null then return public.ed_err('no_compassdash'); end if;
  select * into t from public.cd_tok(p_tkey);   -- null fields when the session is not valid
  if t.id is null or t.username is null then return public.ed_err('cd_no_match'); end if;
  update public.ed_user set cd_tid = null where cd_tid = t.id and id <> u.id;   -- a seat belongs to one person
  update public.ed_user set cd_tid = t.id where id = u.id;
  return json_build_object('ok', true, 't', json_build_object('id', t.id, 'subj', t.subj, 'name', t.name, 'username', t.username));
end $$;

-- Staff: which seat is linked (for Settings), without starting a session; and unlink.
create or replace function public.ed_t_cd_me(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); t record;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if to_regclass('public.cd_teacher') is null then return json_build_object('ok', true, 'on', false); end if;
  select * into t from public.cd_teacher where id = u.cd_tid;   -- no row: every field null
  return json_build_object('ok', true, 'on', true, 'linked', t.id is not null,
    't', case when t.id is not null then json_build_object('name', t.name, 'username', t.username) end);
end $$;
create or replace function public.ed_t_cd_unlink(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  update public.ed_user set cd_tid = null where id = u.id; return json_build_object('ok', true);
end $$;

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
