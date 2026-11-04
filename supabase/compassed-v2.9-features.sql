-- ===== Compass Ed v2.9: new features =====
-- Run AFTER compassed-v2.8-one-login.sql. Safe to run again.

-- ---------- 1. Review queue: how many cards come back tomorrow ----------
create or replace function public.ed_s_review(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true,
    'due', (select coalesce(json_agg(json_build_object('id', v.id, 'subj', v.subj, 'front', v.front, 'back', v.back, 'reps', v.reps) order by v.due, v.id), '[]'::json) from (select * from public.ed_review where uid = u.id and due <= current_date order by due, id limit 40) v),
    'total', (select count(*) from public.ed_review where uid = u.id), 'next', (select min(due) from public.ed_review where uid = u.id and due > current_date),
    'tomorrow', (select count(*) from public.ed_review where uid = u.id and due = current_date + 1));
end $$;

-- ---------- 2. Permission slips: staff ask, a parent or carer signs through the student's private parent link ----------
create table if not exists public.ed_slip (
  id       serial primary key,
  class_id int references public.ed_class(id) on delete cascade,     -- null: the whole school
  event_id int references public.ed_event(id) on delete set null,     -- the trip or event it is for, if any
  title    text not null,
  body     text not null default '',                                  -- what the parent agrees to: dates, cost, kit, pick-up
  question text not null default '',                                  -- optional, e.g. "Any medical or dietary needs?"
  due      date not null,                                             -- sign by
  uid      int references public.ed_user(id) on delete set null,
  created  timestamptz not null default now()
);
create table if not exists public.ed_slip_sign (
  slip_id   int not null references public.ed_slip(id) on delete cascade,
  uid       int not null references public.ed_user(id) on delete cascade,   -- the student
  answer    boolean not null,                                             -- true: permission given
  signer    text not null,                                                -- the name the parent or carer typed
  relation  text not null default '',
  note      text not null default '',
  signed_at timestamptz not null default now(),
  primary key (slip_id, uid)
);
alter table public.ed_slip enable row level security; alter table public.ed_slip_sign enable row level security;
revoke all on public.ed_slip, public.ed_slip_sign from anon, authenticated;

create or replace function public.ed_slip_for(s public.ed_slip, u public.ed_user) returns boolean language sql immutable as $$
  select u.role = 'student' and (s.class_id is null or s.class_id = u.class_id) $$;
create or replace function public.ed_slip_mine(s public.ed_slip, u public.ed_user) returns boolean language sql stable security definer set search_path = public as $$
  select u.role = 'admin' or s.uid = u.id or (s.class_id is not null and public.ed_can_class(u, s.class_id)) or (s.class_id is null and public.ed_staff(u)) $$;

-- Staff: the slips they can see, with how many have answered
create or replace function public.ed_t_slips(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', s.id, 'title', s.title, 'body', s.body, 'question', s.question, 'due', s.due,
      'class_id', s.class_id, 'class', (select name from public.ed_class where id = s.class_id), 'event_id', s.event_id,
      'event', (select json_build_object('title', e.title, 'starts', e.starts) from public.ed_event e where e.id = s.event_id),
      'reach', (select count(*) from public.ed_user x where public.ed_slip_for(s, x) and not x.disabled),
      -- only answers from students the slip still reaches (a student may have moved class)
      'yes', (select count(*) from public.ed_slip_sign g join public.ed_user x on x.id = g.uid where g.slip_id = s.id and g.answer and public.ed_slip_for(s, x) and not x.disabled),
      'no', (select count(*) from public.ed_slip_sign g join public.ed_user x on x.id = g.uid where g.slip_id = s.id and not g.answer and public.ed_slip_for(s, x) and not x.disabled),
      'mine', s.uid = u.id or u.role = 'admin', 'created', s.created) order by s.due desc, s.id desc), '[]'::json)
    from public.ed_slip s where public.ed_slip_mine(s, u)));
end $$;

-- Staff: one slip, every student it is for, and their answer
create or replace function public.ed_t_slip(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); s public.ed_slip;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  select * into s from public.ed_slip where id = p_id; if s.id is null or not public.ed_slip_mine(s, u) then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'slip', json_build_object('id', s.id, 'title', s.title, 'body', s.body, 'question', s.question, 'due', s.due, 'class_id', s.class_id, 'event_id', s.event_id,
      'class', (select name from public.ed_class where id = s.class_id), 'mine', s.uid = u.id or u.role = 'admin'),
    'rows', (select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name, 'class', (select name from public.ed_class where id = x.class_id),
      'answer', g.answer, 'signer', g.signer, 'relation', g.relation, 'note', g.note, 'signed_at', g.signed_at) order by x.name), '[]'::json)
      from public.ed_user x left join public.ed_slip_sign g on g.slip_id = s.id and g.uid = x.id where public.ed_slip_for(s, x) and not x.disabled));
end $$;

-- Staff: make or change a slip. A class the teacher can see, or (admin only) the whole school. New slips tell the students.
create or replace function public.ed_t_slip_save(p_key text, p_id int, p_class int, p_event int, p_title text, p_body text, p_question text, p_due date) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); s public.ed_slip; cl int := nullif(p_class, 0); ev int := nullif(p_event, 0); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120 or length(coalesce(p_body, '')) > 3000 or length(coalesce(p_question, '')) > 200 then return public.ed_err('bad_text'); end if;
  if p_due is null then return public.ed_err('bad_text'); end if;
  if cl is null and u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  if cl is not null and not public.ed_can_class(u, cl) then return public.ed_err('forbidden'); end if;
  if ev is not null and not exists (select 1 from public.ed_event where id = ev and (class_id is null or public.ed_can_class(u, class_id))) then return public.ed_err('not_found'); end if;
  if p_id is not null and p_id > 0 then
    select * into s from public.ed_slip where id = p_id; if s.id is null then return public.ed_err('not_found'); end if;
    if not (s.uid = u.id or u.role = 'admin') then return public.ed_err('forbidden'); end if;
    -- a parent's answer was to these words and this class: once anyone has answered, only the title, date and event can change
    if exists (select 1 from public.ed_slip_sign where slip_id = s.id) and (cl is distinct from s.class_id or coalesce(p_body, '') <> s.body or btrim(coalesce(p_question, '')) <> s.question) then return public.ed_err('signed'); end if;
    update public.ed_slip set class_id = cl, event_id = ev, title = btrim(p_title), body = coalesce(p_body, ''), question = btrim(coalesce(p_question, '')), due = p_due where id = s.id;
    return json_build_object('ok', true, 'id', s.id);
  end if;
  if p_due < current_date then return public.ed_err('bad_text'); end if;
  insert into public.ed_slip (class_id, event_id, title, body, question, due, uid) values (cl, ev, btrim(p_title), coalesce(p_body, ''), btrim(coalesce(p_question, '')), p_due, u.id) returning id into i;
  insert into public.ed_notif (uid, kind, title, body, link)
    select x.id, 'slip', 'Permission slip: ' || btrim(p_title), 'Ask a parent or carer to sign it with your parent link by ' || to_char(p_due, 'DD Mon') || '.', '#/settings'
    from public.ed_user x where x.role = 'student' and not x.disabled and (cl is null or x.class_id = cl);
  return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_t_slip_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  delete from public.ed_slip where id = p_id and (uid = u.id or u.role = 'admin'); return json_build_object('ok', found);
end $$;

-- the slips for one student (shared by the student's own view and the parent page)
create or replace function public.ed_slips_of(x public.ed_user) returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', s.id, 'title', s.title, 'body', s.body, 'question', s.question, 'due', s.due, 'open', s.due >= current_date,
      'event', (select json_build_object('title', e.title, 'starts', e.starts, 'place', e.place) from public.ed_event e where e.id = s.event_id),
      'answer', g.answer, 'signer', g.signer, 'relation', g.relation, 'note', g.note, 'signed_at', g.signed_at) order by s.due, s.id), '[]'::json)
  from public.ed_slip s left join public.ed_slip_sign g on g.slip_id = s.id and g.uid = x.id
  where public.ed_slip_for(s, x) and s.due >= current_date - 30 $$;
create or replace function public.ed_s_slips(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', public.ed_slips_of(u));
end $$;
-- Parent page (no account: the private parent link's token). Named ed_s_ so every file's permission step keeps them callable.
create or replace function public.ed_s_parent_slips(p_tok text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare x public.ed_user;
begin
  if coalesce(p_tok, '') !~ '^[0-9a-f]{36}$' then return public.ed_err('not_found'); end if;
  select * into x from public.ed_user where parent_tok = p_tok and role = 'student' and not disabled; if x.id is null then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'rows', public.ed_slips_of(x));
end $$;
create or replace function public.ed_s_parent_slip_sign(p_tok text, p_slip int, p_answer boolean, p_signer text, p_relation text, p_note text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare x public.ed_user; s public.ed_slip; nm text := btrim(coalesce(p_signer, '')); prev boolean;
begin
  if coalesce(p_tok, '') !~ '^[0-9a-f]{36}$' then return public.ed_err('not_found'); end if;
  select * into x from public.ed_user where parent_tok = p_tok and role = 'student' and not disabled; if x.id is null then return public.ed_err('not_found'); end if;
  select * into s from public.ed_slip where id = p_slip; if s.id is null or not public.ed_slip_for(s, x) then return public.ed_err('not_found'); end if;
  if s.due < current_date then return public.ed_err('closed'); end if;
  if p_answer is null or length(nm) not between 2 and 80 or length(coalesce(p_relation, '')) > 40 or length(coalesce(p_note, '')) > 500 then return public.ed_err('bad_text'); end if;
  select answer into prev from public.ed_slip_sign where slip_id = s.id and uid = x.id;
  insert into public.ed_slip_sign (slip_id, uid, answer, signer, relation, note) values (s.id, x.id, p_answer, nm, btrim(coalesce(p_relation, '')), btrim(coalesce(p_note, '')))
    on conflict (slip_id, uid) do update set answer = excluded.answer, signer = excluded.signer, relation = excluded.relation, note = excluded.note, signed_at = now();
  if prev is distinct from p_answer then   -- tell the student when the answer changes, not on every save
    insert into public.ed_notif (uid, kind, title, body, link) values (x.id, 'slip', case when p_answer then 'Permission given: ' else 'Permission not given: ' end || s.title, 'Signed by ' || nm || '.', '#/');
  end if;
  return json_build_object('ok', true);
end $$;

-- ---------- 3. My day: each class's weekly timetable ----------
create table if not exists public.ed_timetable (
  id       serial primary key,
  class_id int not null references public.ed_class(id) on delete cascade,
  day      smallint not null check (day between 1 and 7),               -- 1 Monday ... 7 Sunday
  starts   time not null,
  ends     time not null check (ends > starts),
  title    text not null,
  room     text not null default '',
  teacher  text not null default ''
);
create index if not exists ed_timetable_class on public.ed_timetable (class_id, day, starts);
alter table public.ed_timetable enable row level security; revoke all on public.ed_timetable from anon, authenticated;

create or replace function public.ed_tt_rows(p_class int) returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('day', day, 'starts', to_char(starts, 'HH24:MI'), 'ends', to_char(ends, 'HH24:MI'), 'title', title, 'room', room, 'teacher', teacher) order by day, starts), '[]'::json)
  from public.ed_timetable where class_id = p_class $$;
create or replace function public.ed_s_timetable(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'class', (select name from public.ed_class where id = u.class_id), 'rows', case when u.class_id is null then '[]'::json else public.ed_tt_rows(u.class_id) end);
end $$;
create or replace function public.ed_t_timetable(p_key text, p_class int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'rows', public.ed_tt_rows(p_class));
end $$;
-- Staff: replace a class's whole week (up to 80 lessons). Times are the school's local time, "HH:MM".
create or replace function public.ed_t_timetable_save(p_key text, p_class int, p_rows jsonb) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); r jsonb; n int := 0;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then return public.ed_err('bad_text'); end if;
  if jsonb_array_length(p_rows) > 80 then return public.ed_err('too_many'); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'day', '') !~ '^[1-7]$' or coalesce(r->>'starts', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(r->>'ends', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (r->>'ends')::time <= (r->>'starts')::time or length(btrim(coalesce(r->>'title', ''))) not between 1 and 60
       or length(coalesce(r->>'room', '')) > 30 or length(coalesce(r->>'teacher', '')) > 40 then return public.ed_err('bad_text'); end if;
  end loop;
  delete from public.ed_timetable where class_id = p_class;
  insert into public.ed_timetable (class_id, day, starts, ends, title, room, teacher)
    select p_class, (e->>'day')::smallint, (e->>'starts')::time, (e->>'ends')::time, btrim(e->>'title'), btrim(coalesce(e->>'room', '')), btrim(coalesce(e->>'teacher', '')) from jsonb_array_elements(p_rows) e;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'n', n);
end $$;

-- ---------- 4. Termly goals and the year portfolio ----------
-- A school year starts on 1 September (2026 means 2026-27). Terms: 1 autumn (Sep-Dec), 2 spring (Jan-Mar), 3 summer (Apr-Aug).
create table if not exists public.ed_goal (
  id         serial primary key,
  uid        int not null references public.ed_user(id) on delete cascade,
  ay         int not null,
  term       int not null check (term between 1 and 3),
  subj       int references public.ed_subject(id) on delete set null,
  title      text not null,
  plan       text not null default '',                  -- how I'll do it
  status     text not null default 'active' check (status in ('active','done','dropped')),
  reflection text not null default '',                  -- how it went
  created    timestamptz not null default now(),
  updated    timestamptz not null default now()
);
create index if not exists ed_goal_uid on public.ed_goal (uid, ay, term);
alter table public.ed_goal enable row level security;
revoke all on public.ed_goal from anon, authenticated;

create or replace function public.ed_ay(d date) returns int language sql immutable as $$
  select extract(year from d)::int - case when extract(month from d) >= 9 then 0 else 1 end $$;
create or replace function public.ed_term(d date) returns int language sql immutable as $$
  select case when extract(month from d) >= 9 then 1 when extract(month from d) <= 3 then 2 else 3 end $$;
create or replace function public.ed_goals_of(p_uid int, p_ay int) returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', g.id, 'ay', g.ay, 'term', g.term, 'subj', g.subj, 'title', g.title, 'plan', g.plan, 'status', g.status,
    'reflection', g.reflection, 'updated', g.updated) order by g.ay desc, g.term desc, g.id), '[]'::json)
  from public.ed_goal g where g.uid = p_uid and (p_ay is null or g.ay = p_ay) $$;

create or replace function public.ed_s_goals(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'ay', public.ed_ay(current_date), 'term', public.ed_term(current_date), 'rows', public.ed_goals_of(u.id, null));
end $$;
-- New goals go into the current term (at most 6 in progress at once); any of your own goals can be edited later, e.g. to write the reflection.
create or replace function public.ed_s_goal_save(p_key text, p_id int, p_subj int, p_title text, p_plan text, p_status text, p_reflection text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); g public.ed_goal; i int; sj int := p_subj; st text := coalesce(p_status, 'active');
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 120 or length(coalesce(p_plan, '')) > 1000 or length(coalesce(p_reflection, '')) > 2000
     or st not in ('active','done','dropped') then return public.ed_err('bad_text'); end if;
  if sj is not null and not exists (select 1 from public.ed_subject where id = sj) then sj := null; end if;
  if p_id is not null and p_id > 0 then
    select * into g from public.ed_goal where id = p_id and uid = u.id; if g.id is null then return public.ed_err('not_found'); end if;
    update public.ed_goal set subj = sj, title = btrim(p_title), plan = btrim(coalesce(p_plan, '')), status = st, reflection = btrim(coalesce(p_reflection, '')), updated = now() where id = g.id;
    return json_build_object('ok', true, 'id', g.id);
  end if;
  if (select count(*) from public.ed_goal where uid = u.id and ay = public.ed_ay(current_date) and term = public.ed_term(current_date) and status = 'active') >= 6 then return public.ed_err('too_many'); end if;
  insert into public.ed_goal (uid, ay, term, subj, title, plan, status, reflection)
    values (u.id, public.ed_ay(current_date), public.ed_term(current_date), sj, btrim(p_title), btrim(coalesce(p_plan, '')), st, btrim(coalesce(p_reflection, ''))) returning id into i;
  return json_build_object('ok', true, 'id', i);
end $$;
create or replace function public.ed_s_goal_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  delete from public.ed_goal where id = p_id and uid = u.id;
  return json_build_object('ok', found);
end $$;

-- One school year of a student's record, for the printable portfolio
create or replace function public.ed_portfolio_of(s public.ed_user, p_ay int) returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare y int := case when p_ay between 2000 and 2100 then p_ay else public.ed_ay(current_date) end; a timestamptz; b timestamptz;
begin
  a := make_date(y, 9, 1)::timestamptz; b := make_date(y + 1, 9, 1)::timestamptz;
  return json_build_object('ok', true, 'ay', y, 'first_ay', least(public.ed_ay(s.created::date), y), 'now_ay', public.ed_ay(current_date),
    'student', json_build_object('id', s.id, 'name', s.name, 'year', s.year, 'house', s.house, 'class', (select name from public.ed_class where id = s.class_id)),
    'school', (select name from public.ed_school where id = 1),
    'goals', public.ed_goals_of(s.id, y),
    'lessons', (select count(*) from public.ed_lesson_done d where d.uid = s.id and d.at >= a and d.at < b),
    'checkpoints', (select count(distinct q.id) from public.ed_quiz q join public.ed_quiz_res r on r.quiz_id = q.id
      where q.kind = 'checkpoint' and r.uid = s.id and r.at >= a and r.at < b and 100 * r.score >= q.threshold * greatest(r.out_of, 1)),
    'points', (select coalesce(sum(pts), 0) from public.ed_points p where p.uid = s.id and p.at >= a and p.at < b),
    'activities', (select coalesce(json_agg(json_build_object('title', x.title, 'cat', x.cat, 'at', d.at) order by d.at), '[]'::json)
      from public.ed_activity_done d join public.ed_activity x on x.id = d.activity_id where d.uid = s.id and d.at >= a and d.at < b),
    'competitions', (select coalesce(json_agg(json_build_object('title', c.title, 'kind', c.kind, 'place', e.place, 'at', e.at) order by e.at), '[]'::json)
      from public.ed_entry e join public.ed_competition c on c.id = e.comp_id where e.uid = s.id and e.at >= a and e.at < b),
    'clubs', (select coalesce(json_agg(json_build_object('title', c.title, 'day', c.day) order by c.title), '[]'::json)
      from public.ed_club_member m join public.ed_club c on c.id = m.club_id where m.uid = s.id and m.at < b),
    'work', (select coalesce(json_agg(json_build_object('title', x.title, 'subj', x.subj, 'kind', x.kind, 'status', w.status, 'score', w.score, 'at', w.sub_at) order by w.sub_at), '[]'::json)
      from public.ed_sub w join public.ed_assign x on x.id = w.assign_id where w.uid = s.id and w.status <> 'draft' and w.sub_at >= a and w.sub_at < b));
end $$;
create or replace function public.ed_s_portfolio(p_key text, p_ay int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  return public.ed_portfolio_of(u, p_ay);
end $$;
-- Staff: a student in a class they can see (admins: anyone)
create or replace function public.ed_t_portfolio(p_key text, p_uid int, p_ay int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); s public.ed_user;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_staff(u) then return public.ed_err('forbidden'); end if;
  select * into s from public.ed_user where id = p_uid and role = 'student'; if s.id is null then return public.ed_err('not_found'); end if;
  if not (u.role = 'admin' or (s.class_id is not null and public.ed_can_class(u, s.class_id))) then return public.ed_err('forbidden'); end if;
  return public.ed_portfolio_of(s, p_ay);
end $$;

-- ---------- 5. Deadline reminders (Web Push) ----------
-- Students' devices that asked for reminders. The ed-remind Edge Function (supabase/functions/ed-remind) runs hourly:
-- it calls ed_push_due() for the messages to send and ed_push_gone() for devices that no longer exist. Neither is callable from the browser.
alter table public.ed_school add column if not exists push_run timestamptz;   -- last run of the sender: the Settings switch shows only once it runs
create table if not exists public.ed_push (
  endpoint text primary key,                    -- the browser's push address (Google, Mozilla, Apple or Microsoft)
  uid      int not null references public.ed_user(id) on delete cascade,
  p256dh   text not null,
  auth     text not null,
  lang     text not null default 'en',
  tz       text not null default 'UTC',         -- the device's time zone: reminders go out between 07:00 and 20:59 there
  created  timestamptz not null default now()
);
create index if not exists ed_push_uid on public.ed_push (uid);
create table if not exists public.ed_push_sent (
  uid       int not null references public.ed_user(id) on delete cascade,
  assign_id int not null references public.ed_assign(id) on delete cascade,
  at        timestamptz not null default now(),
  primary key (uid, assign_id)
);
alter table public.ed_push enable row level security;
alter table public.ed_push_sent enable row level security;
revoke all on public.ed_push, public.ed_push_sent from anon, authenticated;

create or replace function public.ed_push_host(p text) returns boolean language sql immutable as $$   -- only real push services, so the sender can't be pointed at any other address
  select length(p) <= 1000 and p ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[!-~]+$' $$;
create or replace function public.ed_s_push(p_key text, p_endpoint text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'ready', coalesce((select push_run > now() - interval '3 hours' from public.ed_school where id = 1), false),
    'on', exists (select 1 from public.ed_push where uid = u.id and endpoint = p_endpoint));
end $$;
create or replace function public.ed_s_push_save(p_key text, p_endpoint text, p_p256dh text, p_auth text, p_lang text, p_tz text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); tz text := 'UTC';
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  if not public.ed_push_host(coalesce(p_endpoint, '')) or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then return public.ed_err('bad_text'); end if;
  if exists (select 1 from pg_timezone_names where name = p_tz) then tz := p_tz; end if;
  insert into public.ed_push (endpoint, uid, p256dh, auth, lang, tz) values (p_endpoint, u.id, p_p256dh, p_auth, case when p_lang in ('en','fr','ar') then p_lang else 'en' end, tz)
    on conflict (endpoint) do update set uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, tz = excluded.tz, created = now();
  delete from public.ed_push where uid = u.id and endpoint not in (select endpoint from public.ed_push where uid = u.id order by created desc limit 5);   -- 5 devices each
  return json_build_object('ok', true);
end $$;
create or replace function public.ed_s_push_del(p_key text, p_endpoint text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  delete from public.ed_push where uid = u.id and endpoint = p_endpoint;
  return json_build_object('ok', true);
end $$;
-- For the sender only: one message per device for work due in the next 24 hours that the student hasn't handed in, once per piece of work
create or replace function public.ed_push_due() returns json language plpgsql security definer set search_path = public, extensions as $$
declare out json;
begin
  update public.ed_school set push_run = now() where id = 1;
  delete from public.ed_push_sent where at < now() - interval '60 days';
  with due as (
    select s.id as uid, a.id as assign_id, a.title, a.due, p.endpoint, p.p256dh, p.auth, p.lang, to_char(a.due at time zone p.tz, 'HH24:MI') as hm,
      (a.due at time zone p.tz)::date = (now() at time zone p.tz)::date as today
    from public.ed_assign a
    join public.ed_user s on s.class_id = a.class_id and s.role = 'student' and not s.disabled
    join public.ed_push p on p.uid = s.id
    where a.due > now() and a.due <= now() + interval '24 hours'
      and extract(hour from now() at time zone p.tz) between 7 and 20
      and public.ed_push_host(p.endpoint)
      and not exists (select 1 from public.ed_sub w where w.assign_id = a.id and w.uid = s.id and w.status <> 'draft')
      and not exists (select 1 from public.ed_push_sent x where x.uid = s.id and x.assign_id = a.id)
  ), mark as (
    insert into public.ed_push_sent (uid, assign_id) select distinct uid, assign_id from due on conflict do nothing
  )
  select coalesce(json_agg(json_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth, 'title', title, 'tag', 'assign-' || assign_id,
      'ttl', greatest(60, extract(epoch from due - now())::int),   -- the push service drops it once the work is due
      'url', 'student/#/assignment/' || assign_id,
      'body', case lang when 'fr' then case when today then 'À rendre aujourd''hui à ' else 'À rendre demain à ' end
                        when 'ar' then case when today then 'التسليم اليوم الساعة ' else 'التسليم غدًا الساعة ' end
                        else case when today then 'Due today at ' else 'Due tomorrow at ' end end || hm)), '[]'::json) into out from due;
  return out;
end $$;
create or replace function public.ed_push_gone(p_endpoints text[]) returns json language sql security definer set search_path = public as $$
  with d as (delete from public.ed_push where endpoint = any(p_endpoints) returning 1) select json_build_object('ok', true, 'n', (select count(*) from d)) $$;

-- ---------- 6. Wellbeing check-ins (off until an admin turns them on) ----------
alter table public.ed_school add column if not exists wellbeing boolean not null default false;
alter table public.ed_user add column if not exists pastoral boolean not null default false;   -- staff who see check-ins and get the alerts (admins always do)
create table if not exists public.ed_mood (
  id      serial primary key,
  uid     int not null references public.ed_user(id) on delete cascade,
  day     date not null default current_date,      -- shortcut: the database's date (UTC); a check-in before 03:00 in UTC+3 counts for the day before
  mood    int not null check (mood between 1 and 5),   -- 1 struggling, 2 not great, 3 okay, 4 good, 5 great
  talk    boolean not null default false,          -- would like to talk to someone
  note    text not null default '',
  at      timestamptz not null default now(),
  seen_by int references public.ed_user(id) on delete set null,   -- followed up by
  seen_at timestamptz,
  unique (uid, day)
);
create index if not exists ed_mood_day on public.ed_mood (day);
alter table public.ed_mood enable row level security;
revoke all on public.ed_mood from anon, authenticated;

create or replace function public.ed_pastoral(u public.ed_user) returns boolean language sql immutable as $$ select u.role = 'admin' or (u.role = 'teacher' and u.pastoral) $$;
create or replace function public.ed_mood_flag(p_mood int, p_talk boolean) returns boolean language sql immutable as $$ select p_mood <= 2 or p_talk $$;
create or replace function public.ed_mood_tidy() returns void language sql security definer set search_path = public as $$
  delete from public.ed_mood where day < current_date - 180;   -- kept for six months: the students are told this
  -- and so are the alerts, which also go when their reader is no longer one of the wellbeing staff
  delete from public.ed_notif n where n.kind = 'wellbeing' and (n.created < now() - interval '180 days' or not exists (select 1 from public.ed_user t where t.id = n.uid and public.ed_pastoral(t))) $$;

create or replace function public.ed_s_checkin(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if u.role <> 'student' or not coalesce((select wellbeing from public.ed_school where id = 1), false) then return json_build_object('ok', true, 'on', false); end if;
  return json_build_object('ok', true, 'on', true, 'today', (select json_build_object('mood', mood, 'talk', talk, 'note', note) from public.ed_mood where uid = u.id and day = current_date));
end $$;
create or replace function public.ed_s_checkin_save(p_key text, p_mood int, p_talk boolean, p_note text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); old public.ed_mood; tk boolean := coalesce(p_talk, false);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  if not coalesce((select wellbeing from public.ed_school where id = 1), false) then return public.ed_err('off'); end if;
  if p_mood is null or p_mood not between 1 and 5 or length(coalesce(p_note, '')) > 500 then return public.ed_err('bad_text'); end if;
  select * into old from public.ed_mood where uid = u.id and day = current_date;
  insert into public.ed_mood (uid, mood, talk, note) values (u.id, p_mood, tk, btrim(coalesce(p_note, '')))
    on conflict (uid, day) do update set mood = excluded.mood, talk = excluded.talk, note = excluded.note, at = now();
  -- newly worrying (or a new request to talk): alert the wellbeing staff, once, and put it back on their to-do list
  if public.ed_mood_flag(p_mood, tk) and (old.id is null or not public.ed_mood_flag(old.mood, old.talk) or (tk and not old.talk)) then
    update public.ed_mood set seen_by = null, seen_at = null where uid = u.id and day = current_date;
    insert into public.ed_notif (uid, kind, title, body, link)
      select t.id, 'wellbeing', 'Wellbeing check-in: ' || u.name,
        'Checked in: ' || (array['Struggling','Not great','Okay','Good','Great'])[p_mood] || case when tk then ' · would like to talk to someone' else '' end, '#/wellbeing'
      from public.ed_user t where public.ed_pastoral(t) and not t.disabled;
  end if;
  perform public.ed_mood_tidy();
  return json_build_object('ok', true);
end $$;
-- Wellbeing staff: the worrying check-ins of the last n days (to follow up first), and how everyone answered
create or replace function public.ed_t_wellbeing(p_key text, p_days int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); n int := least(greatest(coalesce(p_days, 14), 1), 60);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_pastoral(u) then return public.ed_err('forbidden'); end if;
  perform public.ed_mood_tidy();
  return json_build_object('ok', true, 'on', coalesce((select wellbeing from public.ed_school where id = 1), false), 'days', n,
    'counts', (select json_build_array(count(*) filter (where mood = 1), count(*) filter (where mood = 2), count(*) filter (where mood = 3), count(*) filter (where mood = 4), count(*) filter (where mood = 5))
      from public.ed_mood where day > current_date - n),
    'students', (select count(distinct uid) from public.ed_mood where day > current_date - n),
    'rows', (select coalesce(json_agg(json_build_object('id', m.id, 'uid', m.uid, 'name', s.name, 'class', c.name, 'day', m.day, 'at', m.at, 'mood', m.mood, 'talk', m.talk, 'note', m.note,
        'seen_at', m.seen_at, 'seen_by', (select name from public.ed_user where id = m.seen_by),
        'recent', (select json_agg(r.mood order by r.day) from (select x.mood, x.day from public.ed_mood x where x.uid = m.uid order by x.day desc limit 7) r))
        order by (m.seen_at is null) desc, m.day desc, m.at desc), '[]'::json)
      from public.ed_mood m join public.ed_user s on s.id = m.uid left join public.ed_class c on c.id = s.class_id
      where m.day > current_date - n and public.ed_mood_flag(m.mood, m.talk)));
end $$;
create or replace function public.ed_t_wellbeing_seen(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_pastoral(u) then return public.ed_err('forbidden'); end if;
  update public.ed_mood set seen_by = u.id, seen_at = now() where id = p_id;
  return json_build_object('ok', found);
end $$;
-- Admin: switch check-ins on or off and choose the staff who see them
create or replace function public.ed_a_wellbeing(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true, 'on', coalesce((select wellbeing from public.ed_school where id = 1), false),
    'staff', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'role', t.role, 'pastoral', t.role = 'admin' or t.pastoral) order by t.role, t.name), '[]'::json)
      from public.ed_user t where t.role in ('teacher','admin') and not t.disabled));
end $$;
create or replace function public.ed_a_wellbeing_set(p_key text, p_on boolean, p_staff int[]) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  update public.ed_school set wellbeing = coalesce(p_on, false), updated = now() where id = 1;
  update public.ed_user set pastoral = (id = any(coalesce(p_staff, '{}'::int[]))) where role = 'teacher';
  perform public.ed_mood_tidy();
  return json_build_object('ok', true);
end $$;

-- ---------- Permissions (same rule as before) ----------
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
-- the reminder sender (the ed-remind Edge Function) signs in as service_role; the browser can't call these
grant execute on function public.ed_push_due(), public.ed_push_gone(text[]) to service_role;
