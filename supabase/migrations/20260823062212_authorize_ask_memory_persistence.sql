-- Canonical Ask memories are server-authored outputs. The legacy RPC accepted
-- caller-authored JSON under an authenticated JWT, so ownership checks alone
-- could not establish semantic authority.
create function public.persist_furvise_ask_intelligence(
  p_user_id uuid,
  p_pet_id uuid,
  p_authorized_pet_ids uuid[],
  p_source_message_id uuid,
  p_assistant_message_id uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_operation_owner_token uuid,
  p_learnings jsonb default '[]'::jsonb
)
returns table(
  memories_created integer,
  memories_superseded integer,
  care_entries_created integer,
  concerns_resolved integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learning jsonb;
  v_existing public.furvise_memories%rowtype;
  v_memory_id uuid;
  v_dedupe_key text;
  v_subject_type text;
  v_memory_pet_id uuid;
  v_category text;
  v_fact_key text;
  v_fact_value text;
  v_normalized_value text;
  v_source_excerpt text;
  v_source_text text;
  v_authorized_learnings jsonb;
  v_memories_created integer := 0;
  v_memories_superseded integer := 0;
begin
  -- Opaque sb_secret keys are authorized by PostgREST as the service_role
  -- database role and do not carry legacy JWT role claims. The EXECUTE grant
  -- below is therefore the caller boundary; the body still binds every write
  -- to the live Ask lease and the exact server-governed message output.
  if p_user_id is null or p_pet_id is null or p_source_message_id is null
    or p_assistant_message_id is null or p_request_id is null or p_operation_owner_token is null
    or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'ASK_MEMORY_IDENTITY_REQUIRED';
  end if;
  if p_authorized_pet_ids is null
    or cardinality(p_authorized_pet_ids) not between 1 and 8
    or p_pet_id <> all(p_authorized_pet_ids)
    or exists (select 1 from unnest(p_authorized_pet_ids) as authorized_pet(id) where authorized_pet.id is null)
    or (select count(*) from unnest(p_authorized_pet_ids) as authorized_pet(id))
      <> (select count(distinct authorized_pet.id) from unnest(p_authorized_pet_ids) as authorized_pet(id)) then
    raise exception using errcode = '42501', message = 'ASK_MEMORY_PET_NOT_AUTHORIZED';
  end if;
  if exists (
    select 1
    from unnest(p_authorized_pet_ids) as authorized_pet(id)
    where not exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = authorized_pet.id and pet_row.user_id = p_user_id
    )
  ) then
    raise exception using errcode = '42501', message = 'ASK_MEMORY_PET_NOT_OWNED';
  end if;
  if jsonb_typeof(coalesce(p_learnings, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_learnings, '[]'::jsonb)) > 8
    or octet_length(coalesce(p_learnings, '[]'::jsonb)::text) > 32768 then
    raise exception using errcode = '22023', message = 'ASK_MEMORY_PAYLOAD_INVALID';
  end if;
  if not exists (
    select 1
    from public.idempotency_operations as operation_row
    where operation_row.user_id = p_user_id
      and operation_row.operation_type = 'ask.submit.persisted_answer_v2'
      and operation_row.idempotency_key = p_request_id
      and operation_row.payload_hash = p_payload_hash
      and operation_row.owner_token = p_operation_owner_token
      and operation_row.status = 'processing'
      and operation_row.lease_expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception using errcode = '42501', message = 'ASK_MEMORY_REQUEST_NOT_AUTHORIZED';
  end if;

  select source_message.user_text, assistant_message.persistence_governance->'authorizedLearnings'
    into strict v_source_text, v_authorized_learnings
  from public.ask_conversation_messages as source_message
  join public.ask_conversation_messages as assistant_message
    on assistant_message.conversation_id = source_message.conversation_id
    and assistant_message.id = p_assistant_message_id
    and assistant_message.user_id = p_user_id
    and assistant_message.role = 'furvise'
    and assistant_message.request_id = p_request_id
    and assistant_message.sequence_number = source_message.sequence_number + 1
    and assistant_message.persistence_governance is not null
    and assistant_message.intelligence_validation->>'valid' = 'true'
  join public.ask_conversations as conversation_row
    on conversation_row.id = source_message.conversation_id
    and conversation_row.user_id = p_user_id
  where source_message.id = p_source_message_id
    and source_message.user_id = p_user_id
    and source_message.role = 'user'
    and source_message.request_id = p_request_id;
  if btrim(coalesce(v_source_text, '')) = '' or char_length(v_source_text) > 1200 then
    raise exception using errcode = '22023', message = 'ASK_MEMORY_SOURCE_INVALID';
  end if;
  if jsonb_typeof(v_authorized_learnings) is distinct from 'array' then
    raise exception using errcode = '42501', message = 'ASK_MEMORY_GOVERNANCE_REQUIRED';
  end if;
  if jsonb_array_length(v_authorized_learnings) > 8
    or octet_length(v_authorized_learnings::text) > 32768 then
    raise exception using errcode = '42501', message = 'ASK_MEMORY_GOVERNANCE_REQUIRED';
  end if;
  v_source_text := lower(regexp_replace(v_source_text, '[^[:alnum:]]+', ' ', 'g'));

  for v_learning in select value from jsonb_array_elements(coalesce(p_learnings, '[]'::jsonb))
  loop
    if jsonb_typeof(v_learning) <> 'object'
      or v_learning - array[
        'subjectType', 'subjectId', 'category', 'factKey', 'canonicalConceptKey',
        'factValue', 'normalizedValue', 'confidence', 'importance', 'durability',
        'action', 'sourceExcerpt'
      ] <> '{}'::jsonb
      or jsonb_typeof(v_learning->'subjectType') <> 'string'
      or not (v_learning ? 'subjectId')
      or jsonb_typeof(v_learning->'subjectId') not in ('string', 'null')
      or jsonb_typeof(v_learning->'category') <> 'string'
      or jsonb_typeof(v_learning->'factKey') <> 'string'
      or jsonb_typeof(v_learning->'factValue') <> 'string'
      or jsonb_typeof(v_learning->'normalizedValue') <> 'string'
      or jsonb_typeof(v_learning->'confidence') <> 'number'
      or jsonb_typeof(v_learning->'importance') <> 'string'
      or jsonb_typeof(v_learning->'durability') <> 'string'
      or jsonb_typeof(v_learning->'action') <> 'string'
      or jsonb_typeof(v_learning->'sourceExcerpt') <> 'string'
      or (
        v_learning ? 'canonicalConceptKey'
        and jsonb_typeof(v_learning->'canonicalConceptKey') not in ('string', 'null')
      ) then
      raise exception using errcode = '22023', message = 'ASK_MEMORY_LEARNING_INVALID';
    end if;

    v_subject_type := v_learning->>'subjectType';
    v_category := btrim(v_learning->>'category');
    v_fact_key := public.normalize_furvise_memory_identifier(v_learning->>'factKey');
    v_fact_value := btrim(v_learning->>'factValue');
    v_normalized_value := lower(regexp_replace(v_fact_value, '\s+', ' ', 'g'));
    v_source_excerpt := btrim(v_learning->>'sourceExcerpt');
    if v_subject_type not in ('pet', 'owner')
      or v_category = '' or char_length(v_category) > 80
      or v_fact_key = '' or char_length(v_learning->>'factKey') > 100
      or char_length(v_fact_value) not between 2 and 500
      or char_length(v_source_excerpt) not between 1 and 240
      or char_length(v_learning->>'normalizedValue') > 500
      or char_length(coalesce(v_learning->>'canonicalConceptKey', '')) > 100
      or v_learning->>'normalizedValue' <> v_normalized_value
      or (v_learning->>'confidence')::numeric not between 0.85 and 1
      or v_learning->>'importance' not in ('low', 'medium', 'high')
      or v_learning->>'durability' not in ('ongoing', 'durable')
      or v_learning->>'action' not in ('create', 'confirm', 'update', 'supersede', 'resolve') then
      raise exception using errcode = '22023', message = 'ASK_MEMORY_LEARNING_INVALID';
    end if;

    if v_subject_type = 'pet' then
      if coalesce(v_learning->>'subjectId', '') <> p_pet_id::text then
        raise exception using errcode = '42501', message = 'ASK_MEMORY_SUBJECT_INVALID';
      end if;
      v_memory_pet_id := p_pet_id;
    else
      if v_learning->'subjectId' is not null and jsonb_typeof(v_learning->'subjectId') <> 'null' then
        raise exception using errcode = '42501', message = 'ASK_MEMORY_SUBJECT_INVALID';
      end if;
      v_memory_pet_id := null;
    end if;

    if position(
      lower(regexp_replace(v_source_excerpt, '[^[:alnum:]]+', ' ', 'g'))
      in v_source_text
    ) = 0 then
      raise exception using errcode = '22023', message = 'ASK_MEMORY_PROVENANCE_REQUIRED';
    end if;
    if not coalesce(v_authorized_learnings @> jsonb_build_array(v_learning), false) then
      raise exception using errcode = '22023', message = 'ASK_MEMORY_FACT_NOT_GOVERNED';
    end if;

    v_dedupe_key := md5(
      p_user_id::text || ':' || coalesce(v_memory_pet_id::text, 'owner') || ':' ||
      v_fact_key || ':' || v_normalized_value || ':' || p_source_message_id::text
    );
    select memory_row.* into v_existing
    from public.furvise_memories as memory_row
    where memory_row.user_id = p_user_id
      and memory_row.subject_type = v_subject_type
      and memory_row.pet_id is not distinct from v_memory_pet_id
      and memory_row.fact_key = v_fact_key
      and memory_row.status = 'active'
    order by memory_row.last_confirmed_at desc
    limit 1
    for update;
    if v_existing.id is not null and v_existing.normalized_value = v_normalized_value then
      update public.furvise_memories as memory_row
      set last_confirmed_at = now(), updated_at = now(),
          confidence = greatest(memory_row.confidence, (v_learning->>'confidence')::numeric)
      where memory_row.id = v_existing.id;
      continue;
    end if;

    insert into public.furvise_memories(
      user_id, pet_id, subject_type, category, fact_key, fact_value,
      normalized_value, confidence, importance, durability, status,
      source_type, source_id, source_excerpt, dedupe_key
    ) values (
      p_user_id, v_memory_pet_id, v_subject_type, v_category, v_fact_key,
      to_jsonb(v_fact_value), v_normalized_value, (v_learning->>'confidence')::numeric,
      v_learning->>'importance', v_learning->>'durability', 'active',
      'ask_message', p_source_message_id, v_source_excerpt, v_dedupe_key
    ) on conflict (dedupe_key) do nothing
    returning id into v_memory_id;
    if v_memory_id is null then
      continue;
    end if;
    v_memories_created := v_memories_created + 1;
    if v_existing.id is not null then
      update public.furvise_memories as memory_row
      set status = 'superseded', superseded_by = v_memory_id, updated_at = now()
      where memory_row.id = v_existing.id;
      v_memories_superseded := v_memories_superseded + 1;
    end if;
    v_existing := null;
    v_memory_id := null;
  end loop;

  return query select v_memories_created, v_memories_superseded, 0, 0;
exception
  when no_data_found then
    raise exception using errcode = '42501', message = 'ASK_MEMORY_SOURCE_NOT_AUTHORIZED';
end;
$$;

revoke all on function public.persist_furvise_ask_intelligence(uuid, uuid, uuid[], uuid, uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_furvise_ask_intelligence(uuid, uuid, uuid[], uuid, uuid, uuid, text, uuid, jsonb)
  to service_role;

-- The legacy signature remains present for deployment/API compatibility, but
-- no Data API application role may execute it after this migration.
revoke all on function public.persist_furvise_intelligence(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;

do $migration$
begin
  if has_function_privilege('anon', 'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)', 'EXECUTE') then
    raise exception using errcode = '55000', message = 'LEGACY_ASK_MEMORY_RPC_PRIVILEGE_CONTRACT_FAILED';
  end if;
  if has_function_privilege('anon', 'public.persist_furvise_ask_intelligence(uuid,uuid,uuid[],uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.persist_furvise_ask_intelligence(uuid,uuid,uuid[],uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.persist_furvise_ask_intelligence(uuid,uuid,uuid[],uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE') then
    raise exception using errcode = '55000', message = 'ASK_MEMORY_RPC_PRIVILEGE_CONTRACT_FAILED';
  end if;
  if has_function_privilege('anon', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE') then
    raise exception using errcode = '55000', message = 'FEATURE_INTELLIGENCE_RPC_PRIVILEGE_CONTRACT_CHANGED';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'furvise_memories'
      and relation.relrowsecurity and relation.relforcerowsecurity
  ) then
    raise exception using errcode = '55000', message = 'FURVISE_MEMORY_RLS_CONTRACT_CHANGED';
  end if;
end;
$migration$;

comment on function public.persist_furvise_ask_intelligence(uuid, uuid, uuid[], uuid, uuid, uuid, text, uuid, jsonb) is
  'Service-only Ask memory persistence bound to a live idempotency lease, exact governed message pair, authorized pets, bounded payloads, and grounded semantic provenance.';
