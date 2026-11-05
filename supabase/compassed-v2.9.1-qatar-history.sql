-- ===== Compass Ed v2.9.1: Qatar History & Citizenship in Compass Dash =====
-- Run AFTER Compass Dash's compass-dash-v2.8.0-teacher-accounts.sql (Teacher Panel seats). Safe to run again.
-- Compass Dash's 12th subject sits at position 11, after Arabic. It gets its two Teacher Panel seats,
-- and an admin can set a class to it. Nothing else in the database counts subjects.

-- 1. Seats may belong to subjects 0-11 (the v2.8.0 table only allowed 0-10)
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.cd_teacher'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%subj%' loop
    execute format('alter table public.cd_teacher drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.cd_teacher add constraint cd_teacher_subj_check check (subj between 0 and 11);

-- 2. The two seats for the new subject, each with an invite code for the admin to hand out
insert into public.cd_teacher (subj, seat, invite)
select 11, n, public.cd_inv() from generate_series(1, 2) n
on conflict (subj, seat) do nothing;

-- 3. Admin: set a class's subject (same as v2.8.0, now up to 11)
create or replace function public.cd_admin_class_subj(p_key text, p_id int, p_subj int) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.cd_admin_ok(p_key) then return json_build_object('ok', false, 'error', 'bad_key'); end if;
  if p_subj is not null and p_subj not between 0 and 11 then return json_build_object('ok', false, 'error', 'bad_request'); end if;
  update public.cd_class set subj = p_subj where id = p_id;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  return json_build_object('ok', true);
end $$;
