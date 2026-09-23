-- Canonical Ask stores authorized notes; legacy SQL inference is a separate domain.
-- Existing rows deliberately remain unmarked: origin alone proves no isolation.
alter table public.pet_care_entries
  add column canonical_ask_isolated boolean not null default false;
comment on column public.pet_care_entries.canonical_ask_isolated is
  'Server-owned provenance: canonical Ask persisted this row with SQL semantic inference prohibited.';

create function private.protect_canonical_ask_isolation()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $function$
begin
  if tg_op='INSERT' and new.canonical_ask_isolated
    and current_user <> pg_get_userbyid((select relowner from pg_class where oid=tg_relid)) then
    raise exception using errcode='42501',message='CANONICAL_ASK_ORIGIN_REQUIRES_WRITER';
  end if;
  if tg_op='UPDATE' and (new.canonical_ask_isolated is distinct from old.canonical_ask_isolated
    or (old.canonical_ask_isolated and (
      new.user_id is distinct from old.user_id or new.pet_profile_id is distinct from old.pet_profile_id
      or new.intelligence_source_message_id is distinct from old.intelligence_source_message_id
      or new.intelligence_source_type is distinct from old.intelligence_source_type))) then
    raise exception using errcode='23514',message='CANONICAL_ASK_ORIGIN_IMMUTABLE';
  end if;
  if new.canonical_ask_isolated and (
    new.intelligence_source_type is distinct from 'ask_application_action'
    or new.intelligence_source_message_id is null or new.episode_id is not null
    or new.concern_id is not null or new.state_action_type is not null) then
    raise exception using errcode='23514',message='CANONICAL_ASK_INFERRED_LINK_FORBIDDEN';
  end if;
  return new;
end $function$;
revoke all on function private.protect_canonical_ask_isolation() from public,anon,authenticated,service_role;
create trigger aa_canonical_ask_isolation before insert or update on public.pet_care_entries
  for each row execute function private.protect_canonical_ask_isolation();

-- A capability-bound source cannot re-enter legacy semantic persistence.
create function private.is_canonical_ask_source(p_source uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.ask_action_capabilities c where c.source_message_id=p_source)
    or exists(select 1 from public.pet_care_entries e
      where e.intelligence_source_message_id=p_source and e.canonical_ask_isolated);
$function$;
revoke all on function private.is_canonical_ask_source(uuid) from public,anon,authenticated,service_role;

-- Filtered views are not another ledger. History readers keep using the original table.
create view private.legacy_inference_care_entries with (security_invoker=true) as
  select * from public.pet_care_entries where not canonical_ask_isolated;
create view private.legacy_inference_messages with (security_invoker=true) as
  select * from public.ask_conversation_messages m where not private.is_canonical_ask_source(m.id);
create view private.legacy_inference_episode_events with (security_invoker=true) as
  select m.* from public.pet_care_episode_events m
  join public.pet_care_entries e on e.id=m.care_entry_id where not e.canonical_ask_isolated;
revoke all on private.legacy_inference_care_entries,private.legacy_inference_messages,
  private.legacy_inference_episode_events from public,anon,authenticated,service_role;

-- Match stored structural references, never interpret a care entry's prose.
create function private.json_references_care_entry(p_value jsonb,p_id uuid)
returns boolean language sql immutable security invoker set search_path=pg_catalog as $function$
  select coalesce(jsonb_path_exists(p_value,'$.** ? (@ == $id)',
    jsonb_build_object('id',p_id::text)),false);
$function$;
revoke all on function private.json_references_care_entry(jsonb,uuid) from public,anon,authenticated,service_role;
create function private.canonical_ask_replace_safe(p_entry uuid,p_user uuid,p_pet uuid)
returns boolean language sql stable security definer set search_path='' as $function$
select exists (
  select 1 from public.pet_care_entries e where e.id=p_entry and e.user_id=p_user
    and e.pet_profile_id=p_pet and e.deleted_at is null and e.canonical_ask_isolated
    and e.episode_id is null and e.concern_id is null and e.state_action_type is null
    and exists(select 1 from public.ask_action_capabilities c
      cross join lateral jsonb_array_elements(c.action_payload#>'{appendJob,items}') item
      where c.user_id=e.user_id and c.pet_profile_id=e.pet_profile_id
        and c.source_message_id=e.intelligence_source_message_id and c.status='succeeded'
        and c.action_kind='care_history.add'
        and item#>>'{body,id}'=e.care_event_metadata->>'sourceSpanId')
    and not exists(select 1 from public.pet_care_episode_events d where d.care_entry_id=e.id)
    and not exists(select 1 from public.pet_concerns d where d.source_care_entry_id=e.id)
    and not exists(select 1 from public.pet_care_episodes d where d.user_id=e.user_id
      and (e.id=any(d.missing_source_event_ids) or private.json_references_care_entry(d.summary,e.id)))
    and not exists(select 1 from public.pet_current_state d where d.user_id=e.user_id
      and (e.id=any(d.source_event_ids) or private.json_references_care_entry(d.state,e.id)))
    and not exists(select 1 from public.semantic_claim_legacy_lineage d
      where d.legacy_table='pet_care_entries' and d.legacy_row_id=e.id)
    and not exists(select 1 from public.semantic_claims d where d.user_id=e.user_id
      and (d.source_message_lineage_id=e.id or d.source_message_id=e.intelligence_source_message_id
        or private.json_references_care_entry(d.governance_metadata,e.id)
        or private.json_references_care_entry(d.structured_value,e.id)))
    and not exists(select 1 from public.furvise_memories d where d.user_id=e.user_id
      and d.source_id in (e.id,e.intelligence_source_message_id))
    and not exists(select 1 from public.ai_update_suggestions d where d.care_entry_id=e.id)
    and not exists(select 1 from private.ask_tasks d where d.entry_id=e.id)
    and not exists(select 1 from public.owner_note_jobs d where d.entry_id=e.id)
    and not exists(select 1 from public.vet_visit_briefs d where e.id=any(d.source_entry_ids))
);
$function$;
revoke all on function private.canonical_ask_replace_safe(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Preserve trigger functions and all non-Ask behavior; only their input eligibility changes.
do $migration$
declare name text; definition text;
begin
  foreach name in array array[
    'pet_care_entries_assign_episode','pet_care_entries_apply_current_state',
    'sync_pet_concern_from_care_entry','zz_pet_care_entries_medication_state',
    'zz_pet_care_entries_record_episode_event','zzz_pet_care_entries_reconcile_canonical_concern',
    'owner_note_revision_outbox'
  ] loop
    select pg_get_triggerdef(oid) into strict definition from pg_trigger
      where tgrelid='public.pet_care_entries'::regclass and tgname=name and not tgisinternal;
    if position(' FOR EACH ROW EXECUTE FUNCTION ' in definition)=0 then
      raise exception 'Unexpected inference trigger: %',name;
    end if;
    execute format('drop trigger %I on public.pet_care_entries',name);
    execute replace(definition,' FOR EACH ROW EXECUTE FUNCTION ',
      ' FOR EACH ROW WHEN (not new.canonical_ask_isolated) EXECUTE FUNCTION ');
  end loop;
end $migration$;

-- Existing maintenance routines may infer only from non-isolated records.
-- The explicit function inventory avoids altering retrieval, receipts or integrity cleanup.
do $migration$
declare signature text; definition text; revised text;
begin
  foreach signature in array array[
    'public.backfill_pet_care_episodes(uuid,boolean)',
    'public.recompute_pet_current_state(uuid,boolean)',
    'public.refresh_pet_current_medications(uuid)',
    'public.rebuild_pet_lifecycle_projections(uuid)',
    'public.apply_care_event_to_pet_state()',
    'public.repair_resolved_concern_suggestions(boolean)',
    'public.repair_furvise_recovery_events_legacy(boolean)',
    'public.repair_furvise_recovery_events(boolean)',
    'public.repair_maple_qa_consistency(boolean)',
    'public.finish_maple_qa_consistency_repair(boolean)',
    'public.repair_maple_persistence_destinations(boolean)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    revised:=regexp_replace(definition,'\m(from|join|update|using)\s+(public\.)?pet_care_entries\M',
      '\1 private.legacy_inference_care_entries','gi');
    if revised=definition then raise exception 'Missing inference scan: %',signature; end if;
    -- Historical repairs must not reinterpret the original canonical source turn either.
    revised:=regexp_replace(revised,'\m(from|join)\s+public\.ask_conversation_messages\M',
      '\1 private.legacy_inference_messages','gi');
    execute revised;
  end loop;
  definition:=pg_get_functiondef('public.import_legacy_semantic_claims_v2(uuid,text,uuid[],text,integer)'::regprocedure);
  revised:=regexp_replace(definition,'from public\.pet_care_entries entry(\s+join)',
    'from private.legacy_inference_care_entries entry\1','g');
  if revised=definition then raise exception 'Missing import inference scan'; end if;
  -- Keep existing non-Ask import fingerprints stable when the provenance column is added.
  revised:=replace(revised,'to_jsonb(source_row)::text',
    '(to_jsonb(source_row)-''canonical_ask_isolated'')::text');
  execute revised;
  definition:=pg_get_functiondef('public.rebuild_pet_care_episode(uuid)'::regprocedure);
  revised:=replace(definition,'from public.pet_care_episode_events m',
    'from private.legacy_inference_episode_events m');
  if revised=definition then raise exception 'Missing episode rebuild input'; end if;
  execute revised;
end $migration$;

-- Canonical source turns cannot enter the retained legacy care/semantic RPC family.
do $migration$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.persist_furvise_care_event_with_concern(uuid,uuid,uuid,jsonb,uuid)',
    'public.persist_furvise_care_event_before_destination_routing(uuid,uuid,uuid,jsonb,uuid)',
    'public.persist_furvise_care_event(uuid,uuid,uuid,jsonb,uuid)',
    'public.persist_furvise_semantic_event_exact_20260807(uuid,uuid,uuid,jsonb)',
    'public.persist_furvise_semantic_event(uuid,uuid,uuid,jsonb)',
    'public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)',
    'public.persist_furvise_server_care_event(uuid,uuid,uuid,jsonb,uuid)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    execute regexp_replace(definition,'\mbegin\M',
      E'begin\n  if private.is_canonical_ask_source(p_source_message_id) then\n'
      || E'    raise exception using errcode=''42501'',message=''CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN'';\n'
      || E'  end if;','i');
  end loop;
end $migration$;

-- Only the existing privileged canonical writer stamps origin. Never backfill old rows.
do $migration$
declare definition text; revised text;
begin
  definition:=pg_get_functiondef('private.persist_furvise_append_items(uuid,uuid,uuid,jsonb)'::regprocedure);
  revised:=replace(definition,'intelligence_confidence,care_event_metadata)',
    'intelligence_confidence,care_event_metadata,canonical_ask_isolated)');
  revised:=replace(revised,'''source'',''ask_furvise''));','''source'',''ask_furvise''),true);');
  if revised=definition or position('care_event_metadata,canonical_ask_isolated)' in revised)=0
    or position('''source'',''ask_furvise''),true);' in revised)=0 then
    raise exception 'Unexpected canonical append writer';
  end if;
  revised:=replace(revised,'if existing.note is distinct from body',
    'if not existing.canonical_ask_isolated or existing.note is distinct from body');
  execute revised;
  definition:=pg_get_functiondef('private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure);
  revised:=replace(definition,
    '  if v_error is null and v.action_kind = ''care_history.add'' and v.action_payload ? ''appendJob'' then',
    E'  if v_error is null and (v.action_kind=''care_history.remove''\n'
    || E'    or (v.action_kind=''care_history.add'' and not(v.action_payload ? ''appendJob''))) then\n'
    || E'    v_error:=''That history operation is not supported by canonical authority yet.'';\n'
    || E'  end if;\n'
    || '  if v_error is null and v.action_kind = ''care_history.add'' and v.action_payload ? ''appendJob'' then');
  revised:=replace(revised,'      elsif v_detail is null or btrim(v_detail) = '''' then',
    E'      elsif not private.canonical_ask_replace_safe(v.target_id,v.user_id,v.pet_profile_id) then\n'
    || E'        v_error:=''That record cannot be safely replaced without changing derived state.'';\n'
    || '      elsif v_detail is null or btrim(v_detail) = '''' then');
  -- An explicit lifecycle executor may retain its existing audit note, but that
  -- note must not trigger additional prose-derived factual effects either.
  revised:=replace(revised,'intelligence_source_message_id,intelligence_source_type,idempotency_key',
    'intelligence_source_message_id,intelligence_source_type,idempotency_key,canonical_ask_isolated');
  revised:=replace(revised,'''ask_application_action'',v.id','''ask_application_action'',v.id,true');
  if revised=definition or position('private.canonical_ask_replace_safe' in revised)=0
    or position('That history operation is not supported by canonical authority yet.' in revised)=0
    or position('idempotency_key,canonical_ask_isolated' in revised)=0 then
    raise exception 'Unexpected canonical capability executor';
  end if;
  execute revised;
end $migration$;
