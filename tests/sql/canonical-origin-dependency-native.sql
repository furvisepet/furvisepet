-- UNEXECUTED here. Append after canonical-conversation-delete-native.sql in the
-- SAME isolated rollback-only fixture transaction. No schema/role changes.
-- Uses real service-role semantic persistence, target catalog and both executors.
create function pg_temp.origin_dependency_claim(who uuid,pet uuid,source uuid,metadata jsonb,value jsonb)
returns uuid language plpgsql as $$
declare source_text text;r record;
begin
 select user_text into strict source_text from public.ask_conversation_messages where id=source and user_id=who and role='user';
 execute 'set local role service_role';
 perform pg_temp.check_true(current_user='service_role','dependency actual semantic service role');
 select * into r from public.persist_governed_semantic_turn_v2(who,source,gen_random_uuid(),
  'origin-dependency.v1','origin-dependency.v1',jsonb_build_object('claims',jsonb_build_array(jsonb_build_object(
   'source_local_claim_key','origin_dependency','claim_kind','assertion','subject_type','pet','subject_id',pet,
   'concept_key','independent_dependency','concept_resolution_status','provisional','concept_authority','provisional_normalizer',
   'predicate','{}'::jsonb,'governance_metadata',metadata,'structured_value',value,
   'grounded_evidence',jsonb_build_array(jsonb_build_object('start',0,'end',length(source_text),'excerpt',source_text)),
   'extraction_confidence',1,'governed_confidence',1,'persistence_destination','history')),'relations','[]'::jsonb));
 execute 'reset role';
 perform pg_temp.check_true(cardinality(r.claim_ids)=1 and not r.already_persisted,'one newly RPC-persisted dependency');
 return r.claim_ids[1];
exception when others then execute 'reset role';raise;
end $$;
create function pg_temp.origin_catalog_has(e public.pet_care_entries) returns boolean language plpgsql as $$
declare found boolean;
begin
 execute 'set local role service_role';
 perform pg_temp.check_true(current_user='service_role','dependency actual catalog service role');
 select exists(select 1 from public.list_ask_replace_targets(e.user_id,array[e.pet_profile_id],clock_timestamp()) t where t.id=e.id) into found;
 execute 'reset role';return found;
exception when others then execute 'reset role';raise;
end $$;

-- Only the seven status variants and two isolated lineage projections below are
-- privileged fixture controls. The ordinary origin witness and unrelated/foreign/
-- structured-reference claims are created unchanged by the real governed RPC.
do $$
declare f jsonb:=pg_temp.fixture();e public.pet_care_entries;mode text;operation text;expected_block boolean;
 dep uuid;dep_before jsonb;claims_before jsonb;state_before jsonb;care_before jsonb;receipt_before jsonb;snapshot_before jsonb;
 who uuid;pet uuid;source uuid;metadata jsonb;value jsonb;source_row jsonb;action jsonb;cap uuid;effect record;
 count_claims bigint;count_care bigint;original_receipts jsonb;after_delete jsonb;expected_detached_claims jsonb;message_ids uuid[];
 states text[]:=array['effective','unconfirmed','tombstoned','superseded','rejected','forgotten','dismissed'];
 begin
 foreach mode in array array['origin_effective','origin_unconfirmed','origin_tombstoned','origin_superseded','origin_rejected','origin_forgotten','origin_dismissed',
  'care_lineage','metadata_reference','value_reference','live_source_only','clean_attributed','unrelated_message','foreign_reference']loop
  foreach operation in array array['replace','remove']loop
   begin
    select * into strict e from public.pet_care_entries where id=(f#>>'{reference,recordId}')::uuid;
    perform pg_temp.check_true(private.canonical_ask_replace_safe(e.id,e.user_id,e.pet_profile_id),'clean initial safety');
    perform pg_temp.check_true((select count(*)=1 from public.semantic_claims c where c.user_id=e.user_id
     and c.source_message_lineage_id=e.id and c.governance_metadata ? 'sourceSemanticsPayload'
     and c.knowledge_status='unconfirmed' and c.persistence_destination='none'),'own attributed non-effective evidence present');
    select count(*) into count_claims from public.semantic_claims;
    select count(*) into count_care from public.pet_care_entries;
    dep:=null;expected_block:=mode not in('clean_attributed','unrelated_message','foreign_reference');
    if mode<>'clean_attributed' then
     who:=e.user_id;pet:=e.pet_profile_id;source:=e.canonical_ask_origin_message_id;metadata:='{}';value:='null';
     if mode in('care_lineage','metadata_reference','value_reference','unrelated_message')then source:=(f#>>'{source,id}')::uuid;end if;
     if mode='metadata_reference'then metadata:=jsonb_build_object('careReference',e.id);end if;
     if mode='value_reference'then value:=jsonb_build_object('careReference',e.id);end if;
     if mode='foreign_reference'then
      who:=(f#>>'{foreign,owner}')::uuid;pet:=(f#>>'{foreign,subject,id}')::uuid;
      select canonical_ask_origin_message_id into strict source from public.pet_care_entries where id=(f#>>'{foreign,reference,recordId}')::uuid;
      metadata:=jsonb_build_object('careReference',e.id);
     end if;
     dep:=pg_temp.origin_dependency_claim(who,pet,source,metadata,value);
     perform pg_temp.check_true((select count(*)=count_claims+1 from public.semantic_claims),'exact one dependency claim delta');
     perform pg_temp.check_true((select user_id=who and subject_id=pet and source_message_id=source and source_message_lineage_id=source
      and knowledge_status='effective' and not(governance_metadata ? 'sourceSemanticsPayload') from public.semantic_claims where id=dep),'actual RPC origin lineage/status');
     if mode like 'origin_%' and mode<>'origin_effective'then
      perform pg_temp.check_true(substring(mode from 8)=any(states),'known status control');
      update public.semantic_claims set knowledge_status=substring(mode from 8) where id=dep;
     end if;
     if mode='care_lineage'then update public.semantic_claims set source_message_lineage_id=e.id where id=dep;end if;
     if mode='live_source_only'then update public.semantic_claims set source_message_lineage_id=(f#>>'{source,id}')::uuid where id=dep;end if;
     if mode='unrelated_message'then
      perform pg_temp.check_true((select source_message_lineage_id<>e.id and source_message_lineage_id<>e.canonical_ask_origin_message_id
       and not private.json_references_care_entry(governance_metadata,e.id) and not private.json_references_care_entry(structured_value,e.id)
       from public.semantic_claims where id=dep),'genuinely unrelated origin and structures');
     end if;
     select to_jsonb(c) into dep_before from public.semantic_claims c where id=dep;
    end if;
    perform pg_temp.check_true(private.canonical_ask_replace_safe(e.id,e.user_id,e.pet_profile_id)=(not expected_block),'pre-delete helper dependency '||mode);
    perform pg_temp.check_true(pg_temp.origin_catalog_has(e)=(not expected_block),'pre-delete actual selection '||mode);
    select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into claims_before from public.semantic_claims c;
    select coalesce(array_agg(id),'{}') into message_ids from public.ask_conversation_messages where conversation_id='89300000-0000-4000-8000-000000000005';
    state_before:=pg_temp.lifecycle_state();snapshot_before:=private.ask_source_semantics_snapshot(e);
    original_receipts:=state_before->'public.ask_action_capabilities';
    if mode<>'live_source_only'then
     perform pg_temp.check_true(pg_temp.delete_owned(e.user_id,'89300000-0000-4000-8000-000000000005'),'genuine owned dialogue deletion '||mode);
     perform pg_temp.check_true(not exists(select 1 from public.ask_conversations where id='89300000-0000-4000-8000-000000000005')
      and not exists(select 1 from public.ask_conversation_messages where id=any(message_ids)),'physical transcript absence');
     select coalesce(jsonb_agg(case when (x->>'source_message_id')::uuid=any(message_ids) then jsonb_set(x,'{source_message_id}','null') else x end order by x->>'id'),'[]')
      into expected_detached_claims from jsonb_array_elements(claims_before) x;
     perform pg_temp.check_true((select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]')=expected_detached_claims from public.semantic_claims c),'all claim fields/lineage preserved except actual live detach');
     perform pg_temp.check_true((select (to_jsonb(c)-'intelligence_source_message_id')=(to_jsonb(e)-'intelligence_source_message_id') and intelligence_source_message_id is null
      and private.ask_source_semantics_snapshot(c)=snapshot_before from public.pet_care_entries c where id=e.id),'care generation/snapshot/body immutable across deletion');
     after_delete:=pg_temp.lifecycle_state();
     perform pg_temp.check_true(after_delete->'public.ask_action_capabilities'=original_receipts,'terminal receipt bytes unchanged');
     perform pg_temp.check_true(after_delete->'public.ask_recorded_inventory_revision' is distinct from state_before->'public.ask_recorded_inventory_revision','actual inventory invalidation');
     perform pg_temp.check_true((after_delete-array['public.ask_conversations','public.ask_conversation_messages','public.pet_care_entries','public.semantic_claims','public.ask_recorded_inventory_revision','public.ask_recorded_inventory_removals'])=
      (state_before-array['public.ask_conversations','public.ask_conversation_messages','public.pet_care_entries','public.semantic_claims','public.ask_recorded_inventory_revision','public.ask_recorded_inventory_removals']),'no unrelated inferred/effective effects');
     if dep is not null then
      perform pg_temp.check_true((select (to_jsonb(c)-'source_message_id')=(dep_before-'source_message_id') from public.semantic_claims c where id=dep),'same dependency survives including permanent lineage/status');
     end if;
     perform pg_temp.check_true(private.canonical_ask_replace_safe(e.id,e.user_id,e.pet_profile_id)=(not expected_block),'post-delete dependency helper '||mode);
     perform pg_temp.check_true(pg_temp.origin_catalog_has(e)=(not expected_block),'post-delete actual selection '||mode);
    end if;
    perform pg_temp.check_true((select count(*)=count_care from public.pet_care_entries),'deletion preserves exact total care count');
    perform pg_temp.check_true((select count(*)=count_claims+case when dep is null then 0 else 1 end from public.semantic_claims),'deletion preserves exact total claim count');
    action:=f#>array['deletion',operation];source_row:=f#>array['deletion',case when operation='replace' then 'source' else 'removeSource' end];
    perform pg_temp.new_source(source_row,'89300000-0000-4000-8000-000000000306','89300000-0000-4000-8000-000000000305');
    cap:=pg_temp.mint(action,'89300000-0000-4000-8000-000000000306');
    state_before:=pg_temp.lifecycle_state();care_before:=state_before->'public.pet_care_entries';claims_before:=state_before->'public.semantic_claims';
    select count(*) into count_claims from public.semantic_claims;
    execute 'set local role service_role';perform pg_temp.check_true(current_user='service_role','actual effect service role');
    select * into effect from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000306',e.user_id,'confirm',null);execute 'reset role';
    if expected_block then
     perform pg_temp.check_true(not effect.changed and effect.action->>'status'='failed','dependency denies real '||operation||' '||mode);
     perform pg_temp.check_true((pg_temp.lifecycle_state()->'public.pet_care_entries')=care_before,'denied effect preserves all care generations/body/count');
     perform pg_temp.check_true((pg_temp.lifecycle_state()->'public.semantic_claims')=claims_before,'denied effect preserves all dependency/stamp fields/count');
     perform pg_temp.check_true((pg_temp.lifecycle_state()-'public.ask_action_capabilities')=(state_before-'public.ask_action_capabilities'),'denial changes only its failure receipt');
    else
     perform pg_temp.check_true(effect.changed and effect.action->>'status'='succeeded','unrelated/exempt clean real '||operation||' '||mode);
     if operation='replace'then
      perform pg_temp.check_true((select note=action#>>'{replaceJob,body,text}' and updated_at<>e.updated_at from public.pet_care_entries where id=e.id),'positive exact replacement/new generation');
      perform pg_temp.check_true((select count(*)=count_claims+1 from public.semantic_claims),'positive replacement one stamp');
     else
      perform pg_temp.check_true((select deleted_at is not null and note=e.note from public.pet_care_entries where id=e.id),'positive governed removal');
      perform pg_temp.check_true((select count(*)=count_claims from public.semantic_claims),'positive removal no invented stamp');
     end if;
     perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(claims_before) old where not exists(select 1 from public.semantic_claims c where to_jsonb(c)=old)),'existing claims unchanged by clean effect');
    end if;
    perform pg_temp.check_true((select receipt=effect.action and status=effect.action->>'status' from public.ask_action_capabilities where id=cap),'exact persisted outcome receipt');
    perform pg_temp.check_true((select count(*)=count_care from public.pet_care_entries),'effect preserves exact care count');
    receipt_before:=effect.action;state_before:=pg_temp.lifecycle_state();
    execute 'set local role service_role';select * into effect from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000306',e.user_id,'confirm',null);execute 'reset role';
    perform pg_temp.check_true(not effect.changed and effect.action=receipt_before and pg_temp.lifecycle_state()=state_before,'terminal failed/succeeded replay exact and effect-free');
    raise notice 'PASS origin dependency mode=% action=% blocked=%',mode,operation,expected_block;
    raise exception using errcode='Z0001',message='rollback dependency variant';
   exception when sqlstate 'Z0001' then null;end;
  end loop;
 end loop;
end $$;
