\set ON_ERROR_STOP on
\timing on
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
do $$ declare fn regprocedure := 'ask_candidate_experiment.search(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)'::regprocedure; begin
 if not has_function_privilege('authenticated',fn,'execute')
   or has_function_privilege('anon',fn,'execute') or has_function_privilege('service_role',fn,'execute') then raise exception 'Execution grants'; end if;
 if has_schema_privilege('authenticated','ask_candidate_experiment','create') then raise exception 'Caller can replace function'; end if;
 if not exists(select 1 from pg_roles where rolname='ask_candidate_experiment_reader' and rolbypassrls and not rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb) then raise exception 'Execution role'; end if;
 if has_table_privilege('ask_candidate_experiment_reader','public.pet_care_entries','INSERT,UPDATE,DELETE')
   or has_table_privilege('ask_candidate_experiment_reader','public.semantic_claims','SELECT') then raise exception 'Excess role privilege'; end if;
 if (select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname in ('care_history_note_search_idx','care_history_title_search_idx','care_history_owner_pet_cursor_idx') and i.indisvalid and i.indisready)<>3 then raise exception 'Indexes unavailable'; end if;
 if current_setting('enable_seqscan')<>'on' or current_setting('enable_indexscan')<>'on' or current_setting('enable_bitmapscan')<>'on' or current_setting('enable_incremental_sort')<>'on' then raise exception 'Planner override'; end if;
 raise notice 'PASS: execution role/grants, maintained valid indexes, default planner flags';
end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'Wrong SQLSTATE: %, expected %, SQL %',sqlstate,expected,statement;
  end;
  raise exception 'Expected rejection: %',statement;
end $$;
create temp table cases(label text,pet uuid,terms text[],lo timestamptz,hi timestamptz,ct timestamptz,ci uuid);
insert into cases values
 ('rare_all','93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],null,null,null,null),
 ('none_all','93000000-0000-4000-8000-000000000011',array['unfindablemarker'],null,null,null,null),
 ('common_all','93000000-0000-4000-8000-000000000011',array['grooming'],null,null,null,null),
 ('rare_2014','93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],'2014-01-01','2015-01-01',null,null),
 ('none_2014','93000000-0000-4000-8000-000000000011',array['unfindablemarker'],'2014-01-01','2015-01-01',null,null),
 ('common_2026','93000000-0000-4000-8000-000000000011',array['grooming'],'2026-01-01','2027-01-01',null,null),
 ('rare_next','93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],null,null,'2014-07-09','95000000-0000-4000-8000-000000000024'),
 ('common_next','93000000-0000-4000-8000-000000000011',array['grooming'],null,null,'2026-01-01 00:25:00+00','94000000-0000-4000-8000-000000000025'),
 ('decisive_2011','93000000-0000-4000-8000-000000000011',array['stool'],'2011-01-01','2012-01-01',null,null),
 ('other_pet','93000000-0000-4000-8000-000000000012',array['grooming'],null,null,null,null),
 ('rare_unique','93000000-0000-4000-8000-000000000011',array['stool'],null,null,null,null),
 ('rare_tail','93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],null,null,'2014-07-09','95000000-0000-4000-8000-000000000049'),
 ('rare_exhausted','93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],null,null,'2014-07-09','95000000-0000-4000-8000-000000000060'),
 ('period_next','93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],'2014-01-01','2015-01-01','2014-07-09','95000000-0000-4000-8000-000000000025');
grant select on cases to authenticated;
-- Unqualified shadow objects must not alter the function's qualified reads.
create temp table dog_profiles(id uuid,user_id uuid);
create temp table pet_care_entries(id uuid);
grant select on dog_profiles,pet_care_entries to authenticated;
create function pg_temp.baseline(c cases) returns text language plpgsql as $$
declare pred text; q text;
begin
 select string_agg(format('(note ilike %L or title ilike %L)','%'||t||'%','%'||t||'%'),' or ') into pred from unnest(c.terms)t;
 q := format('select id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at,deleted_at from public.pet_care_entries where user_id=%L and pet_profile_id=%L and deleted_at is null and (%s)',auth.uid(),c.pet,pred);
 if c.lo is not null then q:=q||format(' and occurred_at >= %L::timestamptz and occurred_at < %L::timestamptz',c.lo,c.hi); end if;
 if c.ct is not null then q:=q||format(' and (occurred_at > %L::timestamptz or (occurred_at=%L::timestamptz and id>%L::uuid))',c.ct,c.ct,c.ci); end if;
 return q||' order by occurred_at,id limit 25';
end $$;
create function pg_temp.rpc(c cases) returns text language sql as $$
 select format('select * from ask_candidate_experiment.search(%L::uuid,%L::text[],%L::timestamptz,%L::timestamptz,%L::timestamptz,%L::uuid,25)',c.pet,c.terms,c.lo,c.hi,c.ct,c.ci)
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
do $$ declare c cases; a jsonb; b jsonb; begin
 for c in select * from cases loop
   -- Aggregate in output order, NOT re-sorted: detect order and value changes.
   execute 'select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from ('||pg_temp.baseline(c)||')r' into a;
   execute 'select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from ('||pg_temp.rpc(c)||')r' into b;
   if a<>b then raise exception 'Candidate mismatch %',c.label; end if;
 end loop;
 raise notice 'PASS: 14 query cases identical IDs, ordering, all 11 values';
end $$;
do $$ declare seen uuid[]:='{}'; last_time timestamptz; last_id uuid; r record; n int; pages int:=0; begin
 loop
  n:=0;
  for r in select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],null,null,last_time,last_id,25) loop
   if r.id=any(seen) or (last_time is not null and (r.occurred_at,r.id)<=(last_time,last_id)) then raise exception 'Bad cursor'; end if;
   if r.deleted_at is not null or r.user_id<>auth.uid() or r.pet_profile_id<>'93000000-0000-4000-8000-000000000011' then raise exception 'Scope leak'; end if;
   seen:=array_append(seen,r.id);last_time:=r.occurred_at;last_id:=r.id;n:=n+1;
  end loop;
  pages:=pages+1;exit when n=0;
  if pages>4 then raise exception 'Unbounded pagination'; end if;
 end loop;
 if cardinality(seen)<>61 or pages<>4 or seen[1]<>'95000000-0000-4000-8000-000000000061' then raise exception 'Missing old/tied source'; end if;
 raise notice 'PASS: 61 exact sources in 25/25/11/0 pages; deleted source excluded';
end $$;
-- Typed SQL input rejects malformed UUID/timestamps before body execution.
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('bad',array['vomit'])$q$,'22P02');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],'bad','2015-01-01')$q$,'22007');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000013',array['vomit'])$q$,'42501');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000099',array['vomit'])$q$,'42501');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search(null,array['vomit'])$q$,'42501');
do $$ declare terms text[]; lim int; begin
 foreach terms slice 1 in array array[array[''],array['ab'],array['%vomit%'],array['vo_mit'],array['vomit;drop table'],array[repeat('a',33)],array[null::text]] loop
  perform pg_temp.expect_error(format('select * from ask_candidate_experiment.search(%L,%L::text[])','93000000-0000-4000-8000-000000000011',terms),'22023');
 end loop;
 foreach lim in array array[0,26,100000,-1,null::int] loop
  perform pg_temp.expect_error(format('select * from ask_candidate_experiment.search(%L,array[''vomit''],null,null,null,null,%L)','93000000-0000-4000-8000-000000000011',lim),'22023');
 end loop;
end $$;
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',null)$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011','{}')$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array_fill('vomit'::text,array[7]))$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array[['vomit','stool']])$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011','[0:0]={vomit}')$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],'2015-01-01',null)$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],'2015-01-01','2014-01-01')$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],'-infinity','infinity')$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,'2014-01-01',null)$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,null,'95000000-0000-4000-8000-000000000061')$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],'2014-01-01','2015-01-01','2015-01-01','95000000-0000-4000-8000-000000000061')$q$,'22023');
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,'infinity','95000000-0000-4000-8000-000000000061')$q$,'22023');
do $$ begin
 if (select count(*) from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up','stool','weight','rice'],null,null,null,null,1))<>1 then raise exception 'Valid bounds rejected'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'42501');
reset role;
-- Transfer only a fixture pet inside this rollback transaction. Old care owner
-- remains unchanged: neither owner may gain foreign/stale-owner candidate rows.
update public.dog_profiles set user_id='93000000-0000-4000-8000-000000000002' where id='93000000-0000-4000-8000-000000000012';
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select * from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000012',array['grooming'])$q$,'42501');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000012',array['grooming'])) then raise exception 'Transfer leaked stale-owner data'; end if;
 if (select count(*) from ask_candidate_experiment.search('93000000-0000-4000-8000-000000000013',array['vomit']))<>25 then raise exception 'Second owner positive control'; end if;
 raise notice 'PASS: authentication/grants/parameters/current ownership controls';
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.dog_profiles set user_id='93000000-0000-4000-8000-000000000001' where id='93000000-0000-4000-8000-000000000012';
-- Session-only nested plan instrumentation. Acceptance has no planner overrides.
load 'auto_explain';
set local auto_explain.log_min_duration=0;
set local auto_explain.log_analyze=on;
set local auto_explain.log_buffers=on;
set local auto_explain.log_nested_statements=on;
set local auto_explain.log_format=json;
set local auto_explain.log_level=notice;
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
do $$ declare c cases; iteration int; path text; statement text; plan json; label text; begin
 for c in select * from cases order by label loop
  for iteration in 1..3 loop
   -- Alternate order to reduce consistent first-path warmup advantage.
   foreach path in array case when iteration%2=1 then array['baseline','rpc'] else array['rpc','baseline'] end loop
    label:=c.label||'_'||path||'_'||iteration;
    statement:=case when path='baseline' then pg_temp.baseline(c) else pg_temp.rpc(c) end;
    raise notice 'CASE_BEGIN %',label;
    execute 'explain (analyze,buffers,format json) '||statement into plan;
    raise notice 'OUTER %: %',label,plan;
    raise notice 'CASE_END %',label;
   end loop;
  end loop;
 end loop;
end $$;
reset role;
set local auto_explain.log_min_duration=-1;
select indexrelname,idx_scan from pg_stat_user_indexes where relname='pet_care_entries' and indexrelname like 'care_history%';
select attname,n_distinct,most_common_freqs from pg_stats where schemaname='public' and tablename='pet_care_entries' and attname in ('user_id','pet_profile_id','note');
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.pet_care_entries'::regclass and tgname='pet_care_entries_apply_current_state' and tgenabled='O') then raise exception 'Trigger disabled'; end if;
end $$;
rollback;
