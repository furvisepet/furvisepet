\set ON_ERROR_STOP on
\timing on
-- Run as local supabase_admin only in stage2_validation. Refuse name collisions.
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
do $$ begin
  if current_database()<>'stage2_validation' then raise exception 'Wrong database'; end if;
  if exists(select 1 from auth.users where id::text like '93000000-%') then raise exception 'Fixture collision'; end if;
end $$;
create role ask_candidate_experiment_reader nologin noinherit nosuperuser nocreatedb nocreaterole bypassrls;
create schema ask_candidate_experiment authorization postgres;
revoke all on schema ask_candidate_experiment from public;
grant usage on schema public,auth,ask_candidate_experiment to ask_candidate_experiment_reader;
grant select on public.dog_profiles,public.pet_care_entries to ask_candidate_experiment_reader;
grant execute on function auth.uid() to ask_candidate_experiment_reader;
grant usage on schema ask_candidate_experiment to authenticated;
grant create on schema ask_candidate_experiment to ask_candidate_experiment_reader;
\ir function.sql
revoke create on schema ask_candidate_experiment from ask_candidate_experiment_reader;
insert into auth.users(id,aud,role,email,created_at,updated_at)
 select ('93000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'authenticated','authenticated','rpc-synthetic-'||i||'@example.test',now(),now() from generate_series(1,3)i;
insert into public.dog_profiles(id,user_id,name,species) values
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','Synthetic Milo','dog'),
 ('93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000001','Synthetic Luna','cat'),
 ('93000000-0000-4000-8000-000000000013','93000000-0000-4000-8000-000000000002','Synthetic Bruno','dog'),
 ('93000000-0000-4000-8000-000000000014','93000000-0000-4000-8000-000000000003','Synthetic Oscar','dog');
-- Transactional setup only. Restore before COMMIT and every measured read.
alter table public.pet_care_entries disable trigger pet_care_entries_apply_current_state;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,severity,occurred_at)
 select ('94000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 case when i<=125000 then '93000000-0000-4000-8000-000000000001'::uuid when i<=200000 then '93000000-0000-4000-8000-000000000002'::uuid else '93000000-0000-4000-8000-000000000003'::uuid end,
 case when i<=100000 then '93000000-0000-4000-8000-000000000011'::uuid when i<=125000 then '93000000-0000-4000-8000-000000000012'::uuid when i<=200000 then '93000000-0000-4000-8000-000000000013'::uuid else '93000000-0000-4000-8000-000000000014'::uuid end,
 'grooming',case when i%10=0 then 'Synthetic routine' else null end,
 case when i<=125000 then 'Synthetic routine grooming, no clinical update.' else 'Synthetic other owner vomiting and grooming.' end,
 null,'2026-01-01'::timestamptz+i*interval '1 minute' from generate_series(1,250000)i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,severity,occurred_at)
 select ('95000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011',
 'symptom',case when i%3=0 then 'Synthetic thrown up' else 'Synthetic historical note' end,
 case when i%3=0 then 'Synthetic qualified observation: uncertain cause; 2.5 ml.' when i%3=1 then 'Synthetic vomiting note: not confirmed; 27.8 kg.' else 'Synthetic threw up note.' end,
 'mild','2014-07-09'::timestamptz from generate_series(1,60)i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at,deleted_at,deletion_reason) values
 ('95000000-0000-4000-8000-000000000061','93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','symptom','Synthetic decisive 2011','Synthetic stool note: not vomiting, 28.4 kg.','2011-02-01',null,null),
 ('95000000-0000-4000-8000-000000000062','93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','symptom','Synthetic deleted vomiting','Synthetic deleted vomiting.','2010-02-01',now(),'Synthetic deletion control');
alter table public.pet_care_entries enable trigger pet_care_entries_apply_current_state;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.pet_care_entries'::regclass and tgname='pet_care_entries_apply_current_state' and tgenabled='O') then raise exception 'Trigger disabled'; end if;
end $$;
commit;
-- Maintained existing indexes, no planner overrides or new search indexes.
vacuum (analyze) public.pet_care_entries;
vacuum (analyze) public.dog_profiles;
