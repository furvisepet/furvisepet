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
-- projection triggers are bypassed only during bulk fixture loading in this
-- disposable transaction. Restore all before assertions. Foreign keys, other
-- constraints and RLS remain. Real writer behavior is tested separately by
-- ask_century_census.sql; this fixture makes no ingestion-throughput claim.
alter table public.pet_care_entries disable trigger user;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('84000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011',
 'grooming','Synthetic routine grooming, no clinical update.', '1926-01-02'::timestamptz + i * interval '8 hours'
 from generate_series(1,100000) i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('85000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011',
 'symptom','Synthetic vomiting note.', '1976-07-09'::timestamptz from generate_series(1,60) i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at) values
 ('85000000-0000-4000-8000-000000000061','83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011','symptom','Synthetic decisive 1926 soft-stool note, not vomiting.','1926-01-01');
alter table public.pet_care_entries enable trigger user;
analyze public.pet_care_entries;
analyze public.dog_profiles;
set local statement_timeout='8s';
do $$ begin if exists(select 1 from pg_trigger where tgrelid='public.pet_care_entries'::regclass and tgenabled='D') then raise exception 'disabled trigger'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
do $$ declare direction text; reader text; last_time timestamptz; last_id uuid; item record; seen uuid[]; n int; pages int; begin
 foreach direction in array array['ascending','descending'] loop
  reader:=case when direction='ascending' then 'read_ask_history_candidates' else 'read_ask_history_candidates_latest' end;
  last_time:=null;last_id:=null;seen:='{}';pages:=0;
  loop
   n:=0; pages:=pages+1;
   for item in execute format('select * from public.%I($1,$2,null,null,$3,$4,25)',reader)
     using '83000000-0000-4000-8000-000000000011'::uuid,array['vomit'],last_time,last_id
   loop
    if item.id=any(seen) then raise exception 'duplicate %',direction; end if;
    if item.user_id<>auth.uid() or item.pet_profile_id<>'83000000-0000-4000-8000-000000000011'::uuid or item.deleted_at is not null then raise exception 'scope leak'; end if;
    if last_time is not null and ((direction='ascending' and (item.occurred_at,item.id)<=(last_time,last_id)) or (direction='descending' and (item.occurred_at,item.id)>=(last_time,last_id))) then raise exception 'bad ordering'; end if;
    seen:=array_append(seen,item.id);last_time:=item.occurred_at;last_id:=item.id;n:=n+1;
   end loop;
   exit when n=0;
   if pages>4 then raise exception 'unbounded pagination'; end if;
  end loop;
  if cardinality(seen)<>61 or pages<>4 then raise exception 'missing historical sources'; end if;
  if (direction='ascending' and seen[1]<>'85000000-0000-4000-8000-000000000061'::uuid)
    or (direction='descending' and seen[61]<>'85000000-0000-4000-8000-000000000061'::uuid) then raise exception 'century-old decisive source lost'; end if;
 end loop;
 if (select note from public.read_ask_history_candidates('83000000-0000-4000-8000-000000000011',array['stool'],'1926-01-01','1927-01-01')) is distinct from 'Synthetic decisive 1926 soft-stool note, not vomiting.' then raise exception 'old source changed'; end if;
 if exists(select 1 from public.read_ask_history_candidates_latest('83000000-0000-4000-8000-000000000011',array['unfindable'])) then raise exception 'invented no-match'; end if;
end $$;
rollback;
