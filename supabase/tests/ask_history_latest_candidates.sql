-- Actual production RPC; run after the migration as local postgres.
\set ON_ERROR_STOP on
\timing on
begin;
set local statement_timeout='8s';
set local lock_timeout='5s';
insert into auth.users(id,aud,role,email,created_at,updated_at)
 select ('93000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'authenticated','authenticated','integration-fixture-'||i||'@example.test',now(),now() from generate_series(1,2)i;
insert into public.dog_profiles(id,user_id,name,species) values
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','Synthetic Milo','dog'),
 ('93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000001','Synthetic Luna','cat'),
 ('93000000-0000-4000-8000-000000000013','93000000-0000-4000-8000-000000000002','Synthetic Bruno','dog');
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,severity,occurred_at)
 select ('95000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','symptom',
 case when i%3=0 then 'Synthetic thrown up' else null end,
 case when i%3=0 then 'Synthetic qualified observation: uncertain cause; 2.5 ml.' else 'Synthetic vomiting: not confirmed; 27.8 kg.' end,
 'mild','2014-07-09'::timestamptz from generate_series(1,60)i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at,deleted_at,deletion_reason) values
 ('95000000-0000-4000-8000-000000000061','93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','symptom','Synthetic decisive 2011','Synthetic stool note: not vomiting, 28.4 kg.','2011-02-01',null,null),
 ('95000000-0000-4000-8000-000000000062','93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','symptom','Deleted','Synthetic vomiting','2010-01-01',now(),'Synthetic control');
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('94000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 case when i<=25 then '93000000-0000-4000-8000-000000000001'::uuid else '93000000-0000-4000-8000-000000000002'::uuid end,
 case when i<=25 then '93000000-0000-4000-8000-000000000012'::uuid else '93000000-0000-4000-8000-000000000013'::uuid end,
 'grooming','Synthetic grooming and vomiting.','2026-01-01'::timestamptz+i*interval '1 minute' from generate_series(1,50)i;
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
 if c.ct is not null then q:=q||format(' and (occurred_at < %L::timestamptz or (occurred_at=%L::timestamptz and id<%L::uuid))',c.ct,c.ct,c.ci); end if;
 return q||' order by occurred_at desc,id desc limit 25';
end $$;
create function pg_temp.rpc(c cases) returns text language sql as $$
 select format('select * from public.read_ask_history_candidates_latest(%L::uuid,%L::text[],%L::timestamptz,%L::timestamptz,%L::timestamptz,%L::uuid,25)',c.pet,c.terms,c.lo,c.hi,c.ct,c.ci)
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
  for r in select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up'],null,null,last_time,last_id,25) loop
   if r.id=any(seen) or (last_time is not null and (r.occurred_at,r.id)>=(last_time,last_id)) then raise exception 'Bad cursor'; end if;
   if r.deleted_at is not null or r.user_id<>auth.uid() or r.pet_profile_id<>'93000000-0000-4000-8000-000000000011' then raise exception 'Scope leak'; end if;
   seen:=array_append(seen,r.id);last_time:=r.occurred_at;last_id:=r.id;n:=n+1;
  end loop;
  pages:=pages+1;exit when n=0;
  if pages>4 then raise exception 'Unbounded pagination'; end if;
 end loop;
 if cardinality(seen)<>61 or pages<>4 or seen[1]<>'95000000-0000-4000-8000-000000000060' or seen[61]<>'95000000-0000-4000-8000-000000000061' then raise exception 'Missing old/tied source'; end if;
 raise notice 'PASS: 61 exact sources in 25/25/11/0 pages; deleted source excluded';
end $$;
-- The reported shape: old matching history, a newer match, then enough recent
-- unrelated same-pet notes to hide it from ordinary current-context loading.
reset role;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('97000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011',
 'symptom','Synthetic vomiting after breakfast.','2011-01-01'::timestamptz+i*interval '1 day' from generate_series(1,90)i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('98000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011',
 'general','Synthetic walking note.','2026-01-01'::timestamptz+i*interval '1 day' from generate_series(1,100)i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at) values
 ('96000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000011','symptom','Synthetic vomiting in January 2025.','2025-01-01');
set local role authenticated;
do $$ begin
 if (select id from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,null,null,1))
    is distinct from '96000000-0000-4000-8000-000000000001'::uuid then raise exception 'Buried latest match lost'; end if;
end $$;
reset role;
update public.pet_care_entries set pet_profile_id='93000000-0000-4000-8000-000000000012' where id='96000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit']) where id='96000000-0000-4000-8000-000000000001')
 or (select id from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000012',array['vomit'],'2025-01-01','2026-01-01',null,null,1))
    is distinct from '96000000-0000-4000-8000-000000000001'::uuid then raise exception 'Reassigned latest isolation'; end if;
end $$;
reset role;
update public.pet_care_entries set pet_profile_id='93000000-0000-4000-8000-000000000011',occurred_at='2009-01-01' where id='96000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if (select occurred_at from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,null,null,1))
    is distinct from '2014-07-09'::timestamptz then raise exception 'Changed date ignored'; end if;
end $$;
reset role;
update public.pet_care_entries set occurred_at='2025-01-01',deleted_at=now(),deletion_reason='Synthetic deletion' where id='96000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if (select occurred_at from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,null,null,1))
    is distinct from '2014-07-09'::timestamptz then raise exception 'Deleted latest returned'; end if;
 raise notice 'PASS: buried latest, changed event dates, reassignment and deletion';
end $$;
-- Typed SQL input rejects malformed UUID/timestamps before body execution.
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('bad',array['vomit'])$q$,'22P02');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],'bad','2015-01-01')$q$,'22007');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000013',array['vomit'])$q$,'42501');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000099',array['vomit'])$q$,'42501');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest(null,array['vomit'])$q$,'42501');
do $$ declare terms text[]; lim int; begin
 foreach terms slice 1 in array array[array[''],array['ab'],array['%vomit%'],array['vo_mit'],array['vomit;drop table'],array[repeat('a',33)],array[null::text]] loop
  perform pg_temp.expect_error(format('select * from public.read_ask_history_candidates_latest(%L,%L::text[])','93000000-0000-4000-8000-000000000011',terms),'22023');
 end loop;
 foreach lim in array array[0,26,100000,-1,null::int] loop
  perform pg_temp.expect_error(format('select * from public.read_ask_history_candidates_latest(%L,array[''vomit''],null,null,null,null,%L)','93000000-0000-4000-8000-000000000011',lim),'22023');
 end loop;
end $$;
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',null)$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011','{}')$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array_fill('vomit'::text,array[7]))$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array[['vomit','stool']])$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011','[0:0]={vomit}')$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],'2015-01-01',null)$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],'2015-01-01','2014-01-01')$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],'-infinity','infinity')$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,'2014-01-01',null)$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,null,'95000000-0000-4000-8000-000000000061')$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],'2014-01-01','2015-01-01','2015-01-01','95000000-0000-4000-8000-000000000061')$q$,'22023');
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'],null,null,'infinity','95000000-0000-4000-8000-000000000061')$q$,'22023');
do $$ begin
 if (select count(*) from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit','threw up','thrown up','stool','weight','rice'],null,null,null,null,1))<>1 then raise exception 'Valid bounds rejected'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'42501');
reset role;
-- Transfer only a fixture pet inside this rollback transaction. Old care owner
-- remains unchanged: neither owner may gain foreign/stale-owner candidate rows.
update public.dog_profiles set user_id='93000000-0000-4000-8000-000000000002' where id='93000000-0000-4000-8000-000000000012';
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000012',array['grooming'])$q$,'42501');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000012',array['grooming'])) then raise exception 'Transfer leaked stale-owner data'; end if;
 if (select count(*) from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000013',array['vomit']))<>25 then raise exception 'Second owner positive control'; end if;
 raise notice 'PASS: authentication/grants/parameters/current ownership controls';
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.dog_profiles set user_id='93000000-0000-4000-8000-000000000001' where id='93000000-0000-4000-8000-000000000012';

set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.ask_history_request_owner()$q$,'42501');
set local statement_timeout='0';
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'55000');
set local statement_timeout='9s';
select pg_temp.expect_error($q$select * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array['vomit'])$q$,'55000');
set local statement_timeout='8s';
reset role;
set local role authenticated;
do $$ declare term text; begin
 foreach term in array array['vomit','threw up','thrown up','stool','diarrh','weight','weigh','food','rice','diet','litter','medication','stiff','urine','urinalysis','blood','diagnos'] loop
  perform * from public.read_ask_history_candidates_latest('93000000-0000-4000-8000-000000000011',array[term]);
 end loop;
 raise notice 'PASS: every current planner term accepted by actual RPC';
end $$;
reset role;
do $$ declare fn regprocedure := 'public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)'::regprocedure; begin
 if (select proowner::regrole::text from pg_proc where oid=fn)<>'ask_history_candidate_reader' then raise exception 'Wrong function owner'; end if;
 if not has_function_privilege('authenticated',fn,'EXECUTE') or has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'Wrong grants'; end if;
 if has_schema_privilege('ask_history_candidate_reader','auth','USAGE') or has_schema_privilege('ask_history_candidate_reader','public','CREATE') then raise exception 'Excess schema privilege'; end if;
 if has_table_privilege('ask_history_candidate_reader','public.pet_care_entries','INSERT,UPDATE,DELETE') or has_table_privilege('ask_history_candidate_reader','public.semantic_claims','SELECT') then raise exception 'Excess data privilege'; end if;
 if exists(select 1 from pg_roles where rolname='ask_history_candidate_reader' and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or not rolbypassrls)) then raise exception 'Role attributes'; end if;
 if not exists(select 1 from pg_proc where oid='public.ask_history_request_owner()'::regprocedure and not prosecdef and prosqlbody is not null) then raise exception 'Identity helper must be parsed and INVOKER'; end if;
 raise notice 'PASS: production owner, grants, invoker identity, bounded-timeout prerequisite';
end $$;
rollback;
