-- Non-effective, source-bound semantics. No inferred correction edge is created.
create function private.ask_source_semantics_snapshot(e public.pet_care_entries)
returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('id',e.id,'ownerId',e.user_id,'petId',e.pet_profile_id,'note',e.note,'title',e.title,
  'occurredAt',e.occurred_at,'createdAt',e.created_at,'updatedAt',e.updated_at,'sourceMessageId',e.intelligence_source_message_id,'sourceSpanId',e.care_event_metadata->>'sourceSpanId');
$$;
revoke all on function private.ask_source_semantics_snapshot(public.pet_care_entries) from public,anon,authenticated,service_role;

create function private.persist_ask_source_semantics(p_owner uuid,p_payload text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare
 v jsonb:=p_payload::jsonb; s jsonb; t jsonb; e public.pet_care_entries; result uuid; digest text; version_key uuid;
begin
 if p_owner is null or octet_length(p_payload)>16000 or jsonb_typeof(v) is distinct from 'object'
  or v-array['version','source','classification','target']<>'{}'::jsonb
  or not(v ?& array['version','source','classification','target'])
  or v->>'version' is distinct from 'source-semantics.v1'
  or coalesce(v->>'classification','') not in ('observation','attributed_correction','unknown') then
  raise exception 'SOURCE_SEMANTICS_INVALID'; end if;
 s:=v->'source';t:=v->'target';
 select * into e from public.pet_care_entries where id=(s->>'id')::uuid and user_id=p_owner for share;
 if e.id is null or e.deleted_at is not null or not exists(select 1 from public.dog_profiles where id=e.pet_profile_id and user_id=p_owner)
  or s is distinct from private.ask_source_semantics_snapshot(e) then raise exception 'SOURCE_SEMANTICS_SOURCE_CHANGED'; end if;
 if v->>'classification'<>'attributed_correction' then
  if t is distinct from 'null'::jsonb then raise exception 'SOURCE_SEMANTICS_TARGET_INVALID'; end if;
 elsif jsonb_typeof(t) is distinct from 'object' then raise exception 'SOURCE_SEMANTICS_TARGET_INVALID';
 elsif t->>'kind'='target_unknown' then
  if t-array['kind']<>'{}'::jsonb then raise exception 'SOURCE_SEMANTICS_TARGET_INVALID'; end if;
 elsif t->>'kind'='scope' then
  if t-array['kind','from','to','conceptKey']<>'{}'::jsonb or not(t ?& array['kind','from','to','conceptKey'])
   or (t->>'from' is not null and (t->>'from' !~ '^\d{4}-\d{2}-\d{2}T' or not isfinite((t->>'from')::timestamptz)))
   or (t->>'to' is not null and (t->>'to' !~ '^\d{4}-\d{2}-\d{2}T' or not isfinite((t->>'to')::timestamptz)))
   or ((t->>'from')::timestamptz >= (t->>'to')::timestamptz)
   or (t->>'conceptKey' is not null and t->>'conceptKey' !~ '^[a-z0-9]+(_[a-z0-9]+)*$') then
   raise exception 'SOURCE_SEMANTICS_TARGET_INVALID'; end if;
 elsif t->>'kind' in ('source','claim') then
  if t-array['kind','id']<>'{}'::jsonb or not(t ?& array['kind','id']) then raise exception 'SOURCE_SEMANTICS_TARGET_INVALID'; end if;
  if t->>'kind'='source' and not exists(select 1 from public.pet_care_entries x
   where x.id=(t->>'id')::uuid and x.user_id=p_owner and x.pet_profile_id=e.pet_profile_id and x.deleted_at is null)
   or t->>'kind'='claim' and not exists(select 1 from public.semantic_claims x
    where x.id=(t->>'id')::uuid and x.user_id=p_owner and x.subject_type='pet' and x.subject_id=e.pet_profile_id
     and not(x.governance_metadata ? 'sourceSemanticsPayload')) then raise exception 'SOURCE_SEMANTICS_TARGET_NOT_OWNED'; end if;
 else raise exception 'SOURCE_SEMANTICS_TARGET_INVALID'; end if;
 digest:=encode(extensions.digest(convert_to(p_payload,'UTF8'),'sha256'),'hex');
 version_key:=md5(s::text)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':source-semantics:'||e.id::text,0));
 select id into result from public.semantic_claims where user_id=p_owner and source_message_lineage_id=e.id
  and source_local_claim_key='source_semantics' and turn_idempotency_key=version_key;
 if result is not null then
  if not exists(select 1 from public.semantic_claims where id=result and turn_payload_hash=digest) then
   raise exception 'SOURCE_SEMANTICS_REPLAY_MISMATCH'; end if;
  return result;
 end if;
 insert into public.semantic_claims(
  user_id,source_message_id,source_message_lineage_id,source_type,subject_type,subject_id,resolved_entities,
  claim_kind,operation_type,concept_key,canonical_concept_key,concept_resolution_status,concept_authority,concept_version,predicate,
  structured_value,unit,polarity,modality,durability,occurred_at,valid_from,valid_to,temporal_precision,
  grounded_evidence,extraction_confidence,governed_confidence,frame_schema_version,governance_policy_version,
  source_local_claim_key,turn_idempotency_key,turn_payload_hash,lifecycle_role,lifecycle_transition,persistence_destination,
  provenance_classification,safety_floor_metadata,governance_metadata,knowledge_status)
 values(p_owner,e.intelligence_source_message_id,e.id,'legacy_import','pet',e.pet_profile_id,'[]',
  'assertion','assert','source_semantics',null,'provisional','provisional_normalizer','source-semantics.v1','{}',
  jsonb_build_object('note',e.note,'title',e.title,'severity',e.severity),null,'affirmed','reported','unknown',
  e.occurred_at,null,null,'unknown',jsonb_build_array(jsonb_build_object('sourceType','care_entry','sourceId',e.id,'excerpt',e.note)),
  1,1,'source-semantics.v1','source-semantics.v1','source_semantics',version_key,digest,null,null,'none','system_derived','{}',
  jsonb_build_object('sourceSemanticsPayload',p_payload),'unconfirmed') returning id into result;
 return result;
end $$;
revoke all on function private.persist_ask_source_semantics(uuid,text) from public,anon,authenticated,service_role;

-- Explicit reviewed import. No provider, classifier or legacy prose interpreter is invoked here.
create function public.import_ask_source_semantics(p_verified_user_id uuid,p_payload text)
returns uuid language sql security definer set search_path=pg_catalog as $$
 select private.persist_ask_source_semantics(p_verified_user_id,p_payload);
$$;
revoke all on function public.import_ask_source_semantics(uuid,text) from public,anon,authenticated;
grant execute on function public.import_ask_source_semantics(uuid,text) to service_role;

-- An attributed claim can never acquire an effective edge, including through older RPCs.
create function private.protect_attributed_source_relation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from public.semantic_claims where id in(new.from_claim_id,new.to_claim_id)
  and governance_metadata ? 'sourceSemanticsPayload') then raise exception 'ATTRIBUTED_SOURCE_EFFECTIVE_EDGE_FORBIDDEN'; end if;
 return new;
end $$;
revoke all on function private.protect_attributed_source_relation() from public,anon,authenticated,service_role;
create trigger aa_attributed_source_relation before insert or update on public.semantic_claim_relations
 for each row execute function private.protect_attributed_source_relation();

create function private.protect_attributed_source_claim()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.governance_metadata ? 'sourceSemanticsPayload' or (tg_op='UPDATE' and old.governance_metadata ? 'sourceSemanticsPayload') then
  if tg_op='UPDATE' and new.source_message_id is null
   and (to_jsonb(new)-'source_message_id')=(to_jsonb(old)-'source_message_id') then return new; end if;
  if tg_op='UPDATE' or new.knowledge_status<>'unconfirmed' or new.operation_type<>'assert'
   or new.persistence_destination<>'none' or new.modality<>'reported'
   or new.turn_payload_hash<>encode(extensions.digest(convert_to(new.governance_metadata->>'sourceSemanticsPayload','UTF8'),'sha256'),'hex') then
   raise exception 'ATTRIBUTED_SOURCE_IMMUTABLE'; end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_attributed_source_claim() from public,anon,authenticated,service_role;
create trigger aa_attributed_source_claim before insert or update on public.semantic_claims
 for each row execute function private.protect_attributed_source_claim();

-- Bounded discovery is independent of prose and requested factual dates. Runtime matches typed targets.
create function public.read_ask_source_semantics(p_pet_ids uuid[],p_source_ids uuid[] default '{}')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare owner_id uuid:=auth.uid(); claims jsonb; sources jsonb; complete boolean; ids uuid[]; targets jsonb;
begin
 if owner_id is null or coalesce(cardinality(p_pet_ids),0) not between 1 and 10
  or coalesce(cardinality(p_source_ids),0)>64 or exists(select 1 from unnest(p_pet_ids) p
   where not exists(select 1 from public.dog_profiles d where d.id=p and d.user_id=owner_id)) then
  raise exception 'SOURCE_SEMANTICS_SCOPE_INVALID'; end if;
 select coalesce(array_agg(id),'{}') into ids from (
  select c.id from public.semantic_claims c
  join public.pet_care_entries e on e.id=c.source_message_lineage_id and e.user_id=owner_id
   and e.deleted_at is null
   and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->'source'=private.ask_source_semantics_snapshot(e)
  where c.user_id=owner_id and c.subject_id=any(p_pet_ids)
   and c.governance_metadata ? 'sourceSemanticsPayload'
   and (c.source_message_lineage_id=any(p_source_ids)
    or (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->>'classification'<>'observation')
  order by c.id limit 77
 ) limited;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into claims from public.semantic_claims c where c.id=any(ids);
 select coalesce(jsonb_agg(to_jsonb(e)),'[]') into sources from public.pet_care_entries e where e.user_id=owner_id
  and e.id in(select c.source_message_lineage_id from public.semantic_claims c where c.id=any(ids));
 complete:=cardinality(ids)<=76 and (select count(*) from public.semantic_claims c where c.id=any(ids)
  and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->>'classification'<>'observation')<=12 and not exists(
  select 1 from public.pet_care_entries e where e.user_id=owner_id and e.pet_profile_id=any(p_pet_ids) and e.deleted_at is null
   and not exists(select 1 from public.semantic_claims c where c.user_id=owner_id and c.source_message_lineage_id=e.id
    and c.governance_metadata ? 'sourceSemanticsPayload'
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->'source'=private.ask_source_semantics_snapshot(e)));
 select coalesce(jsonb_agg(x),'[]') into targets from (
  select distinct 'source'::text kind,e.id,"ownerId","petId",e.occurred_at as "occurredAt",null::text as "conceptKey"
  from public.pet_care_entries e
  cross join lateral (select e.user_id as "ownerId",e.pet_profile_id as "petId") identity
  where e.user_id=owner_id and e.pet_profile_id=any(p_pet_ids) and e.deleted_at is null
   and exists(select 1 from public.semantic_claims c where c.id=any(ids)
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb#>>'{target,kind}'='source'
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb#>>'{target,id}'=e.id::text)
  union all
  select distinct 'claim',t.id,t.user_id,t.subject_id,t.occurred_at,
   case when t.concept_resolution_status='canonical' then t.canonical_concept_key else null end
  from public.semantic_claims t where t.user_id=owner_id and t.subject_type='pet' and t.subject_id=any(p_pet_ids)
   and t.knowledge_status='effective' and not(t.governance_metadata ? 'sourceSemanticsPayload')
   and exists(select 1 from public.semantic_claims c where c.id=any(ids)
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb#>>'{target,kind}'='claim'
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb#>>'{target,id}'=t.id::text)
 ) x;
 return jsonb_build_object('claims',claims,'sources',sources,'targets',targets,'complete',complete,'limit',76);
end $$;
revoke all on function public.read_ask_source_semantics(uuid[],uuid[]) from public,anon;
grant execute on function public.read_ask_source_semantics(uuid[],uuid[]) to authenticated;

-- Persist semantics in the same transaction as the existing successful canonical receipt.
-- No new mutation execution or language interpretation is introduced.
create function private.stamp_canonical_source_semantics()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare e public.pet_care_entries; item jsonb; meaning jsonb; body text;
begin
 if old.status<>'pending' or new.status<>'succeeded' then return new; end if;
 if new.action_kind='care_history.add' and new.action_payload ? 'appendJob' then
  for item in select value from jsonb_array_elements(new.action_payload#>'{appendJob,items}') loop
   select * into strict e from public.pet_care_entries x where x.user_id=new.user_id and x.pet_profile_id=new.pet_profile_id
    and x.intelligence_source_message_id=new.source_message_id and x.care_event_metadata->>'sourceSpanId'=item#>>'{body,id}';
   body:=item#>>'{body,text}';meaning:=coalesce(item->'semantics','{"classification":"unknown","target":null}'::jsonb);
   if e.note is distinct from body or not e.canonical_ask_isolated then raise exception 'SOURCE_SEMANTICS_WRITE_MISMATCH'; end if;
   if meaning#>>'{target,kind}' in('source','claim') or meaning#>>'{target,conceptKey}' is not null then
    raise exception 'SOURCE_SEMANTICS_UNBOUND_WRITE_TARGET'; end if;
   perform private.persist_ask_source_semantics(new.user_id,(jsonb_build_object('version','source-semantics.v1',
    'source',private.ask_source_semantics_snapshot(e))||meaning)::text);
  end loop;
 elsif new.action_kind='care_history.edit' and new.action_payload ? 'replaceJob' then
  select * into strict e from public.pet_care_entries x where x.id=new.target_id and x.user_id=new.user_id and x.pet_profile_id=new.pet_profile_id;
  meaning:=coalesce(new.action_payload#>'{replaceJob,semantics}','{"classification":"unknown","target":null}'::jsonb);
  if e.note is distinct from new.action_payload#>>'{replaceJob,body,text}' or not e.canonical_ask_isolated then
   raise exception 'SOURCE_SEMANTICS_WRITE_MISMATCH'; end if;
  if meaning#>>'{target,kind}' in('source','claim') or meaning#>>'{target,conceptKey}' is not null then
   raise exception 'SOURCE_SEMANTICS_UNBOUND_WRITE_TARGET'; end if;
  perform private.persist_ask_source_semantics(new.user_id,(jsonb_build_object('version','source-semantics.v1',
   'source',private.ask_source_semantics_snapshot(e))||meaning)::text);
 end if;
 return new;
end $$;
revoke all on function private.stamp_canonical_source_semantics() from public,anon,authenticated,service_role;
create trigger zz_stamp_canonical_source_semantics after update on public.ask_action_capabilities
 for each row execute function private.stamp_canonical_source_semantics();

do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('private.persist_furvise_append_items(uuid,uuid,uuid,jsonb)'::regprocedure);
 revised:=replace(definition,'item-array[''body'',''date'',''occurredAt'']','item-array[''body'',''date'',''occurredAt'',''semantics'']');
 if revised=definition then raise exception 'Missing append structural gate'; end if;
 execute revised;
 -- Attributed metadata is non-effective and edge-prohibited by the guards above.
 -- Every actual derived-state/graph dependency still rejects replacement.
 definition:=pg_get_functiondef('private.canonical_ask_replace_safe(uuid,uuid,uuid)'::regprocedure);
 revised:=replace(definition,'from public.semantic_claims d where d.user_id=e.user_id',
  'from public.semantic_claims d where d.user_id=e.user_id and not(d.governance_metadata ? ''sourceSemanticsPayload'')');
 if revised=definition then raise exception 'Missing replacement semantic dependency gate'; end if;
 execute revised;
end $migration$;
