-- Disposable LOCAL PostgreSQL only. Real RLS, indexes and query execution.
-- All synthetic rows, temporary functions and statistics changes roll back.
\timing on
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('83000000-0000-4000-8000-000000000001','authenticated','authenticated','scale@example.test',now(),now());
insert into public.dog_profiles(id,user_id,name,species) values
 ('83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000001','Synthetic Milo','dog');
-- This is a retrieval benchmark, not an ingestion benchmark. The unrelated
-- state projection walks a growing source-ID array on every insert. Bypass it
-- only while loading synthetic rows in this disposable transaction; restore it
-- before every assertion/read. RLS, constraints and all other triggers remain.
alter table public.pet_care_entries disable trigger pet_care_entries_apply_current_state;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('84000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011',
 'grooming','Synthetic routine grooming, no clinical update.', '2026-01-01'::timestamptz + i * interval '1 minute'
 from generate_series(1,100000) i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('85000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011',
 'symptom','Synthetic vomiting note.', '2014-07-09'::timestamptz from generate_series(1,60) i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at) values
 ('85000000-0000-4000-8000-000000000061','83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011','symptom','Synthetic decisive 2011 soft-stool note, not vomiting.','2011-02-01');
alter table public.pet_care_entries enable trigger pet_care_entries_apply_current_state;
analyze public.pet_care_entries;
analyze public.dog_profiles;

select c.relname,c.relpages,c.reltuples,i.indisvalid,i.indisready from pg_class c join pg_index i on i.indexrelid=c.oid where i.indrelid='public.pet_care_entries'::regclass and c.relname like 'care_history%';
select attname,n_distinct,most_common_freqs from pg_stats where tablename='pet_care_entries' and attname in ('note','title','user_id','pet_profile_id');
create function pg_temp.capture_plan(label text, statement text) returns void language plpgsql as $f$
declare plan json; begin execute 'explain (analyze,buffers,format json) ' || statement into plan; raise notice 'PROBE %: %',label,plan; end $f$;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.capture_plan('rls_ordered', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and (note ilike '%vomit%' or title ilike '%vomit%') order by occurred_at,id limit 25$q$);
select pg_temp.capture_plan('rls_unordered_single_term', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and note ilike '%vomit%'$q$);
set local enable_seqscan=off;
set local enable_indexscan=off;
select pg_temp.capture_plan('rls_diagnostic_bitmap', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and (note ilike '%vomit%' or title ilike '%vomit%') order by occurred_at,id limit 25$q$);
reset enable_seqscan;
reset enable_indexscan;
reset role;
select pg_temp.capture_plan('bypass_six_or', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and (note ilike '%vomit%' or title ilike '%vomit%' or note ilike '%threw up%' or title ilike '%threw up%' or note ilike '%thrown up%' or title ilike '%thrown up%') order by occurred_at,id limit 25$q$);
select pg_temp.capture_plan('bypass_unordered_single_term', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and note ilike '%vomit%'$q$);
select pg_temp.capture_plan('bypass_diagnostic_same_query', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and (note ilike '%vomit%' or title ilike '%vomit%') order by occurred_at,id limit 25$q$);
select pg_temp.capture_plan('bypass_any_pattern', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and (note ilike any(array['%vomit%','%threw up%','%thrown up%']) or title ilike any(array['%vomit%','%threw up%','%thrown up%'])) order by occurred_at,id limit 25$q$);
set local role authenticated;
select pg_temp.capture_plan('rls_any_pattern', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and (note ilike any(array['%vomit%','%threw up%','%thrown up%']) or title ilike any(array['%vomit%','%threw up%','%thrown up%'])) order by occurred_at,id limit 25$q$);
reset role;
set local enable_incremental_sort=off;
select pg_temp.capture_plan('bypass_no_incremental_diagnostic', $q$select id,note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and (note ilike '%vomit%' or title ilike '%vomit%') order by occurred_at,id limit 25$q$);
reset enable_incremental_sort;
-- Repeat the exact returned column shape with default settings. Privileged
-- comparisons below are diagnostics ONLY, not an application read path.
do $f$
declare role_name text; term_name text; predicate text; iteration int; statement text;
begin
  foreach role_name in array array['authenticated','postgres'] loop
    execute format('set local role %I',role_name);
    foreach term_name in array array['selective','no_match','common'] loop
      predicate := case term_name
        when 'selective' then '(note ilike ''%vomit%'' or title ilike ''%vomit%'' or note ilike ''%threw up%'' or title ilike ''%threw up%'' or note ilike ''%thrown up%'' or title ilike ''%thrown up%'')'
        when 'no_match' then '(note ilike ''%unfindablemarker%'' or title ilike ''%unfindablemarker%'')'
        else '(note ilike ''%grooming%'' or title ilike ''%grooming%'')' end;
      statement := 'select id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at,deleted_at from public.pet_care_entries where user_id=''83000000-0000-4000-8000-000000000001'' and pet_profile_id=''83000000-0000-4000-8000-000000000011'' and deleted_at is null and ' || predicate || ' order by occurred_at,id limit 25';
      for iteration in 1..3 loop
        perform pg_temp.capture_plan(role_name || '_' || term_name || '_' || iteration,statement);
      end loop;
    end loop;
    execute 'reset role';
  end loop;
end $f$;
-- Isolation controls added AFTER comparable single-pet measurements.
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('83000000-0000-4000-8000-000000000002','authenticated','authenticated','other-scale@example.test',now(),now());
insert into public.dog_profiles(id,user_id,name,species) values
 ('83000000-0000-4000-8000-000000000012','83000000-0000-4000-8000-000000000001','Synthetic Luna','cat'),
 ('83000000-0000-4000-8000-000000000013','83000000-0000-4000-8000-000000000002','Synthetic outsider','dog');
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at) values
 ('85000000-0000-4000-8000-000000000062','83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000012','symptom','Synthetic vomiting other pet','2011-02-01'),
 ('85000000-0000-4000-8000-000000000063','83000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000013','symptom','Synthetic vomiting other owner','2011-02-01');
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $f$
declare seen uuid[] := '{}'; page_ids uuid[]; last_time timestamptz; last_id uuid; item record; pages int := 0;
begin
  loop
    page_ids := '{}';
    for item in select id,occurred_at from public.pet_care_entries
      where user_id='83000000-0000-4000-8000-000000000001'
        and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null
        and (note ilike '%vomit%' or title ilike '%vomit%')
        and (last_time is null or occurred_at > last_time or (occurred_at=last_time and id>last_id))
      order by occurred_at,id limit 25
    loop
      if item.id=any(seen) then raise exception 'duplicate cursor row'; end if;
      seen := array_append(seen,item.id); page_ids := array_append(page_ids,item.id);
      last_time := item.occurred_at; last_id := item.id;
    end loop;
    pages := pages+1;
    exit when cardinality(page_ids)=0;
    if pages>4 then raise exception 'unexpected pagination size'; end if;
  end loop;
  if cardinality(seen)<>61 or pages<>4 then raise exception 'missing rows: %, pages %',cardinality(seen),pages; end if;
  if exists(select 1 from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000002') then raise exception 'cross-owner leak'; end if;
  if (select count(*) from public.pet_care_entries where pet_profile_id='83000000-0000-4000-8000-000000000012' and note ilike '%vomit%')<>1 then raise exception 'second pet control'; end if;
  if not exists(select 1 from public.pet_care_entries where id=seen[1] and occurred_at='2011-02-01') then raise exception 'lost old decisive source'; end if;
  raise notice 'ASSERTIONS passed: 61 rows / 4 pages, 60 tied timestamps, old 2011 source, second pet, cross-owner exclusion';
end $f$;
reset role;
do $f$ begin
  if not exists(select 1 from pg_trigger where tgrelid='public.pet_care_entries'::regclass and tgname='pet_care_entries_apply_current_state' and tgenabled='O') then raise exception 'projection trigger not restored'; end if;
end $f$;
rollback;
