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
