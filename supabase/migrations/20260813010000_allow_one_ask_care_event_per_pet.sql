-- A governed multi-pet Ask turn may create one independently scoped care event
-- for each owned pet. The RPC already keys idempotency by owner, target pet, and
-- source message; align the supporting uniqueness constraint with that contract.
create unique index if not exists pet_care_entries_intelligence_source_pet_unique
  on public.pet_care_entries(user_id, pet_profile_id, intelligence_source_message_id)
  where intelligence_source_message_id is not null;

-- Existing care RPCs infer the former two-column unique index in ON CONFLICT.
-- Update that inference before retiring the old index, while retaining each
-- function's existing authorization, validation, lifecycle, and grant policy.
do $migration$
declare
  v_procedure regprocedure;
  v_definition text;
begin
  foreach v_procedure in array array[
    'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)'::regprocedure,
    'public.persist_furvise_care_event_with_concern(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.persist_furvise_care_event(uuid,uuid,uuid,jsonb,uuid)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_procedure) into strict v_definition;
    if regexp_count(v_definition, 'on conflict \(user_id, intelligence_source_message_id\)') <> 1 then
      raise exception using errcode = '55000', message = 'ASK_CARE_IDEMPOTENCY_GUARD_UNEXPECTED', detail = v_procedure::text;
    end if;
    v_definition := replace(
      v_definition,
      'on conflict (user_id, intelligence_source_message_id)',
      'on conflict (user_id, pet_profile_id, intelligence_source_message_id)'
    );
    v_definition := replace(
      v_definition,
      'where entry_row.user_id = p_user_id and entry_row.intelligence_source_message_id = p_source_message_id',
      'where entry_row.user_id = p_user_id and entry_row.pet_profile_id = p_pet_id and entry_row.intelligence_source_message_id = p_source_message_id'
    );
    execute v_definition;
  end loop;
end;
$migration$;

drop index if exists public.pet_care_entries_intelligence_source_unique;
