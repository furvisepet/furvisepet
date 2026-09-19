-- Route named medication chronology explicitly and repair QA-only destination mistakes.
alter function public.persist_furvise_care_event(uuid, uuid, uuid, jsonb, uuid)
  rename to persist_furvise_care_event_before_destination_routing;
revoke all on function public.persist_furvise_care_event_before_destination_routing(uuid, uuid, uuid, jsonb, uuid) from public, anon;

create function public.persist_furvise_care_event(
  p_user_id uuid, p_pet_id uuid, p_source_message_id uuid, p_care_action jsonb, p_suggestion_id uuid default null
)
returns table(persistence_status text, care_entry_ids uuid[], concern_ids uuid[], current_safety_state text, already_persisted boolean, error_code text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_entry_id uuid; v_operation text := p_care_action->>'episodeOperation'; v_key text := p_care_action->>'normalizedEpisodeKey';
begin
  if p_care_action->>'category' <> 'medication' or v_operation not in ('start','complete') then
    return query select * from public.persist_furvise_care_event_before_destination_routing(p_user_id,p_pet_id,p_source_message_id,p_care_action,p_suggestion_id);
    return;
  end if;
  if auth.uid() is distinct from p_user_id or not exists(select 1 from public.dog_profiles where id=p_pet_id and user_id=p_user_id) then
    raise exception using errcode='42501',message='CARE_EVENT_FORBIDDEN';
  end if;
  if coalesce(v_key,'') !~ '^[a-z0-9_]{3,80}$' or coalesce((p_care_action->>'confidence')::numeric,0) < 0.90 then
    raise exception using errcode='22023',message='CARE_EVENT_INVALID';
  end if;
  select id into v_entry_id from public.pet_care_entries where user_id=p_user_id and intelligence_source_message_id=p_source_message_id limit 1 for update;
  if v_entry_id is not null then
    return query select 'persisted'::text,array[v_entry_id],array[]::uuid[],'routine'::text,true,null::text; return;
  end if;
  insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,severity,concern_id,
    intelligence_source_message_id,intelligence_source_type,intelligence_confidence,state_action_type,state_suggestion_id,care_event_metadata)
  values(p_user_id,p_pet_id,'medication',left(p_care_action->>'title',120),left(p_care_action->>'details',1000),now(),null,null,
    p_source_message_id,'ask_furvise',(p_care_action->>'confidence')::numeric,
    case when v_operation='complete' then 'resolve_concern' else 'create_entry' end,p_suggestion_id,
    jsonb_build_object('normalizedConcernKey',v_key,'episodeOperation',v_operation,'source','ask_furvise'))
  returning id into v_entry_id;
  return query select 'persisted'::text,array[v_entry_id],array[]::uuid[],'routine'::text,false,null::text;
end; $$;
revoke all on function public.persist_furvise_care_event(uuid,uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.persist_furvise_care_event(uuid,uuid,uuid,jsonb,uuid) to authenticated;

create function public.refresh_pet_current_medications(p_pet_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid; v_medications jsonb;
begin
  select user_id into v_user_id from public.dog_profiles where id=p_pet_id;
  if v_user_id is null or (auth.role()<>'service_role' and auth.uid() is distinct from v_user_id) then
    raise exception using errcode='42501',message='PET_STATE_FORBIDDEN';
  end if;
  with medication_events as (
    select entry_row.id,entry_row.occurred_at,entry_row.created_at,
      (regexp_match(coalesce(entry_row.title,''),'(?i)^(?:Started|Finished|Completed|Stopped)\s+([A-Za-z][A-Za-z0-9-]{2,})'))[1] as medication_name,
      case when coalesce(entry_row.title,'') ~* '^(Finished|Completed|Stopped)\s+' then 'complete' else 'start' end as operation
    from public.pet_care_entries entry_row where entry_row.user_id=v_user_id and entry_row.pet_profile_id=p_pet_id and entry_row.category='medication'
  ), latest as (
    select distinct on (lower(medication_name)) id,occurred_at,medication_name,operation from medication_events
    where medication_name is not null order by lower(medication_name),occurred_at desc,created_at desc
  ) select coalesce(jsonb_agg(jsonb_build_object('name',medication_name,'startedAt',occurred_at,'sourceEventId',id)) filter(where operation='start'),'[]'::jsonb)
    into v_medications from latest;
  update public.pet_current_state set state=jsonb_set(state,'{currentMedications}',v_medications),state_version=state_version+1,computed_at=now(),updated_at=now()
  where pet_profile_id=p_pet_id and user_id=v_user_id;
end; $$;
revoke all on function public.refresh_pet_current_medications(uuid) from public,anon,authenticated;

create function public.sync_medication_episode_and_state()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.category<>'medication' then return new; end if;
  if new.state_action_type='resolve_concern' and new.episode_id is not null then
    update public.pet_care_episodes set status='resolved',resolved_at=new.occurred_at,last_event_at=greatest(last_event_at,new.occurred_at),updated_at=now()
    where id=new.episode_id and user_id=new.user_id;
  end if;
  perform public.refresh_pet_current_medications(new.pet_profile_id);
  return new;
end; $$;
revoke all on function public.sync_medication_episode_and_state() from public,anon,authenticated;
drop trigger if exists zz_pet_care_entries_medication_state on public.pet_care_entries;
create trigger zz_pet_care_entries_medication_state after insert on public.pet_care_entries for each row execute function public.sync_medication_episode_and_state();

create function public.repair_maple_persistence_destinations(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_pet constant uuid:='75db72b1-64fe-476d-a62a-70f4f6aee7cd';
  v_care_ids uuid[]:=array['36958082-5c4b-4f76-8796-6a031cbc7922','365872ff-5d98-42ba-9d0d-ea2f5d3c09f4','97e4fa06-aed5-4c28-9745-d408f4480e65','f91a4f9a-4abb-40d4-81b1-aad463a1e78c']::uuid[];
  v_memory_ids uuid[]:=array['bb5477ed-8e68-4bba-b5c3-67b32fc03866','d9051a53-f11b-4446-80b0-7a095942a2b0','9ceda788-b04a-4412-a893-3859ce3841b7']::uuid[];
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  if p_dry_run then return jsonb_build_object('dryRun',true,'careEntryIds',v_care_ids,'memoryIds',v_memory_ids); end if;

  update public.ask_conversation_messages assistant_row set care_persistence=jsonb_build_object('status','skipped','careEntryIds','[]'::jsonb,'concernIds','[]'::jsonb,'errorCode',null,'memoryIds',jsonb_build_array(mapping.memory_id))
  from (values
    ('fd6ec69b-6bc6-408d-a104-d82929648a76'::uuid,'bb5477ed-8e68-4bba-b5c3-67b32fc03866'::uuid),
    ('9be79fc8-2ea5-4b88-ada7-20bcec9bc43d'::uuid,'d9051a53-f11b-4446-80b0-7a095942a2b0'::uuid),
    ('72bcbdb4-65eb-4593-9983-03e4d568b3bb'::uuid,'9ceda788-b04a-4412-a893-3859ce3841b7'::uuid)
  ) mapping(request_id,memory_id) where assistant_row.request_id=mapping.request_id and assistant_row.role='furvise';
  update public.ask_conversation_messages set care_persistence=jsonb_build_object('status','skipped','careEntryIds','[]'::jsonb,'concernIds','[]'::jsonb,'errorCode',null,'memoryIds','[]'::jsonb)
  where request_id='98158aed-b8e2-4838-af17-000037c92748' and role='furvise';

  delete from public.pet_care_entries where pet_profile_id=v_pet and id=any(v_care_ids);
  delete from public.pet_care_episodes where pet_profile_id=v_pet and id='4674d71f-78eb-49f9-9c20-31a3cdc8b7a7';
  update public.pet_care_episodes set title='Apoquel course',normalized_key='medication_apoquel',status='resolved',
    resolved_at=(select occurred_at from public.pet_care_entries where id='b7f6fa97-ef7a-485e-8e8d-0459639091e8'),updated_at=now()
  where id='3749b2a5-6c94-4118-b1f1-80cf1677b3b9' and pet_profile_id=v_pet;
  perform public.refresh_pet_current_medications(v_pet);
  return jsonb_build_object('dryRun',false,'applied',true,'removedCareEntryIds',v_care_ids,'retainedMemoryIds',v_memory_ids,
    'retainedApoquelCareEntryIds',jsonb_build_array('4a586128-8788-41c2-af01-787ad3472610','b7f6fa97-ef7a-485e-8e8d-0459639091e8'));
end; $$;
revoke all on function public.repair_maple_persistence_destinations(boolean) from public,anon,authenticated;
grant execute on function public.repair_maple_persistence_destinations(boolean) to service_role;
