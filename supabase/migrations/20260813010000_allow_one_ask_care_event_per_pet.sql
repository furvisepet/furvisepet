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
  v_expected_old_lookup_count integer;
  v_expected_new_lookup_count integer;
  v_old_lookup_count integer;
  v_new_lookup_count integer;
  v_old_conflict_pattern constant text := 'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*user_id[[:space:]]*,[[:space:]]*intelligence_source_message_id[[:space:]]*\)';
  v_new_conflict_pattern constant text := 'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*user_id[[:space:]]*,[[:space:]]*pet_profile_id[[:space:]]*,[[:space:]]*intelligence_source_message_id[[:space:]]*\)';
  v_old_entry_lookup_pattern constant text := 'where[[:space:]]+entry_row\.user_id[[:space:]]*=[[:space:]]*p_user_id[[:space:]]+and[[:space:]]+entry_row\.intelligence_source_message_id[[:space:]]*=[[:space:]]*p_source_message_id';
  v_new_entry_lookup_pattern constant text := 'where[[:space:]]+entry_row\.user_id[[:space:]]*=[[:space:]]*p_user_id[[:space:]]+and[[:space:]]+entry_row\.pet_profile_id[[:space:]]*=[[:space:]]*p_pet_id[[:space:]]+and[[:space:]]+entry_row\.intelligence_source_message_id[[:space:]]*=[[:space:]]*p_source_message_id';
  v_old_medication_lookup_pattern constant text := 'where[[:space:]]+user_id[[:space:]]*=[[:space:]]*p_user_id[[:space:]]+and[[:space:]]+intelligence_source_message_id[[:space:]]*=[[:space:]]*p_source_message_id[[:space:]]+limit[[:space:]]+1[[:space:]]+for[[:space:]]+update;';
  v_new_medication_lookup_pattern constant text := 'where[[:space:]]+user_id[[:space:]]*=[[:space:]]*p_user_id[[:space:]]+and[[:space:]]+pet_profile_id[[:space:]]*=[[:space:]]*p_pet_id[[:space:]]+and[[:space:]]+intelligence_source_message_id[[:space:]]*=[[:space:]]*p_source_message_id[[:space:]]+limit[[:space:]]+1[[:space:]]+for[[:space:]]+update;';
begin
  foreach v_procedure in array array[
    'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)'::regprocedure,
    'public.persist_furvise_care_event_with_concern(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.persist_furvise_care_event_before_destination_routing(uuid,uuid,uuid,jsonb,uuid)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_procedure) into strict v_definition;
    if regexp_count(v_definition, v_old_conflict_pattern) <> 1 then
      raise exception using errcode = '55000', message = 'ASK_CARE_IDEMPOTENCY_GUARD_UNEXPECTED', detail = v_procedure::text;
    end if;

    v_expected_old_lookup_count := case
      when v_procedure = 'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)'::regprocedure then 0
      else 1
    end;
    v_old_lookup_count := regexp_count(v_definition, v_old_entry_lookup_pattern);
    if v_old_lookup_count <> v_expected_old_lookup_count then
      raise exception using errcode = '55000', message = 'ASK_CARE_IDEMPOTENCY_GUARD_UNEXPECTED', detail = v_procedure::text || ':source_lookup';
    end if;
    v_expected_new_lookup_count := regexp_count(v_definition, v_new_entry_lookup_pattern) + v_expected_old_lookup_count;

    v_definition := regexp_replace(v_definition, v_old_conflict_pattern, 'on conflict (user_id, pet_profile_id, intelligence_source_message_id)', 'g');
    v_definition := regexp_replace(v_definition, v_old_entry_lookup_pattern, 'where entry_row.user_id = p_user_id and entry_row.pet_profile_id = p_pet_id and entry_row.intelligence_source_message_id = p_source_message_id', 'g');
    v_new_lookup_count := regexp_count(v_definition, v_new_entry_lookup_pattern);
    if regexp_count(v_definition, v_old_conflict_pattern) <> 0
      or regexp_count(v_definition, v_new_conflict_pattern) <> 1
      or regexp_count(v_definition, v_old_entry_lookup_pattern) <> 0
      or v_new_lookup_count <> v_expected_new_lookup_count then
      raise exception using errcode = '55000', message = 'ASK_CARE_IDEMPOTENCY_REWRITE_UNEXPECTED', detail = v_procedure::text;
    end if;
    execute v_definition;
  end loop;

  -- The current public RPC is a medication-routing wrapper. It has no legacy
  -- ON CONFLICT clause, but its medication retry lookup must use the same
  -- owner + pet + source identity as the delegated care-event functions.
  v_procedure := 'public.persist_furvise_care_event(uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  select pg_get_functiondef(v_procedure) into strict v_definition;
  if regexp_count(v_definition, v_old_conflict_pattern) <> 0 then
    raise exception using errcode = '55000', message = 'ASK_CARE_IDEMPOTENCY_GUARD_UNEXPECTED', detail = v_procedure::text || ':unexpected_conflict';
  end if;
  v_old_lookup_count := regexp_count(v_definition, v_old_medication_lookup_pattern);
  if v_old_lookup_count <> 1 then
    raise exception using errcode = '55000', message = 'ASK_CARE_IDEMPOTENCY_GUARD_UNEXPECTED', detail = v_procedure::text || ':medication_lookup';
  end if;
  v_definition := regexp_replace(v_definition, v_old_medication_lookup_pattern, 'where user_id=p_user_id and pet_profile_id=p_pet_id and intelligence_source_message_id=p_source_message_id limit 1 for update;', 'g');
  v_new_lookup_count := regexp_count(v_definition, v_new_medication_lookup_pattern);
  if regexp_count(v_definition, v_old_medication_lookup_pattern) <> 0 or v_new_lookup_count <> 1 then
    raise exception using errcode = '55000', message = 'ASK_CARE_IDEMPOTENCY_REWRITE_UNEXPECTED', detail = v_procedure::text || ':medication_lookup';
  end if;
  execute v_definition;
end;
$migration$;

drop index if exists public.pet_care_entries_intelligence_source_unique;
