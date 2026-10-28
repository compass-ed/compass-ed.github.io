-- ===== Compass Ed v2.0: a standalone campus platform =====
-- Run this ONCE in your Supabase project (SQL Editor > New query > paste > Run). Safe to run again.
--
-- BEFORE YOU RUN IT, change the three values in section 8 (admin password, student join code, teacher invite code).
--
-- Everything is prefixed ed_ and is self-contained: Compass Ed has its own accounts (username + password,
-- bcrypt-hashed, with session tokens), its own classes, subjects, units, lessons, quizzes, playlists,
-- assignments, rubrics, activities, competitions, news, calendar and announcements. It does not read or
-- write any other application's tables. If the earlier ce_ tables from v1.0 exist, they are left alone;
-- supabase/patches/drop-v1-tables.sql removes them.
--
-- Roles: 'student', 'teacher', 'admin'. Students sign up with the school's join code; teachers claim an
-- invite code; the admin account is created in section 8 and can manage users, classes and codes.
-- All tables have row-level security with no policies, so the only way in is through the ed_* functions,
-- which check the caller's session token on every call.

create extension if not exists pgcrypto;

-- ---------- 1. Accounts ----------
create table if not exists public.ed_school (
  id          int primary key default 1 check (id = 1),
  name        text not null default 'Compass Ed',
  join_code   text not null,                  -- students use it to create an account
  invite_code text not null,                  -- teachers use it to create an account
  updated     timestamptz not null default now()
);
create table if not exists public.ed_class (
  id      serial primary key,
  name    text not null,
  year    int check (year is null or year between 7 and 13),
  subj    int,                                 -- optional: the subject this class is for
  created timestamptz not null default now()
);
create table if not exists public.ed_user (
  id        serial primary key,
  role      text not null check (role in ('student','teacher','admin')),
  username  text not null unique,
  name      text not null,
  pw        text not null,                     -- bcrypt hash
  year      int check (year is null or year between 7 and 13),
  class_id  int references public.ed_class(id) on delete set null,
  subj      int,                               -- teachers: their main subject (null = all)
  disabled  boolean not null default false,
  created   timestamptz not null default now(),
  last_seen timestamptz
);
create index if not exists ed_user_class on public.ed_user (class_id);
create table if not exists public.ed_session (
  tok     text primary key,                    -- sha256 of the token (the token itself is never stored)
  uid     int not null references public.ed_user(id) on delete cascade,
  created timestamptz not null default now(),
  seen    timestamptz not null default now()
);
create table if not exists public.ed_guard (
  ip         text primary key,
  fails      int not null default 0,
  first_at   timestamptz not null default now(),
  lock_until timestamptz
);

-- ---------- 2. Content ----------
create table if not exists public.ed_subject (
  id    int primary key,
  name  text not null,
  icon  text not null default 'book',
  ord   int not null default 0
);
insert into public.ed_subject (id, name, icon, ord) values
  (0,'Maths','maths',0),(1,'English','english',1),(2,'Science','science',2),(3,'Geography','geography',3),(4,'History','history',4),
  (5,'Computing','computing',5),(6,'Art & Design','art',6),(7,'Music','music',7),(8,'Languages','french',8),(9,'PE & Wellbeing','sport',9),(10,'Drama','drama',10)
on conflict (id) do nothing;

-- Campus categories (the Global-Campus-style hub)
create table if not exists public.ed_category (
  id    int primary key,
  name  text not null,
  icon  text not null default 'spark',
  blurb text not null default '',
  ord   int not null default 0
);
insert into public.ed_category (id, name, icon, blurb, ord) values
  (1,'Campus Hub','compass','Start here: what is on this month, how the campus works and the latest news.',0),
  (2,'Art, Design & Media','art','Drawing, design, photography, film and making things that look good.',1),
  (3,'Our World','geography','Geography, environment, cultures and the big questions about the planet.',2),
  (4,'Performing Arts','drama','Drama, music, dance and performance.',3),
  (5,'Read, Write, Speak','english','Reading challenges, creative writing, debating and public speaking.',4),
  (6,'Social Impact','users','Projects that help people: volunteering, campaigns and leadership.',5),
  (7,'STEAM','science','Science, technology, engineering, art and maths challenges.',6),
  (8,'Wellbeing & Sport','sport','Sport, mindfulness, healthy habits and looking after yourself.',7)
on conflict (id) do nothing;

create table if not exists public.ed_activity (       -- an enrichment activity in a category
  id       serial primary key,
  cat      int not null references public.ed_category(id),
  title    text not null,
  blurb    text not null default '',
  blocks   jsonb not null default '[]'::jsonb,     -- same block format as lessons
  minutes  int not null default 30,
  ages     text not null default 'all' check (ages in ('all','under11','11plus')),
  pub      boolean not null default true,
  uid      int references public.ed_user(id) on delete set null,
  updated  timestamptz not null default now()
);
create table if not exists public.ed_activity_done (
  activity_id int not null references public.ed_activity(id) on delete cascade,
  uid         int not null references public.ed_user(id) on delete cascade,
  at          timestamptz not null default now(),
  primary key (activity_id, uid)
);
create table if not exists public.ed_competition (    -- competitions, challenges and tournaments
  id       serial primary key,
  cat      int references public.ed_category(id),
  kind     text not null default 'competition' check (kind in ('competition','challenge','tournament')),
  title    text not null,
  blurb    text not null default '',
  blocks   jsonb not null default '[]'::jsonb,
  opens    timestamptz not null default now(),
  closes   timestamptz not null,
  ages     text not null default 'all' check (ages in ('all','under11','11plus')),
  uid      int references public.ed_user(id) on delete set null,
  updated  timestamptz not null default now()
);
create table if not exists public.ed_entry (          -- a student's entry to a competition
  id       serial primary key,
  comp_id  int not null references public.ed_competition(id) on delete cascade,
  uid      int not null references public.ed_user(id) on delete cascade,
  body     text not null default '',
  links    jsonb not null default '[]'::jsonb,
  at       timestamptz not null default now(),
  place    int,                                     -- 1, 2, 3 or null (set by a teacher)
  note     text,
  unique (comp_id, uid)
);
create table if not exists public.ed_news (           -- news and the student newsletter
  id       serial primary key,
  title    text not null,
  body     text not null,
  cover    text not null default '',                 -- image url (optional)
  featured boolean not null default false,          -- shows in the home page banner
  uid      int references public.ed_user(id) on delete set null,
  created  timestamptz not null default now()
);

create table if not exists public.ed_unit (
  id       serial primary key,
  subj     int not null references public.ed_subject(id),
  class_id int references public.ed_class(id) on delete cascade,     -- null: every class
  year     int,
  title    text not null,
  summary  text not null default '',
  ord      int not null default 0,
  uid      int references public.ed_user(id) on delete set null,
  created  timestamptz not null default now()
);
create table if not exists public.ed_lesson (
  id       serial primary key,
  unit_id  int not null references public.ed_unit(id) on delete cascade,
  title    text not null,
  minutes  int not null default 20,
  blocks   jsonb not null default '[]'::jsonb,
  ord      int not null default 0,
  pub      boolean not null default true,
  updated  timestamptz not null default now()
);
create table if not exists public.ed_lesson_done (
  lesson_id int not null references public.ed_lesson(id) on delete cascade,
  uid       int not null references public.ed_user(id) on delete cascade,
  at        timestamptz not null default now(),
  primary key (lesson_id, uid)
);
create table if not exists public.ed_quiz (
  id        serial primary key,
  subj      int not null references public.ed_subject(id),
  unit_id   int references public.ed_unit(id) on delete set null,
  title     text not null,
  kind      text not null default 'quiz' check (kind in ('quiz','checkpoint')),
  threshold int not null default 80,
  qs        jsonb not null default '[]'::jsonb,
  uid       int references public.ed_user(id) on delete set null,
  updated   timestamptz not null default now()
);
create table if not exists public.ed_quiz_res (
  id      serial primary key,
  quiz_id int not null references public.ed_quiz(id) on delete cascade,
  uid     int not null references public.ed_user(id) on delete cascade,
  score   int not null default 0,
  out_of  int not null default 0,
  answers jsonb not null default '[]'::jsonb,
  at      timestamptz not null default now()
);
create index if not exists ed_quiz_res_q on public.ed_quiz_res (quiz_id, uid, at desc);
create table if not exists public.ed_playlist (
  id       serial primary key,
  class_id int not null references public.ed_class(id) on delete cascade,
  subj     int not null references public.ed_subject(id),
  title    text not null,
  items    jsonb not null default '[]'::jsonb,
  uid      int references public.ed_user(id) on delete set null,
  updated  timestamptz not null default now()
);
create table if not exists public.ed_rubric (
  id       serial primary key,
  uid      int references public.ed_user(id) on delete set null,
  title    text not null,
  criteria jsonb not null default '[]'::jsonb,
  updated  timestamptz not null default now()
);
create table if not exists public.ed_assign (
  id        serial primary key,
  class_id  int not null references public.ed_class(id) on delete cascade,
  subj      int not null references public.ed_subject(id),
  kind      text not null default 'homework' check (kind in ('homework','assignment','quiz')),
  title     text not null,
  instr     text not null default '',
  due       timestamptz,
  points    int not null default 10,
  quiz_id   int references public.ed_quiz(id) on delete set null,
  rubric_id int references public.ed_rubric(id) on delete set null,
  uid       int references public.ed_user(id) on delete set null,
  created   timestamptz not null default now()
);
create table if not exists public.ed_sub (
  id        serial primary key,
  assign_id int not null references public.ed_assign(id) on delete cascade,
  uid       int not null references public.ed_user(id) on delete cascade,
  status    text not null default 'draft' check (status in ('draft','submitted','returned')),
  ver       int not null default 0,
  body      text not null default '',
  links     jsonb not null default '[]'::jsonb,
  sub_at    timestamptz,
  score     int,
  rub       jsonb,
  feedback  text,
  graded_at timestamptz,
  unique (assign_id, uid)
);
create table if not exists public.ed_sub_ver (
  sub_id int not null references public.ed_sub(id) on delete cascade,
  ver    int not null,
  body   text not null,
  links  jsonb not null default '[]'::jsonb,
  at     timestamptz not null default now(),
  primary key (sub_id, ver)
);
create table if not exists public.ed_review (
  id    serial primary key,
  uid   int not null references public.ed_user(id) on delete cascade,
  subj  int not null,
  key   text not null,
  front text not null,
  back  text not null,
  ease  numeric not null default 2.5,
  ivl   int not null default 0,
  reps  int not null default 0,
  due   date not null default current_date,
  unique (uid, key)
);
create index if not exists ed_review_due on public.ed_review (uid, due);
create table if not exists public.ed_event (
  id       serial primary key,
  class_id int references public.ed_class(id) on delete cascade,
  kind     text not null default 'event' check (kind in ('event','exam','deadline','trip','competition')),
  title    text not null,
  starts   timestamptz not null,
  ends     timestamptz,
  place    text not null default '',
  uid      int references public.ed_user(id) on delete set null
);
create table if not exists public.ed_ann (
  id       serial primary key,
  class_id int references public.ed_class(id) on delete cascade,
  targets  jsonb not null default '{}'::jsonb,   -- {} school, {year:7}, {uids:[...]}
  title    text not null,
  body     text not null,
  pinned   boolean not null default false,
  uid      int references public.ed_user(id) on delete set null,
  created  timestamptz not null default now(),
  ends     timestamptz not null
);
create table if not exists public.ed_ann_read (
  ann_id int not null references public.ed_ann(id) on delete cascade,
  uid    int not null references public.ed_user(id) on delete cascade,
  at     timestamptz not null default now(),
  primary key (ann_id, uid)
);
create table if not exists public.ed_notif (
  id      serial primary key,
  uid     int not null references public.ed_user(id) on delete cascade,
  kind    text not null default 'info',
  title   text not null,
  body    text not null default '',
  link    text not null default '',
  created timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists ed_notif_u on public.ed_notif (uid, created desc);

do $$ declare t text; begin
  foreach t in array array['ed_school','ed_class','ed_user','ed_session','ed_guard','ed_subject','ed_category','ed_activity','ed_activity_done',
    'ed_competition','ed_entry','ed_news','ed_unit','ed_lesson','ed_lesson_done','ed_quiz','ed_quiz_res','ed_playlist','ed_rubric',
    'ed_assign','ed_sub','ed_sub_ver','ed_review','ed_event','ed_ann','ed_ann_read','ed_notif'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- 3. Helpers ----------
create or replace function public.ed_err(p text) returns json language sql immutable as $$ select json_build_object('ok', false, 'error', p) $$;
create or replace function public.ed_ok_text(p text, n int) returns boolean language sql immutable as $$ select p is not null and length(btrim(p)) between 1 and n $$;
create or replace function public.ed_ip() returns text language sql stable as $$
  select coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'local') $$;

-- lockout: 5 failed sign-ins from one connection within 15 minutes lock it for 1 minute
create or replace function public.ed_guard_secs() returns int language sql stable security definer set search_path = public as $$
  select coalesce((select greatest(1, ceil(extract(epoch from (lock_until - now()))))::int from public.ed_guard where ip = public.ed_ip() and lock_until > now()), 0) $$;
create or replace function public.ed_guard_fail() returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.ed_guard as g (ip, fails, first_at) values (public.ed_ip(), 1, now())
    on conflict (ip) do update set fails = case when g.first_at < now() - interval '15 minutes' then 1 else g.fails + 1 end,
      first_at = case when g.first_at < now() - interval '15 minutes' then now() else g.first_at end returning fails into n;
  if n >= 5 then update public.ed_guard set lock_until = now() + interval '60 seconds', fails = 0, first_at = now() where ip = public.ed_ip(); end if;
  delete from public.ed_guard where coalesce(lock_until, first_at) < now() - interval '1 day';
end $$;

create or replace function public.ed_tok_new(p_uid int) returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  insert into public.ed_session (tok, uid) values (encode(digest(t, 'sha256'), 'hex'), p_uid);
  delete from public.ed_session where uid = p_uid and seen < now() - interval '30 days';
  return t;
end $$;

-- Who is calling? Returns the user row, or null. Teacher/admin sessions expire after 12 hours idle; students after 30 days.
create or replace function public.ed_who(p_key text) returns public.ed_user language plpgsql security definer set search_path = public, extensions as $$
declare s public.ed_session; u public.ed_user;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into s from public.ed_session where tok = encode(digest(p_key, 'sha256'), 'hex');
  if s.tok is null then return null; end if;
  select * into u from public.ed_user where id = s.uid and not disabled;
  if u.id is null then return null; end if;
  if s.seen < now() - (case when u.role = 'student' then interval '30 days' else interval '12 hours' end) then delete from public.ed_session where tok = s.tok; return null; end if;
  update public.ed_session set seen = now() where tok = s.tok and seen < now() - interval '1 minute';
  update public.ed_user set last_seen = now() where id = u.id and (last_seen is null or last_seen < now() - interval '1 minute');
  return u;
end $$;

create or replace function public.ed_info(u public.ed_user) returns json language sql stable as $$
  select json_build_object('id', u.id, 'role', u.role, 'username', u.username, 'name', u.name, 'year', u.year, 'subj', u.subj,
    'class', (select json_build_object('id', id, 'name', name, 'year', year, 'subj', subj) from public.ed_class where id = u.class_id)) $$;

-- staff = teacher or admin. A teacher with a subject may only touch classes of that subject (or with no subject); admin: everything.
create or replace function public.ed_staff(u public.ed_user) returns boolean language sql immutable as $$ select u.role in ('teacher','admin') $$;
create or replace function public.ed_my_classes(u public.ed_user) returns int[] language sql stable as $$
  select coalesce(array_agg(id), '{}') from public.ed_class where u.role = 'admin' or u.subj is null or subj is null or subj = u.subj $$;
create or replace function public.ed_can_class(u public.ed_user, p_class int) returns boolean language sql stable as $$
  select public.ed_staff(u) and p_class = any(public.ed_my_classes(u)) $$;
create or replace function public.ed_can_subj(u public.ed_user, p_subj int) returns boolean language sql immutable as $$
  select public.ed_staff(u) and (u.role = 'admin' or u.subj is null or u.subj = p_subj) $$;
create or replace function public.ed_ann_for(a public.ed_ann, u public.ed_user) returns boolean language sql stable as $$
  select (a.class_id is not null and a.class_id = u.class_id)
      or (a.class_id is null and (a.targets = '{}'::jsonb or (a.targets ? 'year' and (a.targets->>'year')::int = u.year) or (a.targets ? 'uids' and a.targets->'uids' @> to_jsonb(u.id)))) $$;
create or replace function public.ed_notify_class(p_class int, p_kind text, p_title text, p_body text, p_link text) returns void language sql security definer set search_path = public as $$
  insert into public.ed_notif (uid, kind, title, body, link) select id, p_kind, p_title, p_body, p_link from public.ed_user where class_id = p_class and role = 'student' $$;
create or replace function public.ed_unit_for(un public.ed_unit, u public.ed_user) returns boolean language sql immutable as $$
  select (un.class_id is null or un.class_id = u.class_id) and (un.year is null or un.year = u.year) $$;

-- ---------- 4. Sign in, sign up, sessions ----------
create or replace function public.ed_login(p_user text, p_pw text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user; s int := public.ed_guard_secs();
begin
  if s > 0 then return json_build_object('ok', false, 'error', 'locked', 'secs', s); end if;
  select * into u from public.ed_user where lower(username) = lower(btrim(coalesce(p_user, '')));
  if u.id is null or u.pw <> crypt(coalesce(p_pw, ''), u.pw) then perform public.ed_guard_fail(); s := public.ed_guard_secs(); return json_build_object('ok', false, 'error', case when s > 0 then 'locked' else 'no_match' end, 'secs', s); end if;
  if u.disabled then return public.ed_err('disabled'); end if;
  delete from public.ed_guard where ip = public.ed_ip();
  update public.ed_user set last_seen = now() where id = u.id;
  return json_build_object('ok', true, 'tok', public.ed_tok_new(u.id), 'me', public.ed_info(u));
end $$;

-- Students create their own account with the school's join code.
create or replace function public.ed_signup(p_join text, p_user text, p_pw text, p_name text, p_year int, p_class int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare sc public.ed_school; i int;
begin
  if public.ed_guard_secs() > 0 then return public.ed_err('locked'); end if;
  select * into sc from public.ed_school where id = 1;
  if sc.id is null or upper(btrim(coalesce(p_join, ''))) <> upper(sc.join_code) then perform public.ed_guard_fail(); return public.ed_err('bad_code'); end if;
  if p_user !~ '^[A-Za-z0-9_.]{3,24}$' then return public.ed_err('bad_user'); end if;
  if length(coalesce(p_pw, '')) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  if not public.ed_ok_text(p_name, 60) then return public.ed_err('bad_text'); end if;
  if exists (select 1 from public.ed_user where lower(username) = lower(p_user)) then return public.ed_err('taken'); end if;
  if p_class is not null and p_class <> 0 and not exists (select 1 from public.ed_class where id = p_class) then return public.ed_err('no_class'); end if;
  insert into public.ed_user (role, username, name, pw, year, class_id) values ('student', p_user, btrim(p_name), crypt(p_pw, gen_salt('bf', 10)), nullif(p_year, 0), nullif(p_class, 0)) returning id into i;
  return json_build_object('ok', true, 'tok', public.ed_tok_new(i), 'me', (select public.ed_info(u) from public.ed_user u where u.id = i));
end $$;

-- Teachers create their account with the invite code.
create or replace function public.ed_claim(p_invite text, p_user text, p_pw text, p_name text, p_subj int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare sc public.ed_school; i int;
begin
  if public.ed_guard_secs() > 0 then return public.ed_err('locked'); end if;
  select * into sc from public.ed_school where id = 1;
  if sc.id is null or upper(btrim(coalesce(p_invite, ''))) <> upper(sc.invite_code) then perform public.ed_guard_fail(); return public.ed_err('bad_code'); end if;
  if p_user !~ '^[A-Za-z0-9_.]{3,24}$' then return public.ed_err('bad_user'); end if;
  if length(coalesce(p_pw, '')) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  if not public.ed_ok_text(p_name, 60) then return public.ed_err('bad_text'); end if;
  if exists (select 1 from public.ed_user where lower(username) = lower(p_user)) then return public.ed_err('taken'); end if;
  insert into public.ed_user (role, username, name, pw, subj) values ('teacher', p_user, btrim(p_name), crypt(p_pw, gen_salt('bf', 10)), nullif(p_subj, -1)) returning id into i;
  return json_build_object('ok', true, 'tok', public.ed_tok_new(i), 'me', (select public.ed_info(u) from public.ed_user u where u.id = i));
end $$;

create or replace function public.ed_logout(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_key ~ '^[0-9a-f]{48}$' then delete from public.ed_session where tok = encode(digest(p_key, 'sha256'), 'hex'); end if;
  return json_build_object('ok', true);
end $$;

-- Who am I (plus the lists every page needs)
create or replace function public.ed_me(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return (public.ed_info(u)::jsonb || jsonb_build_object('ok', true,
    'school', (select name from public.ed_school where id = 1),
    'subjects', (select json_agg(json_build_object('id', id, 'name', name, 'icon', icon) order by ord) from public.ed_subject),
    'categories', (select json_agg(json_build_object('id', id, 'name', name, 'icon', icon, 'blurb', blurb) order by ord) from public.ed_category),
    'classes', case when public.ed_staff(u) then (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'year', c.year, 'subj', c.subj,
                 'n', (select count(*) from public.ed_user x where x.class_id = c.id and x.role = 'student')) order by c.name), '[]'::json) from public.ed_class c where c.id = any(public.ed_my_classes(u))) else null end))::json;
end $$;

create or replace function public.ed_pw(p_key text, p_old text, p_new text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if u.pw <> crypt(coalesce(p_old, ''), u.pw) then perform public.ed_guard_fail(); return public.ed_err('no_match'); end if;
  if length(coalesce(p_new, '')) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  update public.ed_user set pw = crypt(p_new, gen_salt('bf', 10)) where id = u.id;
  delete from public.ed_session where uid = u.id and tok <> encode(digest(p_key, 'sha256'), 'hex');
  return json_build_object('ok', true);
end $$;

-- Public, read-only bits for the home page (no sign-in): categories, open competitions, featured news, public events.
create or replace function public.ed_public() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('ok', true,
    'school', (select name from public.ed_school where id = 1),
    'categories', (select json_agg(json_build_object('id', id, 'name', name, 'icon', icon, 'blurb', blurb,
       'n', (select count(*) from public.ed_activity a where a.cat = c.id and a.pub)) order by ord) from public.ed_category c),
    'competitions', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'title', title, 'blurb', blurb, 'closes', closes, 'cat', cat) order by closes), '[]'::json)
       from public.ed_competition where closes > now() and opens <= now()),
    'news', (select coalesce(json_agg(json_build_object('id', id, 'title', title, 'body', left(body, 220), 'cover', cover, 'featured', featured, 'created', created) order by featured desc, created desc), '[]'::json)
       from (select * from public.ed_news order by featured desc, created desc limit 6) n),
    'events', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'title', title, 'starts', starts, 'place', place) order by starts), '[]'::json)
       from public.ed_event where class_id is null and starts between now() and now() + interval '60 days')) $$;

-- ---------- 5. Student functions (p_key) ----------
create or replace function public.ed_s_home(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true,
    'assigns', (select coalesce(json_agg(json_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'subj', a.subj, 'due', a.due, 'points', a.points, 'quiz_id', a.quiz_id,
                  'status', coalesce(s.status, 'todo'), 'score', s.score, 'sub_at', s.sub_at) order by a.due nulls last), '[]'::json)
                from public.ed_assign a left join public.ed_sub s on s.assign_id = a.id and s.uid = u.id where a.class_id = u.class_id and (a.due is null or a.due > now() - interval '30 days')),
    'playlists', (select coalesce(json_agg(json_build_object('id', p.id, 'title', p.title, 'subj', p.subj, 'n', jsonb_array_length(p.items),
                  'done', (select count(*) from jsonb_array_elements(p.items) i where
                     (i->>'t' = 'lesson' and exists (select 1 from public.ed_lesson_done d where d.uid = u.id and d.lesson_id = (i->>'id')::int)) or
                     (i->>'t' = 'quiz' and exists (select 1 from public.ed_quiz_res q where q.uid = u.id and q.quiz_id = (i->>'id')::int)))) order by p.updated desc), '[]'::json)
                  from public.ed_playlist p where p.class_id = u.class_id),
    'events', (select coalesce(json_agg(json_build_object('id', e.id, 'kind', e.kind, 'title', e.title, 'starts', e.starts, 'place', e.place) order by e.starts), '[]'::json)
               from public.ed_event e where (e.class_id is null or e.class_id = u.class_id) and e.starts between now() and now() + interval '14 days'),
    'competitions', (select coalesce(json_agg(json_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'closes', c.closes, 'cat', c.cat,
                  'entered', exists (select 1 from public.ed_entry e where e.comp_id = c.id and e.uid = u.id)) order by c.closes), '[]'::json)
                  from public.ed_competition c where c.closes > now() and c.opens <= now() and (c.ages = 'all' or (c.ages = '11plus' and coalesce(u.year, 7) >= 7))),
    'news', (select coalesce(json_agg(json_build_object('id', n.id, 'title', n.title, 'body', left(n.body, 160), 'cover', n.cover, 'created', n.created) order by n.created desc), '[]'::json)
             from (select * from public.ed_news order by created desc limit 4) n),
    'review_due', (select count(*) from public.ed_review v where v.uid = u.id and v.due <= current_date),
    'unread_anns', (select count(*) from public.ed_ann a where a.ends > now() and public.ed_ann_for(a, u) and not exists (select 1 from public.ed_ann_read x where x.ann_id = a.id and x.uid = u.id)),
    'notifs', (select coalesce(json_agg(json_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link, 'created', n.created, 'read', n.read_at is not null) order by n.created desc), '[]'::json)
               from (select * from public.ed_notif where uid = u.id order by created desc limit 20) n),
    'activities_done', (select count(*) from public.ed_activity_done d where d.uid = u.id));
end $$;

create or replace function public.ed_s_explore(p_key text, p_cat int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true,
    'activities', (select coalesce(json_agg(json_build_object('id', a.id, 'cat', a.cat, 'title', a.title, 'blurb', a.blurb, 'minutes', a.minutes, 'ages', a.ages,
                     'done', exists (select 1 from public.ed_activity_done d where d.activity_id = a.id and d.uid = u.id)) order by a.updated desc), '[]'::json)
                   from public.ed_activity a where a.pub and (p_cat is null or p_cat = 0 or a.cat = p_cat)),
    'competitions', (select coalesce(json_agg(json_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'blurb', c.blurb, 'cat', c.cat, 'opens', c.opens, 'closes', c.closes, 'ages', c.ages,
                     'open', c.closes > now() and c.opens <= now(), 'entered', exists (select 1 from public.ed_entry e where e.comp_id = c.id and e.uid = u.id)) order by c.closes desc), '[]'::json)
                   from public.ed_competition c where (p_cat is null or p_cat = 0 or c.cat = p_cat) and c.closes > now() - interval '60 days'));
end $$;

create or replace function public.ed_s_activity(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a public.ed_activity;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into a from public.ed_activity where id = p_id and pub;
  if a.id is null then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'id', a.id, 'cat', a.cat, 'title', a.title, 'blurb', a.blurb, 'minutes', a.minutes, 'blocks', a.blocks,
    'done', exists (select 1 from public.ed_activity_done d where d.activity_id = a.id and d.uid = u.id));
end $$;
create or replace function public.ed_s_activity_done(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  insert into public.ed_activity_done (activity_id, uid) select id, u.id from public.ed_activity where id = p_id and pub on conflict do nothing;
  return json_build_object('ok', found);
end $$;

create or replace function public.ed_s_comp(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); c public.ed_competition;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into c from public.ed_competition where id = p_id;
  if c.id is null then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'id', c.id, 'kind', c.kind, 'title', c.title, 'blurb', c.blurb, 'blocks', c.blocks, 'cat', c.cat, 'opens', c.opens, 'closes', c.closes, 'open', c.closes > now() and c.opens <= now(),
    'entry', (select json_build_object('id', e.id, 'body', e.body, 'links', e.links, 'at', e.at, 'place', e.place, 'note', e.note) from public.ed_entry e where e.comp_id = c.id and e.uid = u.id),
    'results', case when c.closes < now() then (select coalesce(json_agg(json_build_object('name', x.name, 'place', e.place) order by e.place), '[]'::json) from public.ed_entry e join public.ed_user x on x.id = e.uid where e.comp_id = c.id and e.place is not null) else '[]'::json end);
end $$;
create or replace function public.ed_s_enter(p_key text, p_id int, p_body text, p_links json) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); c public.ed_competition;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into c from public.ed_competition where id = p_id;
  if c.id is null then return public.ed_err('not_found'); end if;
  if not (c.closes > now() and c.opens <= now()) then return public.ed_err('closed'); end if;
  if length(coalesce(p_body, '')) > 20000 then return public.ed_err('too_big'); end if;
  if length(btrim(coalesce(p_body, ''))) = 0 and coalesce(json_array_length(p_links), 0) = 0 then return public.ed_err('empty'); end if;
  insert into public.ed_entry (comp_id, uid, body, links) values (c.id, u.id, p_body, coalesce(p_links, '[]')::jsonb)
    on conflict (comp_id, uid) do update set body = excluded.body, links = excluded.links, at = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.ed_s_subjects(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true,
    'units', (select coalesce(json_agg(json_build_object('id', un.id, 'subj', un.subj, 'title', un.title, 'summary', un.summary, 'ord', un.ord,
      'lessons', (select coalesce(json_agg(json_build_object('id', l.id, 'title', l.title, 'minutes', l.minutes, 'ord', l.ord, 'done', exists (select 1 from public.ed_lesson_done d where d.lesson_id = l.id and d.uid = u.id)) order by l.ord, l.id), '[]'::json) from public.ed_lesson l where l.unit_id = un.id and l.pub),
      'quizzes', (select coalesce(json_agg(json_build_object('id', q.id, 'title', q.title, 'kind', q.kind, 'threshold', q.threshold, 'n', jsonb_array_length(q.qs),
                   'best', (select max(case when x.out_of > 0 then round(100.0 * x.score / x.out_of) else 0 end) from public.ed_quiz_res x where x.quiz_id = q.id and x.uid = u.id),
                   'tries', (select count(*) from public.ed_quiz_res x where x.quiz_id = q.id and x.uid = u.id)) order by q.kind desc, q.id), '[]'::json) from public.ed_quiz q where q.unit_id = un.id)) order by un.subj, un.ord, un.id), '[]'::json)
              from public.ed_unit un where public.ed_unit_for(un, u)),
    'playlists', (select coalesce(json_agg(json_build_object('id', p.id, 'title', p.title, 'subj', p.subj, 'items', p.items) order by p.updated desc), '[]'::json) from public.ed_playlist p where p.class_id = u.class_id));
end $$;

create or replace function public.ed_s_lesson(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); l public.ed_lesson; un public.ed_unit;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into l from public.ed_lesson where id = p_id and pub; if l.id is null then return public.ed_err('not_found'); end if;
  select * into un from public.ed_unit where id = l.unit_id; if not public.ed_unit_for(un, u) then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'id', l.id, 'title', l.title, 'minutes', l.minutes, 'blocks', l.blocks, 'unit', json_build_object('id', un.id, 'title', un.title, 'subj', un.subj),
    'done', exists (select 1 from public.ed_lesson_done d where d.lesson_id = l.id and d.uid = u.id),
    'next', (select json_build_object('id', x.id, 'title', x.title) from public.ed_lesson x where x.unit_id = un.id and x.pub and (x.ord, x.id) > (l.ord, l.id) order by x.ord, x.id limit 1));
end $$;
create or replace function public.ed_s_lesson_done(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); l public.ed_lesson; b jsonb; n int := 0;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into l from public.ed_lesson where id = p_id and pub; if l.id is null then return public.ed_err('not_found'); end if;
  insert into public.ed_lesson_done (lesson_id, uid) values (l.id, u.id) on conflict do nothing;
  for b in select * from jsonb_array_elements(l.blocks) where value->>'t' = 'key' loop
    n := n + 1;
    insert into public.ed_review (uid, subj, key, front, back) select u.id, un.subj, 'l:' || l.id || ':' || n, coalesce(b->>'q', l.title || ': key point ' || n), left(b->>'text', 600) from public.ed_unit un where un.id = l.unit_id on conflict do nothing;
  end loop;
  return json_build_object('ok', true);
end $$;

create or replace function public.ed_s_quiz(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); q public.ed_quiz;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into q from public.ed_quiz where id = p_id; if q.id is null then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'id', q.id, 'title', q.title, 'kind', q.kind, 'threshold', q.threshold, 'subj', q.subj,
    'qs', (select coalesce(json_agg(json_build_object('q', x->>'q', 'a', x->'a', 'topic', x->>'topic')), '[]'::json) from jsonb_array_elements(q.qs) x),
    'tries', (select count(*) from public.ed_quiz_res x where x.quiz_id = q.id and x.uid = u.id));
end $$;
create or replace function public.ed_s_quiz_done(p_key text, p_id int, p_answers json, p_assign int default null) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); q public.ed_quiz; i int := 0; sc int := 0; n int; x jsonb; ans int; res jsonb := '[]'::jsonb;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into q from public.ed_quiz where id = p_id; if q.id is null then return public.ed_err('not_found'); end if;
  n := jsonb_array_length(q.qs);
  if p_answers is null or json_typeof(p_answers) <> 'array' or json_array_length(p_answers) <> n then return public.ed_err('bad_answers'); end if;
  for x in select * from jsonb_array_elements(q.qs) loop
    ans := nullif(p_answers->>i, '')::int;
    if ans = (x->>'c')::int then sc := sc + 1;
    else insert into public.ed_review (uid, subj, key, front, back) values (u.id, q.subj, 'q:' || q.id || ':' || i, x->>'q', coalesce(x->'a'->>((x->>'c')::int), '') || case when coalesce(x->>'why', '') <> '' then E'\n' || (x->>'why') else '' end)
      on conflict (uid, key) do update set due = current_date, ivl = 0; end if;
    res := res || jsonb_build_object('i', i, 'ans', ans, 'c', (x->>'c')::int, 'why', x->>'why'); i := i + 1;
  end loop;
  insert into public.ed_quiz_res (quiz_id, uid, score, out_of, answers) values (q.id, u.id, sc, n, p_answers::jsonb);
  if p_assign is not null and exists (select 1 from public.ed_assign a where a.id = p_assign and a.quiz_id = q.id and a.class_id = u.class_id) then
    insert into public.ed_sub (assign_id, uid, status, ver, body, sub_at, score) values (p_assign, u.id, 'submitted', 1, 'Quiz: ' || sc || '/' || n, now(), round(100.0 * sc / greatest(n, 1)))
    on conflict (assign_id, uid) do update set status = 'submitted', sub_at = now(), score = greatest(coalesce(public.ed_sub.score, 0), excluded.score), body = excluded.body;
  end if;
  return json_build_object('ok', true, 'score', sc, 'out_of', n, 'pct', round(100.0 * sc / greatest(n, 1)), 'passed', q.kind <> 'checkpoint' or 100 * sc >= q.threshold * n, 'results', res);
end $$;

create or replace function public.ed_s_assigns(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'subj', a.subj, 'instr', a.instr, 'due', a.due, 'points', a.points, 'quiz_id', a.quiz_id, 'created', a.created,
      'rubric', (select json_build_object('title', b.title, 'criteria', b.criteria) from public.ed_rubric b where b.id = a.rubric_id),
      'sub', case when s.id is null then null else json_build_object('id', s.id, 'status', s.status, 'ver', s.ver, 'body', s.body, 'links', s.links, 'sub_at', s.sub_at, 'score', s.score, 'rub', s.rub, 'feedback', s.feedback, 'graded_at', s.graded_at,
                 'versions', (select coalesce(json_agg(json_build_object('ver', v.ver, 'at', v.at, 'len', length(v.body)) order by v.ver desc), '[]'::json) from public.ed_sub_ver v where v.sub_id = s.id)) end) order by a.due nulls last, a.id desc), '[]'::json)
    from public.ed_assign a left join public.ed_sub s on s.assign_id = a.id and s.uid = u.id where a.class_id = u.class_id));
end $$;
create or replace function public.ed_s_submit(p_key text, p_assign int, p_body text, p_links json, p_final boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a public.ed_assign; s public.ed_sub; v int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into a from public.ed_assign where id = p_assign and class_id = u.class_id; if a.id is null then return public.ed_err('not_found'); end if;
  if length(coalesce(p_body, '')) > 20000 or length(coalesce(p_links::text, '[]')) > 4000 then return public.ed_err('too_big'); end if;
  if p_final and length(btrim(coalesce(p_body, ''))) = 0 and coalesce(json_array_length(p_links), 0) = 0 then return public.ed_err('empty'); end if;
  insert into public.ed_sub (assign_id, uid) values (a.id, u.id) on conflict do nothing;
  select * into s from public.ed_sub where assign_id = a.id and uid = u.id for update;
  if s.status = 'returned' and not p_final then return public.ed_err('graded'); end if;
  v := s.ver + 1;
  insert into public.ed_sub_ver (sub_id, ver, body, links) values (s.id, v, coalesce(p_body, ''), coalesce(p_links, '[]')::jsonb);
  update public.ed_sub set ver = v, body = coalesce(p_body, ''), links = coalesce(p_links, '[]')::jsonb, status = case when p_final then 'submitted' else status end, sub_at = case when p_final then now() else sub_at end where id = s.id;
  if p_final and a.uid is not null then insert into public.ed_notif (uid, kind, title, body, link) values (a.uid, 'submission', u.name || ' handed in "' || a.title || '"', '', '#/assignment/' || a.id); end if;
  return json_build_object('ok', true, 'ver', v, 'status', case when p_final then 'submitted' else s.status end);
end $$;

create or replace function public.ed_s_review(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true,
    'due', (select coalesce(json_agg(json_build_object('id', v.id, 'subj', v.subj, 'front', v.front, 'back', v.back, 'reps', v.reps) order by v.due, v.id), '[]'::json) from (select * from public.ed_review where uid = u.id and due <= current_date order by due, id limit 40) v),
    'total', (select count(*) from public.ed_review where uid = u.id), 'next', (select min(due) from public.ed_review where uid = u.id and due > current_date));
end $$;
create or replace function public.ed_s_review_done(p_key text, p_id int, p_grade int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); v public.ed_review; g int := least(greatest(coalesce(p_grade, 0), 0), 3); e numeric; iv int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into v from public.ed_review where id = p_id and uid = u.id for update; if v.id is null then return public.ed_err('not_found'); end if;
  if g = 0 then iv := 0; e := greatest(1.3, v.ease - 0.2);
  else e := greatest(1.3, v.ease + case g when 1 then -0.15 when 2 then 0 else 0.15 end); iv := case when v.reps = 0 then 1 when v.reps = 1 then 3 else round(greatest(v.ivl, 1) * e) end; if g = 1 then iv := greatest(1, iv / 2); end if; end if;
  update public.ed_review set ease = e, ivl = iv, reps = case when g = 0 then 0 else v.reps + 1 end, due = current_date + greatest(iv, case when g = 0 then 0 else 1 end) where id = v.id;
  return json_build_object('ok', true, 'due_in', greatest(iv, case when g = 0 then 0 else 1 end));
end $$;

create or replace function public.ed_s_progress(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true,
    'subjects', (select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name, 'icon', s.icon,
      'lessons', (select count(*) from public.ed_lesson l join public.ed_unit un on un.id = l.unit_id where un.subj = s.id and l.pub and public.ed_unit_for(un, u)),
      'lessons_done', (select count(*) from public.ed_lesson_done d join public.ed_lesson l on l.id = d.lesson_id join public.ed_unit un on un.id = l.unit_id where un.subj = s.id and d.uid = u.id),
      'checkpoints', (select count(*) from public.ed_quiz q join public.ed_unit un on un.id = q.unit_id where q.subj = s.id and q.kind = 'checkpoint' and public.ed_unit_for(un, u)),
      'checkpoints_passed', (select count(*) from public.ed_quiz q where q.subj = s.id and q.kind = 'checkpoint' and exists (select 1 from public.ed_quiz_res x where x.quiz_id = q.id and x.uid = u.id and 100 * x.score >= q.threshold * greatest(x.out_of, 1))),
      'quiz_avg', (select round(avg(100.0 * x.score / greatest(x.out_of, 1))) from public.ed_quiz_res x join public.ed_quiz q on q.id = x.quiz_id where q.subj = s.id and x.uid = u.id),
      'assigns', (select count(*) from public.ed_assign a where a.subj = s.id and a.class_id = u.class_id),
      'assigns_done', (select count(*) from public.ed_assign a join public.ed_sub b on b.assign_id = a.id and b.uid = u.id where a.subj = s.id and a.class_id = u.class_id and b.status <> 'draft'),
      'grade_avg', (select round(avg(b.score)) from public.ed_assign a join public.ed_sub b on b.assign_id = a.id and b.uid = u.id where a.subj = s.id and b.score is not null)) order by s.ord), '[]'::json) from public.ed_subject s),
    'recent', (select coalesce(json_agg(json_build_object('title', q.title, 'kind', q.kind, 'subj', q.subj, 'score', x.score, 'out_of', x.out_of, 'at', x.at) order by x.at desc), '[]'::json)
               from (select * from public.ed_quiz_res where uid = u.id order by at desc limit 12) x join public.ed_quiz q on q.id = x.quiz_id),
    'activities', (select coalesce(json_agg(json_build_object('cat', c.id, 'name', c.name, 'icon', c.icon, 'n', (select count(*) from public.ed_activity a where a.cat = c.id and a.pub),
                     'done', (select count(*) from public.ed_activity_done d join public.ed_activity a on a.id = d.activity_id where a.cat = c.id and d.uid = u.id)) order by c.ord), '[]'::json) from public.ed_category c),
    'entries', (select count(*) from public.ed_entry e where e.uid = u.id),
    'places', (select coalesce(json_agg(json_build_object('title', c.title, 'place', e.place) order by e.place), '[]'::json) from public.ed_entry e join public.ed_competition c on c.id = e.comp_id where e.uid = u.id and e.place is not null));
end $$;

create or replace function public.ed_s_calendar(p_key text, p_from date, p_to date) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(x order by x.starts), '[]'::json) from (
      select 'e' || e.id as id, e.kind, e.title, e.starts, e.ends, e.place, null::int as assign_id, null::int as comp_id, (select name from public.ed_class where id = e.class_id) as class from public.ed_event e where (e.class_id is null or e.class_id = u.class_id) and e.starts::date between p_from and p_to
      union all select 'a' || a.id, 'due', a.title, a.due, null, (select name from public.ed_subject where id = a.subj), a.id, null, null from public.ed_assign a where a.class_id = u.class_id and a.due is not null and a.due::date between p_from and p_to
      union all select 'c' || c.id, 'competition', c.title || ' closes', c.closes, null, '', null, c.id, null from public.ed_competition c where c.closes::date between p_from and p_to) x));
end $$;

create or replace function public.ed_s_anns(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', a.id, 'title', a.title, 'body', a.body, 'pinned', a.pinned, 'created', a.created,
      'from', (select name from public.ed_user t where t.id = a.uid), 'class', (select name from public.ed_class where id = a.class_id), 'read', exists (select 1 from public.ed_ann_read x where x.ann_id = a.id and x.uid = u.id)) order by a.pinned desc, a.created desc), '[]'::json)
    from public.ed_ann a where a.ends > now() and public.ed_ann_for(a, u)));
end $$;
create or replace function public.ed_s_ann_read(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  insert into public.ed_ann_read (ann_id, uid) select a.id, u.id from public.ed_ann a where a.id = p_id and public.ed_ann_for(a, u) on conflict do nothing;
  return json_build_object('ok', true);
end $$;
create or replace function public.ed_s_news(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', n.id, 'title', n.title, 'body', n.body, 'cover', n.cover, 'featured', n.featured, 'created', n.created, 'from', (select name from public.ed_user t where t.id = n.uid)) order by n.created desc), '[]'::json) from public.ed_news n));
end $$;
create or replace function public.ed_notif_read(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  update public.ed_notif set read_at = now() where uid = u.id and read_at is null and (p_id is null or id = p_id);
  return json_build_object('ok', true);
end $$;

-- ---------- 6. Staff functions (teacher or admin, p_key) ----------
create or replace function public.ed_t_home(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true,
    'to_grade', (select count(*) from public.ed_sub s join public.ed_assign a on a.id = s.assign_id where s.status = 'submitted' and public.ed_can_class(u, a.class_id)),
    'assigns', (select coalesce(json_agg(json_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'due', a.due, 'class_id', a.class_id, 'class', (select name from public.ed_class where id = a.class_id),
                  'n', (select count(*) from public.ed_user x where x.class_id = a.class_id and x.role = 'student'), 'submitted', (select count(*) from public.ed_sub s where s.assign_id = a.id and s.status <> 'draft'), 'graded', (select count(*) from public.ed_sub s where s.assign_id = a.id and s.status = 'returned')) order by a.due nulls last), '[]'::json)
                from public.ed_assign a where public.ed_can_class(u, a.class_id) and (a.due is null or a.due > now() - interval '7 days')),
    'events', (select coalesce(json_agg(json_build_object('id', e.id, 'kind', e.kind, 'title', e.title, 'starts', e.starts) order by e.starts), '[]'::json) from public.ed_event e where (e.class_id is null or public.ed_can_class(u, e.class_id)) and e.starts between now() and now() + interval '14 days'),
    'competitions', (select coalesce(json_agg(json_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'closes', c.closes, 'entries', (select count(*) from public.ed_entry e where e.comp_id = c.id)) order by c.closes), '[]'::json) from public.ed_competition c where c.closes > now() - interval '14 days'),
    'notifs', (select coalesce(json_agg(json_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'link', n.link, 'created', n.created, 'read', n.read_at is not null) order by n.created desc), '[]'::json) from (select * from public.ed_notif where uid = u.id order by created desc limit 20) n),
    'active', (select count(*) from public.ed_user x where x.role = 'student' and x.last_seen > now() - interval '7 days'),
    'students', (select count(*) from public.ed_user x where x.role = 'student'));
end $$;

create or replace function public.ed_t_class(p_key text, p_class int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'class', (select json_build_object('id', id, 'name', name, 'year', year, 'subj', subj) from public.ed_class where id = p_class),
    'students', (select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name, 'username', x.username, 'year', x.year, 'last_seen', x.last_seen,
        'lessons_done', (select count(*) from public.ed_lesson_done d where d.uid = x.id), 'activities_done', (select count(*) from public.ed_activity_done d where d.uid = x.id),
        'submitted', (select count(*) from public.ed_sub s join public.ed_assign a on a.id = s.assign_id where s.uid = x.id and a.class_id = p_class and s.status <> 'draft'),
        'grade_avg', (select round(avg(s.score)) from public.ed_sub s join public.ed_assign a on a.id = s.assign_id where s.uid = x.id and a.class_id = p_class and s.score is not null),
        'quiz_avg', (select round(avg(100.0 * q.score / greatest(q.out_of, 1))) from public.ed_quiz_res q where q.uid = x.id)) order by x.name), '[]'::json)
      from public.ed_user x where x.class_id = p_class and x.role = 'student'));
end $$;

create or replace function public.ed_t_heatmap(p_key text, p_class int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); c public.ed_class;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  select * into c from public.ed_class where id = p_class;
  return json_build_object('ok', true,
    'units', (select coalesce(json_agg(json_build_object('id', un.id, 'title', un.title, 'subj', un.subj, 'lessons', (select count(*) from public.ed_lesson l where l.unit_id = un.id and l.pub),
                'checkpoint', (select q.id from public.ed_quiz q where q.unit_id = un.id and q.kind = 'checkpoint' order by q.id limit 1)) order by un.subj, un.ord, un.id), '[]'::json)
              from public.ed_unit un where (un.class_id is null or un.class_id = p_class) and (un.year is null or un.year = c.year) and (c.subj is null or un.subj = c.subj)),
    'students', (select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name,
        'cells', (select coalesce(json_object_agg(un.id, json_build_object(
            'done', (select count(*) from public.ed_lesson_done d join public.ed_lesson l on l.id = d.lesson_id where l.unit_id = un.id and d.uid = x.id),
            'cp', (select max(round(100.0 * r.score / greatest(r.out_of, 1))) from public.ed_quiz_res r join public.ed_quiz q on q.id = r.quiz_id where q.unit_id = un.id and q.kind = 'checkpoint' and r.uid = x.id),
            'quiz', (select round(avg(100.0 * r.score / greatest(r.out_of, 1))) from public.ed_quiz_res r join public.ed_quiz q on q.id = r.quiz_id where q.unit_id = un.id and r.uid = x.id))), '{}'::json)
          from public.ed_unit un where (un.class_id is null or un.class_id = p_class) and (un.year is null or un.year = c.year) and (c.subj is null or un.subj = c.subj))) order by x.name), '[]'::json)
      from public.ed_user x where x.class_id = p_class and x.role = 'student'));
end $$;

create or replace function public.ed_t_content(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true,
    'units', (select coalesce(json_agg(json_build_object('id', un.id, 'subj', un.subj, 'class_id', un.class_id, 'year', un.year, 'title', un.title, 'summary', un.summary, 'ord', un.ord,
      'lessons', (select coalesce(json_agg(json_build_object('id', l.id, 'title', l.title, 'minutes', l.minutes, 'ord', l.ord, 'pub', l.pub, 'blocks', l.blocks, 'updated', l.updated) order by l.ord, l.id), '[]'::json) from public.ed_lesson l where l.unit_id = un.id)) order by un.subj, un.ord, un.id), '[]'::json) from public.ed_unit un where public.ed_can_subj(u, un.subj)),
    'quizzes', (select coalesce(json_agg(json_build_object('id', q.id, 'subj', q.subj, 'unit_id', q.unit_id, 'title', q.title, 'kind', q.kind, 'threshold', q.threshold, 'qs', q.qs, 'updated', q.updated, 'tries', (select count(*) from public.ed_quiz_res r where r.quiz_id = q.id)) order by q.updated desc), '[]'::json) from public.ed_quiz q where public.ed_can_subj(u, q.subj)),
    'playlists', (select coalesce(json_agg(json_build_object('id', p.id, 'class_id', p.class_id, 'subj', p.subj, 'title', p.title, 'items', p.items) order by p.updated desc), '[]'::json) from public.ed_playlist p where public.ed_can_class(u, p.class_id)),
    'rubrics', (select coalesce(json_agg(json_build_object('id', b.id, 'title', b.title, 'criteria', b.criteria, 'updated', b.updated) order by b.updated desc), '[]'::json) from public.ed_rubric b where u.role = 'admin' or b.uid = u.id),
    'activities', (select coalesce(json_agg(json_build_object('id', a.id, 'cat', a.cat, 'title', a.title, 'blurb', a.blurb, 'blocks', a.blocks, 'minutes', a.minutes, 'ages', a.ages, 'pub', a.pub, 'updated', a.updated, 'done', (select count(*) from public.ed_activity_done d where d.activity_id = a.id)) order by a.updated desc), '[]'::json) from public.ed_activity a),
    'competitions', (select coalesce(json_agg(json_build_object('id', c.id, 'cat', c.cat, 'kind', c.kind, 'title', c.title, 'blurb', c.blurb, 'blocks', c.blocks, 'opens', c.opens, 'closes', c.closes, 'ages', c.ages, 'entries', (select count(*) from public.ed_entry e where e.comp_id = c.id)) order by c.closes desc), '[]'::json) from public.ed_competition c),
    'news', (select coalesce(json_agg(json_build_object('id', n.id, 'title', n.title, 'body', n.body, 'cover', n.cover, 'featured', n.featured, 'created', n.created) order by n.created desc), '[]'::json) from public.ed_news n));
end $$;

create or replace function public.ed_t_unit_save(p_key text, p_id int, p_subj int, p_class int, p_year int, p_title text, p_summary text, p_ord int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if not public.ed_can_subj(u, p_subj) or (coalesce(p_class, 0) <> 0 and not public.ed_can_class(u, p_class)) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 80) then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_unit (subj, class_id, year, title, summary, ord, uid) values (p_subj, nullif(p_class, 0), nullif(p_year, 0), btrim(p_title), left(coalesce(p_summary, ''), 400), coalesce(p_ord, 0), u.id) returning id into i;
  else update public.ed_unit set subj = p_subj, class_id = nullif(p_class, 0), year = nullif(p_year, 0), title = btrim(p_title), summary = left(coalesce(p_summary, ''), 400), ord = coalesce(p_ord, 0) where id = p_id and public.ed_can_subj(u, subj) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_unit_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  delete from public.ed_unit where id = p_id and public.ed_can_subj(u, subj); return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_lesson_save(p_key text, p_id int, p_unit int, p_title text, p_minutes int, p_blocks json, p_ord int, p_pub boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int; un public.ed_unit;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into un from public.ed_unit where id = p_unit; if un.id is null or not public.ed_can_subj(u, un.subj) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 100) then return public.ed_err('bad_text'); end if;
  if p_blocks is null or json_typeof(p_blocks) <> 'array' or length(p_blocks::text) > 200000 then return public.ed_err('too_big'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_lesson (unit_id, title, minutes, blocks, ord, pub) values (un.id, btrim(p_title), least(greatest(coalesce(p_minutes, 20), 1), 300), p_blocks::jsonb, coalesce(p_ord, 0), coalesce(p_pub, true)) returning id into i;
  else update public.ed_lesson set unit_id = un.id, title = btrim(p_title), minutes = least(greatest(coalesce(p_minutes, 20), 1), 300), blocks = p_blocks::jsonb, ord = coalesce(p_ord, 0), pub = coalesce(p_pub, true), updated = now() where id = p_id returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_lesson_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  delete from public.ed_lesson l where l.id = p_id and exists (select 1 from public.ed_unit x where x.id = l.unit_id and public.ed_can_subj(u, x.subj)); return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_quiz_save(p_key text, p_id int, p_subj int, p_unit int, p_title text, p_kind text, p_threshold int, p_qs json) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_subj(u, p_subj) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 100) then return public.ed_err('bad_text'); end if;
  if p_qs is null or json_typeof(p_qs) <> 'array' or json_array_length(p_qs) not between 1 and 60 or length(p_qs::text) > 120000 then return public.ed_err('bad_quiz'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_quiz (subj, unit_id, title, kind, threshold, qs, uid) values (p_subj, nullif(p_unit, 0), btrim(p_title), coalesce(p_kind, 'quiz'), least(greatest(coalesce(p_threshold, 80), 1), 100), p_qs::jsonb, u.id) returning id into i;
  else update public.ed_quiz set subj = p_subj, unit_id = nullif(p_unit, 0), title = btrim(p_title), kind = coalesce(p_kind, 'quiz'), threshold = least(greatest(coalesce(p_threshold, 80), 1), 100), qs = p_qs::jsonb, updated = now() where id = p_id and public.ed_can_subj(u, subj) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_quiz_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; delete from public.ed_quiz where id = p_id and public.ed_can_subj(u, subj); return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_playlist_save(p_key text, p_id int, p_class int, p_subj int, p_title text, p_items json) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 80) then return public.ed_err('bad_text'); end if;
  if p_items is null or json_typeof(p_items) <> 'array' or json_array_length(p_items) > 60 then return public.ed_err('bad_items'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_playlist (class_id, subj, title, items, uid) values (p_class, p_subj, btrim(p_title), p_items::jsonb, u.id) returning id into i; perform public.ed_notify_class(p_class, 'playlist', 'New playlist: ' || btrim(p_title), '', '#/subjects');
  else update public.ed_playlist set class_id = p_class, subj = p_subj, title = btrim(p_title), items = p_items::jsonb, updated = now() where id = p_id and public.ed_can_class(u, class_id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_playlist_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; delete from public.ed_playlist where id = p_id and public.ed_can_class(u, class_id); return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_rubric_save(p_key text, p_id int, p_title text, p_criteria json) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 80) then return public.ed_err('bad_text'); end if;
  if p_criteria is null or json_typeof(p_criteria) <> 'array' or json_array_length(p_criteria) not between 1 and 12 or length(p_criteria::text) > 40000 then return public.ed_err('bad_rubric'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_rubric (uid, title, criteria) values (u.id, btrim(p_title), p_criteria::jsonb) returning id into i;
  else update public.ed_rubric set title = btrim(p_title), criteria = p_criteria::jsonb, updated = now() where id = p_id and (u.role = 'admin' or uid = u.id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_rubric_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; delete from public.ed_rubric where id = p_id and (u.role = 'admin' or uid = u.id); return json_build_object('ok', found);
end $$;

create or replace function public.ed_t_assigns(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', a.id, 'class_id', a.class_id, 'subj', a.subj, 'kind', a.kind, 'title', a.title, 'instr', a.instr, 'due', a.due, 'points', a.points, 'quiz_id', a.quiz_id, 'rubric_id', a.rubric_id, 'created', a.created,
      'class', (select name from public.ed_class where id = a.class_id), 'n', (select count(*) from public.ed_user x where x.class_id = a.class_id and x.role = 'student'),
      'submitted', (select count(*) from public.ed_sub s where s.assign_id = a.id and s.status <> 'draft'), 'graded', (select count(*) from public.ed_sub s where s.assign_id = a.id and s.status = 'returned')) order by a.due desc nulls first, a.id desc), '[]'::json)
    from public.ed_assign a where public.ed_can_class(u, a.class_id)));
end $$;
create or replace function public.ed_t_assign_save(p_key text, p_id int, p_class int, p_subj int, p_kind text, p_title text, p_instr text, p_due timestamptz, p_points int, p_quiz int, p_rubric int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 120) or length(coalesce(p_instr, '')) > 8000 then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then
    insert into public.ed_assign (class_id, subj, kind, title, instr, due, points, quiz_id, rubric_id, uid) values (p_class, p_subj, coalesce(p_kind, 'homework'), btrim(p_title), coalesce(p_instr, ''), p_due, least(greatest(coalesce(p_points, 10), 0), 1000), nullif(p_quiz, 0), nullif(p_rubric, 0), u.id) returning id into i;
    perform public.ed_notify_class(p_class, 'assign', 'New ' || coalesce(p_kind, 'homework') || ': ' || btrim(p_title), case when p_due is null then '' else 'Due ' || to_char(p_due, 'Dy DD Mon') end, '#/assignment/' || i);
  else update public.ed_assign set class_id = p_class, subj = p_subj, kind = coalesce(p_kind, 'homework'), title = btrim(p_title), instr = coalesce(p_instr, ''), due = p_due, points = least(greatest(coalesce(p_points, 10), 0), 1000), quiz_id = nullif(p_quiz, 0), rubric_id = nullif(p_rubric, 0) where id = p_id and public.ed_can_class(u, class_id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_assign_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; delete from public.ed_assign where id = p_id and public.ed_can_class(u, class_id); return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_subs(p_key text, p_assign int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a public.ed_assign;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into a from public.ed_assign where id = p_assign; if a.id is null or not public.ed_can_class(u, a.class_id) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true,
    'assign', json_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'instr', a.instr, 'due', a.due, 'points', a.points, 'class_id', a.class_id, 'quiz_id', a.quiz_id, 'rubric', (select json_build_object('id', b.id, 'title', b.title, 'criteria', b.criteria) from public.ed_rubric b where b.id = a.rubric_id)),
    'rows', (select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name,
        'sub', case when s.id is null then null else json_build_object('id', s.id, 'status', s.status, 'ver', s.ver, 'body', s.body, 'links', s.links, 'sub_at', s.sub_at, 'score', s.score, 'rub', s.rub, 'feedback', s.feedback, 'graded_at', s.graded_at,
          'versions', (select coalesce(json_agg(json_build_object('ver', v.ver, 'at', v.at, 'body', v.body, 'links', v.links) order by v.ver desc), '[]'::json) from public.ed_sub_ver v where v.sub_id = s.id)) end) order by x.name), '[]'::json)
      from public.ed_user x left join public.ed_sub s on s.assign_id = a.id and s.uid = x.id where x.class_id = a.class_id and x.role = 'student'));
end $$;
create or replace function public.ed_t_grade(p_key text, p_sub int, p_score int, p_rub json, p_feedback text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); s public.ed_sub; a public.ed_assign;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into s from public.ed_sub where id = p_sub; if s.id is null then return public.ed_err('not_found'); end if;
  select * into a from public.ed_assign where id = s.assign_id; if not public.ed_can_class(u, a.class_id) then return public.ed_err('forbidden'); end if;
  if length(coalesce(p_feedback, '')) > 4000 then return public.ed_err('bad_text'); end if;
  update public.ed_sub set status = 'returned', score = least(greatest(coalesce(p_score, 0), 0), 100), rub = p_rub::jsonb, feedback = coalesce(p_feedback, ''), graded_at = now() where id = s.id;
  insert into public.ed_notif (uid, kind, title, body, link) values (s.uid, 'grade', '"' || a.title || '" has been marked', coalesce(left(p_feedback, 120), ''), '#/assignment/' || a.id);
  return json_build_object('ok', true);
end $$;

-- activities, competitions, news (any staff member)
create or replace function public.ed_t_activity_save(p_key text, p_id int, p_cat int, p_title text, p_blurb text, p_blocks json, p_minutes int, p_ages text, p_pub boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 100) or length(coalesce(p_blurb, '')) > 400 then return public.ed_err('bad_text'); end if;
  if p_blocks is null or json_typeof(p_blocks) <> 'array' or length(p_blocks::text) > 200000 then return public.ed_err('too_big'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_activity (cat, title, blurb, blocks, minutes, ages, pub, uid) values (p_cat, btrim(p_title), coalesce(p_blurb, ''), p_blocks::jsonb, least(greatest(coalesce(p_minutes, 30), 1), 600), coalesce(p_ages, 'all'), coalesce(p_pub, true), u.id) returning id into i;
  else update public.ed_activity set cat = p_cat, title = btrim(p_title), blurb = coalesce(p_blurb, ''), blocks = p_blocks::jsonb, minutes = least(greatest(coalesce(p_minutes, 30), 1), 600), ages = coalesce(p_ages, 'all'), pub = coalesce(p_pub, true), updated = now() where id = p_id returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_activity_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  delete from public.ed_activity where id = p_id; return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_comp_save(p_key text, p_id int, p_cat int, p_kind text, p_title text, p_blurb text, p_blocks json, p_opens timestamptz, p_closes timestamptz, p_ages text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 100) or length(coalesce(p_blurb, '')) > 400 or p_closes is null then return public.ed_err('bad_text'); end if;
  if p_blocks is null or json_typeof(p_blocks) <> 'array' or length(p_blocks::text) > 200000 then return public.ed_err('too_big'); end if;
  if coalesce(p_id, 0) = 0 then
    insert into public.ed_competition (cat, kind, title, blurb, blocks, opens, closes, ages, uid) values (nullif(p_cat, 0), coalesce(p_kind, 'competition'), btrim(p_title), coalesce(p_blurb, ''), p_blocks::jsonb, coalesce(p_opens, now()), p_closes, coalesce(p_ages, 'all'), u.id) returning id into i;
    insert into public.ed_notif (uid, kind, title, body, link) select id, 'competition', 'New ' || coalesce(p_kind, 'competition') || ': ' || btrim(p_title), 'Closes ' || to_char(p_closes, 'Dy DD Mon'), '#/competition/' || i from public.ed_user where role = 'student';
  else update public.ed_competition set cat = nullif(p_cat, 0), kind = coalesce(p_kind, 'competition'), title = btrim(p_title), blurb = coalesce(p_blurb, ''), blocks = p_blocks::jsonb, opens = coalesce(p_opens, opens), closes = p_closes, ages = coalesce(p_ages, 'all'), updated = now() where id = p_id returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_comp_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  delete from public.ed_competition where id = p_id; return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_entries(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'comp', (select json_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'closes', c.closes) from public.ed_competition c where c.id = p_id),
    'rows', (select coalesce(json_agg(json_build_object('id', e.id, 'uid', e.uid, 'name', x.name, 'year', x.year, 'class', (select name from public.ed_class where id = x.class_id), 'body', e.body, 'links', e.links, 'at', e.at, 'place', e.place, 'note', e.note) order by e.place nulls last, e.at), '[]'::json)
      from public.ed_entry e join public.ed_user x on x.id = e.uid where e.comp_id = p_id));
end $$;
create or replace function public.ed_t_entry_place(p_key text, p_id int, p_place int, p_note text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); e public.ed_entry; c public.ed_competition;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  update public.ed_entry set place = nullif(p_place, 0), note = left(coalesce(p_note, ''), 500) where id = p_id returning * into e;
  if e.id is null then return public.ed_err('not_found'); end if;
  select * into c from public.ed_competition where id = e.comp_id;
  if e.place is not null then insert into public.ed_notif (uid, kind, title, body, link) values (e.uid, 'competition', 'You placed ' || e.place || case e.place when 1 then 'st' when 2 then 'nd' when 3 then 'rd' else 'th' end || ' in ' || c.title, coalesce(e.note, ''), '#/competition/' || c.id); end if;
  return json_build_object('ok', true);
end $$;
create or replace function public.ed_t_news_save(p_key text, p_id int, p_title text, p_body text, p_cover text, p_featured boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 120) or not public.ed_ok_text(p_body, 20000) then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_news (title, body, cover, featured, uid) values (btrim(p_title), btrim(p_body), left(coalesce(p_cover, ''), 500), coalesce(p_featured, false), u.id) returning id into i;
  else update public.ed_news set title = btrim(p_title), body = btrim(p_body), cover = left(coalesce(p_cover, ''), 500), featured = coalesce(p_featured, false) where id = p_id returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_news_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  delete from public.ed_news where id = p_id; return json_build_object('ok', found);
end $$;

create or replace function public.ed_t_anns(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', a.id, 'class_id', a.class_id, 'targets', a.targets, 'title', a.title, 'body', a.body, 'pinned', a.pinned, 'created', a.created, 'ends', a.ends,
      'class', (select name from public.ed_class where id = a.class_id), 'reach', (select count(*) from public.ed_user x where x.role = 'student' and public.ed_ann_for(a, x)), 'reads', (select count(*) from public.ed_ann_read r where r.ann_id = a.id),
      'readers', (select coalesce(json_agg(json_build_object('name', x.name, 'at', r.at) order by r.at desc), '[]'::json) from public.ed_ann_read r join public.ed_user x on x.id = r.uid where r.ann_id = a.id)) order by a.created desc), '[]'::json)
    from public.ed_ann a where (a.class_id is not null and public.ed_can_class(u, a.class_id)) or (a.class_id is null and (u.role = 'admin' or a.uid = u.id))));
end $$;
create or replace function public.ed_t_ann_save(p_key text, p_id int, p_class int, p_targets json, p_title text, p_body text, p_pinned boolean, p_days int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if coalesce(p_class, 0) <> 0 and not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 120) or not public.ed_ok_text(p_body, 2000) then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then
    insert into public.ed_ann (class_id, targets, title, body, pinned, uid, ends) values (nullif(p_class, 0), coalesce(p_targets, '{}')::jsonb, btrim(p_title), btrim(p_body), coalesce(p_pinned, false), u.id, now() + make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90))) returning id into i;
    insert into public.ed_notif (uid, kind, title, body, link) select x.id, 'announce', btrim(p_title), left(btrim(p_body), 140), '#/announcements' from public.ed_user x, public.ed_ann a where a.id = i and x.role = 'student' and public.ed_ann_for(a, x);
  else update public.ed_ann set class_id = nullif(p_class, 0), targets = coalesce(p_targets, '{}')::jsonb, title = btrim(p_title), body = btrim(p_body), pinned = coalesce(p_pinned, false), ends = now() + make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90)) where id = p_id and (u.role = 'admin' or uid = u.id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_ann_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; delete from public.ed_ann where id = p_id and (u.role = 'admin' or uid = u.id); return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_events(p_key text, p_from date, p_to date) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(x order by x.starts), '[]'::json) from (
      select 'e' || e.id as id, e.id as event_id, e.kind, e.title, e.starts, e.ends, e.place, e.class_id, (select name from public.ed_class where id = e.class_id) as class, null::int as assign_id, null::int as comp_id from public.ed_event e where (e.class_id is null or public.ed_can_class(u, e.class_id)) and e.starts::date between p_from and p_to
      union all select 'a' || a.id, null, 'due', a.title, a.due, null, (select name from public.ed_class where id = a.class_id), a.class_id, (select name from public.ed_class where id = a.class_id), a.id, null from public.ed_assign a where public.ed_can_class(u, a.class_id) and a.due is not null and a.due::date between p_from and p_to
      union all select 'c' || c.id, null, 'competition', c.title || ' closes', c.closes, null, '', null, null, null, c.id from public.ed_competition c where c.closes::date between p_from and p_to) x));
end $$;
create or replace function public.ed_t_event_save(p_key text, p_id int, p_class int, p_kind text, p_title text, p_starts timestamptz, p_ends timestamptz, p_place text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if coalesce(p_class, 0) <> 0 and not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 120) or p_starts is null then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then
    insert into public.ed_event (class_id, kind, title, starts, ends, place, uid) values (nullif(p_class, 0), coalesce(p_kind, 'event'), btrim(p_title), p_starts, p_ends, left(coalesce(p_place, ''), 120), u.id) returning id into i;
    if coalesce(p_class, 0) <> 0 then perform public.ed_notify_class(p_class, 'event', coalesce(p_kind, 'event') || ': ' || btrim(p_title), to_char(p_starts, 'Dy DD Mon HH24:MI'), '#/calendar'); end if;
  else update public.ed_event set class_id = nullif(p_class, 0), kind = coalesce(p_kind, 'event'), title = btrim(p_title), starts = p_starts, ends = p_ends, place = left(coalesce(p_place, ''), 120) where id = p_id and (u.role = 'admin' or uid = u.id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_event_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; delete from public.ed_event where id = p_id and (u.role = 'admin' or uid = u.id); return json_build_object('ok', found);
end $$;

-- ---------- 7. Admin functions: people, classes, codes ----------
create or replace function public.ed_a_users(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'admin', u.role = 'admin',
    'school', (select json_build_object('name', name, 'join_code', case when u.role = 'admin' then join_code else null end, 'invite_code', case when u.role = 'admin' then invite_code else null end) from public.ed_school where id = 1),
    'users', (select coalesce(json_agg(json_build_object('id', x.id, 'role', x.role, 'username', x.username, 'name', x.name, 'year', x.year, 'class_id', x.class_id, 'subj', x.subj, 'disabled', x.disabled, 'last_seen', x.last_seen, 'created', x.created) order by x.role, x.name), '[]'::json)
      from public.ed_user x where u.role = 'admin' or (x.role = 'student' and x.class_id = any(public.ed_my_classes(u)))),
    'classes', (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'year', c.year, 'subj', c.subj, 'n', (select count(*) from public.ed_user x where x.class_id = c.id and x.role = 'student')) order by c.name), '[]'::json) from public.ed_class c));
end $$;
-- Staff create or edit a student (admin: any role). p_pw sets or resets the password (null keeps it).
create or replace function public.ed_a_user_save(p_key text, p_id int, p_role text, p_username text, p_name text, p_pw text, p_year int, p_class int, p_subj int, p_disabled boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int; r text := coalesce(p_role, 'student');
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if u.role <> 'admin' and (r <> 'student' or (coalesce(p_class, 0) <> 0 and not public.ed_can_class(u, p_class))) then return public.ed_err('forbidden'); end if;
  if p_username !~ '^[A-Za-z0-9_.]{3,24}$' then return public.ed_err('bad_user'); end if;
  if not public.ed_ok_text(p_name, 60) then return public.ed_err('bad_text'); end if;
  if p_pw is not null and length(p_pw) not between 8 and 72 then return public.ed_err('bad_pw'); end if;
  if exists (select 1 from public.ed_user where lower(username) = lower(p_username) and id <> coalesce(p_id, 0)) then return public.ed_err('taken'); end if;
  if coalesce(p_id, 0) = 0 then
    if p_pw is null then return public.ed_err('bad_pw'); end if;
    insert into public.ed_user (role, username, name, pw, year, class_id, subj, disabled) values (r, p_username, btrim(p_name), crypt(p_pw, gen_salt('bf', 10)), nullif(p_year, 0), nullif(p_class, 0), nullif(p_subj, -1), coalesce(p_disabled, false)) returning id into i;
  else
    if p_id = u.id and (r <> u.role or coalesce(p_disabled, false)) then return public.ed_err('forbidden'); end if;   -- cannot demote or disable yourself
    update public.ed_user set role = case when u.role = 'admin' then r else role end, username = p_username, name = btrim(p_name), pw = case when p_pw is null then pw else crypt(p_pw, gen_salt('bf', 10)) end,
      year = nullif(p_year, 0), class_id = nullif(p_class, 0), subj = case when u.role = 'admin' then nullif(p_subj, -1) else subj end, disabled = coalesce(p_disabled, false)
     where id = p_id and (u.role = 'admin' or (role = 'student' and class_id = any(public.ed_my_classes(u)))) returning id into i;
    if i is not null and p_pw is not null then delete from public.ed_session where uid = i; end if;
  end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_a_user_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' or p_id = u.id then return public.ed_err('forbidden'); end if;
  delete from public.ed_user where id = p_id; return json_build_object('ok', found);
end $$;
create or replace function public.ed_a_class_save(p_key text, p_id int, p_name text, p_year int, p_subj int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_name, 60) then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_class (name, year, subj) values (btrim(p_name), nullif(p_year, 0), nullif(p_subj, -1)) returning id into i;
  else update public.ed_class set name = btrim(p_name), year = nullif(p_year, 0), subj = nullif(p_subj, -1) where id = p_id and public.ed_can_class(u, id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_a_class_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  delete from public.ed_class where id = p_id; return json_build_object('ok', found);
end $$;
create or replace function public.ed_a_school_save(p_key text, p_name text, p_join text, p_invite text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_name, 60) or p_join !~ '^[A-Za-z0-9-]{6,24}$' or p_invite !~ '^[A-Za-z0-9-]{6,24}$' then return public.ed_err('bad_text'); end if;
  update public.ed_school set name = btrim(p_name), join_code = upper(p_join), invite_code = upper(p_invite), updated = now() where id = 1;
  return json_build_object('ok', true);
end $$;

-- ---------- 8. First admin and codes: CHANGE THESE THREE VALUES, then run ----------
do $$
declare admin_pw text := 'change-me-now';        -- the admin's password (8 to 72 characters). Never commit a real one.
        join_code text := 'COMPASS-2026';           -- students type this to create an account
        invite_code text := 'TEACH-2026';           -- teachers type this to create an account
begin
  insert into public.ed_school (id, name, join_code, invite_code) values (1, 'Compass Ed', upper(join_code), upper(invite_code)) on conflict (id) do nothing;
  if not exists (select 1 from public.ed_user where role = 'admin') then
    insert into public.ed_user (role, username, name, pw) values ('admin', 'admin', 'Administrator', crypt(admin_pw, gen_salt('bf', 10)));
  end if;
end $$;

-- ---------- 9. Permissions ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ed\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.name in ('ed_login','ed_signup','ed_claim','ed_logout','ed_me','ed_pw','ed_public','ed_notif_read') or f.name like 'ed\_s\_%' or f.name like 'ed\_t\_%' or f.name like 'ed\_a\_%' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;
grant usage on schema public to anon, authenticated;
