-- UNEXECUTED SQL PREPARATION. Disposable database only; everything rolls back.
-- Apply ask_governed_freeform.sql then revised ask_recorded_completeness.sql first.
begin;
set local statement_timeout='8s';
create function pg_temp.check_recorded(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',label; end if; end $$;
insert into auth.users(id) values('93000000-0000-4000-8000-000000000001'),('93000000-0000-4000-8000-000000000002');
insert into public.dog_profiles(id,user_id,name,species) values
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','Milo','dog'),
 ('93000000-0000-4000-8000-000000000021','93000000-0000-4000-8000-000000000002','Other','dog'),
 ('93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000001','Bruno','dog');
insert into public.ask_conversations(id,user_id,pet_profile_id,title) values
 ('93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','Freeform validation');
insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text) values
 ('93000000-0000-4000-8000-000000000041','93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000001','user',1,'Milo started vomiting after breakfast and threw up on the kitchen rug.'),
 ('93000000-0000-4000-8000-000000000042','93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000001','user',2,'Milo continued vomiting this afternoon after drinking water.'),
 ('93000000-0000-4000-8000-000000000043','93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000001','user',3,'Milo started limping after our walk around the park.');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','service_role',true);
create function pg_temp.event_payload(msg_id uuid,topic text,transition text,prior uuid default null) returns jsonb language sql stable as $$
 select jsonb_build_object('subject',jsonb_build_object('type','pet','name','Milo'),
 'domain','health','topic',topic,'eventTitle','Observed health change','transition',transition,'state','active',
 'temporal',jsonb_build_object('occurredAt',null,'explicitTime',null),'importance','important','confidence',0.99,'sourceExcerpt',msg.user_text,
 'recordedEvidence',jsonb_build_object('version','ask-governed-source.v1','sourceHash',encode(extensions.digest(convert_to(msg.user_text,'UTF8'),'sha256'),'hex'),
 'noteHash',encode(extensions.digest(convert_to(msg.user_text,'UTF8'),'sha256'),'hex'),'petId','93000000-0000-4000-8000-000000000011',
 'topic',topic,'inventoryTopic',case when topic='limping' then 'outside_supported_topics' else topic end,'transition',transition,'priorEpisodeId',prior)) from public.ask_conversation_messages msg where msg.id=msg_id;
$$;
create function pg_temp.inventory() returns jsonb language sql stable as $$
 select public.read_ask_episode_sources('93000000-0000-4000-8000-000000000011',array['vomiting','vomit']); $$;
create temp table written as select * from public.persist_furvise_server_semantic_event(
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000041',
 pg_temp.event_payload('93000000-0000-4000-8000-000000000041','vomiting','started'));
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id)->>'role'='opening' from written),'actual writer persists opening provenance');
select * from public.persist_furvise_server_semantic_event(
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000042',
 pg_temp.event_payload('93000000-0000-4000-8000-000000000042','vomiting','continued',(select episode_id from written)));
select pg_temp.check_recorded((select count(*)=2 from private.ask_recorded_source_evidence where user_id=auth.uid()),'continuation retains second source');
select pg_temp.check_recorded(pg_temp.inventory()#>>'{recorded_inventory,episodeCount}'='1','current health namespace reaches reader as one identity');
select pg_temp.check_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'='[]','natural notes have no inventory omissions');
select pg_temp.check_recorded(pg_temp.inventory()#>>'{memberships,1,recorded_provenance,role}'='continuation','reader carries verified continuation');
select * from public.persist_furvise_server_semantic_event(
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000043',
 pg_temp.event_payload('93000000-0000-4000-8000-000000000043','limping','started'));
select pg_temp.check_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'='[]' and jsonb_array_length(pg_temp.inventory()#>'{recorded_inventory,careIds}')=2,'reliably other-topic source does not poison vomiting census');
create temp table prior_revision as select pg_temp.inventory()#>>'{recorded_inventory,revision}' as revision;
savepoint foreign_write;
update public.dog_profiles set name='Other renamed' where id='93000000-0000-4000-8000-000000000021';
select pg_temp.check_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'=(select revision from prior_revision),'unrelated owner does not invalidate');
rollback to foreign_write;
savepoint own_write;
update public.dog_profiles set name='Milo renamed' where id='93000000-0000-4000-8000-000000000011';
select pg_temp.check_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'<>(select revision from prior_revision),'own mutation invalidates');
rollback to own_write;
select pg_temp.check_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'=(select revision from prior_revision),'transaction rollback restores revision');
savepoint ownership_changed;
create temp table foreign_revision as select revision from public.ask_recorded_inventory_revision where user_id='93000000-0000-4000-8000-000000000002';
update private.ask_recorded_source_evidence set user_id='93000000-0000-4000-8000-000000000002' where care_id=(select care_entry_id from written);
select pg_temp.check_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'<>(select revision from prior_revision),'old owner invalidated on ownership change');
select pg_temp.check_recorded((select revision from public.ask_recorded_inventory_revision where user_id='93000000-0000-4000-8000-000000000002')>(select revision from foreign_revision),'new owner invalidated on ownership change');
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id) is null from written),'foreign provenance ownership cannot bind original source');
rollback to ownership_changed;
savepoint registry_write;
update public.semantic_concepts set canonical_key=canonical_key where id=(select id from public.semantic_concepts limit 1);
select pg_temp.check_recorded(pg_temp.inventory()#>>'{recorded_inventory,revision}'<>(select revision from prior_revision),'registry change invalidates separately');
rollback to registry_write;
savepoint source_changed;
update public.ask_conversation_messages set user_text='Correction: Milo never vomited.' where id='93000000-0000-4000-8000-000000000041';
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id) is null from written),'full source correction invalidates proof');
select pg_temp.check_recorded(pg_temp.inventory()#>'{memberships,0,recorded_provenance}'='null'::jsonb,'invalidated provenance is explicit, not legacy fallback');
rollback to source_changed;
savepoint note_changed;
update public.pet_care_entries set note='Milo never vomited.' where id=(select care_entry_id from written);
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id) is null from written),'changed care source fails snapshot');
rollback to note_changed;
savepoint role_changed;
update public.pet_care_episode_events set event_role='continuation' where care_entry_id=(select care_entry_id from written);
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id) is null from written),'membership change invalidates');
rollback to role_changed;
savepoint forgotten;
update public.pet_care_entries set deleted_at=now(),deletion_reason='synthetic forget' where id=(select care_entry_id from written);
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id) is null from written),'forgotten source loses authority');
rollback to forgotten;
savepoint outside_changed;
update public.ask_conversation_messages set user_text='Milo vomited as well.' where id='93000000-0000-4000-8000-000000000043';
select pg_temp.check_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'<>'[]','changed outside classification reenters unknown census');
rollback to outside_changed;
savepoint legacy_unknown;
insert into public.pet_care_entries(user_id,pet_profile_id,category,note,occurred_at) values
 ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','general','An old unclassified note',now());
select pg_temp.check_recorded(pg_temp.inventory()#>'{recorded_inventory,failures}'<>'[]','unknown legacy is not silently discarded');
rollback to legacy_unknown;
savepoint missing_message;
delete from public.ask_conversation_messages where id='93000000-0000-4000-8000-000000000041';
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id) is null from written),'missing message cannot retain provenance');
rollback to missing_message;
do $$ begin
 begin
  perform public.persist_furvise_server_semantic_event('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000041',
   pg_temp.event_payload('93000000-0000-4000-8000-000000000041','vomiting','started'));
  raise exception 'foreign pet provenance accepted';
 exception when invalid_parameter_value or insufficient_privilege then null; end;
 begin
  perform public.persist_furvise_server_semantic_event('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000041',
   jsonb_set(pg_temp.event_payload('93000000-0000-4000-8000-000000000041','vomiting','started'),'{recordedEvidence,sourceHash}','"changed"'));
  raise exception 'wrong source hash accepted';
 exception when invalid_parameter_value then null; end;
end $$;
-- Replays do not update or bless existing provenance.
create temp table evidence_before as select * from private.ask_recorded_source_evidence;
select * from public.persist_furvise_server_semantic_event(
 '93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000041',
 pg_temp.event_payload('93000000-0000-4000-8000-000000000041','vomiting','started'));
select pg_temp.check_recorded(not exists((select * from evidence_before except select * from private.ask_recorded_source_evidence) union all (select * from private.ask_recorded_source_evidence except select * from evidence_before)),'idempotent writer preserves snapshot');
do $$ begin
 begin
  perform public.persist_furvise_server_semantic_event('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000021','93000000-0000-4000-8000-000000000041',
   pg_temp.event_payload('93000000-0000-4000-8000-000000000041','vomiting','started'));
  raise exception 'foreign provenance accepted';
 exception when invalid_parameter_value or insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
select pg_temp.check_recorded((select private.read_ask_recorded_source_evidence(care_entry_id) is null from written),'foreign owner cannot read proof');
set local role authenticated;
do $$ begin
 begin
  perform public.persist_furvise_server_semantic_event('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000041','{}');
  raise exception 'authenticated writer accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
