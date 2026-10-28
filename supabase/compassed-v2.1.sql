-- ===== CompassED v2.1: houses and points, clubs, question bank, timed quizzes, peer review, newsletter issues,
-- gallery permission, parent summary links, file uploads =====
-- Run ONCE after compassed-v2.0.sql (SQL Editor > New query > paste > Run). Safe to run again.

-- ---------- 1. Schema additions ----------
alter table public.ed_user add column if not exists house text check (house is null or house in ('N','E','S','W'));
alter table public.ed_user add column if not exists parent_tok text unique;
alter table public.ed_school add column if not exists houses jsonb not null default '{"N":"North","E":"East","S":"South","W":"West"}'::jsonb;
alter table public.ed_class add column if not exists seating jsonb not null default '[]'::jsonb;   -- [uid, uid, ...] left to right, row by row
alter table public.ed_entry add column if not exists show boolean not null default false;             -- student allows the gallery to show it
alter table public.ed_news add column if not exists issue text;                                         -- newsletter issue label, e.g. "Autumn 1 2026"
alter table public.ed_quiz add column if not exists opens timestamptz;                                  -- timed assessment window
alter table public.ed_quiz add column if not exists closes timestamptz;
alter table public.ed_quiz add column if not exists minutes int;                                        -- time limit once started
alter table public.ed_quiz_res add column if not exists secs int;
alter table public.ed_assign add column if not exists peer boolean not null default false;              -- peer review before hand-in
alter table public.ed_activity add column if not exists points int not null default 5;

create table if not exists public.ed_points (
  id     serial primary key,
  uid    int not null references public.ed_user(id) on delete cascade,
  pts    int not null,
  reason text not null,
  by_uid int references public.ed_user(id) on delete set null,   -- null: awarded automatically
  at     timestamptz not null default now()
);
create index if not exists ed_points_u on public.ed_points (uid, at desc);
create table if not exists public.ed_club (
  id       serial primary key,
  cat      int references public.ed_category(id),
  title    text not null,
  blurb    text not null default '',
  day      text not null default 'Monday',
  time     text not null default '12:30',
  place    text not null default '',
  capacity int not null default 20,
  ages     text not null default 'all' check (ages in ('all','under11','11plus')),
  uid      int references public.ed_user(id) on delete set null,
  updated  timestamptz not null default now()
);
create table if not exists public.ed_club_member (
  club_id int not null references public.ed_club(id) on delete cascade,
  uid     int not null references public.ed_user(id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (club_id, uid)
);
create table if not exists public.ed_qbank (
  id    serial primary key,
  subj  int not null references public.ed_subject(id),
  topic text not null default '',
  q     text not null,
  a     jsonb not null,
  c     int not null default 0,
  why   text not null default '',
  uid   int references public.ed_user(id) on delete set null,
  created timestamptz not null default now()
);
create table if not exists public.ed_peer (
  id        serial primary key,
  assign_id int not null references public.ed_assign(id) on delete cascade,
  reviewer  int not null references public.ed_user(id) on delete cascade,
  target    int not null references public.ed_user(id) on delete cascade,
  body      text not null default '',
  stars     int,
  at        timestamptz,
  unique (assign_id, reviewer, target)
);
create table if not exists public.ed_file (
  id    text primary key,                       -- storage object path
  uid   int not null references public.ed_user(id) on delete cascade,
  name  text not null,
  size  int not null,
  at    timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['ed_points','ed_club','ed_club_member','ed_qbank','ed_peer','ed_file'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- old signatures are replaced (PostgREST must see one function per name)
drop function if exists public.ed_s_quiz_done(text, int, json, int);
drop function if exists public.ed_s_enter(text, int, text, json);
drop function if exists public.ed_t_quiz_save(text, int, int, int, text, text, int, json);
drop function if exists public.ed_t_assign_save(text, int, int, int, text, text, text, timestamptz, int, int, int);
drop function if exists public.ed_t_news_save(text, int, text, text, text, boolean);

-- ---------- 2. Points helper and automatic awards ----------
create or replace function public.ed_award(p_uid int, p_pts int, p_reason text, p_by int) returns void language sql security definer set search_path = public as $$
  insert into public.ed_points (uid, pts, reason, by_uid) values (p_uid, p_pts, left(p_reason, 120), p_by) $$;
create or replace function public.ed_points_total(p_uid int) returns int language sql stable as $$
  select coalesce(sum(pts), 0)::int from public.ed_points where uid = p_uid $$;

-- activity done: points once
create or replace function public.ed_s_activity_done(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a public.ed_activity;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into a from public.ed_activity where id = p_id and pub; if a.id is null then return public.ed_err('not_found'); end if;
  insert into public.ed_activity_done (activity_id, uid) values (a.id, u.id) on conflict do nothing;
  if found then perform public.ed_award(u.id, a.points, 'Activity: ' || a.title, null); end if;
  return json_build_object('ok', true, 'pts', a.points);
end $$;

-- competition entry: gallery permission + points once
create or replace function public.ed_s_enter(p_key text, p_id int, p_body text, p_links json, p_show boolean default false) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); c public.ed_competition; isnew boolean;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into c from public.ed_competition where id = p_id; if c.id is null then return public.ed_err('not_found'); end if;
  if not (c.closes > now() and c.opens <= now()) then return public.ed_err('closed'); end if;
  if length(coalesce(p_body, '')) > 20000 then return public.ed_err('too_big'); end if;
  if length(btrim(coalesce(p_body, ''))) = 0 and coalesce(json_array_length(p_links), 0) = 0 then return public.ed_err('empty'); end if;
  isnew := not exists (select 1 from public.ed_entry where comp_id = c.id and uid = u.id);
  insert into public.ed_entry (comp_id, uid, body, links, show) values (c.id, u.id, p_body, coalesce(p_links, '[]')::jsonb, coalesce(p_show, false))
    on conflict (comp_id, uid) do update set body = excluded.body, links = excluded.links, show = excluded.show, at = now();
  if isnew then perform public.ed_award(u.id, 10, 'Entered: ' || c.title, null); end if;
  return json_build_object('ok', true);
end $$;

-- placing: points
create or replace function public.ed_t_entry_place(p_key text, p_id int, p_place int, p_note text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); e public.ed_entry; c public.ed_competition; had int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  select place into had from public.ed_entry where id = p_id;
  update public.ed_entry set place = nullif(p_place, 0), note = left(coalesce(p_note, ''), 500) where id = p_id returning * into e;
  if e.id is null then return public.ed_err('not_found'); end if;
  select * into c from public.ed_competition where id = e.comp_id;
  if e.place is not null and had is distinct from e.place then
    perform public.ed_award(e.uid, case e.place when 1 then 50 when 2 then 30 when 3 then 20 else 10 end, 'Placed in ' || c.title, u.id);
    insert into public.ed_notif (uid, kind, title, body, link) values (e.uid, 'competition', 'You placed ' || e.place || case e.place when 1 then 'st' when 2 then 'nd' when 3 then 'rd' else 'th' end || ' in ' || c.title, coalesce(e.note, ''), '#/competition/' || c.id);
  end if;
  return json_build_object('ok', true);
end $$;

-- checkpoint passed first time: points (wraps the quiz result)
create or replace function public.ed_s_quiz_done(p_key text, p_id int, p_answers json, p_assign int default null, p_secs int default null) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); q public.ed_quiz; i int := 0; sc int := 0; n int; x jsonb; ans int; res jsonb := '[]'::jsonb; passed boolean; first boolean;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into q from public.ed_quiz where id = p_id; if q.id is null then return public.ed_err('not_found'); end if;
  if q.opens is not null and now() < q.opens then return public.ed_err('not_open'); end if;
  if q.closes is not null and now() > q.closes + interval '2 minutes' then return public.ed_err('closed'); end if;
  n := jsonb_array_length(q.qs);
  if p_answers is null or json_typeof(p_answers) <> 'array' or json_array_length(p_answers) <> n then return public.ed_err('bad_answers'); end if;
  for x in select * from jsonb_array_elements(q.qs) loop
    ans := nullif(p_answers->>i, '')::int;
    if ans = (x->>'c')::int then sc := sc + 1;
    else insert into public.ed_review (uid, subj, key, front, back) values (u.id, q.subj, 'q:' || q.id || ':' || i, x->>'q', coalesce(x->'a'->>((x->>'c')::int), '') || case when coalesce(x->>'why', '') <> '' then E'\n' || (x->>'why') else '' end)
      on conflict (uid, key) do update set due = current_date, ivl = 0; end if;
    res := res || jsonb_build_object('i', i, 'ans', ans, 'c', (x->>'c')::int, 'why', x->>'why'); i := i + 1;
  end loop;
  passed := q.kind <> 'checkpoint' or 100 * sc >= q.threshold * n;
  first := q.kind = 'checkpoint' and passed and not exists (select 1 from public.ed_quiz_res r where r.quiz_id = q.id and r.uid = u.id and 100 * r.score >= q.threshold * greatest(r.out_of, 1));
  insert into public.ed_quiz_res (quiz_id, uid, score, out_of, answers, secs) values (q.id, u.id, sc, n, p_answers::jsonb, p_secs);
  if first then perform public.ed_award(u.id, 25, 'Mastered: ' || q.title, null); end if;
  if p_assign is not null and exists (select 1 from public.ed_assign a where a.id = p_assign and a.quiz_id = q.id and a.class_id = u.class_id) then
    insert into public.ed_sub (assign_id, uid, status, ver, body, sub_at, score) values (p_assign, u.id, 'submitted', 1, 'Quiz: ' || sc || '/' || n, now(), round(100.0 * sc / greatest(n, 1)))
    on conflict (assign_id, uid) do update set status = 'submitted', sub_at = now(), score = greatest(coalesce(public.ed_sub.score, 0), excluded.score), body = excluded.body;
  end if;
  return json_build_object('ok', true, 'score', sc, 'out_of', n, 'pct', round(100.0 * sc / greatest(n, 1)), 'passed', passed, 'results', res, 'pts', case when first then 25 else 0 end);
end $$;

-- quiz now carries its window and time limit
create or replace function public.ed_s_quiz(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); q public.ed_quiz;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into q from public.ed_quiz where id = p_id; if q.id is null then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'id', q.id, 'title', q.title, 'kind', q.kind, 'threshold', q.threshold, 'subj', q.subj, 'opens', q.opens, 'closes', q.closes, 'minutes', q.minutes,
    'open', (q.opens is null or now() >= q.opens) and (q.closes is null or now() <= q.closes),
    'qs', (select coalesce(json_agg(json_build_object('q', x->>'q', 'a', x->'a', 'topic', x->>'topic')), '[]'::json) from jsonb_array_elements(q.qs) x),
    'tries', (select count(*) from public.ed_quiz_res x where x.quiz_id = q.id and x.uid = u.id));
end $$;
create or replace function public.ed_t_quiz_save(p_key text, p_id int, p_subj int, p_unit int, p_title text, p_kind text, p_threshold int, p_qs json, p_opens timestamptz default null, p_closes timestamptz default null, p_minutes int default null) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_subj(u, p_subj) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 100) then return public.ed_err('bad_text'); end if;
  if p_qs is null or json_typeof(p_qs) <> 'array' or json_array_length(p_qs) not between 1 and 60 or length(p_qs::text) > 120000 then return public.ed_err('bad_quiz'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_quiz (subj, unit_id, title, kind, threshold, qs, uid, opens, closes, minutes) values (p_subj, nullif(p_unit, 0), btrim(p_title), coalesce(p_kind, 'quiz'), least(greatest(coalesce(p_threshold, 80), 1), 100), p_qs::jsonb, u.id, p_opens, p_closes, nullif(p_minutes, 0)) returning id into i;
  else update public.ed_quiz set subj = p_subj, unit_id = nullif(p_unit, 0), title = btrim(p_title), kind = coalesce(p_kind, 'quiz'), threshold = least(greatest(coalesce(p_threshold, 80), 1), 100), qs = p_qs::jsonb, opens = p_opens, closes = p_closes, minutes = nullif(p_minutes, 0), updated = now() where id = p_id and public.ed_can_subj(u, subj) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
-- per-question breakdown for staff
create or replace function public.ed_t_quiz_stats(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); q public.ed_quiz;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into q from public.ed_quiz where id = p_id; if q.id is null or not public.ed_can_subj(u, q.subj) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'title', q.title, 'attempts', (select count(*) from public.ed_quiz_res r where r.quiz_id = q.id), 'students', (select count(distinct uid) from public.ed_quiz_res r where r.quiz_id = q.id),
    'avg', (select round(avg(100.0 * r.score / greatest(r.out_of, 1))) from public.ed_quiz_res r where r.quiz_id = q.id),
    'avg_secs', (select round(avg(secs)) from public.ed_quiz_res r where r.quiz_id = q.id and secs is not null),
    'questions', (select coalesce(json_agg(json_build_object('i', i - 1, 'q', x->>'q', 'topic', x->>'topic', 'c', (x->>'c')::int,
        'right', (select count(*) from public.ed_quiz_res r where r.quiz_id = q.id and (r.answers->>(i - 1)::int)::int = (x->>'c')::int),
        'total', (select count(*) from public.ed_quiz_res r where r.quiz_id = q.id),
        'picks', (select coalesce(json_agg(cnt order by k), '[]'::json) from (select k, (select count(*) from public.ed_quiz_res r where r.quiz_id = q.id and (r.answers->>(i - 1)::int)::int = k) cnt from generate_series(0, 3) k) t)) order by i), '[]'::json)
      from jsonb_array_elements(q.qs) with ordinality a(x, i)),
    'rows', (select coalesce(json_agg(json_build_object('name', x.name, 'score', r.score, 'out_of', r.out_of, 'secs', r.secs, 'at', r.at) order by r.at desc), '[]'::json) from public.ed_quiz_res r join public.ed_user x on x.id = r.uid where r.quiz_id = q.id));
end $$;
-- topic accuracy per student in a class (from question topic tags)
create or replace function public.ed_t_topics(p_key text, p_class int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('uid', t.uid, 'name', t.name, 'topic', t.topic, 'n', t.n, 'right', t.r)), '[]'::json) from (
    select x.id as uid, x.name, coalesce(nullif(qq.x->>'topic', ''), 'untagged') as topic, count(*) as n, count(*) filter (where (r.answers->>(qq.i - 1)::int)::int = (qq.x->>'c')::int) as r
    from public.ed_user x join public.ed_quiz_res r on r.uid = x.id join public.ed_quiz q on q.id = r.quiz_id, jsonb_array_elements(q.qs) with ordinality qq(x, i)
    where x.class_id = p_class and x.role = 'student' group by 1, 2, 3) t));
end $$;

-- ---------- 3. Houses, points, leaderboards, badges ----------
create or replace function public.ed_s_house(p_key text, p_house text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if u.house is not null then return public.ed_err('forbidden'); end if;    -- chosen once; staff can change it
  if p_house not in ('N','E','S','W') then return public.ed_err('bad_text'); end if;
  update public.ed_user set house = p_house where id = u.id; return json_build_object('ok', true);
end $$;
create or replace function public.ed_board(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); mon date := date_trunc('week', now())::date;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'houses', (select houses from public.ed_school where id = 1), 'my_house', u.house, 'my_pts', public.ed_points_total(u.id),
    'my_week', (select coalesce(sum(pts), 0) from public.ed_points where uid = u.id and at >= mon),
    'house', (select coalesce(json_agg(json_build_object('house', h, 'pts', p, 'week', w) order by p desc), '[]'::json) from (
       select x.house h, coalesce(sum(pp.pts), 0) p, coalesce(sum(pp.pts) filter (where pp.at >= mon), 0) w from public.ed_user x left join public.ed_points pp on pp.uid = x.id where x.house is not null and x.role = 'student' group by x.house) t),
    'students', (select coalesce(json_agg(json_build_object('name', name, 'house', house, 'class', class, 'pts', p, 'week', w) order by p desc), '[]'::json) from (
       select x.name, x.house, (select name from public.ed_class where id = x.class_id) class, coalesce(sum(pp.pts), 0) p, coalesce(sum(pp.pts) filter (where pp.at >= mon), 0) w from public.ed_user x left join public.ed_points pp on pp.uid = x.id where x.role = 'student' group by x.id order by p desc limit 50) t),
    'classes', (select coalesce(json_agg(json_build_object('name', name, 'pts', p, 'n', n) order by p desc), '[]'::json) from (
       select c.name, coalesce(sum(pp.pts), 0) p, count(distinct x.id) n from public.ed_class c join public.ed_user x on x.class_id = c.id and x.role = 'student' left join public.ed_points pp on pp.uid = x.id group by c.id) t),
    'recent', (select coalesce(json_agg(json_build_object('pts', pts, 'reason', reason, 'at', at) order by at desc), '[]'::json) from (select * from public.ed_points where uid = u.id order by at desc limit 15) t));
end $$;
create or replace function public.ed_t_award(p_key text, p_uids json, p_pts int, p_reason text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); x int; n int := 0;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if p_pts not between -50 and 100 or not public.ed_ok_text(p_reason, 120) then return public.ed_err('bad_text'); end if;
  for x in select value::text::int from json_array_elements(p_uids) loop
    if exists (select 1 from public.ed_user s where s.id = x and s.role = 'student' and (u.role = 'admin' or s.class_id = any(public.ed_my_classes(u)) or s.class_id is null)) then
      perform public.ed_award(x, p_pts, btrim(p_reason), u.id); n := n + 1;
      insert into public.ed_notif (uid, kind, title, body, link) values (x, 'points', (case when p_pts >= 0 then '+' else '' end) || p_pts || ' house points: ' || btrim(p_reason), 'from ' || u.name, '#/house');
    end if;
  end loop;
  return json_build_object('ok', true, 'n', n);
end $$;
-- staff may set a student's house
create or replace function public.ed_t_house(p_key text, p_uid int, p_house text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  update public.ed_user set house = nullif(p_house, '') where id = p_uid and role = 'student'; return json_build_object('ok', found);
end $$;
-- the numbers badges are computed from
create or replace function public.ed_s_badges(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true,
    'activities', (select count(*) from public.ed_activity_done d where d.uid = u.id),
    'lessons', (select count(*) from public.ed_lesson_done d where d.uid = u.id),
    'checkpoints', (select count(distinct q.id) from public.ed_quiz q join public.ed_quiz_res r on r.quiz_id = q.id where q.kind = 'checkpoint' and r.uid = u.id and 100 * r.score >= q.threshold * greatest(r.out_of, 1)),
    'perfect', (select count(*) from public.ed_quiz_res r where r.uid = u.id and r.score = r.out_of and r.out_of > 0),
    'entries', (select count(*) from public.ed_entry e where e.uid = u.id),
    'places', (select count(*) from public.ed_entry e where e.uid = u.id and e.place is not null),
    'wins', (select count(*) from public.ed_entry e where e.uid = u.id and e.place = 1),
    'handins', (select count(*) from public.ed_sub s where s.uid = u.id and s.status <> 'draft'),
    'reviews', (select coalesce(sum(reps), 0) from public.ed_review v where v.uid = u.id),
    'clubs', (select count(*) from public.ed_club_member m where m.uid = u.id),
    'peer', (select count(*) from public.ed_peer p where p.reviewer = u.id and p.at is not null),
    'pts', public.ed_points_total(u.id),
    'cats', (select count(distinct a.cat) from public.ed_activity_done d join public.ed_activity a on a.id = d.activity_id where d.uid = u.id));
end $$;

-- ---------- 4. Clubs ----------
create or replace function public.ed_s_clubs(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', c.id, 'cat', c.cat, 'title', c.title, 'blurb', c.blurb, 'day', c.day, 'time', c.time, 'place', c.place, 'capacity', c.capacity, 'ages', c.ages,
      'n', (select count(*) from public.ed_club_member m where m.club_id = c.id), 'joined', exists (select 1 from public.ed_club_member m where m.club_id = c.id and m.uid = u.id),
      'lead', (select name from public.ed_user t where t.id = c.uid)) order by array_position(array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], c.day), c.time), '[]'::json) from public.ed_club c));
end $$;
create or replace function public.ed_s_club_join(p_key text, p_id int, p_join boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); c public.ed_club;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into c from public.ed_club where id = p_id; if c.id is null then return public.ed_err('not_found'); end if;
  if p_join then
    if (select count(*) from public.ed_club_member m where m.club_id = c.id) >= c.capacity then return public.ed_err('full'); end if;
    insert into public.ed_club_member (club_id, uid) values (c.id, u.id) on conflict do nothing;
  else delete from public.ed_club_member where club_id = c.id and uid = u.id; end if;
  return json_build_object('ok', true);
end $$;
create or replace function public.ed_t_clubs(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', c.id, 'cat', c.cat, 'title', c.title, 'blurb', c.blurb, 'day', c.day, 'time', c.time, 'place', c.place, 'capacity', c.capacity, 'ages', c.ages, 'uid', c.uid,
      'members', (select coalesce(json_agg(json_build_object('uid', x.id, 'name', x.name, 'class', (select name from public.ed_class where id = x.class_id), 'at', m.at) order by m.at), '[]'::json) from public.ed_club_member m join public.ed_user x on x.id = m.uid where m.club_id = c.id)) order by c.title), '[]'::json) from public.ed_club c));
end $$;
create or replace function public.ed_t_club_save(p_key text, p_id int, p_cat int, p_title text, p_blurb text, p_day text, p_time text, p_place text, p_capacity int, p_ages text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 80) or length(coalesce(p_blurb, '')) > 400 then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_club (cat, title, blurb, day, time, place, capacity, ages, uid) values (nullif(p_cat, 0), btrim(p_title), coalesce(p_blurb, ''), coalesce(p_day, 'Monday'), left(coalesce(p_time, '12:30'), 20), left(coalesce(p_place, ''), 80), least(greatest(coalesce(p_capacity, 20), 1), 500), coalesce(p_ages, 'all'), u.id) returning id into i;
    insert into public.ed_notif (uid, kind, title, body, link) select id, 'club', 'New club: ' || btrim(p_title), coalesce(p_day, '') || ' ' || coalesce(p_time, ''), '#/clubs' from public.ed_user where role = 'student';
  else update public.ed_club set cat = nullif(p_cat, 0), title = btrim(p_title), blurb = coalesce(p_blurb, ''), day = coalesce(p_day, 'Monday'), time = left(coalesce(p_time, '12:30'), 20), place = left(coalesce(p_place, ''), 80), capacity = least(greatest(coalesce(p_capacity, 20), 1), 500), ages = coalesce(p_ages, 'all'), updated = now() where id = p_id returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_club_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  delete from public.ed_club where id = p_id; return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_club_remove(p_key text, p_id int, p_uid int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  delete from public.ed_club_member where club_id = p_id and uid = p_uid; return json_build_object('ok', found);
end $$;

-- ---------- 5. Question bank ----------
create or replace function public.ed_t_bank(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', b.id, 'subj', b.subj, 'topic', b.topic, 'q', b.q, 'a', b.a, 'c', b.c, 'why', b.why, 'created', b.created) order by b.subj, b.topic, b.id), '[]'::json) from public.ed_qbank b where public.ed_can_subj(u, b.subj)));
end $$;
-- import many at once: [{topic,q,a:[4],c,why}]
create or replace function public.ed_t_bank_add(p_key text, p_subj int, p_rows json) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); r json; n int := 0;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_subj(u, p_subj) then return public.ed_err('forbidden'); end if;
  if p_rows is null or json_typeof(p_rows) <> 'array' or json_array_length(p_rows) > 500 then return public.ed_err('bad_text'); end if;
  for r in select * from json_array_elements(p_rows) loop
    if length(coalesce(r->>'q', '')) between 1 and 500 and json_typeof(r->'a') = 'array' and json_array_length(r->'a') = 4 then
      insert into public.ed_qbank (subj, topic, q, a, c, why, uid) values (p_subj, left(coalesce(r->>'topic', ''), 60), r->>'q', (r->'a')::jsonb, least(greatest(coalesce((r->>'c')::int, 0), 0), 3), left(coalesce(r->>'why', ''), 500), u.id); n := n + 1;
    end if;
  end loop;
  return json_build_object('ok', true, 'n', n);
end $$;
create or replace function public.ed_t_bank_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; delete from public.ed_qbank where id = p_id and public.ed_can_subj(u, subj); return json_build_object('ok', found);
end $$;

-- ---------- 6. Peer review ----------
-- Students who have handed in get two classmates' submissions to review (the two who handed in after them, wrapping round).
create or replace function public.ed_s_peer(p_key text, p_assign int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a public.ed_assign; mine public.ed_sub; ids int[]; pos int; t1 int; t2 int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into a from public.ed_assign where id = p_assign and class_id = u.class_id and peer; if a.id is null then return public.ed_err('not_found'); end if;
  select * into mine from public.ed_sub where assign_id = a.id and uid = u.id and status <> 'draft';
  if mine.id is null then return json_build_object('ok', true, 'ready', false, 'targets', '[]'::json, 'received', '[]'::json); end if;
  ids := array(select s.uid from public.ed_sub s where s.assign_id = a.id and s.status <> 'draft' order by s.sub_at, s.id);
  pos := array_position(ids, u.id);
  if array_length(ids, 1) >= 2 then t1 := ids[(pos % array_length(ids, 1)) + 1]; end if;
  if array_length(ids, 1) >= 3 then t2 := ids[((pos + 1) % array_length(ids, 1)) + 1]; end if;
  insert into public.ed_peer (assign_id, reviewer, target) select a.id, u.id, t from unnest(array[t1, t2]) t where t is not null on conflict do nothing;
  return json_build_object('ok', true, 'ready', true,
    'targets', (select coalesce(json_agg(json_build_object('id', p.id, 'name', x.name, 'body', s.body, 'links', s.links, 'review', p.body, 'stars', p.stars, 'done', p.at is not null)), '[]'::json)
                from public.ed_peer p join public.ed_user x on x.id = p.target join public.ed_sub s on s.assign_id = a.id and s.uid = p.target where p.assign_id = a.id and p.reviewer = u.id),
    'received', (select coalesce(json_agg(json_build_object('name', x.name, 'body', p.body, 'stars', p.stars, 'at', p.at)), '[]'::json) from public.ed_peer p join public.ed_user x on x.id = p.reviewer where p.assign_id = a.id and p.target = u.id and p.at is not null));
end $$;
create or replace function public.ed_s_peer_save(p_key text, p_id int, p_body text, p_stars int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); p public.ed_peer; a public.ed_assign;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if not public.ed_ok_text(p_body, 3000) then return public.ed_err('bad_text'); end if;
  update public.ed_peer set body = btrim(p_body), stars = least(greatest(coalesce(p_stars, 3), 1), 5), at = now() where id = p_id and reviewer = u.id returning * into p;
  if p.id is null then return public.ed_err('not_found'); end if;
  select * into a from public.ed_assign where id = p.assign_id;
  insert into public.ed_notif (uid, kind, title, body, link) values (p.target, 'peer', 'A classmate reviewed your work on "' || a.title || '"', left(p.body, 120), '#/assignment/' || a.id);
  if (select count(*) from public.ed_peer x where x.assign_id = p.assign_id and x.reviewer = u.id and x.at is not null) = 1 then perform public.ed_award(u.id, 5, 'Peer review: ' || a.title, null); end if;
  return json_build_object('ok', true);
end $$;
create or replace function public.ed_t_peers(p_key text, p_assign int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a public.ed_assign;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into a from public.ed_assign where id = p_assign; if a.id is null or not public.ed_can_class(u, a.class_id) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('reviewer', r.name, 'target', t.name, 'target_uid', p.target, 'body', p.body, 'stars', p.stars, 'at', p.at)), '[]'::json) from public.ed_peer p join public.ed_user r on r.id = p.reviewer join public.ed_user t on t.id = p.target where p.assign_id = a.id and p.at is not null));
end $$;
create or replace function public.ed_t_assign_save(p_key text, p_id int, p_class int, p_subj int, p_kind text, p_title text, p_instr text, p_due timestamptz, p_points int, p_quiz int, p_rubric int, p_peer boolean default false) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 120) or length(coalesce(p_instr, '')) > 8000 then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then
    insert into public.ed_assign (class_id, subj, kind, title, instr, due, points, quiz_id, rubric_id, uid, peer) values (p_class, p_subj, coalesce(p_kind, 'homework'), btrim(p_title), coalesce(p_instr, ''), p_due, least(greatest(coalesce(p_points, 10), 0), 1000), nullif(p_quiz, 0), nullif(p_rubric, 0), u.id, coalesce(p_peer, false)) returning id into i;
    perform public.ed_notify_class(p_class, 'assign', 'New ' || coalesce(p_kind, 'homework') || ': ' || btrim(p_title), case when p_due is null then '' else 'Due ' || to_char(p_due, 'Dy DD Mon') end, '#/assignment/' || i);
  else update public.ed_assign set class_id = p_class, subj = p_subj, kind = coalesce(p_kind, 'homework'), title = btrim(p_title), instr = coalesce(p_instr, ''), due = p_due, points = least(greatest(coalesce(p_points, 10), 0), 1000), quiz_id = nullif(p_quiz, 0), rubric_id = nullif(p_rubric, 0), peer = coalesce(p_peer, false) where id = p_id and public.ed_can_class(u, class_id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
-- student assignment list now says whether peer review is on
create or replace function public.ed_s_assigns(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'subj', a.subj, 'instr', a.instr, 'due', a.due, 'points', a.points, 'quiz_id', a.quiz_id, 'created', a.created, 'peer', a.peer,
      'rubric', (select json_build_object('title', b.title, 'criteria', b.criteria) from public.ed_rubric b where b.id = a.rubric_id),
      'sub', case when s.id is null then null else json_build_object('id', s.id, 'status', s.status, 'ver', s.ver, 'body', s.body, 'links', s.links, 'sub_at', s.sub_at, 'score', s.score, 'rub', s.rub, 'feedback', s.feedback, 'graded_at', s.graded_at,
                 'versions', (select coalesce(json_agg(json_build_object('ver', v.ver, 'at', v.at, 'len', length(v.body)) order by v.ver desc), '[]'::json) from public.ed_sub_ver v where v.sub_id = s.id)) end) order by a.due nulls last, a.id desc), '[]'::json)
    from public.ed_assign a left join public.ed_sub s on s.assign_id = a.id and s.uid = u.id where a.class_id = u.class_id));
end $$;

-- ---------- 7. Seating / register, newsletter issues, gallery, parent links ----------
create or replace function public.ed_t_seating(p_key text, p_class int, p_order json) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  update public.ed_class set seating = coalesce(p_order, '[]')::jsonb where id = p_class; return json_build_object('ok', true);
end $$;
create or replace function public.ed_t_class(p_key text, p_class int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'class', (select json_build_object('id', id, 'name', name, 'year', year, 'subj', subj, 'seating', seating) from public.ed_class where id = p_class),
    'students', (select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name, 'username', x.username, 'year', x.year, 'house', x.house, 'last_seen', x.last_seen, 'pts', public.ed_points_total(x.id),
        'lessons_done', (select count(*) from public.ed_lesson_done d where d.uid = x.id), 'activities_done', (select count(*) from public.ed_activity_done d where d.uid = x.id),
        'submitted', (select count(*) from public.ed_sub s join public.ed_assign a on a.id = s.assign_id where s.uid = x.id and a.class_id = p_class and s.status <> 'draft'),
        'overdue', (select count(*) from public.ed_assign a where a.class_id = p_class and a.due < now() and not exists (select 1 from public.ed_sub s where s.assign_id = a.id and s.uid = x.id and s.status <> 'draft')),
        'grade_avg', (select round(avg(s.score)) from public.ed_sub s join public.ed_assign a on a.id = s.assign_id where s.uid = x.id and a.class_id = p_class and s.score is not null),
        'quiz_avg', (select round(avg(100.0 * q.score / greatest(q.out_of, 1))) from public.ed_quiz_res q where q.uid = x.id)) order by x.name), '[]'::json)
      from public.ed_user x where x.class_id = p_class and x.role = 'student'));
end $$;
create or replace function public.ed_t_news_save(p_key text, p_id int, p_title text, p_body text, p_cover text, p_featured boolean, p_issue text default null) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 120) or not public.ed_ok_text(p_body, 20000) then return public.ed_err('bad_text'); end if;
  if coalesce(p_id, 0) = 0 then insert into public.ed_news (title, body, cover, featured, uid, issue) values (btrim(p_title), btrim(p_body), left(coalesce(p_cover, ''), 500), coalesce(p_featured, false), u.id, nullif(left(btrim(coalesce(p_issue, '')), 40), '')) returning id into i;
  else update public.ed_news set title = btrim(p_title), body = btrim(p_body), cover = left(coalesce(p_cover, ''), 500), featured = coalesce(p_featured, false), issue = nullif(left(btrim(coalesce(p_issue, '')), 40), '') where id = p_id returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_s_news(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', n.id, 'title', n.title, 'body', n.body, 'cover', n.cover, 'featured', n.featured, 'issue', n.issue, 'created', n.created, 'from', (select name from public.ed_user t where t.id = n.uid)) order by n.created desc), '[]'::json) from public.ed_news n));
end $$;
-- winners' gallery material for staff newsletter building: closed competitions with placed entries
create or replace function public.ed_t_winners(p_key text, p_days int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('title', c.title, 'kind', c.kind, 'closes', c.closes,
      'places', (select coalesce(json_agg(json_build_object('name', x.name, 'place', e.place, 'body', left(e.body, 140)) order by e.place), '[]'::json) from public.ed_entry e join public.ed_user x on x.id = e.uid where e.comp_id = c.id and e.place is not null)) order by c.closes desc), '[]'::json)
    from public.ed_competition c where c.closes between now() - make_interval(days => coalesce(p_days, 60)) and now()));
end $$;
-- public home page: now with gallery and age counts
create or replace function public.ed_public() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('ok', true,
    'school', (select name from public.ed_school where id = 1),
    'categories', (select json_agg(json_build_object('id', id, 'name', name, 'icon', icon, 'blurb', blurb,
       'n', (select count(*) from public.ed_activity a where a.cat = c.id and a.pub), 'n_u11', (select count(*) from public.ed_activity a where a.cat = c.id and a.pub and a.ages in ('all','under11')), 'n_11', (select count(*) from public.ed_activity a where a.cat = c.id and a.pub and a.ages in ('all','11plus'))) order by ord) from public.ed_category c),
    'competitions', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'title', title, 'blurb', blurb, 'closes', closes, 'cat', cat, 'ages', ages) order by closes), '[]'::json) from public.ed_competition where closes > now() and opens <= now()),
    'news', (select coalesce(json_agg(json_build_object('id', id, 'title', title, 'body', left(body, 220), 'cover', cover, 'featured', featured, 'created', created) order by featured desc, created desc), '[]'::json) from (select * from public.ed_news order by featured desc, created desc limit 6) n),
    'events', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'title', title, 'starts', starts, 'place', place) order by starts), '[]'::json) from public.ed_event where class_id is null and starts between now() and now() + interval '60 days'),
    'clubs', (select coalesce(json_agg(json_build_object('id', id, 'title', title, 'day', day, 'time', time, 'ages', ages) order by title), '[]'::json) from public.ed_club),
    'gallery', (select coalesce(json_agg(json_build_object('comp', c.title, 'name', x.name, 'place', e.place, 'body', left(e.body, 200), 'links', e.links) order by c.closes desc, e.place), '[]'::json)
       from public.ed_entry e join public.ed_competition c on c.id = e.comp_id join public.ed_user x on x.id = e.uid where e.show and e.place is not null and c.closes < now() and c.closes > now() - interval '180 days')) $$;

-- parent summary: the student makes (or re-makes) a private link; anyone with the link sees a read-only weekly digest
create or replace function public.ed_s_parent_link(p_key text, p_reset boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); t text;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if u.parent_tok is null or coalesce(p_reset, false) then t := encode(gen_random_bytes(18), 'hex'); update public.ed_user set parent_tok = t where id = u.id; else t := u.parent_tok; end if;
  return json_build_object('ok', true, 'tok', t);
end $$;
create or replace function public.ed_parent(p_tok text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user;
begin
  if p_tok is null or p_tok !~ '^[0-9a-f]{36}$' then return public.ed_err('not_found'); end if;
  select * into u from public.ed_user where parent_tok = p_tok; if u.id is null then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'name', u.name, 'year', u.year, 'class', (select name from public.ed_class where id = u.class_id), 'house', u.house, 'school', (select name from public.ed_school where id = 1),
    'pts', public.ed_points_total(u.id), 'pts_week', (select coalesce(sum(pts), 0) from public.ed_points where uid = u.id and at > now() - interval '7 days'),
    'due', (select coalesce(json_agg(json_build_object('title', a.title, 'subj', (select name from public.ed_subject where id = a.subj), 'due', a.due, 'status', coalesce(s.status, 'todo')) order by a.due), '[]'::json) from public.ed_assign a left join public.ed_sub s on s.assign_id = a.id and s.uid = u.id where a.class_id = u.class_id and a.due between now() - interval '7 days' and now() + interval '14 days'),
    'returned', (select coalesce(json_agg(json_build_object('title', a.title, 'score', s.score, 'feedback', s.feedback, 'at', s.graded_at) order by s.graded_at desc), '[]'::json) from public.ed_sub s join public.ed_assign a on a.id = s.assign_id where s.uid = u.id and s.graded_at > now() - interval '14 days'),
    'week', json_build_object('lessons', (select count(*) from public.ed_lesson_done d where d.uid = u.id and d.at > now() - interval '7 days'), 'activities', (select count(*) from public.ed_activity_done d where d.uid = u.id and d.at > now() - interval '7 days'),
      'quizzes', (select count(*) from public.ed_quiz_res r where r.uid = u.id and r.at > now() - interval '7 days'), 'reviews', (select count(*) from public.ed_review v where v.uid = u.id)),
    'events', (select coalesce(json_agg(json_build_object('title', e.title, 'kind', e.kind, 'starts', e.starts, 'place', e.place) order by e.starts), '[]'::json) from public.ed_event e where (e.class_id is null or e.class_id = u.class_id) and e.starts between now() and now() + interval '14 days'),
    'clubs', (select coalesce(json_agg(json_build_object('title', c.title, 'day', c.day, 'time', c.time)), '[]'::json) from public.ed_club_member m join public.ed_club c on c.id = m.club_id where m.uid = u.id));
end $$;

-- ---------- 8. File uploads (Supabase Storage) ----------
-- Files go in a public bucket "uploads" under random names, so a link cannot be guessed. The page uploads straight to
-- storage with the anon key; the policies below allow inserts only (no listing, no deletes). ed_s_file records the
-- upload against the student so staff can see who sent what.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('uploads', 'uploads', true, 10485760, array['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','video/mp4','audio/mpeg','audio/mp4'])
  on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ed uploads insert') then
    create policy "ed uploads insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'uploads');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ed uploads read') then
    create policy "ed uploads read" on storage.objects for select to anon, authenticated using (bucket_id = 'uploads');
  end if;
end $$;
create or replace function public.ed_s_file(p_key text, p_path text, p_name text, p_size int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  insert into public.ed_file (id, uid, name, size) values (left(p_path, 200), u.id, left(coalesce(p_name, 'file'), 120), coalesce(p_size, 0)) on conflict (id) do nothing;
  return json_build_object('ok', true);
end $$;

-- ---------- 9. Permissions ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ed\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.name in ('ed_login','ed_signup','ed_claim','ed_logout','ed_me','ed_pw','ed_public','ed_notif_read','ed_board','ed_parent') or f.name like 'ed\_s\_%' or f.name like 'ed\_t\_%' or f.name like 'ed\_a\_%' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;
