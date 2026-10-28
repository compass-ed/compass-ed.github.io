-- ===== CompassED v2.3: login codes, admin dashboard, consent, external calendar feeds, Compass Dash link =====
-- Run AFTER compassed-v2.0.sql and compassed-v2.1.sql. Safe to run again; it never deletes data.
--
-- What it adds
--   1. Login codes in the form 1234-5678. A blank code creates an account the first time it is used (the student or
--      teacher picks a username and password); a code made for an existing account signs that person in and asks
--      them to set a new password. Codes are unique, single-owner, printable, and can be revoked at any time.
--   2. Consent: every account records when it accepted the Terms and Privacy Policy (and parental consent where
--      given). Sign-up and code set-up require it.
--   3. External calendar feeds: subscribe to any iCalendar (.ics) address, e.g. a Global Campus or school
--      calendar export, and mirror its events into the campus calendar. Needs the `http` extension (section 5).
--   4. Compass Dash link: Compass Dash runs in this same database (its cd_* functions). Students can link their
--      Compass Dash student code + username; CompassED then shows their XP, mastery, assignments and teacher
--      announcements from Compass Dash, and everyone sees the Compass Dash house XP, challenges and cup.
--   5. An admin overview (ed_a_dash) and "sign out everywhere" for any account.

-- ---------- 1. Schema ----------
create table if not exists public.ed_code (
  code       text primary key check (code ~ '^[0-9]{4}-[0-9]{4}$'),
  uid        int references public.ed_user(id) on delete cascade,     -- null until the code has created an account
  role       text not null default 'student' check (role in ('student','teacher')),
  purpose    text not null default 'join' check (purpose in ('join','reset')),
  label      text not null default '',                                 -- printed on the sheet, e.g. "7A · September"
  class_id   int references public.ed_class(id) on delete set null,
  year       int check (year is null or year between 7 and 13),
  created    timestamptz not null default now(),
  created_by int references public.ed_user(id) on delete set null,
  expires    timestamptz not null default now() + interval '180 days', -- unused codes stop working after this
  used_at    timestamptz,
  last_used  timestamptz,
  revoked_at timestamptz
);
create index if not exists ed_code_uid on public.ed_code (uid);
alter table public.ed_user add column if not exists consent jsonb not null default '{}'::jsonb;  -- {terms:ts, privacy:ts, parent:ts}
alter table public.ed_user add column if not exists must_pw boolean not null default false;      -- signed in with a reset code: set a password
alter table public.ed_user add column if not exists cd_code text;                                 -- linked Compass Dash student code
alter table public.ed_user add column if not exists cd_user text;
alter table public.ed_event add column if not exists src  text;                                   -- 'feed:<id>' for mirrored events
alter table public.ed_event add column if not exists src_uid text;
create unique index if not exists ed_event_src on public.ed_event (src, src_uid) where src is not null;
alter table public.ed_school add column if not exists links jsonb not null default '[]'::jsonb;   -- [{name,url,blurb}] shown on portal home pages
create table if not exists public.ed_feed (
  id         serial primary key,
  name       text not null,
  url        text not null,
  source     text not null default 'other' check (source in ('globalcampus','compassdash','other')),
  class_id   int references public.ed_class(id) on delete cascade,     -- null = whole school
  tz         text not null default 'Europe/London',                     -- for floating (no time zone) times in the feed
  last_sync  timestamptz,
  last_error text,
  n          int not null default 0,
  uid        int references public.ed_user(id) on delete set null,
  created    timestamptz not null default now()
);
alter table public.ed_code enable row level security;
alter table public.ed_feed enable row level security;
revoke all on public.ed_code, public.ed_feed from anon, authenticated;

-- ---------- 2. Identity (adds must_pw, consent, Compass Dash link, house) ----------
create or replace function public.ed_info(u public.ed_user) returns json language sql stable as $$
  select json_build_object('id', u.id, 'role', u.role, 'username', u.username, 'name', u.name, 'year', u.year, 'subj', u.subj, 'house', u.house,
    'must_pw', u.must_pw, 'consent', u.consent, 'cd', u.cd_code is not null,
    'class', (select json_build_object('id', id, 'name', name, 'year', year, 'subj', subj) from public.ed_class where id = u.class_id)) $$;

-- Record consent (terms + privacy are required; parent is optional, for under-13s)
create or replace function public.ed_consent(p_key text, p_terms boolean, p_privacy boolean, p_parent boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); c jsonb;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if not coalesce(p_terms, false) or not coalesce(p_privacy, false) then return public.ed_err('consent'); end if;
  c := u.consent || jsonb_build_object('terms', now(), 'privacy', now(), 'v', 1);
  if coalesce(p_parent, false) then c := c || jsonb_build_object('parent', now()); end if;
  update public.ed_user set consent = c where id = u.id;
  return json_build_object('ok', true, 'consent', c);
end $$;

-- Sign-up and teacher claim now require consent (old 6/5-argument versions are replaced)
drop function if exists public.ed_signup(text, text, text, text, int, int);
drop function if exists public.ed_claim(text, text, text, text, int);
create or replace function public.ed_signup(p_join text, p_user text, p_pw text, p_name text, p_year int, p_class int, p_consent boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare sc public.ed_school; i int;
begin
  if public.ed_guard_secs() > 0 then return public.ed_err('locked'); end if;
  if not coalesce(p_consent, false) then return public.ed_err('consent'); end if;
  select * into sc from public.ed_school where id = 1;
  if sc.id is null or upper(btrim(coalesce(p_join, ''))) <> upper(sc.join_code) then perform public.ed_guard_fail(); return public.ed_err('bad_code'); end if;
  if p_user !~ '^[A-Za-z0-9_.]{3,24}$' then return public.ed_err('bad_user'); end if;
  if length(coalesce(p_pw, '')) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  if not public.ed_ok_text(p_name, 60) then return public.ed_err('bad_text'); end if;
  if exists (select 1 from public.ed_user where lower(username) = lower(p_user)) then return public.ed_err('taken'); end if;
  if p_class is not null and p_class <> 0 and not exists (select 1 from public.ed_class where id = p_class) then return public.ed_err('no_class'); end if;
  insert into public.ed_user (role, username, name, pw, year, class_id, consent) values ('student', p_user, btrim(p_name), crypt(p_pw, gen_salt('bf', 10)), nullif(p_year, 0), nullif(p_class, 0), jsonb_build_object('terms', now(), 'privacy', now(), 'v', 1)) returning id into i;
  return json_build_object('ok', true, 'tok', public.ed_tok_new(i), 'me', (select public.ed_info(u) from public.ed_user u where u.id = i));
end $$;
create or replace function public.ed_claim(p_invite text, p_user text, p_pw text, p_name text, p_subj int, p_consent boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare sc public.ed_school; i int;
begin
  if public.ed_guard_secs() > 0 then return public.ed_err('locked'); end if;
  if not coalesce(p_consent, false) then return public.ed_err('consent'); end if;
  select * into sc from public.ed_school where id = 1;
  if sc.id is null or upper(btrim(coalesce(p_invite, ''))) <> upper(sc.invite_code) then perform public.ed_guard_fail(); return public.ed_err('bad_code'); end if;
  if p_user !~ '^[A-Za-z0-9_.]{3,24}$' then return public.ed_err('bad_user'); end if;
  if length(coalesce(p_pw, '')) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  if not public.ed_ok_text(p_name, 60) then return public.ed_err('bad_text'); end if;
  if exists (select 1 from public.ed_user where lower(username) = lower(p_user)) then return public.ed_err('taken'); end if;
  insert into public.ed_user (role, username, name, pw, subj, consent) values ('teacher', p_user, btrim(p_name), crypt(p_pw, gen_salt('bf', 10)), nullif(p_subj, -1), jsonb_build_object('terms', now(), 'privacy', now(), 'v', 1)) returning id into i;
  return json_build_object('ok', true, 'tok', public.ed_tok_new(i), 'me', (select public.ed_info(u) from public.ed_user u where u.id = i));
end $$;

-- ---------- 3. Login codes ----------
create or replace function public.ed_code_norm(p text) returns text language sql immutable as $$
  select case when regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8}$'
              then substr(regexp_replace(p, '[^0-9]', '', 'g'), 1, 4) || '-' || substr(regexp_replace(p, '[^0-9]', '', 'g'), 5, 4) else null end $$;

-- A fresh, unique code from the database's random generator. Never repeats an existing code (used, revoked or not).
create or replace function public.ed_code_make() returns text language plpgsql security definer set search_path = public, extensions as $$
declare c text; b bytea; n int := 0;
begin
  loop
    b := gen_random_bytes(4);
    c := lpad(((get_byte(b, 0) * 256 + get_byte(b, 1)) % 10000)::text, 4, '0') || '-' || lpad(((get_byte(b, 2) * 256 + get_byte(b, 3)) % 10000)::text, 4, '0');
    n := n + 1;
    exit when c !~ '^(\d)\1{3}-(\d)\2{3}$'                              -- no 1111-2222 style codes
         and c not in ('1234-5678', '0000-0000', '1234-1234', '4321-8765')
         and not exists (select 1 from public.ed_code where code = c);
    if n > 500 then raise exception 'no_free_codes'; end if;
  end loop;
  return c;
end $$;

-- Staff: list codes (admin: all; teachers: student codes for their classes)
create or replace function public.ed_a_codes(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'admin', u.role = 'admin', 'rows', (select coalesce(json_agg(json_build_object(
      'code', c.code, 'role', c.role, 'purpose', c.purpose, 'label', c.label, 'class_id', c.class_id, 'class', (select name from public.ed_class where id = c.class_id), 'year', c.year,
      'created', c.created, 'by', (select name from public.ed_user x where x.id = c.created_by), 'expires', c.expires, 'used_at', c.used_at, 'last_used', c.last_used, 'revoked_at', c.revoked_at,
      'uid', c.uid, 'user', (select json_build_object('name', x.name, 'username', x.username, 'disabled', x.disabled) from public.ed_user x where x.id = c.uid),
      'status', case when c.revoked_at is not null then 'revoked' when c.uid is null and c.expires < now() then 'expired' when c.uid is null then 'unused' else 'active' end) order by c.created desc), '[]'::json)
    from public.ed_code c where u.role = 'admin' or (c.role = 'student' and (c.class_id = any(public.ed_my_classes(u)) or exists (select 1 from public.ed_user x where x.id = c.uid and x.class_id = any(public.ed_my_classes(u)))))));
end $$;

-- Make codes. p_uid > 0: one code for that existing account (any earlier codes for them are revoked; they will be asked to
-- set a new password when they use it). Otherwise p_n blank codes (1 to 200) for new accounts of p_role.
create or replace function public.ed_a_code_gen(p_key text, p_n int, p_role text, p_class int, p_year int, p_label text, p_uid int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); t public.ed_user; codes text[] := '{}'; c text; i int; r text := coalesce(nullif(p_role, ''), 'student');
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if length(coalesce(p_label, '')) > 60 then return public.ed_err('bad_text'); end if;
  if coalesce(p_uid, 0) > 0 then
    select * into t from public.ed_user where id = p_uid;
    if t.id is null then return public.ed_err('not_found'); end if;
    if t.role = 'admin' and u.id <> t.id then return public.ed_err('forbidden'); end if;                              -- nobody makes a code for another administrator
    if u.role <> 'admin' and not (t.role = 'student' and t.class_id = any(public.ed_my_classes(u))) then return public.ed_err('forbidden'); end if;
    update public.ed_code set revoked_at = now() where uid = t.id and revoked_at is null;
    c := public.ed_code_make();
    insert into public.ed_code (code, uid, role, purpose, label, class_id, year, created_by, expires) values (c, t.id, case when t.role = 'student' then 'student' else 'teacher' end, 'reset', coalesce(p_label, ''), t.class_id, t.year, u.id, now() + interval '30 days');
    return json_build_object('ok', true, 'codes', json_build_array(c));
  end if;
  if r not in ('student', 'teacher') then return public.ed_err('bad_text'); end if;
  if u.role <> 'admin' and (r <> 'student' or coalesce(p_class, 0) = 0 or not public.ed_can_class(u, p_class)) then return public.ed_err('forbidden'); end if;
  if coalesce(p_class, 0) <> 0 and not exists (select 1 from public.ed_class where id = p_class) then return public.ed_err('no_class'); end if;
  for i in 1 .. least(greatest(coalesce(p_n, 1), 1), 200) loop
    c := public.ed_code_make();
    insert into public.ed_code (code, role, purpose, label, class_id, year, created_by) values (c, r, 'join', coalesce(p_label, ''), case when r = 'student' then nullif(p_class, 0) end, case when r = 'student' then nullif(p_year, 0) end, u.id);
    codes := codes || c;
  end loop;
  return json_build_object('ok', true, 'codes', to_json(codes));
end $$;

create or replace function public.ed_a_code_revoke(p_key text, p_code text, p_undo boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); c public.ed_code;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  select * into c from public.ed_code where code = public.ed_code_norm(p_code);
  if c.code is null then return public.ed_err('not_found'); end if;
  if u.role <> 'admin' and not (c.role = 'student' and (c.class_id = any(public.ed_my_classes(u)) or exists (select 1 from public.ed_user x where x.id = c.uid and x.class_id = any(public.ed_my_classes(u))))) then return public.ed_err('forbidden'); end if;
  if coalesce(p_undo, false) then update public.ed_code set revoked_at = null where code = c.code;
  else update public.ed_code set revoked_at = now() where code = c.code; end if;
  return json_build_object('ok', true);
end $$;

-- Delete codes that can never be used again (revoked, or unused and expired). Keeps active ones.
create or replace function public.ed_a_code_purge(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); n int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  delete from public.ed_code where revoked_at is not null or (uid is null and expires < now()); get diagnostics n = row_count;
  return json_build_object('ok', true, 'n', n);
end $$;

-- Public: what does this code do? 'new' (will create an account), 'account' (signs an existing person in), or an error.
-- Wrong codes count towards the sign-in lockout.
create or replace function public.ed_code_check(p_code text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare c public.ed_code; s int := public.ed_guard_secs();
begin
  if s > 0 then return json_build_object('ok', false, 'error', 'locked', 'secs', s); end if;
  select * into c from public.ed_code where code = public.ed_code_norm(p_code) and revoked_at is null;
  if c.code is null or (c.uid is null and c.expires < now()) then perform public.ed_guard_fail(); s := public.ed_guard_secs(); return json_build_object('ok', false, 'error', case when s > 0 then 'locked' else 'bad_code' end, 'secs', s); end if;
  if c.uid is null then
    return json_build_object('ok', true, 'status', 'new', 'role', c.role, 'year', c.year, 'class', (select name from public.ed_class where id = c.class_id), 'label', c.label);
  end if;
  return json_build_object('ok', true, 'status', 'account', 'role', c.role, 'name', (select split_part(name, ' ', 1) from public.ed_user where id = c.uid), 'reset', c.purpose = 'reset' and c.used_at is null);
end $$;

-- Public: sign in with a code that belongs to an account
create or replace function public.ed_code_login(p_code text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare c public.ed_code; u public.ed_user; s int := public.ed_guard_secs();
begin
  if s > 0 then return json_build_object('ok', false, 'error', 'locked', 'secs', s); end if;
  select * into c from public.ed_code where code = public.ed_code_norm(p_code) and revoked_at is null and uid is not null;
  if c.code is null then perform public.ed_guard_fail(); s := public.ed_guard_secs(); return json_build_object('ok', false, 'error', case when s > 0 then 'locked' else 'bad_code' end, 'secs', s); end if;
  select * into u from public.ed_user where id = c.uid;
  if u.id is null then return public.ed_err('bad_code'); end if;
  if u.disabled then return public.ed_err('disabled'); end if;
  delete from public.ed_guard where ip = public.ed_ip();
  if c.purpose = 'reset' and c.used_at is null then update public.ed_user set must_pw = true where id = u.id; delete from public.ed_session where uid = u.id; end if;
  update public.ed_code set used_at = coalesce(used_at, now()), last_used = now() where code = c.code;
  update public.ed_user set last_seen = now() where id = u.id;
  return json_build_object('ok', true, 'tok', public.ed_tok_new(u.id), 'me', (select public.ed_info(x) from public.ed_user x where x.id = u.id));
end $$;

-- Public: first use of a blank code: create the account (consent required)
create or replace function public.ed_code_setup(p_code text, p_user text, p_pw text, p_name text, p_consent boolean, p_parent boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare c public.ed_code; i int; s int := public.ed_guard_secs();
begin
  if s > 0 then return json_build_object('ok', false, 'error', 'locked', 'secs', s); end if;
  if not coalesce(p_consent, false) then return public.ed_err('consent'); end if;
  select * into c from public.ed_code where code = public.ed_code_norm(p_code) and revoked_at is null and uid is null and expires > now() for update;
  if c.code is null then perform public.ed_guard_fail(); return public.ed_err('bad_code'); end if;
  if p_user !~ '^[A-Za-z0-9_.]{3,24}$' then return public.ed_err('bad_user'); end if;
  if length(coalesce(p_pw, '')) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  if not public.ed_ok_text(p_name, 60) then return public.ed_err('bad_text'); end if;
  if exists (select 1 from public.ed_user where lower(username) = lower(p_user)) then return public.ed_err('taken'); end if;
  insert into public.ed_user (role, username, name, pw, year, class_id, consent)
    values (c.role, p_user, btrim(p_name), crypt(p_pw, gen_salt('bf', 10)), c.year, c.class_id, jsonb_build_object('terms', now(), 'privacy', now(), 'v', 1) || case when coalesce(p_parent, false) then jsonb_build_object('parent', now()) else '{}'::jsonb end)
    returning id into i;
  update public.ed_code set uid = i, used_at = now(), last_used = now() where code = c.code;
  delete from public.ed_guard where ip = public.ed_ip();
  return json_build_object('ok', true, 'tok', public.ed_tok_new(i), 'me', (select public.ed_info(x) from public.ed_user x where x.id = i));
end $$;

-- Set a password after signing in with a reset code (no old password needed; only while must_pw is set)
create or replace function public.ed_pw_set(p_key text, p_new text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if not u.must_pw then return public.ed_err('forbidden'); end if;
  if length(coalesce(p_new, '')) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  update public.ed_user set pw = crypt(p_new, gen_salt('bf', 10)), must_pw = false where id = u.id;
  delete from public.ed_session where uid = u.id and tok <> encode(digest(p_key, 'sha256'), 'hex');
  return json_build_object('ok', true);
end $$;

-- Staff: my own codes and the codes of one account (for the account editor)
create or replace function public.ed_a_user_codes(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); t public.ed_user;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  select * into t from public.ed_user where id = p_id; if t.id is null then return public.ed_err('not_found'); end if;
  if u.role <> 'admin' and not (t.role = 'student' and t.class_id = any(public.ed_my_classes(u))) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('code', c.code, 'purpose', c.purpose, 'created', c.created, 'used_at', c.used_at, 'last_used', c.last_used, 'revoked_at', c.revoked_at) order by c.created desc), '[]'::json) from public.ed_code c where c.uid = t.id),
    'sessions', (select count(*) from public.ed_session where uid = t.id));
end $$;

-- Staff: sign an account out of every device (admin: anyone; teacher: their students)
create or replace function public.ed_a_user_kick(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); t public.ed_user; n int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  select * into t from public.ed_user where id = p_id; if t.id is null then return public.ed_err('not_found'); end if;
  if u.role <> 'admin' and not (t.role = 'student' and t.class_id = any(public.ed_my_classes(u))) then return public.ed_err('forbidden'); end if;
  delete from public.ed_session where uid = t.id; get diagnostics n = row_count;
  return json_build_object('ok', true, 'n', n);
end $$;

-- ---------- 4. Admin overview ----------
create or replace function public.ed_a_dash(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true,
    'school', (select json_build_object('name', name, 'join_code', join_code, 'invite_code', invite_code, 'links', links, 'houses', houses) from public.ed_school where id = 1),
    'students', (select count(*) from public.ed_user where role = 'student' and not disabled),
    'staff', (select count(*) from public.ed_user where role <> 'student' and not disabled),
    'disabled', (select count(*) from public.ed_user where disabled),
    'no_consent', (select count(*) from public.ed_user where not (consent ? 'terms')),
    'active_today', (select count(*) from public.ed_user where last_seen > now() - interval '1 day'),
    'active_week', (select count(*) from public.ed_user where last_seen > now() - interval '7 days'),
    'sessions', (select count(*) from public.ed_session where seen > now() - interval '30 days'),
    'locked_ips', (select count(*) from public.ed_guard where lock_until > now()),
    'codes', (select json_build_object('unused', count(*) filter (where uid is null and revoked_at is null and expires > now()), 'active', count(*) filter (where uid is not null and revoked_at is null), 'revoked', count(*) filter (where revoked_at is not null), 'expired', count(*) filter (where uid is null and revoked_at is null and expires <= now())) from public.ed_code),
    'feeds', (select coalesce(json_agg(json_build_object('id', f.id, 'name', f.name, 'source', f.source, 'last_sync', f.last_sync, 'last_error', f.last_error, 'n', f.n) order by f.id), '[]'::json) from public.ed_feed f),
    'recent', (select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name, 'username', x.username, 'role', x.role, 'created', x.created, 'consent', x.consent ? 'terms') order by x.created desc), '[]'::json) from (select * from public.ed_user order by created desc limit 8) x),
    'compassdash', public.ed_cd_on(),
    'http', exists (select 1 from pg_extension where extname = 'http'));
end $$;

create or replace function public.ed_a_links_save(p_key text, p_links jsonb) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 12 then return public.ed_err('bad_text'); end if;
  if exists (select 1 from jsonb_array_elements(p_links) l where not public.ed_ok_text(l->>'name', 40) or (l->>'url') !~ '^https://[^ ]{4,300}$' or length(coalesce(l->>'blurb', '')) > 120) then return public.ed_err('bad_text'); end if;
  update public.ed_school set links = p_links, updated = now() where id = 1;
  return json_build_object('ok', true);
end $$;

-- ---------- 5. External calendar feeds (iCalendar) ----------
-- Mirrors events from any .ics address (Global Campus "export calendar", a Google Calendar's secret iCal address, Outlook, ...)
-- into ed_event, tagged with the feed, so they show in every calendar and on home pages alongside the school's own events.
-- Needs the pgsql-http extension. Supabase: Database > Extensions > enable "http" (or the line below does it where allowed).
do $$ begin
  begin execute 'create extension if not exists http with schema extensions'; exception when others then raise notice 'http extension not enabled yet: %', sqlerrm; end;
end $$;

create or replace function public.ed_ics_ts(p text, p_tz text) returns timestamptz language plpgsql stable as $$
declare v text := regexp_replace(coalesce(p, ''), '[^0-9TZ]', '', 'g');
begin
  if v ~ '^[0-9]{8}$' then return (to_date(v, 'YYYYMMDD')::timestamp) at time zone p_tz; end if;
  if v ~ '^[0-9]{8}T[0-9]{6}Z$' then return to_timestamp(left(v, 15), 'YYYYMMDD"T"HH24MISS') at time zone 'UTC'; end if;
  if v ~ '^[0-9]{8}T[0-9]{6}$' then return (to_timestamp(v, 'YYYYMMDD"T"HH24MISS')::timestamp) at time zone p_tz; end if;
  return null;
exception when others then return null;
end $$;

create or replace function public.ed_ics_unescape(p text) returns text language sql immutable as $$
  select left(btrim(replace(replace(replace(replace(coalesce(p, ''), '\n', ' '), '\N', ' '), '\,', ','), '\;', ';')), 200) $$;

-- Parse an iCalendar text and mirror its events for one feed. Returns the number of events kept.
create or replace function public.ed_feed_apply(p_feed int, p_body text) returns int language plpgsql security definer set search_path = public, extensions as $$
declare f public.ed_feed; body text; ev text; uidv text; title text; st timestamptz; en timestamptz; loc text; cnt int := 0; keep text[] := '{}'; tzid text;
begin
  select * into f from public.ed_feed where id = p_feed; if f.id is null then return 0; end if;
  body := regexp_replace(coalesce(p_body, ''), E'\r?\n[ \t]', '', 'g');                   -- unfold continuation lines
  for ev in select m[1] from regexp_matches(body, 'BEGIN:VEVENT(.*?)END:VEVENT', 'g') m loop
    uidv  := (regexp_match(ev, E'(?:^|\n)UID(?:;[^:\n]*)?:([^\r\n]+)'))[1];
    title := public.ed_ics_unescape((regexp_match(ev, E'(?:^|\n)SUMMARY(?:;[^:\n]*)?:([^\r\n]+)'))[1]);
    tzid  := (regexp_match(ev, E'(?:^|\n)DTSTART;[^:\n]*TZID=([^;:\n]+)'))[1];
    st    := public.ed_ics_ts((regexp_match(ev, E'(?:^|\n)DTSTART(?:;[^:\n]*)?:([^\r\n]+)'))[1], coalesce(tzid, f.tz));
    en    := public.ed_ics_ts((regexp_match(ev, E'(?:^|\n)DTEND(?:;[^:\n]*)?:([^\r\n]+)'))[1], coalesce(tzid, f.tz));
    loc   := public.ed_ics_unescape((regexp_match(ev, E'(?:^|\n)LOCATION(?:;[^:\n]*)?:([^\r\n]+)'))[1]);
    if st is null or coalesce(title, '') = '' then continue; end if;
    if st < now() - interval '60 days' or st > now() + interval '400 days' then continue; end if;
    uidv := coalesce(nullif(btrim(uidv), ''), md5(title || st::text));
    insert into public.ed_event (class_id, kind, title, starts, ends, place, uid, src, src_uid)
      values (f.class_id, 'event', title, st, en, left(coalesce(loc, ''), 120), f.uid, 'feed:' || f.id, left(uidv, 200))
      on conflict (src, src_uid) where src is not null do update set title = excluded.title, starts = excluded.starts, ends = excluded.ends, place = excluded.place, class_id = excluded.class_id;
    keep := keep || left(uidv, 200); cnt := cnt + 1;
    exit when cnt >= 500;
  end loop;
  delete from public.ed_event where src = 'feed:' || f.id and not (src_uid = any(keep));   -- events the feed no longer has
  update public.ed_feed set last_sync = now(), last_error = null, n = cnt where id = f.id;
  return cnt;
end $$;

create or replace function public.ed_a_feeds(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'http', exists (select 1 from pg_extension where extname = 'http'),
    'rows', (select coalesce(json_agg(json_build_object('id', f.id, 'name', f.name, 'url', f.url, 'source', f.source, 'class_id', f.class_id, 'class', (select name from public.ed_class where id = f.class_id), 'tz', f.tz, 'last_sync', f.last_sync, 'last_error', f.last_error, 'n', f.n, 'created', f.created) order by f.id), '[]'::json) from public.ed_feed f));
end $$;
create or replace function public.ed_a_feed_save(p_key text, p_id int, p_name text, p_url text, p_source text, p_class int, p_tz text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_name, 60) or p_url !~ '^(https?|webcal)://[^ ]{4,500}$' then return public.ed_err('bad_text'); end if;
  if coalesce(p_source, 'other') not in ('globalcampus', 'compassdash', 'other') then return public.ed_err('bad_text'); end if;
  if coalesce(p_tz, '') <> '' and not exists (select 1 from pg_timezone_names where name = p_tz) then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_feed (name, url, source, class_id, tz, uid) values (btrim(p_name), regexp_replace(p_url, '^webcal://', 'https://'), coalesce(p_source, 'other'), nullif(p_class, 0), coalesce(nullif(p_tz, ''), 'Europe/London'), u.id) returning id into i;
  else update public.ed_feed set name = btrim(p_name), url = regexp_replace(p_url, '^webcal://', 'https://'), source = coalesce(p_source, 'other'), class_id = nullif(p_class, 0), tz = coalesce(nullif(p_tz, ''), tz) where id = p_id returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_a_feed_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  delete from public.ed_event where src = 'feed:' || p_id; delete from public.ed_feed where id = p_id; return json_build_object('ok', found);
end $$;
-- Fetch the feed now and mirror its events. Staff can trigger it; the result says how many events were kept.
create or replace function public.ed_a_feed_sync(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); f public.ed_feed; st int; body text; n int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  select * into f from public.ed_feed where id = p_id; if f.id is null then return public.ed_err('not_found'); end if;
  if not exists (select 1 from pg_extension where extname = 'http') then return public.ed_err('no_http'); end if;
  begin
    execute 'select status, content from extensions.http_get($1)' into st, body using f.url;
  exception when others then
    update public.ed_feed set last_error = left(sqlerrm, 200) where id = f.id; return json_build_object('ok', false, 'error', 'feed_fetch', 'detail', left(sqlerrm, 200));
  end;
  if st <> 200 then update public.ed_feed set last_error = 'HTTP ' || st where id = f.id; return json_build_object('ok', false, 'error', 'feed_fetch', 'detail', 'HTTP ' || st); end if;
  if position('BEGIN:VCALENDAR' in body) = 0 then update public.ed_feed set last_error = 'Not an iCalendar feed' where id = f.id; return json_build_object('ok', false, 'error', 'feed_format'); end if;
  n := public.ed_feed_apply(f.id, body);
  return json_build_object('ok', true, 'n', n);
end $$;
-- Sync every feed (for a scheduled job: `select public.ed_feeds_sync_all();` from pg_cron, e.g. hourly)
create or replace function public.ed_feeds_sync_all() returns int language plpgsql security definer set search_path = public, extensions as $$
declare f record; st int; body text; n int := 0;
begin
  if not exists (select 1 from pg_extension where extname = 'http') then return 0; end if;
  for f in select * from public.ed_feed loop
    begin
      execute 'select status, content from extensions.http_get($1)' into st, body using f.url;
      if st = 200 and position('BEGIN:VCALENDAR' in body) > 0 then n := n + public.ed_feed_apply(f.id, body); else update public.ed_feed set last_error = 'HTTP ' || st where id = f.id; end if;
    exception when others then update public.ed_feed set last_error = left(sqlerrm, 200) where id = f.id; end;
  end loop;
  return n;
end $$;

-- Calendars now say where an event came from ('src' = null for the school's own events)
create or replace function public.ed_s_calendar(p_key text, p_from date, p_to date) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(x order by x.starts), '[]'::json) from (
      select 'e' || e.id as id, e.kind, e.title, e.starts, e.ends, e.place, null::int as assign_id, null::int as comp_id, (select name from public.ed_class where id = e.class_id) as class,
             (select f.source from public.ed_feed f where 'feed:' || f.id = e.src) as src, (select f.name from public.ed_feed f where 'feed:' || f.id = e.src) as src_name
        from public.ed_event e where (e.class_id is null or e.class_id = u.class_id) and e.starts::date between p_from and p_to
      union all select 'a' || a.id, 'due', a.title, a.due, null, (select name from public.ed_subject where id = a.subj), a.id, null, null, null, null from public.ed_assign a where a.class_id = u.class_id and a.due is not null and a.due::date between p_from and p_to
      union all select 'c' || c.id, 'competition', c.title || ' closes', c.closes, null, '', null, c.id, null, null, null from public.ed_competition c where c.closes::date between p_from and p_to) x));
end $$;
create or replace function public.ed_t_events(p_key text, p_from date, p_to date) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(x order by x.starts), '[]'::json) from (
      select 'e' || e.id as id, e.id as event_id, e.kind, e.title, e.starts, e.ends, e.place, e.class_id, (select name from public.ed_class where id = e.class_id) as class, null::int as assign_id, null::int as comp_id,
             (select f.source from public.ed_feed f where 'feed:' || f.id = e.src) as src, (select f.name from public.ed_feed f where 'feed:' || f.id = e.src) as src_name
        from public.ed_event e where (e.class_id is null or public.ed_can_class(u, e.class_id)) and e.starts::date between p_from and p_to
      union all select 'a' || a.id, null, 'due', a.title, a.due, null, (select name from public.ed_class where id = a.class_id), a.class_id, (select name from public.ed_class where id = a.class_id), a.id, null, null, null from public.ed_assign a where public.ed_can_class(u, a.class_id) and a.due is not null and a.due::date between p_from and p_to
      union all select 'c' || c.id, null, 'competition', c.title || ' closes', c.closes, null, '', null, null, null, c.id, null, null from public.ed_competition c where c.closes::date between p_from and p_to) x));
end $$;
-- Mirrored events cannot be edited or deleted by hand (the next sync would bring them back)
create or replace function public.ed_t_event_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if exists (select 1 from public.ed_event where id = p_id and src is not null) then return public.ed_err('mirrored'); end if;
  delete from public.ed_event where id = p_id and (u.role = 'admin' or uid = u.id); return json_build_object('ok', found);
end $$;

-- ---------- 6. Compass Dash link (same database; calls its own public functions, never its tables) ----------
create or replace function public.ed_cd_on() returns boolean language sql stable as $$
  select exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'cd_houses') $$;

-- Call a Compass Dash function by name with a JSON object of arguments; null if Compass Dash is not installed or it fails.
create or replace function public.ed_cd_call(p_fn text, p_args jsonb) returns json language plpgsql security definer set search_path = public, extensions as $$
declare r json; sql text; k text; v text; args text[] := '{}';
begin
  if not public.ed_cd_on() then return null; end if;
  for k, v in select key, value from jsonb_each_text(coalesce(p_args, '{}'::jsonb)) loop args := args || format('%I => %L', k, v); end loop;
  sql := format('select to_json(public.%I(%s))', p_fn, array_to_string(args, ', '));
  begin execute sql into r; exception when others then return null; end;
  return r;
end $$;

-- Student: link my Compass Dash account (its sign-in check must pass). Wrong pairs count towards the lockout.
create or replace function public.ed_s_cd_link(p_key text, p_code text, p_user text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); r json; code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  if not public.ed_cd_on() then return public.ed_err('no_compassdash'); end if;
  if public.ed_guard_secs() > 0 then return public.ed_err('locked'); end if;
  if code = '' or p_user !~ '^[A-Za-z0-9_]{3,16}$' then return public.ed_err('bad_text'); end if;
  r := public.ed_cd_call('cd_login', jsonb_build_object('p_code', code, 'p_user', p_user));
  if r is null or coalesce((r->>'ok')::boolean, false) = false then perform public.ed_guard_fail(); return public.ed_err('cd_no_match'); end if;
  update public.ed_user set cd_code = coalesce(r->>'code', code), cd_user = coalesce(r->>'username', p_user),
    house = case when house is null and (r->>'house') in ('N','E','S','W') then r->>'house' else house end where id = u.id;
  return json_build_object('ok', true, 'cd_user', coalesce(r->>'username', p_user));
end $$;
create or replace function public.ed_s_cd_unlink(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; update public.ed_user set cd_code = null, cd_user = null where id = u.id; return json_build_object('ok', true);
end $$;
-- Student: everything from Compass Dash in one call: houses + challenges + cup (public), the leaderboard (public),
-- and, if linked, my progress and my teacher's Compass Dash announcements.
create or replace function public.ed_s_cd(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a jsonb;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if not public.ed_cd_on() then return json_build_object('ok', true, 'on', false); end if;
  a := case when u.cd_code is not null then jsonb_build_object('p_code', u.cd_code, 'p_user', u.cd_user) end;
  return json_build_object('ok', true, 'on', true, 'linked', u.cd_code is not null, 'cd_user', u.cd_user,
    'houses', public.ed_cd_call('cd_houses', '{}'::jsonb), 'board', public.ed_cd_call('cd_board', '{}'::jsonb),
    'my', case when a is not null then public.ed_cd_call('cd_my', a) end,
    'anns', case when a is not null then public.ed_cd_call('cd_anns', a) end);
end $$;
-- Staff: Compass Dash houses, challenges, cup and leaderboard
create or replace function public.ed_t_cd(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_cd_on() then return json_build_object('ok', true, 'on', false); end if;
  return json_build_object('ok', true, 'on', true, 'houses', public.ed_cd_call('cd_houses', '{}'::jsonb), 'board', public.ed_cd_call('cd_board', '{}'::jsonb),
    'linked', (select count(*) from public.ed_user where cd_code is not null));
end $$;
-- Public home page: school links (Global Campus, Compass Dash, ...)
create or replace function public.ed_links() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('ok', true, 'links', coalesce((select links from public.ed_school where id = 1), '[]'::jsonb), 'compassdash', public.ed_cd_on()) $$;

-- ---------- 7. Permissions ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ed\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.name in ('ed_login','ed_signup','ed_claim','ed_logout','ed_me','ed_pw','ed_public','ed_notif_read','ed_board','ed_parent',
                  'ed_code_check','ed_code_login','ed_code_setup','ed_pw_set','ed_consent','ed_links')
       or f.name like 'ed\_s\_%' or f.name like 'ed\_t\_%' or f.name like 'ed\_a\_%' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;
grant usage on schema public to anon, authenticated;
