-- ===== Compass Ed v2.10: Compass Dash topics as homework, and a weekly summary for parents =====
-- Run AFTER compassed-v2.9.1-qatar-history.sql (or v2.9-features.sql if you skipped Qatar History). Safe to run again.
-- After running it, redeploy the ed-remind Edge Function so it also sends the parents' summaries (README, "Deadline reminders").

-- ---------- 1. Compass Dash topics as homework ----------
-- Staff set a Compass Dash topic as homework for one of their classes, from the topic's page in Compass Dash.
-- Students open it from Compass Ed. Their best topic-test score before the deadline goes into the mark book, already
-- marked (status 'returned'), so it never waits in "To mark". After the deadline only a first, late attempt still counts.
alter table public.ed_assign add column if not exists dash_s int;        -- Compass Dash subject, in Compass Dash's own order
alter table public.ed_assign add column if not exists dash_t int;        -- the topic's number within that subject
alter table public.ed_assign add column if not exists dash_topic text;   -- the topic's name when it was set
alter table public.ed_assign drop constraint if exists ed_assign_kind_check;
alter table public.ed_assign add constraint ed_assign_kind_check check (kind in ('homework','assignment','quiz','dash'));

create or replace function public.ed_t_dash_assign(p_key text, p_class int, p_s int, p_t int, p_topic text, p_due timestamptz) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); sj int; i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if p_s is null or p_t is null or p_s < 0 or p_t < 0 or p_t > 500 or not public.ed_ok_text(p_topic, 120) then return public.ed_err('bad_request'); end if;
  -- shortcut: Compass Dash's subject order mapped to ed_subject by hand (French, Spanish, Arabic -> Languages; Qatar History -> History); add a number when Compass Dash gets a 13th subject
  sj := coalesce((array[0,1,2,3,8,5,6,7,4,8,8,4])[p_s + 1], (select subj from public.ed_class where id = p_class));
  if sj is null then return public.ed_err('bad_request'); end if;
  insert into public.ed_assign (class_id, subj, kind, title, instr, due, uid, dash_s, dash_t, dash_topic)
    values (p_class, sj, 'dash', btrim(p_topic), 'Learn the topic and practise it in Compass Dash, then take its test. Your best test score before the deadline counts.', p_due, u.id, p_s, p_t, btrim(p_topic)) returning id into i;
  perform public.ed_notify_class(p_class, 'assign', 'New homework: ' || btrim(p_topic), case when p_due is null then '' else 'Due ' || to_char(p_due, 'Dy DD Mon') end, '#/assignment/' || i);
  return json_build_object('ok', true, 'id', i);
end $$;

-- the score is worked out in the student's browser (Compass Dash marks its tests there), so it is homework evidence, not proof
create or replace function public.ed_s_dash_done(p_key text, p_s int, p_t int, p_score int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); n int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'student' then return public.ed_err('forbidden'); end if;
  if p_s is null or p_t is null or p_score is null or p_score not between 0 and 100 then return public.ed_err('bad_request'); end if;
  insert into public.ed_sub as w (assign_id, uid, status, ver, body, sub_at, score, feedback, graded_at)
    select a.id, u.id, 'returned', 1, 'Compass Dash test: ' || p_score || '%', now(), p_score, '', now()
    from public.ed_assign a
    where a.class_id = u.class_id and a.kind = 'dash' and a.dash_s = p_s and a.dash_t = p_t
      and (a.due is null or a.due > now() or not exists (select 1 from public.ed_sub x where x.assign_id = a.id and x.uid = u.id and x.status <> 'draft'))
  on conflict (assign_id, uid) do update set status = 'returned', score = excluded.score, body = excluded.body, sub_at = now(), graded_at = now()
    where w.score is null or excluded.score > w.score;   -- the best score counts, as with quiz assignments
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'n', n);
end $$;

-- a Compass Dash homework has nothing to hand in: its result comes only from the test
create or replace function public.ed_s_submit(p_key text, p_assign int, p_body text, p_links json, p_final boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); a public.ed_assign; s public.ed_sub; v int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  select * into a from public.ed_assign where id = p_assign and class_id = u.class_id and kind <> 'dash'; if a.id is null then return public.ed_err('not_found'); end if;
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

-- the student's list says which Compass Dash topic a homework opens
create or replace function public.ed_s_assigns(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  return json_build_object('ok', true, 'rows', (select coalesce(json_agg(json_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'subj', a.subj, 'instr', a.instr, 'due', a.due, 'points', a.points, 'quiz_id', a.quiz_id, 'created', a.created, 'peer', a.peer,
      'dash_s', a.dash_s, 'dash_t', a.dash_t, 'dash_topic', a.dash_topic,
      'rubric', (select json_build_object('title', b.title, 'criteria', b.criteria) from public.ed_rubric b where b.id = a.rubric_id),
      'sub', case when s.id is null then null else json_build_object('id', s.id, 'status', s.status, 'ver', s.ver, 'body', s.body, 'links', s.links, 'sub_at', s.sub_at, 'score', s.score, 'rub', s.rub, 'feedback', s.feedback, 'graded_at', s.graded_at,
                 'versions', (select coalesce(json_agg(json_build_object('ver', v.ver, 'at', v.at, 'len', length(v.body)) order by v.ver desc), '[]'::json) from public.ed_sub_ver v where v.sub_id = s.id)) end) order by a.due nulls last, a.id desc), '[]'::json)
    from public.ed_assign a left join public.ed_sub s on s.assign_id = a.id and s.uid = u.id where a.class_id = u.class_id));
end $$;

-- editing: a Compass Dash homework stays one (no quiz, rubric or peer review), and only Compass Dash can make one
create or replace function public.ed_t_assign_save(p_key text, p_id int, p_class int, p_subj int, p_kind text, p_title text, p_instr text, p_due timestamptz, p_points int, p_quiz int, p_rubric int, p_peer boolean default false) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if not public.ed_can_class(u, p_class) then return public.ed_err('forbidden'); end if;
  if not public.ed_ok_text(p_title, 120) or length(coalesce(p_instr, '')) > 8000 then return public.ed_err('bad_text'); end if;
  if coalesce(p_kind, 'homework') not in ('homework','assignment','quiz','dash') or (p_kind = 'dash' and not exists (select 1 from public.ed_assign where id = p_id and kind = 'dash')) then return public.ed_err('bad_request'); end if;
  if coalesce(p_id, 0) = 0 then
    insert into public.ed_assign (class_id, subj, kind, title, instr, due, points, quiz_id, rubric_id, uid, peer) values (p_class, p_subj, coalesce(p_kind, 'homework'), btrim(p_title), coalesce(p_instr, ''), p_due, least(greatest(coalesce(p_points, 10), 0), 1000), nullif(p_quiz, 0), nullif(p_rubric, 0), u.id, coalesce(p_peer, false)) returning id into i;
    perform public.ed_notify_class(p_class, 'assign', 'New ' || coalesce(p_kind, 'homework') || ': ' || btrim(p_title), case when p_due is null then '' else 'Due ' || to_char(p_due, 'Dy DD Mon') end, '#/assignment/' || i);
  else update public.ed_assign set class_id = p_class, subj = p_subj, kind = case when kind = 'dash' then 'dash' else coalesce(p_kind, 'homework') end, title = btrim(p_title), instr = coalesce(p_instr, ''), due = p_due, points = least(greatest(coalesce(p_points, 10), 0), 1000),
      quiz_id = case when kind = 'dash' then null else nullif(p_quiz, 0) end, rubric_id = case when kind = 'dash' then null else nullif(p_rubric, 0) end, peer = kind <> 'dash' and coalesce(p_peer, false)
    where id = p_id and public.ed_can_class(u, class_id) returning id into i; end if;
  if i is null then return public.ed_err('not_found'); end if; return json_build_object('ok', true, 'id', i);
end $$;


-- ---------- 2. A weekly summary for parents, sent to their phone (Web Push) ----------
-- A parent turns it on from the private parent link. It goes out on Friday, between 09:00 and 20:59 on that phone,
-- once a week, through the same ed-remind sender as the deadline reminders. Each device is tied to the link it was
-- turned on from: when the child makes a new link, the old link's devices stop getting summaries.
create table if not exists public.ed_push_parent (
  endpoint  text not null,
  uid       int not null references public.ed_user(id) on delete cascade,   -- the child
  tok       text not null,                                                   -- the parent link it was turned on from
  p256dh    text not null,
  auth      text not null,
  lang      text not null default 'en',
  tz        text not null default 'UTC',
  created   timestamptz not null default now(),
  sent_week date,                                                            -- start of the last week a summary went out
  primary key (endpoint, uid)
);
alter table public.ed_push_parent enable row level security;
revoke all on public.ed_push_parent from anon, authenticated;

create or replace function public.ed_parent_child(p_tok text) returns public.ed_user language sql stable security definer set search_path = public as $$
  select u.* from public.ed_user u where coalesce(p_tok, '') ~ '^[0-9a-f]{36}$' and u.parent_tok = p_tok and u.role = 'student' and not u.disabled $$;
create or replace function public.ed_s_parent_push(p_tok text, p_endpoint text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_parent_child(p_tok);
begin
  if u.id is null then return public.ed_err('not_found'); end if;
  return json_build_object('ok', true, 'ready', coalesce((select push_run > now() - interval '3 hours' from public.ed_school where id = 1), false),
    'on', exists (select 1 from public.ed_push_parent where uid = u.id and tok = p_tok and endpoint = p_endpoint));
end $$;
create or replace function public.ed_s_parent_push_save(p_tok text, p_endpoint text, p_p256dh text, p_auth text, p_lang text, p_tz text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_parent_child(p_tok); tz text := 'UTC';
begin
  if u.id is null then return public.ed_err('not_found'); end if;
  if not public.ed_push_host(coalesce(p_endpoint, '')) or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then return public.ed_err('bad_text'); end if;
  if exists (select 1 from pg_timezone_names where name = p_tz) then tz := p_tz; end if;
  insert into public.ed_push_parent (endpoint, uid, tok, p256dh, auth, lang, tz) values (p_endpoint, u.id, p_tok, p_p256dh, p_auth, case when p_lang in ('en','fr','ar') then p_lang else 'en' end, tz)
    on conflict (endpoint, uid) do update set tok = excluded.tok, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, tz = excluded.tz, created = now();
  delete from public.ed_push_parent where uid = u.id and (endpoint, created) not in (select endpoint, created from public.ed_push_parent where uid = u.id order by created desc limit 5);   -- 5 devices for each child
  return json_build_object('ok', true);
end $$;
create or replace function public.ed_s_parent_push_del(p_tok text, p_endpoint text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_parent_child(p_tok);
begin
  if u.id is null then return public.ed_err('not_found'); end if;
  delete from public.ed_push_parent where uid = u.id and endpoint = p_endpoint;
  return json_build_object('ok', true);
end $$;
-- For the sender only: this week's summaries that are due now (Friday daytime on the device), each marked as sent
create or replace function public.ed_push_weekly() returns json language plpgsql security definer set search_path = public, extensions as $$
declare out json;
begin
  delete from public.ed_push_parent p where not exists (select 1 from public.ed_user u where u.id = p.uid and u.parent_tok = p.tok);   -- link replaced (a disabled student keeps theirs for when they are back)
  with w as (
    select p.endpoint, p.uid, p.p256dh, p.auth, p.lang, p.tok, split_part(u.name, ' ', 1) as first,
      date_trunc('week', now() at time zone p.tz)::date as wk,
      (select count(*) from public.ed_sub s where s.uid = u.id and s.status <> 'draft' and s.sub_at > now() - interval '7 days') as handed,
      (select count(*) from public.ed_sub s where s.uid = u.id and s.score is not null and s.graded_at > now() - interval '7 days') as marked,
      (select round(avg(s.score)) from public.ed_sub s where s.uid = u.id and s.score is not null and s.graded_at > now() - interval '7 days')::int as avg,
      (select coalesce(sum(pts), 0) from public.ed_points where uid = u.id and at > now() - interval '7 days')::int as pts,
      (select count(*) from public.ed_assign a where a.class_id = u.class_id and a.due > now() and a.due <= now() + interval '7 days'
         and not exists (select 1 from public.ed_sub s where s.assign_id = a.id and s.uid = u.id and s.status <> 'draft')) as due
    from public.ed_push_parent p join public.ed_user u on u.id = p.uid and not u.disabled
    where extract(isodow from now() at time zone p.tz) = 5 and extract(hour from now() at time zone p.tz) between 9 and 20
      and (p.sent_week is null or p.sent_week < date_trunc('week', now() at time zone p.tz)::date)
      and public.ed_push_host(p.endpoint)
  ), mark as (
    update public.ed_push_parent p set sent_week = w.wk from w where p.endpoint = w.endpoint and p.uid = w.uid
  )
  select coalesce(json_agg(json_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth, 'tag', 'week-' || uid, 'ttl', 86400, 'url', 'parent.html?t=' || tok,
      'title', case lang when 'fr' then 'La semaine de ' || first when 'ar' then 'أسبوع ' || first else first || '’s week' end,
      'body', case lang
        when 'fr' then handed || case when handed > 1 then ' rendus' else ' rendu' end || ' · ' || marked || case when marked > 1 then ' notés' else ' noté' end
          || case when avg is null then '' else ' (moyenne ' || avg || ' %)' end || ' · ' || pts || case when pts > 1 then ' points de maison' else ' point de maison' end || ' · ' || due || ' à rendre la semaine prochaine'
        when 'ar' then 'سُلّم ' || handed || ' · صُحّح ' || marked || case when avg is null then '' else ' (المتوسط ' || avg || '%)' end || ' · ' || pts || ' نقطة للبيت · ' || due || ' مستحقة الأسبوع القادم'
        else handed || ' handed in · ' || marked || ' marked' || case when avg is null then '' else ' (average ' || avg || '%)' end || ' · ' || pts || case when pts = 1 then ' house point' else ' house points' end || ' · ' || due || ' due next week' end)), '[]'::json) into out from w;
  return out;
end $$;
-- gone devices are removed from both lists
create or replace function public.ed_push_gone(p_endpoints text[]) returns json language sql security definer set search_path = public as $$
  with d as (delete from public.ed_push where endpoint = any(p_endpoints) returning 1), e as (delete from public.ed_push_parent where endpoint = any(p_endpoints) returning 1)
  select json_build_object('ok', true, 'n', (select count(*) from d) + (select count(*) from e)) $$;


-- ---------- Permissions (same as v2.9: every file ends with this) ----------
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
grant execute on function public.ed_push_due(), public.ed_push_gone(text[]), public.ed_push_retry(text[], int[]), public.ed_push_weekly() to service_role;
