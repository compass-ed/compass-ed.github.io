-- ===== Compass Ed v2.6: Campus Dashboard =====
-- Run AFTER compassed-v2.4.2-feedback.sql. Safe to run again.
-- Student Voice: anyone signed in can post an idea and vote for others'; staff answer, plan or close them.
-- Campus Insights (ed_t_insights) is further down: participation numbers for staff, built only from existing tables.

create table if not exists public.ed_voice (
  id      serial primary key,
  uid     int references public.ed_user(id) on delete set null,
  name    text not null,                                   -- the author's name at the time
  title   text not null,
  body    text not null default '',
  status  text not null default 'open' check (status in ('open','planned','done','closed')),
  reply   text not null default '',                       -- staff answer, shown under the idea
  created timestamptz not null default now()
);
create table if not exists public.ed_voice_vote (
  voice_id int not null references public.ed_voice(id) on delete cascade,
  uid      int not null references public.ed_user(id) on delete cascade,
  primary key (voice_id, uid)
);
create index if not exists ed_voice_created on public.ed_voice (created desc);
alter table public.ed_voice enable row level security;
alter table public.ed_voice_vote enable row level security;
revoke all on public.ed_voice, public.ed_voice_vote from anon, authenticated;

-- Ideas, most voted first, with my own vote marked
create or replace function public.ed_s_voice(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object(
      'id', v.id, 'title', v.title, 'body', v.body, 'name', v.name, 'status', v.status, 'reply', v.reply, 'created', v.created,
      'votes', (select count(*) from public.ed_voice_vote x where x.voice_id = v.id),
      'voted', exists (select 1 from public.ed_voice_vote x where x.voice_id = v.id and x.uid = u.id),
      'mine', v.uid = u.id) order by (v.status = 'closed'), (select count(*) from public.ed_voice_vote x where x.voice_id = v.id) desc, v.created desc), '[]'::json)
    from (select * from public.ed_voice order by created desc limit 200) v));
end $$;

-- Post an idea: a short title, an optional explanation, one a minute and ten a day per person
create or replace function public.ed_s_voice_post(p_key text, p_title text, p_body text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if length(btrim(coalesce(p_title, ''))) < 4 then return public.ed_err('empty'); end if;
  if length(p_title) > 80 or length(coalesce(p_body, '')) > 600 then return public.ed_err('too_big'); end if;
  if exists (select 1 from public.ed_voice v where v.uid = u.id and v.created > now() - interval '60 seconds') then return public.ed_err('too_many'); end if;
  if (select count(*) from public.ed_voice v where v.uid = u.id and v.created > now() - interval '1 day') >= 10 then return public.ed_err('too_many'); end if;
  insert into public.ed_voice (uid, name, title, body) values (u.id, u.name, btrim(p_title), btrim(coalesce(p_body, ''))) returning id into i;
  insert into public.ed_voice_vote (voice_id, uid) values (i, u.id);   -- you back your own idea
  return json_build_object('ok', true, 'id', i);
end $$;

-- Vote or take the vote back
create or replace function public.ed_s_voice_vote(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); on_ boolean;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if not exists (select 1 from public.ed_voice v where v.id = p_id and v.status <> 'closed') then return public.ed_err('not_found'); end if;
  delete from public.ed_voice_vote where voice_id = p_id and uid = u.id; on_ := not found;
  if on_ then insert into public.ed_voice_vote (voice_id, uid) values (p_id, u.id); end if;
  return json_build_object('ok', true, 'voted', on_, 'votes', (select count(*) from public.ed_voice_vote x where x.voice_id = p_id));
end $$;

-- Staff: answer an idea, mark it planned or done, or close it
create or replace function public.ed_t_voice_set(p_key text, p_id int, p_status text, p_reply text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role not in ('teacher','admin') then return public.ed_err('forbidden'); end if;
  if p_status not in ('open','planned','done','closed') then return public.ed_err('bad_status'); end if;
  if length(coalesce(p_reply, '')) > 400 then return public.ed_err('too_big'); end if;
  update public.ed_voice set status = p_status, reply = btrim(coalesce(p_reply, '')) where id = p_id;
  return json_build_object('ok', found);
end $$;
create or replace function public.ed_t_voice_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role not in ('teacher','admin') then return public.ed_err('forbidden'); end if;
  delete from public.ed_voice where id = p_id; return json_build_object('ok', found);
end $$;

-- Campus Insights for staff: participation numbers from the tables that already exist (nothing new is stored)
create or replace function public.ed_t_insights(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role not in ('teacher','admin') then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true,
    'students',     (select count(*) from public.ed_user where role = 'student' and not disabled),
    'active_week',  (select count(*) from public.ed_user where role = 'student' and not disabled and last_seen > now() - interval '7 days'),
    'active_month', (select count(*) from public.ed_user where role = 'student' and not disabled and last_seen > now() - interval '30 days'),
    'done_week',    (select count(*) from public.ed_activity_done where at > now() - interval '7 days'),
    'done_total',   (select count(*) from public.ed_activity_done),
    'lessons_week', (select count(*) from public.ed_lesson_done where at > now() - interval '7 days'),
    'quizzes_week', (select count(*) from public.ed_quiz_res where at > now() - interval '7 days'),
    'subs_week',    (select count(*) from public.ed_sub where status = 'submitted' and sub_at > now() - interval '7 days'),
    'voice_open',   (select count(*) from public.ed_voice where status = 'open'),
    'cats',   (select coalesce(json_agg(json_build_object('name', c.name, 'n', (select count(*) from public.ed_activity_done d join public.ed_activity a on a.id = d.activity_id where a.cat = c.id)) order by c.id), '[]'::json) from public.ed_category c),
    'comps',  (select coalesce(json_agg(json_build_object('title', k.title, 'kind', k.kind, 'closes', k.closes, 'entries', (select count(*) from public.ed_entry e where e.comp_id = k.id)) order by k.closes desc), '[]'::json) from (select * from public.ed_competition order by closes desc limit 8) k),
    'houses', (select coalesce(json_agg(json_build_object('house', t.h, 'pts', t.p, 'week', t.w) order by t.p desc), '[]'::json) from (select x.house h, coalesce(sum(p.pts), 0) p, coalesce(sum(p.pts) filter (where p.at > now() - interval '7 days'), 0) w from public.ed_user x left join public.ed_points p on p.uid = x.id where x.house is not null and x.role = 'student' group by x.house) t),
    'clubs',  (select coalesce(json_agg(json_build_object('title', c.title, 'members', (select count(*) from public.ed_club_member m where m.club_id = c.id), 'capacity', c.capacity) order by c.title), '[]'::json) from public.ed_club c),
    'weeks',  (select coalesce(json_agg(json_build_object('week', t.wk, 'n', t.n) order by t.wk), '[]'::json) from (select date_trunc('week', at) wk, count(*) n from public.ed_activity_done where at > now() - interval '8 weeks' group by 1) t));
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
