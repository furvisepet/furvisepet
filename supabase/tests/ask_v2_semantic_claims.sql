begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ask-v2-a@example.test', '', now(), now()),
  ('52000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ask-v2-b@example.test', '', now(), now());

insert into public.dog_profiles(id, user_id, name, species) values
  ('51000000-0000-4000-8000-000000000011', '51000000-0000-4000-8000-000000000001', 'Luna', 'dog'),
  ('52000000-0000-4000-8000-000000000021', '52000000-0000-4000-8000-000000000002', 'Private pet', 'cat');

insert into public.ask_conversations(id, user_id, pet_profile_id, title, preview) values
  ('51000000-0000-4000-8000-000000000031', '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000011', 'Ask v2 A', ''),
  ('52000000-0000-4000-8000-000000000032', '52000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000021', 'Ask v2 B', '');

insert into public.ask_conversation_messages(id, conversation_id, user_id, role, sequence_number, user_text) values
  ('51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000031', '51000000-0000-4000-8000-000000000001', 'user', 1, 'Luna is limping and I prefer local stores'),
  ('51000000-0000-4000-8000-000000000043', '51000000-0000-4000-8000-000000000031', '51000000-0000-4000-8000-000000000001', 'user', 2, 'Actually I prefer online stores'),
  ('52000000-0000-4000-8000-000000000042', '52000000-0000-4000-8000-000000000032', '52000000-0000-4000-8000-000000000002', 'user', 1, 'Private pet is tired');

insert into public.pet_care_episodes(
  id, user_id, pet_profile_id, episode_type, normalized_key, title, status,
  severity, sequence_number, started_at, last_event_at, summary
) values (
  '51000000-0000-4000-8000-000000000051', '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000011', 'symptom', 'limping', 'Limping', 'active',
  'important', 1, now(), now(), '{}'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    perform public.persist_governed_semantic_turn_v2(
      '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000061',
      'frame.v1', 'policy.v1', '{"claims":[],"relations":[]}'::jsonb
    );
    raise exception 'authenticated client executed the service-only v2 RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.semantic_claims(
      user_id, source_type, subject_type, subject_id, claim_kind, canonical_concept_key,
      concept_version, predicate, polarity, modality, durability, temporal_precision,
      grounded_evidence, extraction_confidence, governed_confidence, frame_schema_version,
      governance_policy_version, source_local_claim_key, turn_idempotency_key,
      turn_payload_hash, persistence_destination, provenance_classification
    ) values (
      '51000000-0000-4000-8000-000000000001', 'ask_message', 'owner',
      '51000000-0000-4000-8000-000000000001', 'preference', 'test', 'v1', '{}',
      'affirmed', 'asserted', 'durable', 'unknown', '[{"start":0,"end":1,"excerpt":"x"}]',
      1, 1, 'v1', 'v1', 'claim_direct', gen_random_uuid(), repeat('a', 64),
      'owner_memory', 'ask_v2_shadow'
    );
    raise exception 'authenticated client inserted directly into semantic_claims';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_result record;
  v_retry record;
  v_pref_id uuid;
  v_payload jsonb := jsonb_build_object(
    'claims', jsonb_build_array(
      jsonb_build_object(
        'source_local_claim_key', 'claim_limping', 'subject_type', 'pet',
        'subject_id', '51000000-0000-4000-8000-000000000011',
        'resolved_entities', jsonb_build_array(jsonb_build_object('entity_type', 'pet', 'entity_id', '51000000-0000-4000-8000-000000000011')),
        'claim_kind', 'event', 'concept_key', 'limping', 'canonical_concept_key', 'limping',
        'concept_resolution_status', 'canonical', 'concept_authority', 'governed_registry', 'concept_version', 'furvise.core.v1',
        'predicate', jsonb_build_object('label', 'limping'), 'structured_value', jsonb_build_object('state', 'active'),
        'polarity', 'affirmed', 'modality', 'asserted', 'durability', 'ongoing',
        'temporal_precision', 'unknown', 'grounded_evidence', jsonb_build_array(jsonb_build_object('start', 0, 'end', 15, 'excerpt', 'Luna is limping')),
        'extraction_confidence', 0.98, 'governed_confidence', 0.97,
        'lifecycle_role', 'opening', 'lifecycle_transition', 'started',
        'server_episode_id', '51000000-0000-4000-8000-000000000051',
        'persistence_destination', 'history'
      ),
      jsonb_build_object(
        'source_local_claim_key', 'claim_owner_preference', 'subject_type', 'owner',
        'subject_id', '51000000-0000-4000-8000-000000000001',
        'resolved_entities', jsonb_build_array(jsonb_build_object('entity_type', 'owner', 'entity_id', '51000000-0000-4000-8000-000000000001')),
        'claim_kind', 'preference', 'concept_key', 'retailer_locality', 'canonical_concept_key', null,
        'concept_resolution_status', 'provisional', 'concept_authority', 'provisional_normalizer', 'concept_version', 'concept.provisional.v1',
        'predicate', jsonb_build_object('label', 'retailer locality'), 'structured_value', jsonb_build_object('value', 'local'),
        'polarity', 'affirmed', 'modality', 'asserted', 'durability', 'durable',
        'temporal_precision', 'unknown', 'grounded_evidence', jsonb_build_array(jsonb_build_object('start', 20, 'end', 41, 'excerpt', 'I prefer local stores')),
        'extraction_confidence', 0.99, 'governed_confidence', 0.99,
        'persistence_destination', 'owner_memory'
      )
    ),
    'relations', '[]'::jsonb
  );
begin
  if auth.uid() is not null then
    raise exception 'service invocation unexpectedly inherited an end-user JWT subject';
  end if;
  select * into v_result from public.persist_governed_semantic_turn_v2(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000061',
    'frame.v1', 'policy.v1', v_payload
  );
  if cardinality(v_result.claim_ids) <> 2 or v_result.already_persisted then
    raise exception 'multi-claim governed turn was not persisted atomically';
  end if;
  if v_result.projection_version <> 'ask_v2.shadow.projections.v1'
    or v_result.snapshot_metadata->>'mode' <> 'shadow_only' then
    raise exception 'projection snapshot metadata is not versioned shadow output';
  end if;
  if not exists(
    select 1 from public.pet_care_episode_events member
    where member.claim_id = v_result.claim_ids[1]
      and member.care_entry_id is null
      and member.episode_id = '51000000-0000-4000-8000-000000000051'
  ) then
    raise exception 'claim-based lifecycle membership was not created';
  end if;

  select * into v_retry from public.persist_governed_semantic_turn_v2(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000061',
    'frame.v1', 'policy.v1', v_payload
  );
  if not v_retry.already_persisted or v_retry.claim_ids <> v_result.claim_ids then
    raise exception 'duplicate governed turn was not idempotent';
  end if;

  select id into v_pref_id from public.semantic_claims
  where user_id = '51000000-0000-4000-8000-000000000001'
    and source_local_claim_key = 'claim_owner_preference';
  perform public.persist_governed_semantic_turn_v2(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000043', '51000000-0000-4000-8000-000000000066',
    'frame.v1', 'policy.v1', jsonb_build_object(
      'claims', jsonb_build_array(jsonb_build_object(
        'source_local_claim_key', 'claim_correction', 'subject_type', 'owner',
        'subject_id', '51000000-0000-4000-8000-000000000001',
        'resolved_entities', jsonb_build_array(jsonb_build_object('entity_type', 'owner', 'entity_id', '51000000-0000-4000-8000-000000000001')),
        'claim_kind', 'correction', 'operation_type', 'correct', 'concept_key', 'retailer_locality',
        'canonical_concept_key', null, 'concept_resolution_status', 'provisional',
        'concept_authority', 'provisional_normalizer', 'concept_version', 'concept.provisional.v1',
        'predicate', jsonb_build_object('label', 'retailer locality'), 'structured_value', jsonb_build_object('value', 'online'),
        'polarity', 'affirmed', 'modality', 'asserted', 'durability', 'unknown', 'temporal_precision', 'unknown',
        'grounded_evidence', jsonb_build_array(jsonb_build_object('start', 0, 'end', 31, 'excerpt', 'Actually I prefer online stores')),
        'extraction_confidence', 0.99, 'governed_confidence', 0.99, 'persistence_destination', 'owner_memory'
      )),
      'relations', jsonb_build_array(jsonb_build_object(
        'source_local_relation_key', 'relation_correction', 'from_local_claim_key', 'claim_correction',
        'to_claim_id', v_pref_id, 'relation_type', 'corrects', 'metadata', '{}'::jsonb
      ))
    )
  );
  if not exists(select 1 from public.semantic_claim_relations relation
      where relation.to_claim_id = v_pref_id and relation.relation_type = 'corrects') then
    raise exception 'owned prior-claim correction target was not resolved';
  end if;

  begin
    perform public.persist_governed_semantic_turn_v2(
      '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000062',
      'frame.v1', 'policy.v1', jsonb_set(v_payload, '{claims,0,grounded_evidence,0,excerpt}', '"tampered"')
    );
    raise exception 'evidence tampering was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.persist_governed_semantic_turn_v2(
      '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000063',
      'frame.v1', 'policy.v1', jsonb_set(v_payload, '{claims,0,subject_id}', '"52000000-0000-4000-8000-000000000021"')
    );
    raise exception 'cross-user pet subject was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.persist_governed_semantic_turn_v2(
      '51000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000042', '51000000-0000-4000-8000-000000000064',
      'frame.v1', 'policy.v1', v_payload
    );
    raise exception 'cross-user source message was accepted';
  exception when no_data_found then null;
  end;

  begin
    perform public.persist_governed_semantic_turn_v2(
      '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000065',
      'frame.v1', 'policy.v1', v_payload || '{"user_id":"52000000-0000-4000-8000-000000000002"}'::jsonb
    );
    raise exception 'client or model user ID was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

-- The inverse edge would create a directed correction cycle and must fail.
do $$
declare
  v_pref_id uuid;
  v_correction_id uuid;
begin
  select id into v_pref_id from public.semantic_claims where source_local_claim_key = 'claim_owner_preference';
  select id into v_correction_id from public.semantic_claims where source_local_claim_key = 'claim_correction';
  begin
    insert into public.semantic_claim_relations(
      user_id, from_claim_id, to_claim_id, relation_type, source_local_relation_key
    ) values (
      '51000000-0000-4000-8000-000000000001', v_pref_id, v_correction_id, 'corrects', 'relation_cycle'
    );
    raise exception 'semantic relation cycle was accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Membership rows have exactly one source authority.
insert into public.pet_care_entries(
  id, user_id, pet_profile_id, category, title, note, occurred_at
) values (
  '51000000-0000-4000-8000-000000000071', '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000011', 'general', 'Legacy membership', 'Compatibility member', now()
);
insert into public.pet_care_episode_events(
  care_entry_id, episode_id, user_id, pet_profile_id, event_ordinal, event_role, occurred_at
) values (
  '51000000-0000-4000-8000-000000000071', '51000000-0000-4000-8000-000000000051',
  '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000011', 2, 'continuation', now()
);

do $$
declare
  v_claim_id uuid;
begin
  select id into v_claim_id from public.semantic_claims where source_local_claim_key = 'claim_limping';
  begin
    insert into public.pet_care_episode_events(
      episode_id, user_id, pet_profile_id, event_ordinal, event_role, occurred_at
    ) values (
      '51000000-0000-4000-8000-000000000051', '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000011', 3, 'continuation', now()
    );
    raise exception 'membership with neither source was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.pet_care_episode_events(
      care_entry_id, claim_id, episode_id, user_id, pet_profile_id, event_ordinal, event_role, occurred_at
    ) values (
      '51000000-0000-4000-8000-000000000071', v_claim_id,
      '51000000-0000-4000-8000-000000000051', '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000011', 4, 'continuation', now()
    );
    raise exception 'membership with both sources was accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Removing ordinary conversation content clears the live pointer, not knowledge authority.
delete from public.ask_conversation_messages where id = '51000000-0000-4000-8000-000000000041';
do $$
begin
  if (select count(*) from public.semantic_claims
      where source_message_lineage_id = '51000000-0000-4000-8000-000000000041') <> 2 then
    raise exception 'source-message deletion erased canonical semantic claims';
  end if;
  if exists(select 1 from public.semantic_claims
      where source_message_lineage_id = '51000000-0000-4000-8000-000000000041' and source_message_id is not null) then
    raise exception 'deleted source message live pointer was retained';
  end if;
end;
$$;

rollback;
