begin;

insert into auth.users(id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('72000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase2-a@example.test', '', now(), now()),
  ('72000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase2-b@example.test', '', now(), now());
insert into public.dog_profiles(id, user_id, name, species) values
  ('72000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-000000000001', 'Mani', 'dog'),
  ('72000000-0000-4000-8000-000000000012', '72000000-0000-4000-8000-000000000002', 'Other', 'cat');

insert into public.pet_care_entries(
  id, user_id, pet_profile_id, category, title, note, occurred_at, care_event_metadata
) values
  ('72000000-0000-4000-8000-000000000021', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000011',
    'symptom', 'Mani was vomiting', 'Observed once', '2026-08-10T10:00:00Z', '{}'::jsonb),
  ('72000000-0000-4000-8000-000000000022', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000011',
    'symptom', 'Vomiting', 'Observed again', '2026-08-10T11:00:00Z', '{"normalizedConcernKey":"health_vomiting"}'::jsonb),
  ('72000000-0000-4000-8000-000000000023', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000011',
    'general', 'Deleted note', 'Do not project', '2026-08-10T12:00:00Z', '{}'::jsonb),
  ('72000000-0000-4000-8000-000000000024', '72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000012',
    'symptom', 'Other vomiting', 'Other tenant', '2026-08-10T13:00:00Z', '{"normalizedConcernKey":"vomiting"}'::jsonb);
update public.pet_care_entries set deleted_at = now(), deleted_by = user_id, deletion_reason = 'user_removed'
where id = '72000000-0000-4000-8000-000000000023';

insert into public.furvise_memories(
  id, user_id, pet_id, subject_type, category, fact_key, fact_value, confidence, importance,
  durability, status, source_type, dedupe_key, first_observed_at, last_confirmed_at
) values
  ('72000000-0000-4000-8000-000000000031', '72000000-0000-4000-8000-000000000001', null, 'owner', 'shopping', 'preferred_retailer', '"Local shop"', .95, 'medium', 'durable', 'active', 'ask_message', 'p2-owner-pref', now(), now()),
  ('72000000-0000-4000-8000-000000000032', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000011', 'pet', 'preference', 'food_likes', '"salmon"', .94, 'medium', 'durable', 'active', 'ask_message', 'p2-pet-pref', now(), now()),
  ('72000000-0000-4000-8000-000000000033', '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000011', 'pet', 'relationship', 'caregiver_relationship', '{"person":"Ari"}', .93, 'medium', 'durable', 'active', 'ask_message', 'p2-relation', now(), now()),
  ('72000000-0000-4000-8000-000000000034', '72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000012', 'pet', 'preference', 'food_likes', '"tuna"', .9, 'medium', 'durable', 'active', 'ask_message', 'p2-cross-user', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin
    perform public.import_legacy_semantic_claims_v2('72000000-0000-4000-8000-000000000001', 'pet_care_entries');
    raise exception 'authenticated role executed legacy importer';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.semantic_concepts(id, canonical_key, display_label, definition, concept_kind, status, concept_version)
    values(gen_random_uuid(), 'browser_concept', 'Browser', 'Forbidden browser concept', 'care_fact', 'active', 'v1');
    raise exception 'authenticated role wrote canonical registry';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  v_first record;
  v_repeat record;
  v_memory record;
begin
  if auth.uid() is not null then raise exception 'service import unexpectedly inherited end-user auth.uid'; end if;
  select * into v_first from public.import_legacy_semantic_claims_v2(
    '72000000-0000-4000-8000-000000000001', 'pet_care_entries', null, 'phase2.test.v1', 50
  );
  if v_first.examined <> 3 or v_first.imported <> 3 or v_first.canonical <> 1 or v_first.unresolved <> 2 then
    raise exception 'unexpected care import audit: %', row_to_json(v_first);
  end if;
  if not exists(select 1 from public.semantic_claims claim
      join public.semantic_claim_legacy_lineage lineage on lineage.claim_id = claim.id
      where lineage.legacy_row_id = '72000000-0000-4000-8000-000000000021'
        and claim.concept_resolution_status = 'unresolved' and claim.canonical_concept_key is null) then
    raise exception 'phrase-derived title was falsely canonicalized';
  end if;
  if not exists(select 1 from public.semantic_claims claim
      join public.semantic_claim_legacy_lineage lineage on lineage.claim_id = claim.id
      where lineage.legacy_row_id = '72000000-0000-4000-8000-000000000023'
        and claim.knowledge_status = 'tombstoned' and claim.persistence_destination = 'none') then
    raise exception 'tombstoned History was not excluded from effective projection';
  end if;
  if exists(select 1 from public.semantic_claims where provenance_classification = 'imported_legacy'
      and (evidence_basis <> 'legacy_record' or grounded_evidence <> '[]'::jsonb)) then
    raise exception 'legacy importer fabricated grounded evidence';
  end if;

  select * into v_repeat from public.import_legacy_semantic_claims_v2(
    '72000000-0000-4000-8000-000000000001', 'pet_care_entries', null, 'phase2.test.v2', 50
  );
  if v_repeat.imported <> 0 or v_repeat.already_imported <> 3 then raise exception 'legacy import was not idempotent'; end if;

  select * into v_memory from public.import_legacy_semantic_claims_v2(
    '72000000-0000-4000-8000-000000000001', 'furvise_memories', null, 'phase2.test.v1', 50
  );
  if v_memory.imported <> 3 or v_memory.canonical <> 2 or v_memory.provisional <> 1 then
    raise exception 'unexpected memory import audit: %', row_to_json(v_memory);
  end if;
  if (select count(*) from public.semantic_claims where user_id = '72000000-0000-4000-8000-000000000001'
      and persistence_destination in ('owner_memory','pet_memory','relationship')) <> 3 then
    raise exception 'owner, pet, or relationship memory projection class missing';
  end if;

  begin
    perform public.import_legacy_semantic_claims_v2(
      '72000000-0000-4000-8000-000000000001', 'furvise_memories',
      array['72000000-0000-4000-8000-000000000034'::uuid], 'phase2.test.v1', 50
    );
    raise exception 'cross-user import was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Duplicate an exact alias under another concept to prove ambiguity is represented, not guessed.
insert into public.semantic_concepts(
  id, canonical_key, display_label, definition, concept_kind, lifecycle_capable, status, concept_version
) values (
  '72000000-0000-4000-8000-000000000041', 'test_illness', 'Test illness', 'Test-only ambiguous concept.',
  'symptom', true, 'active', 'test.v1'
);
insert into public.semantic_concept_aliases(
  concept_id, normalized_alias, alias_type, confidence, authority, alias_version, provenance
) values (
  '72000000-0000-4000-8000-000000000041', 'vomit', 'language_variant', 1, 'furvise_governed', 'test.v1', 'Rollback-only ambiguity test'
);
do $$
declare resolution record;
begin
  select * into resolution from public.resolve_semantic_concept_v2('vomit', 'dog');
  if resolution.resolution_status <> 'ambiguous' or resolution.concept_id is not null then
    raise exception 'ambiguous exact alias received canonical authority';
  end if;
end $$;

-- Relational lineage must remain tenant-correct and duplicate-free.
do $$ begin
  if exists(select 1 from public.semantic_claim_legacy_lineage lineage
      join public.semantic_claims claim on claim.id = lineage.claim_id
      where lineage.user_id <> claim.user_id) then raise exception 'cross-user lineage exists'; end if;
  if exists(select 1 from public.semantic_claim_legacy_lineage
      group by user_id, legacy_table, legacy_row_id, claim_role having count(*) > 1) then
    raise exception 'duplicate legacy lineage exists';
  end if;
end $$;

rollback;
