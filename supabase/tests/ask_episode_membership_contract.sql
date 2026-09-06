-- NOT DATABASE-VALIDATED. Run only in a disposable database after applying the
-- draft. Every fixture and assertion rolls back. No provider/network dependency.
begin;
set local statement_timeout='8s';
create function pg_temp.assert_contract(ok boolean, message text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception '%',message; end if; end $$;

insert into auth.users(id) values ('91000000-0000-4000-8000-000000000001'), ('91000000-0000-4000-8000-000000000002');
insert into public.dog_profiles(id,user_id,name,species) values
 ('91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000001','Milo','dog'),
 ('91000000-0000-4000-8000-000000000012','91000000-0000-4000-8000-000000000001','Bruno','dog'),
 ('91000000-0000-4000-8000-000000000021','91000000-0000-4000-8000-000000000002','Private','dog');
insert into public.pet_care_episodes(id,user_id,pet_profile_id,episode_type,normalized_key,title,status,severity,sequence_number,started_at,last_event_at)
values ('91000000-0000-4000-8000-000000000031','91000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000011','symptom','vomiting','Vomiting','resolved','routine',7,'2011-02-01','2011-02-01');

-- Stored schema-shaped claim; use the registry's actual installed version.
insert into public.semantic_claims(id,user_id,source_message_lineage_id,source_type,subject_type,subject_id,
 claim_kind,operation_type,concept_key,canonical_concept_key,concept_resolution_status,concept_authority,concept_version,
 predicate,structured_value,polarity,modality,durability,occurred_at,temporal_precision,recorded_at,grounded_evidence,
 extraction_confidence,governed_confidence,frame_schema_version,governance_policy_version,source_local_claim_key,
 turn_idempotency_key,turn_payload_hash,lifecycle_role,lifecycle_transition,persistence_destination,provenance_classification)
select '91000000-0000-4000-8000-000000000041','91000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000051','ask_message','pet','91000000-0000-4000-8000-000000000011',
 'event','assert','vomiting','vomiting','canonical','governed_registry',concept_version,'{}',
 '{"note":"Milo had a vomiting episode.","title":null,"severity":null}','affirmed','reported','temporary','2011-02-01','day','2011-02-01',
 '[{"start":0,"end":28,"excerpt":"Milo had a vomiting episode."}]',1,1,'test.v1','test.v1','claim_one',
 '91000000-0000-4000-8000-000000000061',repeat('a',64),'opening','started','history','ask_v2_shadow'
from public.semantic_concepts where canonical_key='vomiting' and status='active';
select pg_temp.assert_contract(exists(select 1 from public.semantic_claims where id='91000000-0000-4000-8000-000000000041'),'active vomiting registry required');
insert into public.pet_care_episode_events(id,claim_id,episode_id,user_id,pet_profile_id,event_ordinal,event_role,occurred_at)
values ('91000000-0000-4000-8000-000000000071','91000000-0000-4000-8000-000000000041','91000000-0000-4000-8000-000000000031',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000011',1,'opening','2011-02-01');

select pg_temp.assert_contract(not has_function_privilege('anon','public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)','execute'),'anon execute forbidden');
select pg_temp.assert_contract(not has_function_privilege('service_role','public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)','execute'),'service fallback forbidden');
select pg_temp.assert_contract(not has_table_privilege('authenticated','public.semantic_claims','select'),'no new claim table grant');
select pg_temp.assert_contract((select proconfig @> array['search_path=pg_catalog'] from pg_proc
 where oid='public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)'::regprocedure),'fixed search path required');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; begin
 r:=public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting']);
 perform pg_temp.assert_contract(r->>'membership_contract'='ask-episode-membership.v1','versioned contract');
 perform pg_temp.assert_contract(jsonb_array_length(r->'memberships')=1 and jsonb_array_length(r->'claims')=1 and jsonb_array_length(r->'sources')=0,'claim-only membership retained');
 perform pg_temp.assert_contract(r#>>'{episodes,0,sequence_number}'='7','stored sequence is not display ordinal');
 perform pg_temp.assert_contract(not (r ? 'exactTotal') and r->>'coverage'='bounded_candidates_not_complete','no completeness or exact count invented');
 perform pg_temp.assert_contract(jsonb_array_length(public.read_ask_episode_sources('91000000-0000-4000-8000-000000000012',array['vomiting'],array['91000000-0000-4000-8000-000000000031']::uuid[])->'episodes')=0,'foreign pet pinned ID excluded');
 begin
  perform public.read_ask_episode_sources('91000000-0000-4000-8000-000000000021',array['vomiting']);
  raise exception 'foreign owner read succeeded';
 exception when insufficient_privilege then null; end;
 perform pg_temp.assert_contract(jsonb_array_length(public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['soft_stool'])->'episodes')=0,'concept scope enforced');
end $$;
reset role;

do $$ declare before_members jsonb; after_members jsonb; begin
 before_members:=public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting'])->'memberships';
 update public.pet_care_episode_events set event_ordinal=2 where id='91000000-0000-4000-8000-000000000071';
 after_members:=public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting'])->'memberships';
 perform pg_temp.assert_contract(before_members<>after_members,'membership version input must change without a source-text edit');
 update public.pet_care_episode_events set event_ordinal=1 where id='91000000-0000-4000-8000-000000000071';
end $$;

-- Oversize payload keeps its membership and explicit omission (whole-group
-- exclusion is asserted separately in the actual production callback tests).
update public.semantic_claims set structured_value=jsonb_build_object('note',repeat('x',2001)) where id='91000000-0000-4000-8000-000000000041';
set local role authenticated;
select pg_temp.assert_contract((public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting'])#>>'{claims,0,content_omitted}')::boolean,'oversize claim retained as omission');
reset role;
update public.semantic_claims set structured_value='{"note":"Milo had a vomiting episode.","title":null,"severity":null}',knowledge_status='forgotten'
 where id='91000000-0000-4000-8000-000000000041';
set local role authenticated;
select pg_temp.assert_contract(public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting'])#>>'{claims,0,knowledge_status}'='forgotten','forgotten member must not disappear from group');
reset role;

-- Real correction and retained tombstone effects, including forgetting its author.
insert into public.semantic_claims select (jsonb_populate_record(null::public.semantic_claims,to_jsonb(c)||jsonb_build_object(
 'id','91000000-0000-4000-8000-000000000042','source_local_claim_key','later','operation_type','correct',
 'recorded_at','2026-08-01T00:00:00Z','knowledge_status','forgotten'))).* from public.semantic_claims c
 where c.id='91000000-0000-4000-8000-000000000041';
insert into public.semantic_claim_relations(user_id,from_claim_id,to_claim_id,relation_type,source_local_relation_key)
values ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000042','91000000-0000-4000-8000-000000000041','corrects','correction');
set local role authenticated;
select pg_temp.assert_contract(jsonb_array_length(public.read_ask_history_correction_page('{}',array['91000000-0000-4000-8000-000000000041']::uuid[])->'relations')=1,'forgotten correction retains target-removal edge');
reset role;
update public.semantic_claim_relations set relation_type='supersedes' where source_local_relation_key='correction' and user_id='91000000-0000-4000-8000-000000000001';
delete from public.semantic_claim_relations where source_local_relation_key='correction' and user_id='91000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_contract(public.read_ask_history_correction_page('{}',array['91000000-0000-4000-8000-000000000041']::uuid[])->'withheld_claim_ids' @> '["91000000-0000-4000-8000-000000000041"]','deleted supersession cannot revive target');
reset role;

-- Care writer triggers create authoritative edges. Import uses real hash writer.
insert into public.pet_care_entries(id,user_id,pet_profile_id,episode_id,category,note,occurred_at,care_event_metadata)
values ('91000000-0000-4000-8000-000000000081','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000011',
 '91000000-0000-4000-8000-000000000031','symptom','Milo had a vomiting episode.','2011-02-01','{"canonicalConceptKey":"vomiting"}');
select * from public.import_legacy_semantic_claims_v2('91000000-0000-4000-8000-000000000001','pet_care_entries',array['91000000-0000-4000-8000-000000000081']::uuid[]);
insert into public.pet_care_episode_events(claim_id,episode_id,user_id,pet_profile_id,event_ordinal,event_role,occurred_at)
select l.claim_id,'91000000-0000-4000-8000-000000000031',l.user_id,'91000000-0000-4000-8000-000000000011',3,'opening','2011-02-01'
from public.semantic_claim_legacy_lineage l where l.legacy_row_id='91000000-0000-4000-8000-000000000081';
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting']);
 perform pg_temp.assert_contract(jsonb_array_length(r->'memberships')=3,'duplicate lineage retains both raw edges for application dedup/versioning');
 perform pg_temp.assert_contract(not exists(select 1 from jsonb_array_elements(r->'memberships') m where m->>'source_issue' is not null),'import hash agrees with actual writer');
end $$;
reset role;
update public.pet_care_entries set note='Changed source' where id='91000000-0000-4000-8000-000000000081';
set local role authenticated;
select pg_temp.assert_contract(exists(select 1 from jsonb_array_elements(public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting'])->'memberships') m
 where m->>'source_issue'='legacy_source_changed_or_missing'),'changed import has explicit source issue');
reset role;
delete from public.pet_care_entries where id='91000000-0000-4000-8000-000000000081';
set local role authenticated;
select pg_temp.assert_contract(exists(select 1 from jsonb_array_elements(public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting'])->'memberships') m
 where m->>'source_issue'='legacy_source_changed_or_missing'),'missing import cannot hide behind claim');
reset role;

-- Nine members are an overflow sentinel, never a complete group or count.
delete from public.semantic_claim_legacy_lineage where legacy_row_id='91000000-0000-4000-8000-000000000081';
set local role authenticated;
select pg_temp.assert_contract(public.read_ask_history_correction_page(array['91000000-0000-4000-8000-000000000081']::uuid[],'{}')->'withheld_source_ids'
 @> '["91000000-0000-4000-8000-000000000081"]','forgotten imported lineage retains source tombstone');
reset role;
insert into public.pet_care_entries(user_id,pet_profile_id,episode_id,category,note,occurred_at)
select '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000011',
 '91000000-0000-4000-8000-000000000031','general','Milo rested.','2011-02-01'::timestamptz from generate_series(1,9);
set local role authenticated;
select pg_temp.assert_contract(jsonb_array_length(public.read_ask_episode_sources('91000000-0000-4000-8000-000000000011',array['vomiting'])->'memberships')=9,'ninth member sentinel required');
reset role;
rollback;
