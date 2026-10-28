-- ===== Compass Ed v2.4.2: feedback button =====
-- Run AFTER compassed-v2.3.sql. Safe to run again.
-- Any signed-in student or member of staff can send feedback (a star rating, a category and a message) from the
-- Feedback button in their portal. Only the administrator can read, mark or delete it (Admin > Feedback).

create table if not exists public.ed_feedback (
  id       serial primary key,
  uid      int references public.ed_user(id) on delete set null,
  role     text not null,
  name     text not null,                        -- the sender's name at the time (kept even if the account goes)
  rating   int not null check (rating between 1 and 5),
  category text not null default 'Other' check (category in ('Bug report','Feature request','Suggestion','Other')),
  body     text not null,
  page     text not null default '',             -- where they were when they sent it
  created  timestamptz not null default now(),
  seen_at  timestamptz
);
create index if not exists ed_feedback_created on public.ed_feedback (created desc);
alter table public.ed_feedback enable row level security;
revoke all on public.ed_feedback from anon, authenticated;

-- Send feedback: at most one message every 30 seconds and 20 a day per person
create or replace function public.ed_feedback_send(p_key text, p_rating int, p_cat text, p_msg text, p_page text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key); i int;
begin
  if u.id is null then return public.ed_err('bad_key'); end if;
  if p_rating is null or p_rating not between 1 and 5 then return public.ed_err('bad_rating'); end if;
  if length(btrim(coalesce(p_msg, ''))) < 10 then return public.ed_err('empty'); end if;
  if length(p_msg) > 2000 then return public.ed_err('too_big'); end if;
  if exists (select 1 from public.ed_feedback f where f.uid = u.id and f.created > now() - interval '30 seconds') then return public.ed_err('too_many'); end if;
  if (select count(*) from public.ed_feedback f where f.uid = u.id and f.created > now() - interval '1 day') >= 20 then return public.ed_err('too_many'); end if;
  insert into public.ed_feedback (uid, role, name, rating, category, body, page)
    values (u.id, u.role, u.name, p_rating, case when p_cat in ('Bug report','Feature request','Suggestion','Other') then p_cat else 'Other' end, btrim(p_msg), left(coalesce(p_page, ''), 120))
    returning id into i;
  return json_build_object('ok', true, 'id', i);
end $$;

-- Admin only: every message, newest first, with the unseen count
create or replace function public.ed_a_feedback(p_key text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  return json_build_object('ok', true,
    'unseen', (select count(*) from public.ed_feedback where seen_at is null),
    'total', (select count(*) from public.ed_feedback),
    'avg', (select round(avg(rating)::numeric, 1) from public.ed_feedback),
    'rows', (select coalesce(json_agg(json_build_object('id', f.id, 'uid', f.uid, 'role', f.role, 'name', f.name, 'username', (select username from public.ed_user x where x.id = f.uid),
        'rating', f.rating, 'category', f.category, 'body', f.body, 'page', f.page, 'created', f.created, 'seen', f.seen_at is not null) order by f.created desc), '[]'::json)
      from (select * from public.ed_feedback order by created desc limit 500) f));
end $$;
create or replace function public.ed_a_feedback_seen(p_key text, p_id int, p_seen boolean) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  if coalesce(p_id, 0) = 0 then update public.ed_feedback set seen_at = case when coalesce(p_seen, true) then coalesce(seen_at, now()) else null end;   -- 0 = all of them
  else update public.ed_feedback set seen_at = case when coalesce(p_seen, true) then coalesce(seen_at, now()) else null end where id = p_id; end if;
  return json_build_object('ok', true);
end $$;
create or replace function public.ed_a_feedback_del(p_key text, p_id int) returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.ed_user := public.ed_who(p_key);
begin
  if u.id is null then return public.ed_err('bad_key'); end if; if u.role <> 'admin' then return public.ed_err('forbidden'); end if;
  delete from public.ed_feedback where id = p_id; return json_build_object('ok', found);
end $$;

-- Permissions (same rule as before, plus ed_feedback_send)
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
