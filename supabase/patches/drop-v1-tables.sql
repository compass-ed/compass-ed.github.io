-- Only if you ran the earlier compassed-v1.0.sql: removes its ce_* tables and functions. Compass Ed v2 does not use them.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ce\_%' loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
  for r in select tablename from pg_tables where schemaname = 'public' and tablename like 'ce\_%' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
end $$;
