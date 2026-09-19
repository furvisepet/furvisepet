-- Ask v2 Phase 1: append-oriented semantic claims shadow foundation.
-- Legacy Ask remains the production write authority. No production caller invokes
-- persist_governed_semantic_turn_v2 during this phase.

create table if not exists public.semantic_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.ask_conversation_messages(id) on delete set null,
  source_message_lineage_id uuid not null,
  source_type text not null check (source_type in (
    'ask_message', 'manual_history', 'legacy_import', 'system'
  )),
  subject_type text not null check (subject_type in (
    'owner', 'pet', 'person', 'organization', 'product', 'place', 'unknown'
  )),
  subject_id uuid,
  resolved_entities jsonb not null default '[]'::jsonb check (jsonb_typeof(resolved_entities) = 'array'),
  claim_kind text not null check (claim_kind in (
    'assertion', 'event', 'state_transition', 'preference', 'relationship', 'correction'
  )),
  operation_type text not null default 'assert' check (operation_type in (
    'assert', 'retract', 'correct', 'supersede', 'confirm', 'forget', 'dismiss_lifecycle'
  )),
  concept_key text not null check (
    concept_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and char_length(concept_key) <= 120
  ),
  canonical_concept_key text check (
    canonical_concept_key is null or (
      canonical_concept_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and char_length(canonical_concept_key) <= 120
    )
  ),
  concept_resolution_status text not null check (concept_resolution_status in ('provisional', 'canonical')),
  concept_authority text not null check (concept_authority in ('provisional_normalizer', 'governed_registry')),
  concept_version text not null check (char_length(btrim(concept_version)) between 1 and 80),
  predicate jsonb not null check (jsonb_typeof(predicate) = 'object'),
  structured_value jsonb not null default 'null'::jsonb,
  unit text check (unit is null or char_length(btrim(unit)) between 1 and 60),
  polarity text not null check (polarity in ('affirmed', 'negated')),
  modality text not null check (modality in ('asserted', 'reported', 'suspected', 'hypothetical')),
  durability text not null check (durability in ('temporary', 'ongoing', 'durable', 'unknown')),
  occurred_at timestamptz,
  valid_from timestamptz,
  valid_to timestamptz,
  temporal_precision text not null check (temporal_precision in (
    'exact', 'day', 'approximate', 'recurring', 'unknown'
  )),
  recorded_at timestamptz not null default transaction_timestamp(),
  grounded_evidence jsonb not null check (
    jsonb_typeof(grounded_evidence) = 'array' and jsonb_array_length(grounded_evidence) > 0
  ),
  extraction_confidence numeric(5,4) not null check (extraction_confidence between 0 and 1),
  governed_confidence numeric(5,4) not null check (governed_confidence between 0 and 1),
  frame_schema_version text not null check (char_length(btrim(frame_schema_version)) between 1 and 100),
  governance_policy_version text not null check (char_length(btrim(governance_policy_version)) between 1 and 100),
  source_local_claim_key text not null check (
    source_local_claim_key ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'
  ),
  turn_idempotency_key uuid not null,
  turn_payload_hash text not null check (turn_payload_hash ~ '^[0-9a-f]{64}$'),
  lifecycle_role text check (lifecycle_role is null or lifecycle_role in (
    'opening', 'continuation', 'worsening', 'improvement', 'resolution',
    'recurrence', 'correction', 'dismissal', 'unknown'
  )),
  lifecycle_transition text check (lifecycle_transition is null or lifecycle_transition in (
    'started', 'continued', 'changed', 'improved', 'worsened', 'resolved',
    'recurred', 'dismissed', 'unknown'
  )),
  persistence_destination text not null check (persistence_destination in (
    'history', 'current_state', 'pet_memory', 'owner_memory', 'profile',
    'relationship', 'none'
  )),
  provenance_classification text not null check (provenance_classification in (
    'ask_v2_shadow', 'manual', 'legacy_import', 'system_derived'
  )),
  safety_floor_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safety_floor_metadata) = 'object'),
  governance_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(governance_metadata) = 'object'),
  constraint semantic_claims_validity_window_check check (
    valid_from is null or valid_to is null or valid_to >= valid_from
  ),
  constraint semantic_claims_concept_resolution_consistency_check check (
    (concept_resolution_status = 'provisional' and concept_authority = 'provisional_normalizer' and canonical_concept_key is null)
    or (concept_resolution_status = 'canonical' and concept_authority = 'governed_registry'
      and canonical_concept_key is not null and canonical_concept_key = concept_key)
  ),
  constraint semantic_claims_subject_identity_check check (
    (subject_type in ('owner', 'pet') and subject_id is not null)
    or subject_type not in ('owner', 'pet')
  ),
  constraint semantic_claims_lifecycle_shape_check check (
    (claim_kind in ('event', 'state_transition') and lifecycle_role is not null)
    or (claim_kind not in ('event', 'state_transition') and lifecycle_role is null and lifecycle_transition is null)
  ),
  unique (id, user_id),
  unique (id, user_id, subject_id),
  unique (user_id, source_message_lineage_id, turn_idempotency_key, source_local_claim_key)
);

create index if not exists semantic_claims_owner_recorded_idx
  on public.semantic_claims(user_id, recorded_at desc, id);
create index if not exists semantic_claims_subject_concept_time_idx
  on public.semantic_claims(user_id, subject_type, subject_id, canonical_concept_key, occurred_at, recorded_at, id);
create index if not exists semantic_claims_source_message_idx
  on public.semantic_claims(user_id, source_message_lineage_id, source_local_claim_key);
create index if not exists semantic_claims_lifecycle_idx
  on public.semantic_claims(user_id, subject_id, canonical_concept_key, lifecycle_role, occurred_at)
  where lifecycle_role is not null;

create table if not exists public.semantic_claim_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_claim_id uuid not null,
  to_claim_id uuid not null,
  relation_type text not null check (relation_type in (
    'retracts', 'corrects', 'supersedes', 'confirms', 'derived_from', 'dismisses_lifecycle'
  )),
  source_local_relation_key text not null check (
    source_local_relation_key ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'
  ),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  recorded_at timestamptz not null default transaction_timestamp(),
  constraint semantic_claim_relations_not_self_check check (from_claim_id <> to_claim_id),
  constraint semantic_claim_relations_from_owner_fk foreign key (from_claim_id, user_id)
    references public.semantic_claims(id, user_id) on delete cascade,
  constraint semantic_claim_relations_to_owner_fk foreign key (to_claim_id, user_id)
    references public.semantic_claims(id, user_id) on delete cascade,
  unique (user_id, from_claim_id, to_claim_id, relation_type),
  unique (user_id, source_local_relation_key, from_claim_id)
);

create index if not exists semantic_claim_relations_to_idx
  on public.semantic_claim_relations(user_id, to_claim_id, relation_type);

create or replace function public.prevent_semantic_claim_relation_cycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.from_claim_id = new.to_claim_id then
    raise exception 'Semantic claim cannot relate to itself' using errcode = '23514';
  end if;

  -- Confirmation may be mutual. Other directed semantic operations must remain acyclic.
  if new.relation_type <> 'confirms' and exists (
    with recursive descendants(claim_id) as (
      select new.to_claim_id
      union
      select relation_row.to_claim_id
      from public.semantic_claim_relations relation_row
      join descendants prior on relation_row.from_claim_id = prior.claim_id
      where relation_row.user_id = new.user_id
        and relation_row.relation_type <> 'confirms'
    )
    select 1 from descendants where claim_id = new.from_claim_id
  ) then
    raise exception 'Semantic claim relation cycle is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_semantic_claim_relation_cycle() from public, anon, authenticated, service_role;
drop trigger if exists semantic_claim_relations_prevent_cycle on public.semantic_claim_relations;
create trigger semantic_claim_relations_prevent_cycle
before insert or update on public.semantic_claim_relations
for each row execute function public.prevent_semantic_claim_relation_cycle();

-- Compatibility membership gains a surrogate key so care-entry-only and
-- claim-only members can coexist. Existing care_entry_id callers keep their
-- uniqueness contract during the shadow period.
alter table public.pet_care_episode_events
  add column if not exists id uuid default gen_random_uuid();
update public.pet_care_episode_events set id = gen_random_uuid() where id is null;
alter table public.pet_care_episode_events alter column id set not null;
alter table public.pet_care_episode_events drop constraint if exists pet_care_episode_events_pkey;
alter table public.pet_care_episode_events add constraint pet_care_episode_events_pkey primary key (id);
alter table public.pet_care_episode_events alter column care_entry_id drop not null;
alter table public.pet_care_episode_events add column if not exists claim_id uuid;
alter table public.pet_care_episode_events add constraint pet_care_episode_events_source_check
  check (num_nonnulls(care_entry_id, claim_id) = 1);
alter table public.pet_care_episode_events add constraint pet_care_episode_events_care_entry_id_key
  unique (care_entry_id);
alter table public.pet_care_episode_events add constraint pet_care_episode_events_claim_tenant_fk
  foreign key (claim_id, user_id, pet_profile_id)
  references public.semantic_claims(id, user_id, subject_id) on delete cascade;
alter table public.pet_care_episode_events drop constraint if exists pet_care_episode_events_event_role_check;
alter table public.pet_care_episode_events add constraint pet_care_episode_events_event_role_check check (event_role in (
  'opening', 'continuation', 'worsening', 'improvement', 'resolution', 'recurrence',
  'correction', 'dismissal', 'unknown_legacy'
));
create unique index if not exists pet_care_episode_events_claim_id_key
  on public.pet_care_episode_events(claim_id) where claim_id is not null;

alter table public.semantic_claims enable row level security;
alter table public.semantic_claims force row level security;
alter table public.semantic_claim_relations enable row level security;
alter table public.semantic_claim_relations force row level security;

revoke all on table public.semantic_claims from public, anon, authenticated, service_role;
revoke all on table public.semantic_claim_relations from public, anon, authenticated, service_role;
grant select on table public.semantic_claims to service_role;
grant select on table public.semantic_claim_relations to service_role;

create or replace function public.persist_governed_semantic_turn_v2(
  p_verified_user_id uuid,
  p_source_message_id uuid,
  p_idempotency_key uuid,
  p_frame_schema_version text,
  p_governance_policy_version text,
  p_governed_turn jsonb
)
returns table(
  claim_ids uuid[],
  projection_version text,
  snapshot_metadata jsonb,
  already_persisted boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := p_verified_user_id;
  v_source_text text;
  v_claim jsonb;
  v_relation jsonb;
  v_entity jsonb;
  v_evidence jsonb;
  v_claim_id uuid;
  v_from_claim_id uuid;
  v_to_claim_id uuid;
  v_subject_id uuid;
  v_episode_id uuid;
  v_claim_ids uuid[] := '{}';
  v_payload_hash text;
  v_existing_hash text;
  v_claim_count integer;
  v_membership_count integer := 0;
  v_ordinal bigint;
begin
  if v_user_id is null then
    raise exception 'Server-verified user identity is required' using errcode = '28000';
  end if;
  if p_source_message_id is null or p_idempotency_key is null then
    raise exception 'Source message and idempotency key are required' using errcode = '22023';
  end if;
  if char_length(coalesce(p_frame_schema_version, '')) not between 1 and 100
    or char_length(coalesce(p_governance_policy_version, '')) not between 1 and 100 then
    raise exception 'Semantic governance versions are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_governed_turn) <> 'object'
    or jsonb_typeof(p_governed_turn->'claims') <> 'array'
    or jsonb_typeof(coalesce(p_governed_turn->'relations', '[]'::jsonb)) <> 'array' then
    raise exception 'Governed turn payload is invalid' using errcode = '22023';
  end if;
  if octet_length(p_governed_turn::text) > 131072 then
    raise exception 'Governed turn payload is too large' using errcode = '22023';
  end if;
  if jsonb_path_exists(p_governed_turn, '$.**.user_id')
    or jsonb_path_exists(p_governed_turn, '$.**.userId') then
    raise exception 'Client or model user identifiers are forbidden' using errcode = '22023';
  end if;

  select message_row.user_text into v_source_text
  from public.ask_conversation_messages message_row
  where message_row.id = p_source_message_id
    and message_row.user_id = v_user_id
    and message_row.role = 'user'
  for share;
  if not found or v_source_text is null then
    raise exception 'Owned user source message not found' using errcode = 'P0002';
  end if;

  v_claim_count := jsonb_array_length(p_governed_turn->'claims');
  if v_claim_count > 32 or jsonb_array_length(coalesce(p_governed_turn->'relations', '[]'::jsonb)) > 64 then
    raise exception 'Governed turn exceeds claim or relation limits' using errcode = '22023';
  end if;
  v_payload_hash := encode(extensions.digest(convert_to(p_governed_turn::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_idempotency_key::text, 0));
  select min(turn_payload_hash), array_agg(id order by source_local_claim_key)
  into v_existing_hash, v_claim_ids
  from public.semantic_claims
  where user_id = v_user_id and source_message_lineage_id = p_source_message_id
    and turn_idempotency_key = p_idempotency_key;
  v_claim_ids := coalesce(v_claim_ids, '{}');
  if v_existing_hash is not null then
    if v_existing_hash <> v_payload_hash then
      raise exception 'Idempotency key was reused with a different governed turn' using errcode = '22023';
    end if;
    return query select v_claim_ids, 'ask_v2.shadow.projections.v1',
      jsonb_build_object('mode', 'shadow_only', 'claimCount', cardinality(v_claim_ids),
        'membershipCount', (select count(*) from public.pet_care_episode_events member where member.claim_id = any(v_claim_ids))),
      true;
    return;
  end if;

  for v_claim in select value from jsonb_array_elements(p_governed_turn->'claims') loop
    if jsonb_typeof(v_claim) <> 'object'
      or coalesce(v_claim->>'source_local_claim_key', '') !~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'
      or coalesce(v_claim->>'claim_kind', '') not in ('assertion','event','state_transition','preference','relationship','correction')
      or coalesce(v_claim->>'subject_type', '') not in ('owner','pet','person','organization','product','place','unknown')
      or coalesce(v_claim->>'concept_key', '') !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      or coalesce(v_claim->>'concept_resolution_status', '') not in ('provisional','canonical')
      or coalesce(v_claim->>'concept_authority', '') not in ('provisional_normalizer','governed_registry')
      or jsonb_typeof(v_claim->'predicate') <> 'object'
      or jsonb_typeof(v_claim->'grounded_evidence') <> 'array'
      or jsonb_array_length(v_claim->'grounded_evidence') = 0 then
      raise exception 'Governed claim shape is invalid' using errcode = '22023';
    end if;
    if (v_claim->>'concept_resolution_status' = 'provisional'
        and (nullif(v_claim->>'canonical_concept_key', '') is not null or v_claim->>'concept_authority' <> 'provisional_normalizer'))
      or (v_claim->>'concept_resolution_status' = 'canonical'
        and (v_claim->>'canonical_concept_key' is distinct from v_claim->>'concept_key'
          or v_claim->>'concept_authority' <> 'governed_registry')) then
      raise exception 'Concept authority is inconsistent' using errcode = '22023';
    end if;

    v_subject_id := null;
    if v_claim ? 'subject_id' and v_claim->>'subject_id' is not null then
      v_subject_id := (v_claim->>'subject_id')::uuid;
    end if;
    if v_claim->>'subject_type' = 'owner' then
      if v_subject_id is distinct from v_user_id then
        raise exception 'Owner subject does not match authenticated user' using errcode = '42501';
      end if;
    elsif v_claim->>'subject_type' = 'pet' then
      if not exists(select 1 from public.dog_profiles pet where pet.id = v_subject_id and pet.user_id = v_user_id) then
        raise exception 'Pet subject is not owned by authenticated user' using errcode = '42501';
      end if;
    elsif v_subject_id is not null then
      raise exception 'Only server-owned owner and pet entities may carry database IDs' using errcode = '42501';
    end if;

    if jsonb_typeof(coalesce(v_claim->'resolved_entities', '[]'::jsonb)) <> 'array' then
      raise exception 'Resolved entities must be an array' using errcode = '22023';
    end if;
    for v_entity in select value from jsonb_array_elements(coalesce(v_claim->'resolved_entities', '[]'::jsonb)) loop
      if v_entity->>'entity_type' = 'owner' then
        if (v_entity->>'entity_id')::uuid is distinct from v_user_id then
          raise exception 'Resolved owner entity is not authenticated user' using errcode = '42501';
        end if;
      elsif v_entity->>'entity_type' = 'pet' then
        if not exists(select 1 from public.dog_profiles pet where pet.id = (v_entity->>'entity_id')::uuid and pet.user_id = v_user_id) then
          raise exception 'Resolved pet entity is not owned by authenticated user' using errcode = '42501';
        end if;
      else
        raise exception 'Resolved database entity type is not supported' using errcode = '42501';
      end if;
    end loop;

    for v_evidence in select value from jsonb_array_elements(v_claim->'grounded_evidence') loop
      if jsonb_typeof(v_evidence) <> 'object'
        or (v_evidence->>'start') is null or (v_evidence->>'end') is null
        or (v_evidence->>'excerpt') is null
        or (v_evidence->>'start')::integer < 0
        or (v_evidence->>'end')::integer <= (v_evidence->>'start')::integer
        or substring(v_source_text from (v_evidence->>'start')::integer + 1
          for (v_evidence->>'end')::integer - (v_evidence->>'start')::integer) <> v_evidence->>'excerpt' then
        raise exception 'Grounded evidence does not match source message' using errcode = '22023';
      end if;
    end loop;

    insert into public.semantic_claims(
      user_id, source_message_id, source_message_lineage_id, source_type, subject_type, subject_id, resolved_entities,
      claim_kind, operation_type, concept_key, canonical_concept_key, concept_resolution_status,
      concept_authority, concept_version, predicate,
      structured_value, unit, polarity, modality, durability, occurred_at, valid_from,
      valid_to, temporal_precision, grounded_evidence, extraction_confidence,
      governed_confidence, frame_schema_version, governance_policy_version,
      source_local_claim_key, turn_idempotency_key, turn_payload_hash, lifecycle_role,
      lifecycle_transition, persistence_destination, provenance_classification,
      safety_floor_metadata, governance_metadata
    ) values (
      v_user_id, p_source_message_id, p_source_message_id, 'ask_message', v_claim->>'subject_type', v_subject_id,
      coalesce(v_claim->'resolved_entities', '[]'::jsonb), v_claim->>'claim_kind',
      coalesce(v_claim->>'operation_type', 'assert'), v_claim->>'concept_key',
      nullif(v_claim->>'canonical_concept_key', ''), v_claim->>'concept_resolution_status',
      v_claim->>'concept_authority', coalesce(v_claim->>'concept_version', 'ask_v2.concepts.provisional.v1'), v_claim->'predicate',
      coalesce(v_claim->'structured_value', 'null'::jsonb), nullif(btrim(v_claim->>'unit'), ''),
      coalesce(v_claim->>'polarity', 'affirmed'), coalesce(v_claim->>'modality', 'asserted'),
      coalesce(v_claim->>'durability', 'unknown'), nullif(v_claim->>'occurred_at', '')::timestamptz,
      nullif(v_claim->>'valid_from', '')::timestamptz, nullif(v_claim->>'valid_to', '')::timestamptz,
      coalesce(v_claim->>'temporal_precision', 'unknown'), v_claim->'grounded_evidence',
      (v_claim->>'extraction_confidence')::numeric, (v_claim->>'governed_confidence')::numeric,
      p_frame_schema_version, p_governance_policy_version, v_claim->>'source_local_claim_key',
      p_idempotency_key, v_payload_hash, nullif(v_claim->>'lifecycle_role', ''),
      nullif(v_claim->>'lifecycle_transition', ''), coalesce(v_claim->>'persistence_destination', 'none'),
      'ask_v2_shadow', coalesce(v_claim->'safety_floor_metadata', '{}'::jsonb),
      coalesce(v_claim->'governance_metadata', '{}'::jsonb)
    ) returning id into v_claim_id;
    v_claim_ids := array_append(v_claim_ids, v_claim_id);

    v_episode_id := nullif(v_claim->>'server_episode_id', '')::uuid;
    if v_episode_id is not null then
      if v_claim->>'subject_type' <> 'pet' or coalesce(v_claim->>'lifecycle_role', '') = '' then
        raise exception 'Episode membership requires a pet lifecycle claim' using errcode = '22023';
      end if;
      if v_claim->>'concept_resolution_status' <> 'canonical' or nullif(v_claim->>'canonical_concept_key', '') is null then
        raise exception 'Episode membership requires governed canonical concept identity' using errcode = '22023';
      end if;
      perform 1 from public.pet_care_episodes episode
      where episode.id = v_episode_id and episode.user_id = v_user_id
        and episode.pet_profile_id = v_subject_id
        and episode.normalized_key = v_claim->>'canonical_concept_key'
      for update;
      if not found then
        raise exception 'Lifecycle episode is not owned by claim subject' using errcode = '42501';
      end if;
      select coalesce(max(member.event_ordinal), 0) + 1 into v_ordinal
      from public.pet_care_episode_events member where member.episode_id = v_episode_id;
      insert into public.pet_care_episode_events(
        claim_id, episode_id, user_id, pet_profile_id, event_ordinal, event_role, occurred_at
      ) values (
        v_claim_id, v_episode_id, v_user_id, v_subject_id, v_ordinal,
        case v_claim->>'lifecycle_role' when 'unknown' then 'unknown_legacy' else v_claim->>'lifecycle_role' end,
        coalesce(nullif(v_claim->>'occurred_at', '')::timestamptz, transaction_timestamp())
      );
      v_membership_count := v_membership_count + 1;
    end if;
  end loop;

  for v_relation in select value from jsonb_array_elements(coalesce(p_governed_turn->'relations', '[]'::jsonb)) loop
    if jsonb_typeof(v_relation) <> 'object'
      or coalesce(v_relation->>'relation_type', '') not in ('retracts','corrects','supersedes','confirms','derived_from','dismisses_lifecycle')
      or coalesce(v_relation->>'source_local_relation_key', '') !~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$' then
      raise exception 'Governed claim relation shape is invalid' using errcode = '22023';
    end if;
    select claim.id into v_from_claim_id from public.semantic_claims claim
    where claim.user_id = v_user_id and claim.source_message_lineage_id = p_source_message_id
      and claim.turn_idempotency_key = p_idempotency_key
      and claim.source_local_claim_key = v_relation->>'from_local_claim_key';
    if v_from_claim_id is null then
      raise exception 'Relation source claim is not part of governed turn' using errcode = '22023';
    end if;
    v_to_claim_id := null;
    if nullif(v_relation->>'to_local_claim_key', '') is not null then
      select claim.id into v_to_claim_id from public.semantic_claims claim
      where claim.user_id = v_user_id and claim.source_message_lineage_id = p_source_message_id
        and claim.turn_idempotency_key = p_idempotency_key
        and claim.source_local_claim_key = v_relation->>'to_local_claim_key';
    elsif nullif(v_relation->>'to_claim_id', '') is not null then
      select claim.id into v_to_claim_id from public.semantic_claims claim
      where claim.id = (v_relation->>'to_claim_id')::uuid and claim.user_id = v_user_id;
    end if;
    if v_to_claim_id is null then
      raise exception 'Relation target claim is not owned or does not exist' using errcode = '42501';
    end if;
    insert into public.semantic_claim_relations(
      user_id, from_claim_id, to_claim_id, relation_type, source_local_relation_key, metadata
    ) values (
      v_user_id, v_from_claim_id, v_to_claim_id, v_relation->>'relation_type',
      v_relation->>'source_local_relation_key', coalesce(v_relation->'metadata', '{}'::jsonb)
    );
  end loop;

  select array_agg(claim.id order by claim.source_local_claim_key) into v_claim_ids
  from public.semantic_claims claim
  where claim.user_id = v_user_id and claim.source_message_lineage_id = p_source_message_id
    and claim.turn_idempotency_key = p_idempotency_key;
  return query select coalesce(v_claim_ids, '{}'), 'ask_v2.shadow.projections.v1',
    jsonb_build_object('mode', 'shadow_only', 'claimCount', cardinality(v_claim_ids),
      'relationCount', jsonb_array_length(coalesce(p_governed_turn->'relations', '[]'::jsonb)),
      'membershipCount', v_membership_count,
      'historyVersion', 'ask_v2.history.v1', 'memoryVersion', 'ask_v2.memories.v1',
      'episodeVersion', 'ask_v2.episodes.v1', 'concernVersion', 'ask_v2.concerns.v1',
      'currentStateVersion', 'ask_v2.current_state.v1'),
    false;
end;
$$;

revoke all on function public.persist_governed_semantic_turn_v2(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_governed_semantic_turn_v2(uuid, uuid, uuid, text, text, jsonb)
  to service_role;

comment on table public.semantic_claims is
  'Ask v2 append-oriented governed semantic claim ledger. Shadow-only in Phase 1.';
comment on table public.semantic_claim_relations is
  'Directed, same-tenant semantic operations and provenance between governed claims.';
comment on function public.persist_governed_semantic_turn_v2(uuid, uuid, uuid, text, text, jsonb) is
  'Phase 1 service-only shadow persistence. First argument is a user ID verified by the Furvise server, then revalidated against source and entity ownership. Not production Ask write authority.';
