-- Ask v2 Phase 2: server-owned concepts and explicitly invoked legacy import.
-- This migration creates no production Ask caller and performs no automatic backfill.

create table public.semantic_concepts (
  id uuid primary key,
  canonical_key text not null check (
    canonical_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and char_length(canonical_key) <= 120
  ),
  display_label text not null check (char_length(btrim(display_label)) between 1 and 120),
  definition text not null check (char_length(btrim(definition)) between 1 and 1000),
  concept_kind text not null check (concept_kind in (
    'symptom', 'safety', 'nutrition', 'medication', 'preference', 'profile', 'relationship', 'care_fact'
  )),
  species_applicability text[] not null default '{}' check (
    species_applicability <@ array['dog','cat']::text[]
  ),
  lifecycle_capable boolean not null default false,
  status text not null check (status in ('active', 'deprecated')),
  concept_version text not null check (char_length(btrim(concept_version)) between 1 and 80),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (id, canonical_key),
  unique (canonical_key, concept_version)
);
create unique index semantic_concepts_one_active_key_idx
  on public.semantic_concepts(canonical_key) where status = 'active';

create table public.semantic_concept_aliases (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.semantic_concepts(id) on delete cascade,
  normalized_alias text not null check (
    normalized_alias ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and char_length(normalized_alias) <= 120
  ),
  alias_type text not null check (alias_type in ('canonical_key', 'structured_legacy_key', 'language_variant')),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  authority text not null check (authority in ('furvise_governed', 'legacy_structured')),
  alias_version text not null check (char_length(btrim(alias_version)) between 1 and 80),
  provenance text not null check (char_length(btrim(provenance)) between 1 and 500),
  created_at timestamptz not null default transaction_timestamp(),
  unique (concept_id, normalized_alias, alias_version)
);

create index semantic_concept_aliases_lookup_idx
  on public.semantic_concept_aliases(normalized_alias, concept_id);
create index semantic_concept_aliases_concept_idx on public.semantic_concept_aliases(concept_id);

create or replace function public.preserve_semantic_concept_revision_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(old.canonical_key, old.display_label, old.definition, old.concept_kind,
      old.species_applicability, old.lifecycle_capable, old.concept_version)
    is distinct from row(new.canonical_key, new.display_label, new.definition, new.concept_kind,
      new.species_applicability, new.lifecycle_capable, new.concept_version) then
    raise exception 'Semantic concept meaning is immutable; insert a new version' using errcode = '23514';
  end if;
  new.updated_at := transaction_timestamp();
  return new;
end;
$$;
revoke all on function public.preserve_semantic_concept_revision_v2() from public, anon, authenticated, service_role;
create trigger semantic_concepts_preserve_revision
before update on public.semantic_concepts
for each row execute function public.preserve_semantic_concept_revision_v2();

alter table public.semantic_concepts enable row level security;
alter table public.semantic_concepts force row level security;
alter table public.semantic_concept_aliases enable row level security;
alter table public.semantic_concept_aliases force row level security;
revoke all on public.semantic_concepts from public, anon, authenticated, service_role;
revoke all on public.semantic_concept_aliases from public, anon, authenticated, service_role;
grant select on public.semantic_concepts, public.semantic_concept_aliases to service_role;

-- Small governed seed: only concepts already represented by structured Furvise fields.
insert into public.semantic_concepts(
  id, canonical_key, display_label, definition, concept_kind, species_applicability,
  lifecycle_capable, status, concept_version
) values
  ('71000000-0000-4000-8000-000000000001', 'vomiting', 'Vomiting', 'An observed vomiting symptom.', 'symptom', array['dog','cat'], true, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000002', 'limping', 'Limping', 'An observed altered gait or limp.', 'symptom', array['dog','cat'], true, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000003', 'breathing_difficulty', 'Breathing difficulty', 'An observed breathing difficulty.', 'symptom', array['dog','cat'], true, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000004', 'missing_pet', 'Missing pet', 'A pet is reported missing.', 'safety', array['dog','cat'], true, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000005', 'food_transition', 'Food transition', 'A change from one food routine to another.', 'nutrition', array['dog','cat'], true, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000006', 'preferred_retailer', 'Preferred retailer', 'An owner retailer preference.', 'preference', '{}', false, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000007', 'food_preference', 'Food preference', 'A pet food preference or avoidance.', 'preference', array['dog','cat'], false, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000008', 'weight', 'Weight', 'A recorded pet weight fact.', 'profile', array['dog','cat'], false, 'active', 'furvise.core.v1'),
  ('71000000-0000-4000-8000-000000000009', 'caregiver_relationship', 'Caregiver relationship', 'A person has a caregiving relationship to a pet.', 'relationship', array['dog','cat'], false, 'active', 'furvise.core.v1')
on conflict (canonical_key, concept_version) do nothing;

insert into public.semantic_concept_aliases(
  concept_id, normalized_alias, alias_type, confidence, authority, alias_version, provenance
) values
  ('71000000-0000-4000-8000-000000000001', 'vomiting', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000001', 'vomit', 'language_variant', 1, 'furvise_governed', 'furvise.core.v1', 'Exact registered language variant'),
  ('71000000-0000-4000-8000-000000000001', 'health_vomiting', 'structured_legacy_key', 1, 'legacy_structured', 'furvise.core.v1', 'Existing structured normalizedConcernKey'),
  ('71000000-0000-4000-8000-000000000002', 'limping', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000002', 'limp', 'language_variant', 1, 'furvise_governed', 'furvise.core.v1', 'Exact registered language variant'),
  ('71000000-0000-4000-8000-000000000002', 'health_limping', 'structured_legacy_key', 1, 'legacy_structured', 'furvise.core.v1', 'Existing structured lifecycle key'),
  ('71000000-0000-4000-8000-000000000003', 'breathing_difficulty', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000004', 'missing_pet', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000004', 'safety_missing_pet', 'structured_legacy_key', 1, 'legacy_structured', 'furvise.core.v1', 'Existing structured lifecycle key'),
  ('71000000-0000-4000-8000-000000000005', 'food_transition', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000005', 'nutrition_food_change', 'structured_legacy_key', 1, 'legacy_structured', 'furvise.core.v1', 'Existing structured lifecycle key'),
  ('71000000-0000-4000-8000-000000000006', 'preferred_retailer', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000007', 'food_preference', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000008', 'weight', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed'),
  ('71000000-0000-4000-8000-000000000009', 'caregiver_relationship', 'canonical_key', 1, 'furvise_governed', 'furvise.core.v1', 'Canonical seed')
on conflict (concept_id, normalized_alias, alias_version) do nothing;

alter table public.semantic_claims
  add column semantic_concept_id uuid references public.semantic_concepts(id) on delete restrict,
  add column evidence_basis text not null default 'grounded_source_text',
  add column knowledge_status text not null default 'effective';
alter table public.semantic_claims add constraint semantic_claims_registry_identity_fk
  foreign key (semantic_concept_id, canonical_concept_key)
  references public.semantic_concepts(id, canonical_key) on delete restrict;

alter table public.semantic_claims drop constraint semantic_claims_grounded_evidence_check;
alter table public.semantic_claims add constraint semantic_claims_evidence_basis_check check (
  (evidence_basis = 'grounded_source_text' and jsonb_typeof(grounded_evidence) = 'array' and jsonb_array_length(grounded_evidence) > 0)
  or (evidence_basis = 'legacy_record' and grounded_evidence = '[]'::jsonb)
);
alter table public.semantic_claims add constraint semantic_claims_knowledge_status_check check (
  knowledge_status in ('effective', 'tombstoned', 'superseded', 'rejected', 'forgotten', 'dismissed', 'unconfirmed')
);
alter table public.semantic_claims drop constraint semantic_claims_concept_resolution_status_check;
alter table public.semantic_claims add constraint semantic_claims_concept_resolution_status_check check (
  concept_resolution_status in ('provisional', 'canonical', 'ambiguous', 'unresolved')
);
alter table public.semantic_claims drop constraint semantic_claims_concept_authority_check;
alter table public.semantic_claims add constraint semantic_claims_concept_authority_check check (
  concept_authority in ('provisional_normalizer', 'governed_registry', 'legacy_ambiguous', 'legacy_unresolved')
);
alter table public.semantic_claims drop constraint semantic_claims_concept_resolution_consistency_check;
alter table public.semantic_claims add constraint semantic_claims_concept_resolution_consistency_check check (
  (concept_resolution_status = 'provisional' and concept_authority = 'provisional_normalizer' and canonical_concept_key is null and semantic_concept_id is null)
  or (concept_resolution_status = 'canonical' and concept_authority = 'governed_registry' and canonical_concept_key is not null and canonical_concept_key = concept_key)
  or (concept_resolution_status = 'ambiguous' and concept_authority = 'legacy_ambiguous' and canonical_concept_key is null and semantic_concept_id is null)
  or (concept_resolution_status = 'unresolved' and concept_authority = 'legacy_unresolved' and canonical_concept_key is null and semantic_concept_id is null)
);
alter table public.semantic_claims drop constraint semantic_claims_provenance_classification_check;
alter table public.semantic_claims add constraint semantic_claims_provenance_classification_check check (
  provenance_classification in ('ask_v2_shadow', 'manual', 'legacy_import', 'imported_legacy', 'system_derived')
);
create index semantic_claims_concept_id_idx on public.semantic_claims(semantic_concept_id, user_id, subject_id, occurred_at);

create or replace function public.govern_semantic_claim_concept_authority_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_concept_id uuid;
begin
  if new.concept_resolution_status = 'canonical' then
    select concept.id into v_concept_id
    from public.semantic_concepts concept
    where concept.canonical_key = new.canonical_concept_key
      and concept.concept_version = new.concept_version
      and concept.status = 'active';
    if v_concept_id is null then
      raise exception 'Canonical concept is not an active governed registry version' using errcode = '22023';
    end if;
    if new.semantic_concept_id is not null and new.semantic_concept_id <> v_concept_id then
      raise exception 'Canonical concept ID does not match governed registry' using errcode = '22023';
    end if;
    new.semantic_concept_id := v_concept_id;
    new.concept_key := new.canonical_concept_key;
  elsif new.semantic_concept_id is not null or new.canonical_concept_key is not null then
    raise exception 'Non-canonical claim cannot carry canonical concept authority' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.govern_semantic_claim_concept_authority_v2() from public, anon, authenticated, service_role;
create trigger semantic_claims_govern_concept_authority
before insert or update of semantic_concept_id, concept_key, canonical_concept_key, concept_resolution_status, concept_authority, concept_version
on public.semantic_claims
for each row execute function public.govern_semantic_claim_concept_authority_v2();

create table public.semantic_claim_legacy_lineage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id uuid not null,
  legacy_table text not null check (legacy_table in ('pet_care_entries', 'furvise_memories')),
  legacy_row_id uuid not null,
  claim_role text not null default 'primary' check (claim_role in ('primary', 'status_operation')),
  import_version text not null check (char_length(btrim(import_version)) between 1 and 80),
  source_timestamp timestamptz,
  source_confidence numeric(5,4) check (source_confidence is null or source_confidence between 0 and 1),
  source_quality text not null check (source_quality in ('structured', 'partial', 'unknown')),
  concept_resolution_result text not null check (concept_resolution_result in ('canonical', 'provisional', 'ambiguous', 'unresolved')),
  source_row_hash text not null check (source_row_hash ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default transaction_timestamp(),
  constraint semantic_claim_legacy_lineage_claim_owner_fk foreign key (claim_id, user_id)
    references public.semantic_claims(id, user_id) on delete cascade,
  unique (user_id, legacy_table, legacy_row_id, claim_role),
  unique (claim_id)
);
create index semantic_claim_legacy_lineage_source_idx
  on public.semantic_claim_legacy_lineage(legacy_table, legacy_row_id, user_id);
alter table public.semantic_claim_legacy_lineage enable row level security;
alter table public.semantic_claim_legacy_lineage force row level security;
revoke all on public.semantic_claim_legacy_lineage from public, anon, authenticated, service_role;
grant select on public.semantic_claim_legacy_lineage to service_role;

create or replace function public.resolve_semantic_concept_v2(
  p_candidate text,
  p_species text default null
)
returns table(
  resolution_status text,
  concept_id uuid,
  canonical_key text,
  provisional_key text,
  concept_version text,
  lifecycle_capable boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select nullif(trim(both '_' from regexp_replace(lower(coalesce(p_candidate, '')), '[^a-z0-9]+', '_', 'g')), '') as key
  ), candidates as (
    select distinct concept.id, concept.canonical_key, concept.concept_version, concept.lifecycle_capable
    from normalized
    join public.semantic_concept_aliases alias_row on alias_row.normalized_alias = normalized.key
    join public.semantic_concepts concept on concept.id = alias_row.concept_id and concept.status = 'active'
    where p_species is null or cardinality(concept.species_applicability) = 0 or p_species = any(concept.species_applicability)
  ), aggregate_result as (
    select count(*) count, min(id::text)::uuid id, min(canonical_key) canonical_key,
      min(concept_version) concept_version, bool_and(lifecycle_capable) lifecycle_capable
    from candidates
  )
  select case when normalized.key is null then 'unresolved'
      when aggregate_result.count = 1 then 'canonical'
      when aggregate_result.count > 1 then 'ambiguous'
      else 'provisional' end,
    case when aggregate_result.count = 1 then aggregate_result.id end,
    case when aggregate_result.count = 1 then aggregate_result.canonical_key end,
    coalesce(normalized.key, 'legacy_unresolved'),
    case when aggregate_result.count = 1 then aggregate_result.concept_version else 'ask_v2.legacy_import.v1' end,
    case when aggregate_result.count = 1 then aggregate_result.lifecycle_capable else false end
  from normalized cross join aggregate_result;
$$;
revoke all on function public.resolve_semantic_concept_v2(text, text) from public, anon, authenticated;
grant execute on function public.resolve_semantic_concept_v2(text, text) to service_role;

create or replace function public.import_legacy_semantic_claims_v2(
  p_verified_user_id uuid,
  p_source_table text,
  p_source_ids uuid[] default null,
  p_import_version text default 'ask_v2.legacy_import.v1',
  p_limit integer default 500
)
returns table(examined integer, imported integer, already_imported integer, canonical integer, provisional integer, ambiguous integer, unresolved integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row record;
  concept_result record;
  v_claim_id uuid;
  v_source_hash text;
  v_claim_kind text;
  v_destination text;
  v_knowledge_status text;
  v_lifecycle_role text;
  v_candidate text;
  v_species text;
  v_existing integer;
begin
  if p_verified_user_id is null then raise exception 'Server-verified user identity is required' using errcode = '28000'; end if;
  if p_source_table not in ('pet_care_entries', 'furvise_memories') then raise exception 'Unsupported legacy source table' using errcode = '22023'; end if;
  if p_limit not between 1 and 500 or char_length(coalesce(p_import_version, '')) not between 1 and 80 then
    raise exception 'Invalid import bounds or version' using errcode = '22023';
  end if;
  if p_source_ids is not null and cardinality(p_source_ids) > p_limit then raise exception 'Import source limit exceeded' using errcode = '22023'; end if;

  examined := 0; imported := 0; already_imported := 0;
  canonical := 0; provisional := 0; ambiguous := 0; unresolved := 0;

  if p_source_table = 'pet_care_entries' then
    if p_source_ids is not null and exists (
      select 1 from public.pet_care_entries entry where entry.id = any(p_source_ids) and entry.user_id <> p_verified_user_id
    ) then raise exception 'Cross-user legacy source rejected' using errcode = '42501'; end if;
    for source_row in
      select entry.*, pet.species,
        member.event_role as membership_role
      from public.pet_care_entries entry
      join public.dog_profiles pet on pet.id = entry.pet_profile_id and pet.user_id = entry.user_id
      left join public.pet_care_episode_events member on member.care_entry_id = entry.id and member.user_id = entry.user_id
      where entry.user_id = p_verified_user_id and (p_source_ids is null or entry.id = any(p_source_ids))
      order by entry.occurred_at, entry.created_at, entry.id limit p_limit
    loop
      examined := examined + 1;
      v_source_hash := encode(extensions.digest(convert_to(to_jsonb(source_row)::text, 'UTF8'), 'sha256'), 'hex');
      select count(*) into v_existing from public.semantic_claim_legacy_lineage lineage
      where lineage.user_id = p_verified_user_id and lineage.legacy_table = p_source_table
        and lineage.legacy_row_id = source_row.id and lineage.claim_role = 'primary';
      if v_existing > 0 then
        if not exists(select 1 from public.semantic_claim_legacy_lineage lineage
            where lineage.user_id = p_verified_user_id and lineage.legacy_table = p_source_table
              and lineage.legacy_row_id = source_row.id and lineage.claim_role = 'primary'
              and lineage.source_row_hash = v_source_hash) then
          raise exception 'Legacy source changed after import; explicit re-import policy required' using errcode = '40001';
        end if;
        already_imported := already_imported + 1; continue;
      end if;
      v_candidate := nullif(coalesce(source_row.care_event_metadata->>'canonicalConceptKey', source_row.care_event_metadata->>'normalizedConcernKey'), '');
      v_species := source_row.species;
      select * into concept_result from public.resolve_semantic_concept_v2(v_candidate, v_species);
      v_claim_kind := 'event';
      v_destination := case when source_row.deleted_at is null then 'history' else 'none' end;
      v_knowledge_status := case when source_row.deleted_at is null then 'effective' else 'tombstoned' end;
      v_lifecycle_role := case when source_row.membership_role is null or source_row.membership_role = 'unknown_legacy' then 'unknown' else source_row.membership_role end;
      v_claim_id := extensions.uuid_generate_v5(
        '71000000-0000-4000-8000-000000000000'::uuid,
        p_verified_user_id::text || ':' || p_source_table || ':' || source_row.id::text || ':primary'
      );

      insert into public.semantic_claims(
        id, user_id, source_message_id, source_message_lineage_id, source_type, subject_type, subject_id,
        resolved_entities, claim_kind, operation_type, concept_key, canonical_concept_key,
        semantic_concept_id, concept_resolution_status, concept_authority, concept_version, predicate,
        structured_value, polarity, modality, durability, occurred_at, temporal_precision, recorded_at,
        grounded_evidence, evidence_basis, extraction_confidence, governed_confidence,
        frame_schema_version, governance_policy_version, source_local_claim_key, turn_idempotency_key,
        turn_payload_hash, lifecycle_role, lifecycle_transition, persistence_destination,
        provenance_classification, knowledge_status, safety_floor_metadata, governance_metadata
      ) values (
        v_claim_id, p_verified_user_id, null, source_row.id, 'legacy_import', 'pet', source_row.pet_profile_id,
        jsonb_build_array(jsonb_build_object('entity_type','pet','entity_id',source_row.pet_profile_id)),
        v_claim_kind, 'assert', coalesce(concept_result.canonical_key, concept_result.provisional_key), concept_result.canonical_key,
        concept_result.concept_id, concept_result.resolution_status,
        case concept_result.resolution_status when 'canonical' then 'governed_registry' when 'provisional' then 'provisional_normalizer'
          when 'ambiguous' then 'legacy_ambiguous' else 'legacy_unresolved' end,
        concept_result.concept_version, jsonb_build_object('legacyCategory', source_row.category),
        jsonb_build_object('title', source_row.title, 'note', source_row.note, 'severity', source_row.severity),
        'affirmed', 'reported', 'unknown', source_row.occurred_at, 'unknown', source_row.created_at,
        '[]'::jsonb, 'legacy_record', coalesce(source_row.intelligence_confidence, 0.7),
        least(coalesce(source_row.intelligence_confidence, 0.7), case when concept_result.resolution_status = 'canonical' then 0.9 else 0.7 end),
        'legacy.import.v1', p_import_version, 'legacy_care', source_row.id, v_source_hash,
        v_lifecycle_role, case v_lifecycle_role when 'opening' then 'started' when 'continuation' then 'continued'
          when 'worsening' then 'worsened' when 'improvement' then 'improved' when 'resolution' then 'resolved'
          when 'recurrence' then 'recurred' when 'dismissal' then 'dismissed' else 'unknown' end,
        v_destination, 'imported_legacy', v_knowledge_status, '{}'::jsonb,
        jsonb_build_object('legacyTable', p_source_table, 'legacyRowId', source_row.id,
          'importVersion', p_import_version, 'sourceTimestamp', source_row.created_at,
          'sourceQuality', case when v_candidate is null then 'partial' else 'structured' end,
          'sourceConfidence', source_row.intelligence_confidence,
          'conceptResolution', concept_result.resolution_status, 'legacyEpisodeMembershipOnly', source_row.membership_role is not null)
      );
      insert into public.semantic_claim_legacy_lineage(
        user_id, claim_id, legacy_table, legacy_row_id, import_version, source_timestamp,
        source_confidence, source_quality, concept_resolution_result, source_row_hash
      ) values (
        p_verified_user_id, v_claim_id, p_source_table, source_row.id, p_import_version, source_row.created_at,
        source_row.intelligence_confidence, case when v_candidate is null then 'partial' else 'structured' end,
        concept_result.resolution_status, v_source_hash
      );
      imported := imported + 1;
      if concept_result.resolution_status = 'canonical' then canonical := canonical + 1;
      elsif concept_result.resolution_status = 'provisional' then provisional := provisional + 1;
      elsif concept_result.resolution_status = 'ambiguous' then ambiguous := ambiguous + 1;
      else unresolved := unresolved + 1; end if;
    end loop;
  else
    if p_source_ids is not null and exists (
      select 1 from public.furvise_memories memory where memory.id = any(p_source_ids) and memory.user_id <> p_verified_user_id
    ) then raise exception 'Cross-user legacy source rejected' using errcode = '42501'; end if;
    for source_row in
      select memory.*, pet.species
      from public.furvise_memories memory
      left join public.dog_profiles pet on pet.id = memory.pet_id and pet.user_id = memory.user_id
      where memory.user_id = p_verified_user_id and (p_source_ids is null or memory.id = any(p_source_ids))
      order by memory.first_observed_at, memory.created_at, memory.id limit p_limit
    loop
      examined := examined + 1;
      v_source_hash := encode(extensions.digest(convert_to(to_jsonb(source_row)::text, 'UTF8'), 'sha256'), 'hex');
      select count(*) into v_existing from public.semantic_claim_legacy_lineage lineage
      where lineage.user_id = p_verified_user_id and lineage.legacy_table = p_source_table
        and lineage.legacy_row_id = source_row.id and lineage.claim_role = 'primary';
      if v_existing > 0 then
        if not exists(select 1 from public.semantic_claim_legacy_lineage lineage
            where lineage.user_id = p_verified_user_id and lineage.legacy_table = p_source_table
              and lineage.legacy_row_id = source_row.id and lineage.claim_role = 'primary'
              and lineage.source_row_hash = v_source_hash) then
          raise exception 'Legacy source changed after import; explicit re-import policy required' using errcode = '40001';
        end if;
        already_imported := already_imported + 1; continue;
      end if;
      select * into concept_result from public.resolve_semantic_concept_v2(source_row.fact_key, source_row.species);
      v_claim_kind := case when source_row.category in ('preference','shopping','budget') then 'preference'
        when source_row.category = 'relationship' then 'relationship' else 'assertion' end;
      v_destination := case when source_row.status <> 'active' then 'none' when v_claim_kind = 'relationship' then 'relationship'
        when source_row.subject_type = 'owner' then 'owner_memory' else 'pet_memory' end;
      v_knowledge_status := case source_row.status when 'active' then 'effective' when 'superseded' then 'superseded'
        when 'rejected' then 'rejected' when 'unconfirmed' then 'unconfirmed' else 'forgotten' end;
      v_claim_id := extensions.uuid_generate_v5(
        '71000000-0000-4000-8000-000000000000'::uuid,
        p_verified_user_id::text || ':' || p_source_table || ':' || source_row.id::text || ':primary'
      );

      insert into public.semantic_claims(
        id, user_id, source_message_id, source_message_lineage_id, source_type, subject_type, subject_id,
        resolved_entities, claim_kind, operation_type, concept_key, canonical_concept_key,
        semantic_concept_id, concept_resolution_status, concept_authority, concept_version, predicate,
        structured_value, polarity, modality, durability, occurred_at, temporal_precision, recorded_at,
        grounded_evidence, evidence_basis, extraction_confidence, governed_confidence,
        frame_schema_version, governance_policy_version, source_local_claim_key, turn_idempotency_key,
        turn_payload_hash, persistence_destination, provenance_classification, knowledge_status,
        safety_floor_metadata, governance_metadata
      ) values (
        v_claim_id, p_verified_user_id, null, source_row.id, 'legacy_import', source_row.subject_type,
        case when source_row.subject_type = 'owner' then p_verified_user_id else source_row.pet_id end,
        case when source_row.subject_type = 'owner' then jsonb_build_array(jsonb_build_object('entity_type','owner','entity_id',p_verified_user_id))
          else jsonb_build_array(jsonb_build_object('entity_type','pet','entity_id',source_row.pet_id)) end,
        v_claim_kind, 'assert', coalesce(concept_result.canonical_key, concept_result.provisional_key), concept_result.canonical_key,
        concept_result.concept_id, concept_result.resolution_status,
        case concept_result.resolution_status when 'canonical' then 'governed_registry' when 'provisional' then 'provisional_normalizer'
          when 'ambiguous' then 'legacy_ambiguous' else 'legacy_unresolved' end,
        concept_result.concept_version, jsonb_build_object('legacyFactKey', source_row.fact_key, 'legacyCategory', source_row.category),
        source_row.fact_value, 'affirmed', 'reported', source_row.durability,
        source_row.first_observed_at, 'unknown', source_row.created_at, '[]'::jsonb, 'legacy_record',
        source_row.confidence, source_row.confidence, 'legacy.import.v1', p_import_version,
        'legacy_memory', source_row.id, v_source_hash, v_destination, 'imported_legacy', v_knowledge_status,
        '{}'::jsonb, jsonb_build_object('legacyTable', p_source_table, 'legacyRowId', source_row.id,
          'importVersion', p_import_version, 'sourceTimestamp', source_row.created_at,
          'sourceQuality', 'structured', 'sourceConfidence', source_row.confidence,
          'conceptResolution', concept_result.resolution_status, 'legacySourceType', source_row.source_type,
          'legacySourceExcerptPresent', source_row.source_excerpt is not null)
      );
      insert into public.semantic_claim_legacy_lineage(
        user_id, claim_id, legacy_table, legacy_row_id, import_version, source_timestamp,
        source_confidence, source_quality, concept_resolution_result, source_row_hash
      ) values (
        p_verified_user_id, v_claim_id, p_source_table, source_row.id, p_import_version,
        source_row.created_at, source_row.confidence, 'structured', concept_result.resolution_status, v_source_hash
      );
      imported := imported + 1;
      if concept_result.resolution_status = 'canonical' then canonical := canonical + 1;
      elsif concept_result.resolution_status = 'provisional' then provisional := provisional + 1;
      elsif concept_result.resolution_status = 'ambiguous' then ambiguous := ambiguous + 1;
      else unresolved := unresolved + 1; end if;
    end loop;

    insert into public.semantic_claim_relations(
      user_id, from_claim_id, to_claim_id, relation_type, source_local_relation_key, metadata
    )
    select p_verified_user_id, successor.claim_id, prior.claim_id, 'supersedes',
      'legacy_supersedes_' || left(replace(old_memory.id::text, '-', ''), 24),
      jsonb_build_object('legacyTable','furvise_memories','importVersion',p_import_version)
    from public.furvise_memories old_memory
    join public.semantic_claim_legacy_lineage prior on prior.user_id = old_memory.user_id
      and prior.legacy_table = 'furvise_memories' and prior.legacy_row_id = old_memory.id
    join public.semantic_claim_legacy_lineage successor on successor.user_id = old_memory.user_id
      and successor.legacy_table = 'furvise_memories' and successor.legacy_row_id = old_memory.superseded_by
    where old_memory.user_id = p_verified_user_id and old_memory.superseded_by is not null
    on conflict (user_id, from_claim_id, to_claim_id, relation_type) do nothing;
  end if;
  return next;
end;
$$;

revoke all on function public.import_legacy_semantic_claims_v2(uuid, text, uuid[], text, integer)
  from public, anon, authenticated;
grant execute on function public.import_legacy_semantic_claims_v2(uuid, text, uuid[], text, integer)
  to service_role;

create or replace function public.get_semantic_rebuild_audit_input_v2(p_verified_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_verified_user_id is null then raise exception 'Server-verified user identity is required' using errcode = '28000'; end if;
  if not exists(select 1 from auth.users where id = p_verified_user_id) then
    raise exception 'Verified tenant not found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', claim.id, 'userId', claim.user_id, 'subjectType', claim.subject_type, 'subjectId', claim.subject_id,
        'claimKind', claim.claim_kind, 'operationType', claim.operation_type, 'conceptKey', claim.concept_key,
        'canonicalConceptKey', claim.canonical_concept_key, 'conceptResolutionStatus', claim.concept_resolution_status,
        'lifecycleCapable', coalesce(concept.lifecycle_capable, false), 'lifecycleRole', claim.lifecycle_role,
        'lifecycleTransition', claim.lifecycle_transition, 'persistenceDestination', claim.persistence_destination,
        'knowledgeStatus', claim.knowledge_status, 'occurredAt', claim.occurred_at, 'recordedAt', claim.recorded_at,
        'provenanceClassification', claim.provenance_classification, 'structuredValue', claim.structured_value
      ) order by coalesce(claim.occurred_at, claim.recorded_at), claim.recorded_at, claim.id)
      from public.semantic_claims claim
      left join public.semantic_concepts concept on concept.id = claim.semantic_concept_id
      where claim.user_id = p_verified_user_id and claim.provenance_classification = 'imported_legacy'
    ), '[]'::jsonb),
    'relations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fromClaimId', relation.from_claim_id, 'toClaimId', relation.to_claim_id, 'relationType', relation.relation_type
      ) order by relation.from_claim_id, relation.to_claim_id, relation.relation_type)
      from public.semantic_claim_relations relation
      where relation.user_id = p_verified_user_id
    ), '[]'::jsonb),
    'imported', jsonb_build_object(
      'canonical', (select count(*) from public.semantic_claim_legacy_lineage where user_id = p_verified_user_id and concept_resolution_result = 'canonical'),
      'provisional', (select count(*) from public.semantic_claim_legacy_lineage where user_id = p_verified_user_id and concept_resolution_result = 'provisional'),
      'ambiguous', (select count(*) from public.semantic_claim_legacy_lineage where user_id = p_verified_user_id and concept_resolution_result = 'ambiguous'),
      'unresolved', (select count(*) from public.semantic_claim_legacy_lineage where user_id = p_verified_user_id and concept_resolution_result = 'unresolved')
    ),
    'legacy', jsonb_build_object(
      'historyRows', (select count(*) from public.pet_care_entries where user_id = p_verified_user_id and deleted_at is null),
      'activeEpisodes', (select count(*) from public.pet_care_episodes where user_id = p_verified_user_id and status in ('active','monitoring')),
      'resolvedEpisodes', (select count(*) from public.pet_care_episodes where user_id = p_verified_user_id and status = 'resolved'),
      'concerns', (select count(*) from public.pet_concerns where user_id = p_verified_user_id and status in ('active','monitoring','reopened')),
      'currentStateRows', (select count(*) from public.pet_current_state where user_id = p_verified_user_id),
      'activeMemories', (select count(*) from public.furvise_memories where user_id = p_verified_user_id and status = 'active')
    ),
    'orphanLegacySourceRows',
      (select count(*) from public.pet_care_entries source where source.user_id = p_verified_user_id and not exists (
        select 1 from public.semantic_claim_legacy_lineage lineage where lineage.user_id = source.user_id
          and lineage.legacy_table = 'pet_care_entries' and lineage.legacy_row_id = source.id
      )) + (select count(*) from public.furvise_memories source where source.user_id = p_verified_user_id and not exists (
        select 1 from public.semantic_claim_legacy_lineage lineage where lineage.user_id = source.user_id
          and lineage.legacy_table = 'furvise_memories' and lineage.legacy_row_id = source.id
      )),
    'duplicateLineage', (select count(*) from (
      select 1 from public.semantic_claim_legacy_lineage where user_id = p_verified_user_id
      group by legacy_table, legacy_row_id, claim_role having count(*) > 1
    ) duplicate_rows),
    'invalidCrossUserLineage', (select count(*) from public.semantic_claim_legacy_lineage lineage
      join public.semantic_claims claim on claim.id = lineage.claim_id where lineage.user_id = p_verified_user_id and claim.user_id <> lineage.user_id)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_semantic_rebuild_audit_input_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_semantic_rebuild_audit_input_v2(uuid) to service_role;

comment on table public.semantic_concepts is 'Server-owned versioned Ask v2 canonical concept registry.';
comment on table public.semantic_concept_aliases is 'Exact, governed aliases. Duplicate aliases intentionally represent ambiguity.';
comment on table public.semantic_claim_legacy_lineage is 'Idempotent relational lineage from one legacy source record to its imported semantic claim.';
comment on function public.import_legacy_semantic_claims_v2(uuid, text, uuid[], text, integer) is
  'Explicit service-only bounded Phase 2 import. No automatic backfill and no production Ask authority change.';
comment on function public.get_semantic_rebuild_audit_input_v2(uuid) is
  'Service-only read model for deterministic Phase 2 shadow rebuild and comparison. It performs no writes.';
