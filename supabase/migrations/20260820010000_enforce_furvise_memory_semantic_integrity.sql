-- Forward-only guard for durable memory semantics. This migration deliberately
-- leaves legacy rows untouched; cleanup is a separate, approval-gated action.

-- Semantic identifiers are case-normalized before punctuation is folded. The
-- order matters: removing non-lowercase characters first corrupts camelCase
-- (selectedPet became selected_et) and can hide an authoritative machine key.
create or replace function public.normalize_furvise_memory_identifier(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select btrim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '_', 'g'), '_');
$$;

revoke all on function public.normalize_furvise_memory_identifier(text) from public, anon;
grant execute on function public.normalize_furvise_memory_identifier(text) to authenticated, service_role;

-- Classify exact identifiers and the bounded family of lossy aliases produced
-- by the retired uppercase-stripping bug. The maximum missing-character count
-- is derived from the identifier's word count, rather than from special-casing
-- observed strings such as selected_et or lifecycle_tatus.
create or replace function public.classify_furvise_memory_identifier(p_value text)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v_candidate text := replace(public.normalize_furvise_memory_identifier(p_value), '_', '');
  v_definition record;
  v_missing integer;
  v_candidate_index integer;
  v_target_index integer;
begin
  for v_definition in
    select * from (values
      ('active', 1, 'authoritative'), ('inactive', 1, 'authoritative'), ('archived', 1, 'authoritative'), ('archivedat', 2, 'authoritative'),
      ('deceased', 1, 'authoritative'), ('deceasedat', 2, 'authoritative'), ('deathreported', 2, 'authoritative'),
      ('lifecycle', 1, 'authoritative'), ('lifecyclechangedat', 3, 'authoritative'), ('lifecyclestatus', 2, 'authoritative'),
      ('status', 1, 'authoritative'), ('pending', 1, 'authoritative'), ('confirmed', 1, 'authoritative'),
      ('resolved', 1, 'authoritative'), ('rejected', 1, 'authoritative'), ('approved', 1, 'authoritative'),
      ('species', 1, 'authoritative'), ('breed', 1, 'authoritative'),
      ('sex', 1, 'authoritative'), ('age', 1, 'authoritative'), ('agevalue', 2, 'authoritative'),
      ('ageunit', 2, 'authoritative'), ('weight', 1, 'authoritative'), ('weightvalue', 2, 'authoritative'),
      ('weightunit', 2, 'authoritative'), ('petid', 2, 'authoritative'), ('userid', 2, 'authoritative'),
      ('requestid', 2, 'machine'), ('attemptid', 2, 'machine'), ('routetype', 2, 'machine'),
      ('safetylevel', 2, 'machine'), ('requiresfollowup', 2, 'machine'), ('hasconcern', 2, 'machine'),
      ('hasbehaviorchange', 3, 'machine'), ('confirmationstate', 2, 'machine'), ('actionstatus', 2, 'machine'),
      ('selectedpet', 2, 'machine'),
      ('symptom', 1, 'destination'), ('diagnosis', 1, 'destination'), ('medication', 1, 'destination'),
      ('care', 1, 'destination'), ('carehistory', 2, 'destination'), ('currentstate', 2, 'destination'),
      ('temporarystate', 2, 'destination'), ('applicationaction', 2, 'destination'),
      ('classifier', 1, 'destination'), ('safety', 1, 'destination')
    ) as definitions(canonical, max_missing, classification)
  loop
    if v_candidate = v_definition.canonical then
      return v_definition.classification;
    end if;
    v_missing := length(v_definition.canonical) - length(v_candidate);
    if v_candidate = '' or v_missing < 1 or v_missing > v_definition.max_missing then
      continue;
    end if;
    v_candidate_index := 1;
    v_target_index := 1;
    while v_candidate_index <= length(v_candidate) and v_target_index <= length(v_definition.canonical) loop
      if substr(v_candidate, v_candidate_index, 1) = substr(v_definition.canonical, v_target_index, 1) then
        v_candidate_index := v_candidate_index + 1;
      end if;
      v_target_index := v_target_index + 1;
    end loop;
    if v_candidate_index > length(v_candidate) then
      return v_definition.classification;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.classify_furvise_memory_identifier(text) from public, anon;
grant execute on function public.classify_furvise_memory_identifier(text) to authenticated, service_role;

-- Migration-time, row-free contract checks keep every spelling variant on the
-- same classification path and prove ordinary camelCase semantic keys remain
-- available. A future registry edit that violates this contract aborts DDL.
do $migration$
declare
  v_identifier text;
begin
  foreach v_identifier in array array[
    'selectedPet', 'selected_pet', 'selected-pet', 'SELECTED_PET', 'SelectedPet', 'selected pet',
    'requiresFollowup', 'lifecycleStatus', 'deathReported', 'hasBehaviorChange', 'routeType', 'safetyLevel',
    'selected_et', 'requires_ollowup', 'lifecycle_tatus'
  ]
  loop
    if public.classify_furvise_memory_identifier(v_identifier) not in ('machine', 'authoritative') then
      raise exception using errcode = '55000', message = 'MEMORY_MACHINE_IDENTIFIER_CLASSIFICATION_FAILED', detail = v_identifier;
    end if;
  end loop;

  foreach v_identifier in array array['active', 'archived', 'deceased', 'pending', 'confirmed', 'LifecycleStatus', 'death-reported']
  loop
    if public.classify_furvise_memory_identifier(v_identifier) <> 'authoritative' then
      raise exception using errcode = '55000', message = 'MEMORY_LIFECYCLE_IDENTIFIER_CLASSIFICATION_FAILED', detail = v_identifier;
    end if;
  end loop;

  foreach v_identifier in array array['approachSensitivity', 'foodPreference', 'sleepRoutine']
  loop
    if public.classify_furvise_memory_identifier(v_identifier) is not null then
      raise exception using errcode = '55000', message = 'MEMORY_SEMANTIC_IDENTIFIER_CLASSIFICATION_FAILED', detail = v_identifier;
    end if;
  end loop;
end;
$migration$;

-- Ask persistence used the lossy camelCase expression before inserts reached
-- the table trigger. Rewrite that assignment in-place and abort if production
-- no longer has the exact reviewed definition. Feature persistence is replaced
-- below with a service-only, provenance-bound contract.
do $migration$
declare
  v_procedure regprocedure := 'public.persist_furvise_intelligence(uuid,uuid,jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_occurrences integer;
  v_old_assignment constant text := $rewrite$v_fact_key := lower(regexp_replace(coalesce(v_learning->>'factKey', ''), '[^a-z0-9]+', '_', 'g'));$rewrite$;
  v_new_assignment constant text := $rewrite$v_fact_key := public.normalize_furvise_memory_identifier(v_learning->>'factKey');$rewrite$;
begin
  select pg_get_functiondef(v_procedure) into strict v_definition;
  v_occurrences := (length(v_definition) - length(replace(v_definition, v_old_assignment, ''))) / length(v_old_assignment);
  if v_occurrences <> 1 then
    raise exception using
      errcode = '55000',
      message = 'MEMORY_IDENTIFIER_NORMALIZATION_GUARD_UNEXPECTED',
      detail = v_procedure::text;
  end if;
  v_definition := replace(v_definition, v_old_assignment, v_new_assignment);
  execute v_definition;
end;
$migration$;

-- Replacing function bodies must not broaden their authority boundary.
revoke all on function public.persist_furvise_intelligence(uuid, uuid, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.persist_furvise_intelligence(uuid, uuid, jsonb, jsonb)
  to authenticated;
revoke all on function public.persist_furvise_feature_intelligence(uuid, text, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
drop function public.persist_furvise_feature_intelligence(uuid, text, uuid, jsonb, jsonb);

create or replace function public.normalize_furvise_preference_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case replace(public.normalize_furvise_memory_identifier(p_value), '_', '')
    when 'preferredlanguage' then 'preferred_language'
    when 'languagepreference' then 'preferred_language'
    when 'responselanguage' then 'preferred_language'
    when 'replylanguage' then 'preferred_language'
    when 'preferredunits' then 'preferred_units'
    when 'unitpreference' then 'preferred_units'
    when 'unitspreference' then 'preferred_units'
    when 'communicationstyle' then 'communication_style'
    when 'communicationpreference' then 'communication_style'
    when 'responsestyle' then 'communication_style'
    when 'writingstyle' then 'communication_style'
    when 'preferredretailer' then 'preferred_retailer'
    when 'preferredstore' then 'preferred_retailer'
    when 'petfoodstorepreference' then 'preferred_retailer'
    when 'retailerpreference' then 'preferred_retailer'
    when 'storepreference' then 'preferred_retailer'
    when 'monthlypetsupplybudget' then 'monthly_pet_supply_budget'
    when 'monthlypetsupplyspendinglimit' then 'monthly_pet_supply_budget'
    when 'petsuppliesmonthlybudgetlimit' then 'monthly_pet_supply_budget'
    when 'productbudgetpreference' then 'monthly_pet_supply_budget'
    when 'spendinglimit' then 'monthly_pet_supply_budget'
    else null
  end;
$$;

create or replace function public.is_valid_furvise_preference(
  p_category text,
  p_fact_key text,
  p_fact_value text,
  p_source_excerpt text,
  p_require_explicit_intent boolean default true
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v_category text := replace(public.normalize_furvise_memory_identifier(p_category), '_', '');
  v_key text := public.normalize_furvise_preference_key(p_fact_key);
  v_value text := lower(btrim(regexp_replace(coalesce(p_fact_value, ''), '\s+', ' ', 'g')));
  v_source text := lower(btrim(regexp_replace(coalesce(p_source_excerpt, ''), '[^[:alnum:]]+', ' ', 'g')));
  v_token text;
  v_has_descriptor boolean := false;
  v_grounded boolean := false;
begin
  if v_key is null or v_value = '' or char_length(v_value) > 100 then
    return false;
  end if;
  if v_key in ('preferred_retailer', 'monthly_pet_supply_budget') then
    if v_category not in ('budgetpreference', 'ownerpreference', 'preference', 'preferences', 'retailerpreference', 'shopping', 'shoppingpreference', 'userpreference') then return false; end if;
  elsif v_category not in ('communicationpreference', 'ownerpreference', 'preference', 'preferences', 'userpreference') then
    return false;
  end if;
  if v_value in ('true', 'false', 'null', 'undefined', 'yes', 'no', 'active', 'inactive', 'archived', 'deceased', 'pending', 'confirmed')
    or v_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_value ~ '^\s*[\[{]' then
    return false;
  end if;

  if v_key = 'preferred_language' then
    if not (
      v_value ~ '^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$'
      or regexp_replace(v_value, ' language$', '') in (
        'arabic', 'bengali', 'catalan', 'chinese', 'czech', 'danish', 'dutch', 'english', 'finnish',
        'french', 'german', 'greek', 'hebrew', 'hindi', 'hungarian', 'indonesian', 'italian', 'japanese',
        'korean', 'malay', 'norwegian', 'persian', 'polish', 'portuguese', 'punjabi', 'romanian', 'russian',
        'spanish', 'swedish', 'tagalog', 'thai', 'turkish', 'ukrainian', 'urdu', 'vietnamese'
      )
    ) then return false; end if;
    if p_require_explicit_intent and v_source !~ '\m(answer|keep|language|prefer|remember|reply|respond|speak|switch|use)\M' then return false; end if;
    v_grounded := position(regexp_replace(v_value, ' language$', '') in v_source) > 0;
  elsif v_key = 'preferred_units' then
    if v_value !~ '^(metric|imperial|si|us customary|uk imperial|metric units|imperial units|kilograms?|kg|pounds?|lbs?)$' then return false; end if;
    if p_require_explicit_intent and v_source !~ '\m(metric|imperial|unit|units|kilogram|kilograms|pound|pounds|prefer|remember|switch|use)\M' then return false; end if;
    v_grounded := case when v_value ~ '(metric|si|kilogram|kg)'
      then v_source ~ '\m(metric|si|kilogram|kilograms|kg)\M'
      else v_source ~ '\m(imperial|customary|pound|pounds|lb|lbs)\M' end;
  elsif v_key = 'preferred_retailer' then
    if v_value !~ '^[[:alnum:]][[:alnum:]&.'' -]{0,79}$' then return false; end if;
    if p_require_explicit_intent and v_source !~ '\m(buy|prefer|remember|retailer|shop|store)\M' then return false; end if;
    v_grounded := position(lower(regexp_replace(v_value, '[^[:alnum:]]+', ' ', 'g')) in v_source) > 0;
  elsif v_key = 'monthly_pet_supply_budget' then
    if v_value !~* '([$€£][[:space:]]*[0-9]|[0-9][[:space:]]*(usd|cad|eur|gbp|dollars?|euros?|pounds?)|\m(budget|under|up to|maximum|max)\M)' then return false; end if;
    if p_require_explicit_intent and v_source !~ '\m(budget|cost|limit|maximum|prefer|remember|spend|under)\M' then return false; end if;
    v_grounded := regexp_replace(v_value, '[^0-9]+', '', 'g') <> ''
      and position(regexp_replace(v_value, '[^0-9]+', '', 'g') in regexp_replace(v_source, '[^0-9]+', '', 'g')) > 0;
  else
    for v_token in select token from regexp_split_to_table(v_value, '[^[:alnum:]]+') as words(token) where token <> ''
    loop
      if v_token in ('brief', 'calm', 'casual', 'concise', 'detailed', 'direct', 'friendly', 'gentle', 'practical', 'short', 'simple', 'thorough', 'warm') then
        v_has_descriptor := true;
        v_grounded := v_grounded or position(left(v_token, least(char_length(v_token), 6)) in v_source) > 0;
      elsif v_token not in ('and', 'answer', 'answers', 'be', 'communication', 'i', 'keep', 'me', 'more', 'my', 'please', 'prefer', 'prefers', 'response', 'responses', 'style', 'the', 'to', 'tone', 'want', 'wants') then
        return false;
      end if;
    end loop;
    if not v_has_descriptor then return false; end if;
    if p_require_explicit_intent and v_source !~ '\m(answer|answers|brief|communication|concise|detailed|direct|friendly|prefer|remember|response|responses|short|style|tone)\M' then return false; end if;
  end if;
  return not p_require_explicit_intent or v_grounded;
end;
$$;

revoke all on function public.normalize_furvise_preference_key(text) from public, anon;
grant execute on function public.normalize_furvise_preference_key(text) to authenticated, service_role;
revoke all on function public.is_valid_furvise_preference(text, text, text, text, boolean) from public, anon;
grant execute on function public.is_valid_furvise_preference(text, text, text, text, boolean) to authenticated, service_role;

-- Feature intelligence persistence accepts only service-role calls made by a
-- server route that has already claimed the matching idempotency operation.
-- The authoritative input is transient, and every memory excerpt must be
-- grounded in it before a durable row can be created.
create function public.persist_furvise_feature_intelligence(
  p_user_id uuid,
  p_pet_id uuid,
  p_source_type text,
  p_operation_type text,
  p_request_id uuid,
  p_payload_hash text,
  p_operation_owner_token uuid,
  p_source_input text,
  p_learnings jsonb default '[]'::jsonb,
  p_care_actions jsonb default '[]'::jsonb
)
returns table(memories_created integer, memories_superseded integer, care_entries_created integer, concerns_resolved integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learning jsonb;
  v_action jsonb;
  v_existing public.furvise_memories%rowtype;
  v_memory_id uuid;
  v_dedupe_key text;
  v_fact_key text;
  v_fact_value text;
  v_normalized_value text;
  v_subject_type text;
  v_pet_id uuid;
  v_source_excerpt text;
  v_entry_id uuid;
  v_concern_id uuid;
  v_memories_created integer := 0;
  v_memories_superseded integer := 0;
  v_care_entries_created integer := 0;
  v_concerns_resolved integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'; end if;
  if p_user_id is null or p_pet_id is null or p_request_id is null or p_operation_owner_token is null
    or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'FEATURE_INTELLIGENCE_IDENTITY_REQUIRED';
  end if;
  if p_source_type = 'product_question' and p_operation_type <> 'product.question'
    or p_source_type = 'product_query' and p_operation_type <> 'product.interpret'
    or p_source_type = 'safety_followup' and p_operation_type <> 'safety.followup'
    or p_source_type not in ('product_question', 'product_query', 'safety_followup') then
    raise exception using errcode = '22023', message = 'INVALID_INTELLIGENCE_SOURCE';
  end if;
  if btrim(coalesce(p_source_input, '')) = '' or char_length(p_source_input) > 10000 then
    raise exception using errcode = '22023', message = 'FEATURE_INTELLIGENCE_SOURCE_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_learnings, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_learnings, '[]'::jsonb)) > 8
    or jsonb_typeof(coalesce(p_care_actions, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_care_actions, '[]'::jsonb)) > 1 then
    raise exception using errcode = '22023', message = 'FEATURE_INTELLIGENCE_PAYLOAD_INVALID';
  end if;
  if not exists (select 1 from public.dog_profiles as pet_row where pet_row.id = p_pet_id and pet_row.user_id = p_user_id) then
    raise exception using errcode = '42501', message = 'PET_NOT_OWNED';
  end if;
  if not exists (
    select 1 from public.idempotency_operations as operation_row
    where operation_row.user_id = p_user_id
      and operation_row.operation_type = p_operation_type
      and operation_row.idempotency_key = p_request_id
      and operation_row.payload_hash = p_payload_hash
      and operation_row.owner_token = p_operation_owner_token
      and operation_row.status = 'processing'
  ) then
    raise exception using errcode = '42501', message = 'FEATURE_INTELLIGENCE_REQUEST_NOT_AUTHORIZED';
  end if;

  for v_learning in select value from jsonb_array_elements(coalesce(p_learnings, '[]'::jsonb))
  loop
    if coalesce((v_learning->>'confidence')::numeric, 0) < 0.85 then continue; end if;
    v_subject_type := v_learning->>'subjectType';
    if v_subject_type not in ('pet', 'owner') then continue; end if;
    v_pet_id := case when v_subject_type = 'pet' then p_pet_id else null end;
    v_fact_key := public.normalize_furvise_memory_identifier(v_learning->>'factKey');
    v_fact_value := btrim(coalesce(v_learning->>'factValue', ''));
    v_normalized_value := left(lower(regexp_replace(v_fact_value, '\s+', ' ', 'g')), 500);
    v_source_excerpt := left(btrim(coalesce(v_learning->>'sourceExcerpt', '')), 240);
    if v_fact_key = '' or v_normalized_value = '' or v_source_excerpt = ''
      or position(
        lower(regexp_replace(v_source_excerpt, '[^[:alnum:]]+', ' ', 'g'))
        in lower(regexp_replace(p_source_input, '[^[:alnum:]]+', ' ', 'g'))
      ) = 0 then
      continue;
    end if;
    v_dedupe_key := md5(p_user_id::text || ':' || coalesce(v_pet_id::text, 'owner') || ':' || v_fact_key || ':' || v_normalized_value || ':' || p_source_type || ':' || p_request_id::text);

    select memory_row.* into v_existing from public.furvise_memories as memory_row
    where memory_row.user_id = p_user_id and memory_row.subject_type = v_subject_type
      and memory_row.pet_id is not distinct from v_pet_id and memory_row.fact_key = v_fact_key and memory_row.status = 'active'
    order by memory_row.last_confirmed_at desc limit 1 for update;
    if v_existing.id is not null and v_existing.normalized_value = v_normalized_value then
      update public.furvise_memories as memory_row
      set last_confirmed_at = now(), updated_at = now(), confidence = greatest(memory_row.confidence, (v_learning->>'confidence')::numeric)
      where memory_row.id = v_existing.id;
      continue;
    end if;
    insert into public.furvise_memories(
      user_id, pet_id, subject_type, category, fact_key, fact_value, normalized_value, confidence,
      importance, durability, status, source_type, source_id, source_excerpt, dedupe_key
    ) values (
      p_user_id, v_pet_id, v_subject_type, left(v_learning->>'category', 80), v_fact_key, to_jsonb(v_fact_value),
      v_normalized_value, (v_learning->>'confidence')::numeric, v_learning->>'importance', v_learning->>'durability',
      'active', p_source_type, p_request_id, v_source_excerpt, v_dedupe_key
    ) on conflict (dedupe_key) do nothing returning id into v_memory_id;
    if v_memory_id is null then continue; end if;
    v_memories_created := v_memories_created + 1;
    if v_existing.id is not null then
      update public.furvise_memories as memory_row set status = 'superseded', superseded_by = v_memory_id, updated_at = now()
      where memory_row.id = v_existing.id;
      v_memories_superseded := v_memories_superseded + 1;
    end if;
    v_existing := null;
    v_memory_id := null;
  end loop;

  for v_action in select value from jsonb_array_elements(coalesce(p_care_actions, '[]'::jsonb)) limit 1
  loop
    if coalesce((v_action->>'confidence')::numeric, 0) < 0.90 then continue; end if;
    if v_action->>'action' not in ('create_entry', 'resolve_concern') then continue; end if;
    v_concern_id := case when coalesce(v_action->>'relatedRecordId', '') ~* '^[0-9a-f-]{36}$' then (v_action->>'relatedRecordId')::uuid else null end;
    if v_action->>'action' = 'resolve_concern' and not exists (
      select 1 from public.pet_concerns as concern_row where concern_row.id = v_concern_id and concern_row.user_id = p_user_id
        and concern_row.pet_profile_id = p_pet_id and concern_row.status in ('active', 'monitoring', 'reopened') and concern_row.resolved_at is null
    ) then continue; end if;
    insert into public.pet_care_entries(
      user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id,
      intelligence_request_id, intelligence_source_type
    ) values (
      p_user_id, p_pet_id,
      case when v_action->>'category' in ('symptom', 'food', 'medication', 'activity', 'grooming', 'vet_visit', 'behavior', 'general') then v_action->>'category' else 'general' end,
      left(v_action->>'title', 120), left(v_action->>'details', 1000), now(),
      case when v_action->>'severity' in ('urgent', 'emergency') then 'severe' when v_action->>'severity' = 'moderate' then 'moderate' when v_action->>'severity' = 'mild' then 'mild' else null end,
      v_concern_id, p_request_id, p_source_type
    ) on conflict (user_id, pet_profile_id, intelligence_source_type, intelligence_request_id)
      where intelligence_request_id is not null and intelligence_source_type is not null do nothing
    returning id into v_entry_id;
    if v_entry_id is not null then v_care_entries_created := v_care_entries_created + 1; end if;
    if v_action->>'action' = 'resolve_concern' and v_entry_id is not null then
      update public.pet_concerns as concern_row set status = 'resolved', resolved_at = now(),
        resolution_note = left(v_action->>'details', 1000), updated_at = now()
      where concern_row.id = v_concern_id and concern_row.user_id = p_user_id and concern_row.pet_profile_id = p_pet_id
        and concern_row.status in ('active', 'monitoring', 'reopened') and concern_row.resolved_at is null;
      get diagnostics v_concerns_resolved = row_count;
    end if;
  end loop;
  return query select v_memories_created, v_memories_superseded, v_care_entries_created, v_concerns_resolved;
end;
$$;

revoke all on function public.persist_furvise_feature_intelligence(uuid, uuid, text, text, uuid, text, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_furvise_feature_intelligence(uuid, uuid, text, text, uuid, text, uuid, text, jsonb, jsonb)
  to service_role;

do $migration$
begin
  if to_regprocedure('public.persist_furvise_feature_intelligence(uuid,text,uuid,jsonb,jsonb)') is not null then
    raise exception using errcode = '55000', message = 'LEGACY_FEATURE_INTELLIGENCE_RPC_REMAINS';
  end if;
  if has_function_privilege('anon', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.persist_furvise_feature_intelligence(uuid,uuid,text,text,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE') then
    raise exception using errcode = '55000', message = 'FEATURE_INTELLIGENCE_RPC_PRIVILEGE_CONTRACT_FAILED';
  end if;
  if public.is_valid_furvise_preference('medical_condition', 'communication_style', 'I have diabetes', 'I have diabetes', true)
    or public.is_valid_furvise_preference('behavior', 'preferred_language', 'hides from visitors', 'She hides from visitors', true)
    or public.is_valid_furvise_preference('lifecycle', 'preferred_units', 'active', 'She is active', true)
    or public.is_valid_furvise_preference('preference', 'communication_style', '{"tone":"concise"}', 'Use concise answers', true)
    or public.is_valid_furvise_preference('preference', 'communication_style', '380211f7-4b9a-4690-ad68-35b141ec14a6', 'Use this style', true) then
    raise exception using errcode = '55000', message = 'PREFERENCE_REJECTION_CONTRACT_FAILED';
  end if;
  if not public.is_valid_furvise_preference('communication_preference', 'communication_style', 'concise', 'Please answer more concisely', true)
    or not public.is_valid_furvise_preference('communication_preference', 'preferred_units', 'metric', 'Use metric units', true)
    or not public.is_valid_furvise_preference('communication_preference', 'preferred_language', 'French', 'Answer me in French', true)
    or not public.is_valid_furvise_preference('communication_preference', 'communication_style', 'short answers', 'Remember that I prefer short answers', true) then
    raise exception using errcode = '55000', message = 'PREFERENCE_COMPATIBILITY_CONTRACT_FAILED';
  end if;
end;
$migration$;

create or replace function public.enforce_furvise_memory_semantic_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_preference_key text := public.normalize_furvise_preference_key(new.fact_key);
  v_category_class text := public.classify_furvise_memory_identifier(new.category);
  v_key_class text := public.classify_furvise_memory_identifier(new.fact_key);
  v_value text;
  v_normalized text := lower(btrim(coalesce(new.normalized_value, '')));
begin
  if jsonb_typeof(new.fact_value) <> 'string' then
    raise exception using errcode = '22023', message = 'MEMORY_SEMANTIC_VALUE_REQUIRED';
  end if;
  v_value := btrim(new.fact_value #>> '{}');
  if v_value = '' or v_normalized = '' then
    raise exception using errcode = '22023', message = 'MEMORY_SEMANTIC_VALUE_REQUIRED';
  end if;
  if v_category_class in ('authoritative', 'destination') or v_key_class = 'authoritative' then
    raise exception using errcode = '22023', message = 'MEMORY_AUTHORITATIVE_STATE_FORBIDDEN';
  end if;
  if v_category_class = 'machine' or v_key_class = 'machine' then
    raise exception using errcode = '22023', message = 'MEMORY_MACHINE_VALUE_FORBIDDEN';
  end if;
  if lower(v_value) in ('true', 'false', 'null', 'undefined', 'yes', 'no', 'active', 'inactive', 'archived', 'deceased', 'dead', 'passed away', 'unknown', 'pending', 'confirmed', 'resolved', 'rejected', 'approved')
    or v_value ~* '^[[:space:]]*[[:alpha:]_][[:alnum:]_. -]{0,80}[[:space:]]*[:=][[:space:]]*(true|false|null|undefined|yes|no|active|inactive|archived|deceased|dead|unknown|pending|confirmed|resolved|rejected|approved)[.]?[[:space:]]*$'
    or v_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_value ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
    or v_value ~ '^\s*[\[{]' then
    raise exception using errcode = '22023', message = 'MEMORY_MACHINE_VALUE_FORBIDDEN';
  end if;
  if new.subject_type = 'owner' and not public.is_valid_furvise_preference(
    new.category, new.fact_key, v_value, new.source_excerpt, new.source_type <> 'user_edit'
  ) then
    raise exception using errcode = '22023', message = 'MEMORY_OWNER_PREFERENCE_INVALID';
  end if;
  if new.subject_type = 'pet' and v_preference_key is not null then
    raise exception using errcode = '22023', message = 'MEMORY_PREFERENCE_SCOPE_INVALID';
  end if;
  if new.source_type in ('ask_message', 'product_question', 'product_query', 'safety_followup', 'vet_brief', 'user_edit')
    and btrim(coalesce(new.source_excerpt, '')) = '' then
    raise exception using errcode = '22023', message = 'MEMORY_PROVENANCE_REQUIRED';
  end if;
  if new.source_type = 'ask_message' and not exists (
    select 1 from public.ask_conversation_messages as source_message
    where source_message.id = new.source_id
      and source_message.user_id = new.user_id
      and source_message.role = 'user'
      and position(
        lower(regexp_replace(btrim(new.source_excerpt), '[^[:alnum:]]+', ' ', 'g'))
        in lower(regexp_replace(coalesce(source_message.user_text, ''), '[^[:alnum:]]+', ' ', 'g'))
      ) > 0
  ) then
    raise exception using errcode = '22023', message = 'MEMORY_PROVENANCE_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_furvise_memory_semantic_integrity() from public, anon, authenticated;

drop trigger if exists furvise_memories_semantic_integrity on public.furvise_memories;
create trigger furvise_memories_semantic_integrity
before insert or update of subject_type, category, fact_key, fact_value, normalized_value, source_type, source_excerpt
on public.furvise_memories
for each row execute function public.enforce_furvise_memory_semantic_integrity();

-- Canonical memory writes must pass through the owned SECURITY DEFINER RPCs or
-- a trusted service. Authenticated clients retain owner-scoped reads and the
-- existing lifecycle RPC for confirm/edit/forget.
revoke all privileges on table public.furvise_memories from public, anon, authenticated;
grant select on table public.furvise_memories to authenticated;
grant update (status, superseded_by, updated_at) on table public.furvise_memories to authenticated;

create or replace function public.enforce_legacy_memory_semantic_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_type_class text := public.classify_furvise_memory_identifier(new.type);
  v_preference_key text := public.normalize_furvise_preference_key(new.type);
  v_value text := btrim(regexp_replace(coalesce(new.text, ''), '\s+', ' ', 'g'));
begin
  if v_value = ''
    or v_type_class is not null
    or lower(v_value) in ('true', 'false', 'null', 'undefined', 'yes', 'no', 'active', 'inactive', 'archived', 'deceased', 'dead', 'passed away', 'unknown', 'pending', 'confirmed', 'resolved', 'rejected', 'approved')
    or v_value ~* '^[[:space:]]*[[:alpha:]_][[:alnum:]_. -]{0,80}[[:space:]]*[:=][[:space:]]*(true|false|null|undefined|yes|no|active|inactive|archived|deceased|dead|unknown|pending|confirmed|resolved|rejected|approved)[.]?[[:space:]]*$'
    or v_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_value ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
    or v_value ~ '^\s*[\[{]' then
    raise exception using errcode = '22023', message = 'MEMORY_MACHINE_VALUE_FORBIDDEN';
  end if;
  if v_preference_key is not null and not public.is_valid_furvise_preference(
    'preference', new.type, v_value, coalesce(new.source, ''), false
  ) then
    raise exception using errcode = '22023', message = 'MEMORY_OWNER_PREFERENCE_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_legacy_memory_semantic_integrity() from public, anon, authenticated;

drop trigger if exists dog_memories_semantic_integrity on public.dog_memories;
create trigger dog_memories_semantic_integrity
before insert or update of type, text
on public.dog_memories
for each row execute function public.enforce_legacy_memory_semantic_integrity();

alter table public.dog_memories force row level security;

revoke all privileges on table public.dog_memories from public, anon, authenticated;
grant select, delete on table public.dog_memories to authenticated;
grant insert (user_id, dog_profile_id, type, text, source, confidence, idempotency_key, idempotency_item_index)
on table public.dog_memories to authenticated;
grant update (status, superseded_by) on table public.dog_memories to authenticated;

comment on function public.enforce_furvise_memory_semantic_integrity() is
  'Rejects non-semantic machine state, authoritative profile/lifecycle state, and ungrounded owner facts at the canonical memory write boundary.';
comment on function public.enforce_legacy_memory_semantic_integrity() is
  'Compatibility guard preventing machine state and lifecycle values from entering legacy remembered details.';
comment on function public.normalize_furvise_memory_identifier(text) is
  'Case-first canonicalization shared by Memory Integrity triggers and governed persistence RPCs.';
comment on function public.classify_furvise_memory_identifier(text) is
  'Classifies authoritative, machine, and wrong-destination identifiers, including bounded aliases from the retired camelCase corruption bug.';
