-- UNEXECUTED. Supervisor: apply draft, then psql -X -v ON_ERROR_STOP=1 -f this-file.
-- Fixtures, authority switches and mutations are all rollback-only.
begin;
set local statement_timeout='8s';
create function pg_temp.assert_recorded(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
insert into auth.users(id) values ('92000000-0000-4000-8000-000000000001'),('92000000-0000-4000-8000-000000000002');
insert into public.dog_profiles(id,user_id,name,species) values
 ('92000000-0000-4000-8000-000000000011','92000000-0000-4000-8000-000000000001','Milo','dog'),
 ('92000000-0000-4000-8000-000000000012','92000000-0000-4000-8000-000000000001','Bruno','dog'),
 ('92000000-0000-4000-8000-000000000021','92000000-0000-4000-8000-000000000002','Private','dog');
insert into public.pet_care_episodes(id,user_id,pet_profile_id,episode_type,normalized_key,title,status,severity,sequence_number,started_at,last_event_at)
select ('92000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,'92000000-0000-4000-8000-000000000001',
 '92000000-0000-4000-8000-000000000011','symptom','vomiting','Vomiting','resolved','routine',100+n,
 '2011-01-01'::timestamptz+(n-1)*interval '1 month','2011-01-01'::timestamptz+(n-1)*interval '1 month'
from generate_series(1,12) n;
insert into public.pet_care_entries(id,user_id,pet_profile_id,episode_id,category,note,occurred_at,care_event_metadata)
select ('92000000-0000-4000-8002-'||lpad(n::text,12,'0'))::uuid,'92000000-0000-4000-8000-000000000001',
 '92000000-0000-4000-8000-000000000011',('92000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,
 'symptom','Milo had a new vomiting episode.','2011-01-01'::timestamptz+(n-1)*interval '1 month','{"canonicalConceptKey":"vomiting"}'
from generate_series(1,12) n;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
create function pg_temp.inventory() returns jsonb language sql stable as $$
 select public.read_ask_episode_sources('92000000-0000-4000-8000-000000000011',array['vomiting','vomit']); $$;
set local role authenticated;
do $$ declare r jsonb:=pg_temp.inventory(); p jsonb; begin
 perform pg_temp.assert_recorded(r#>'{recorded_inventory,failures}'='[]','positive census has no SQL omissions');
 perform pg_temp.assert_recorded(r#>>'{recorded_inventory,episodeCount}'='12','full 12 group aggregate input');
 perform pg_temp.assert_recorded(jsonb_array_length(r->'episodes')=12 and jsonb_array_length(r->'memberships')=12,'full members beyond display page');
 perform pg_temp.assert_recorded(jsonb_array_length(r#>'{recorded_inventory,careIds}')=12,'complete source census');
 perform pg_temp.assert_recorded(r#>>'{episodes,0,sequence_number}'='101','sequence is not display ordinal');
 p:=public.read_ask_episode_sources('92000000-0000-4000-8000-000000000011',array['vomiting','vomit'],null,'2011-01-01','2011-04-01');
 perform pg_temp.assert_recorded(p#>>'{recorded_inventory,episodeCount}'='3' and jsonb_array_length(p->'episodes')=3 and jsonb_array_length(p#>'{recorded_inventory,careIds}')=3,'period aggregate and sources share scope');
 perform pg_temp.assert_recorded(p#>>'{recorded_inventory,revision}'=r#>>'{recorded_inventory,revision}','same transaction inventory revision');
 perform pg_temp.assert_recorded(jsonb_array_length(public.read_ask_episode_sources('92000000-0000-4000-8000-000000000012',array['vomiting'])->'episodes')=0,'other pet excluded');
 begin
  perform public.read_ask_episode_sources('92000000-0000-4000-8000-000000000021',array['vomiting']);
  raise exception 'foreign owner accepted';
 exception when insufficient_privilege then null; end;
 perform pg_temp.assert_recorded(public.read_ask_episode_sources('92000000-0000-4000-8000-000000000011',array['breathing'])#>'{recorded_inventory,failures}' <> '[]','other concept cannot classify vomiting sources');
end $$;
reset role;
create temp table recorded_before as select pg_temp.inventory() as payload;
savepoint new_source;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
values('92000000-0000-4000-8002-000000000099','92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000011','general','Unclassified observation','2011-01-01');
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'<>'[]','new unclassified source blocks exact');
select pg_temp.assert_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'<>(select payload#>>'{recorded_inventory,revision}' from recorded_before),'source write advances revision');
rollback to new_source;
select pg_temp.assert_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'=(select payload#>>'{recorded_inventory,revision}' from recorded_before),'aborted writer restores transactional revision');
-- Data-modifying CTE and STABLE reader share one MVCC statement snapshot:
-- the change is applied, but the census and revision must BOTH see the pre-write
-- inventory. The next statement must observe the advanced revision.
savepoint snapshot_consistency;
with changed as (
 update public.pet_care_entries set note='Snapshot concurrent correction'
 where id='92000000-0000-4000-8002-000000000001' returning id
)
select pg_temp.assert_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'=
 (select payload#>>'{recorded_inventory,revision}' from recorded_before) and
 (pg_temp.inventory()->'sources') @> '[{"id":"92000000-0000-4000-8002-000000000001","note":"Milo had a new vomiting episode."}]'::jsonb,
 'stable reader cannot mix new revision with old source snapshot') from changed;
select pg_temp.assert_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'<>
 (select payload#>>'{recorded_inventory,revision}' from recorded_before),'next statement observes transactional invalidation');
rollback to snapshot_consistency;
savepoint correction;
update public.pet_care_entries set note='Correction: no episode.' where id='92000000-0000-4000-8002-000000000001';
select pg_temp.assert_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'<>(select payload#>>'{recorded_inventory,revision}' from recorded_before),'correction invalidates prior callback snapshot');
-- Semantic rejection of this raw changed note is tested by the actual callback.
update public.pet_care_entries set state_action_type='semantic_corrected' where id='92000000-0000-4000-8002-000000000001';
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'<>'[]','structured native correction cannot certify an opening');
rollback to correction;
savepoint deleted;
update public.pet_care_entries set deleted_at=now(), deletion_reason='synthetic validation removal' where id='92000000-0000-4000-8002-000000000001';
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'<>'[]','soft deletion fails closed');
rollback to deleted;
savepoint hard_deleted;
delete from public.pet_care_entries where id='92000000-0000-4000-8002-000000000001';
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}' @> '["retained_removal_debt"]','hard delete leaves removal debt');
rollback to hard_deleted;
savepoint imported;
select * from public.import_legacy_semantic_claims_v2('92000000-0000-4000-8000-000000000001','pet_care_entries',array['92000000-0000-4000-8002-000000000001']::uuid[]);
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}' @> '["import_frontier_gap"]','partial import cannot certify full inventory');
select * from public.import_legacy_semantic_claims_v2('92000000-0000-4000-8000-000000000001','pet_care_entries',null);
insert into public.pet_care_episode_events(claim_id,episode_id,user_id,pet_profile_id,event_ordinal,event_role,occurred_at)
select l.claim_id,e.episode_id,e.user_id,e.pet_profile_id,2,'opening',e.occurred_at
from public.semantic_claim_legacy_lineage l join public.pet_care_entries e on e.id=l.legacy_row_id
where l.user_id='92000000-0000-4000-8000-000000000001' and l.legacy_table='pet_care_entries';
select pg_temp.inventory()#>'{recorded_inventory,failures}' as import_failures;
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'='[]','full import retains raw care and claim census for lineage deduplication');
select pg_temp.assert_recorded(jsonb_array_length(pg_temp.inventory()->'claims')=12,'all imported claims retained');
savepoint forgotten;
update public.semantic_claims set knowledge_status='forgotten' where id=(select claim_id from public.semantic_claim_legacy_lineage where legacy_row_id='92000000-0000-4000-8002-000000000001');
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'<>'[]','forget fails closed');
rollback to forgotten;
update public.pet_care_entries set note='Changed after import' where id='92000000-0000-4000-8002-000000000001';
select pg_temp.assert_recorded(exists(select 1 from jsonb_array_elements(pg_temp.inventory()->'memberships') m where m->>'source_issue'='legacy_source_changed_or_missing'),'actual import hash mismatch preserved');
rollback to imported;
savepoint overflow;
insert into public.pet_care_episodes(user_id,pet_profile_id,episode_type,normalized_key,title,status,severity,sequence_number,started_at,last_event_at)
select '92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000011','symptom','vomiting','Vomiting','resolved','routine',200+n,'2012-01-01','2012-01-01' from generate_series(1,21) n;
select pg_temp.assert_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}' @> '["episode_overflow"]','33rd group overflows without exact aggregate');
rollback to overflow;
select pg_temp.assert_recorded(not has_function_privilege('authenticated','public.read_ask_recorded_membership_batch(uuid,text[],uuid[],timestamptz,timestamptz)','execute'),'private batch inaccessible');
select pg_temp.assert_recorded(not has_function_privilege('service_role','public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)','execute'),'no application service fallback');
select pg_temp.assert_recorded(not has_table_privilege('authenticated','public.ask_recorded_inventory_revision','update'),'client cannot mint revision');
select pg_temp.assert_recorded(not has_table_privilege('authenticated','public.semantic_claims','select'),'claim RLS/grants unchanged');
select pg_temp.assert_recorded((select proconfig @> array['search_path=pg_catalog'] from pg_proc where oid='public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)'::regprocedure),'fixed search path');
do $$ declare t text; begin
 foreach t in array array['dog_profiles','pet_care_entries','pet_care_episodes','pet_care_episode_events','semantic_claims','semantic_claim_relations','semantic_claim_legacy_lineage','ask_history_removed_relation_targets','semantic_concepts','semantic_concept_aliases','ask_conversation_messages','ask_conversations','furvise_memories','dog_memories'] loop
  perform pg_temp.assert_recorded(exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgname='ask_recorded_revision' and tgenabled='O'),'writer revision trigger: '||t);
 end loop;
end $$;
rollback;
