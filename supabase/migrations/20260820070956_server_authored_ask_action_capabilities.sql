-- A response_data action card is presentation only. This service-authored row is
-- the immutable authority for the one mutation it describes.
create table public.ask_action_capabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assistant_message_id uuid not null references public.ask_conversation_messages(id) on delete cascade,
  source_message_id uuid not null references public.ask_conversation_messages(id) on delete cascade,
  source_action_id text not null,
  action_kind text not null,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  target_id uuid,
  target_updated_at timestamptz,
  lifecycle_status_at_mint text,
  lifecycle_changed_at_at_mint timestamptz,
  safety_class text not null,
  mutation_class text not null,
  confirmation_policy text not null,
  authorization_scope text not null,
  explicit_intent boolean not null,
  action_payload jsonb not null,
  status text not null default 'pending',
  receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  terminal_at timestamptz,
  constraint ask_action_capabilities_source_ids_distinct_check
    check (assistant_message_id <> source_message_id),
  constraint ask_action_capabilities_source_action_id_check
    check (char_length(btrim(source_action_id)) between 1 and 160),
  constraint ask_action_capabilities_status_check
    check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  constraint ask_action_capabilities_payload_shape_check check (
    jsonb_typeof(action_payload) = 'object'
    and octet_length(action_payload::text) <= 8192
    and action_payload ?& array['id','kind','petId','sourceMessageId','safetyClass','mutationClass','confirmationPolicy','authorizationScope','explicitIntent','input','evidence','status','label','description','href','resultMessage','errorMessage']
    and action_payload->>'id' = source_action_id
    and action_payload->>'kind' = action_kind
    and action_payload->>'petId' = pet_profile_id::text
    and action_payload->>'sourceMessageId' = source_message_id::text
    and action_payload->>'safetyClass' = safety_class
    and action_payload->>'mutationClass' = mutation_class
    and action_payload->>'confirmationPolicy' = confirmation_policy
    and action_payload->>'authorizationScope' = authorization_scope
    and (action_payload->>'explicitIntent')::boolean = explicit_intent
    and jsonb_typeof(action_payload->'input') = 'object'
    and (action_payload->'input') ?& array['field','value','title','detail','category','target']
    and (action_payload->'input') - array['field','value','title','detail','category','target'] = '{}'::jsonb
    and jsonb_typeof(action_payload#>'{input,field}') in ('string','null')
    and jsonb_typeof(action_payload#>'{input,value}') in ('string','null')
    and jsonb_typeof(action_payload#>'{input,title}') in ('string','null')
    and jsonb_typeof(action_payload#>'{input,detail}') in ('string','null')
    and jsonb_typeof(action_payload#>'{input,category}') in ('string','null')
    and jsonb_typeof(action_payload#>'{input,target}') in ('string','null')
    and coalesce(char_length(action_payload#>>'{input,field}'), 0) <= 80
    and coalesce(char_length(action_payload#>>'{input,value}'), 0) <= 500
    and coalesce(char_length(action_payload#>>'{input,title}'), 0) <= 120
    and coalesce(char_length(action_payload#>>'{input,detail}'), 0) <= 1000
    and coalesce(char_length(action_payload#>>'{input,category}'), 0) <= 80
    and coalesce(action_payload#>>'{input,target}', '') in ('','selected','last','specified')
    and jsonb_typeof(action_payload->'explicitIntent') = 'boolean'
    and jsonb_typeof(action_payload->'evidence') = 'string'
    and char_length(btrim(action_payload->>'evidence')) between 1 and 240
    and jsonb_typeof(action_payload->'label') = 'string'
    and char_length(action_payload->>'label') between 1 and 160
    and jsonb_typeof(action_payload->'description') = 'string'
    and char_length(action_payload->>'description') <= 600
    and jsonb_typeof(action_payload->'href') in ('string','null')
    and jsonb_typeof(action_payload->'resultMessage') = 'null'
    and jsonb_typeof(action_payload->'errorMessage') = 'null'
    and action_payload->>'status' = case when confirmation_policy = 'always' then 'confirmation_required' else 'proposed' end
  ),
  constraint ask_action_capabilities_policy_check check (
    mutation_class = 'mutation'
    and (
      (action_kind in ('pet.update_profile')
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_pet')
      or (action_kind in ('memory.set_preference', 'memory.forget_preference')
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_user')
      or (action_kind = 'care_history.add'
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_pet')
      or (action_kind in ('care_history.edit', 'care_history.remove')
        and safety_class = 'CONFIRMATION_REQUIRED' and confirmation_policy = 'always' and authorization_scope = 'owned_care_record')
      or (action_kind in ('care_state.resolve', 'care_state.reopen')
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_concern')
      or (action_kind in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive')
        and safety_class = 'CONFIRMATION_REQUIRED' and confirmation_policy = 'always' and authorization_scope = 'owned_pet')
      or (action_kind = 'pet.delete_permanently'
        and safety_class = 'DESTRUCTIVE' and confirmation_policy = 'always' and authorization_scope = 'owned_pet')
    )
  ),
  constraint ask_action_capabilities_target_check check (
    (action_kind in ('care_history.edit', 'care_history.remove', 'care_state.resolve', 'care_state.reopen') and target_id is not null)
    or (action_kind not in ('care_history.edit', 'care_history.remove', 'care_state.resolve', 'care_state.reopen') and target_id is null)
  ),
  constraint ask_action_capabilities_version_binding_check check (
    (
      action_kind = 'care_history.edit'
      and target_updated_at is not null
    ) or (
      action_kind <> 'care_history.edit'
      and target_updated_at is null
    )
  ),
  constraint ask_action_capabilities_lifecycle_generation_check check (
    (
      action_kind in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive')
      and lifecycle_status_at_mint in ('active', 'deceased', 'archived')
      and (lifecycle_status_at_mint = 'active' or lifecycle_changed_at_at_mint is not null)
    ) or (
      action_kind not in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive')
      and lifecycle_status_at_mint is null
      and lifecycle_changed_at_at_mint is null
    )
  ),
  constraint ask_action_capabilities_terminal_check check (
    (status = 'pending' and receipt is null and terminal_at is null)
    or (
      status <> 'pending' and jsonb_typeof(receipt) = 'object' and terminal_at is not null
      and octet_length(receipt::text) <= 8192
      and receipt->>'id' = id::text
      and receipt->>'status' = status
      and receipt->>'kind' = action_kind
      and receipt->>'petId' = pet_profile_id::text
      and receipt->>'sourceMessageId' = source_message_id::text
      and receipt->>'safetyClass' = safety_class
      and receipt->>'mutationClass' = mutation_class
      and receipt->>'confirmationPolicy' = confirmation_policy
      and receipt->>'authorizationScope' = authorization_scope
    )
  )
);

create unique index ask_action_capabilities_logical_action_idx
  on public.ask_action_capabilities(user_id, source_message_id, source_action_id);
create index ask_action_capabilities_message_idx
  on public.ask_action_capabilities(user_id, assistant_message_id, created_at, id);

alter table public.ask_action_capabilities enable row level security;
alter table public.ask_action_capabilities force row level security;

revoke all on public.ask_action_capabilities from public, anon, authenticated;
revoke all on public.ask_action_capabilities from service_role;
grant select, insert on public.ask_action_capabilities to service_role;

create or replace function private.validate_ask_action_capability()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_source public.ask_conversation_messages%rowtype;
  v_assistant public.ask_conversation_messages%rowtype;
  v_pet public.dog_profiles%rowtype;
  v_entry public.pet_care_entries%rowtype;
begin
  select * into v_source from public.ask_conversation_messages
  where id = new.source_message_id and user_id = new.user_id and role = 'user';
  select * into v_assistant from public.ask_conversation_messages
  where id = new.assistant_message_id and user_id = new.user_id and role = 'furvise';
  if v_source.id is null or v_assistant.id is null
    or v_source.conversation_id <> v_assistant.conversation_id
    or v_source.request_id is null or v_source.request_id is distinct from v_assistant.request_id
    or v_assistant.sequence_number <> v_source.sequence_number + 1
    or new.source_action_id not like v_source.request_id::text || ':%' then
    raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_MESSAGE_BINDING_INVALID';
  end if;
  select p.* into v_pet from public.ask_conversations c
    join public.dog_profiles p on p.id = c.pet_profile_id and p.user_id = c.user_id
    where c.id = v_source.conversation_id and c.user_id = new.user_id
      and c.pet_profile_id = new.pet_profile_id;
  if v_pet.id is null then
    raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_OWNER_PET_BINDING_INVALID';
  end if;
  if new.action_kind in ('care_history.edit', 'care_history.remove') then
    select e.* into v_entry from public.pet_care_entries e
    where e.id = new.target_id and e.user_id = new.user_id
      and e.pet_profile_id = new.pet_profile_id and e.deleted_at is null;
    if v_entry.id is null then
      raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_TARGET_BINDING_INVALID';
    end if;
    -- Capture the exact Postgres value without crossing a timestamp parser.
    new.target_updated_at := case when new.action_kind = 'care_history.edit' then v_entry.updated_at else null end;
  end if;
  if new.action_kind in ('care_state.resolve', 'care_state.reopen') and not exists (
    select 1 from public.pet_concerns c
    where c.id = new.target_id and c.user_id = new.user_id and c.pet_profile_id = new.pet_profile_id
      and ((new.action_kind = 'care_state.resolve' and c.status in ('active','monitoring','reopened'))
        or (new.action_kind = 'care_state.reopen' and c.status = 'resolved'))
  ) then
    raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_TARGET_BINDING_INVALID';
  end if;
  if new.action_kind in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive') then
    new.lifecycle_status_at_mint := v_pet.lifecycle_status;
    new.lifecycle_changed_at_at_mint := v_pet.lifecycle_changed_at;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_ask_action_capability() from public, anon, authenticated, service_role;

create trigger ask_action_capabilities_validate_insert
before insert on public.ask_action_capabilities
for each row execute function private.validate_ask_action_capability();

create or replace function private.protect_ask_action_capability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.assistant_message_id is distinct from old.assistant_message_id
    or new.source_message_id is distinct from old.source_message_id
    or new.source_action_id is distinct from old.source_action_id
    or new.action_kind is distinct from old.action_kind
    or new.pet_profile_id is distinct from old.pet_profile_id
    or new.target_id is distinct from old.target_id
    or new.target_updated_at is distinct from old.target_updated_at
    or new.lifecycle_status_at_mint is distinct from old.lifecycle_status_at_mint
    or new.lifecycle_changed_at_at_mint is distinct from old.lifecycle_changed_at_at_mint
    or new.safety_class is distinct from old.safety_class
    or new.mutation_class is distinct from old.mutation_class
    or new.confirmation_policy is distinct from old.confirmation_policy
    or new.authorization_scope is distinct from old.authorization_scope
    or new.explicit_intent is distinct from old.explicit_intent
    or new.action_payload is distinct from old.action_payload
    or new.created_at is distinct from old.created_at
    or old.status <> 'pending'
    or new.status = 'pending' then
    raise exception using errcode = '55000', message = 'ACTION_CAPABILITY_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_ask_action_capability() from public, anon, authenticated, service_role;

create trigger ask_action_capabilities_protect_update
before update on public.ask_action_capabilities
for each row execute function private.protect_ask_action_capability();

-- This is the service-authorized equivalent of remove_my_care_entry(..., true).
-- It intentionally preserves that RPC's tombstone, episode, concern, and current-
-- state semantics while taking the already-verified owner as an explicit input.
create or replace function private.remove_ask_action_care_entry(p_user_id uuid, p_entry_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_entry public.pet_care_entries%rowtype;
  v_episode public.pet_care_episodes%rowtype;
  v_was_active boolean := false;
  v_remaining_active boolean;
  v_remaining_urgent boolean;
begin
  select * into v_entry from public.pet_care_entries
  where id = p_entry_id and user_id = p_user_id for update;
  if v_entry.id is null or v_entry.deleted_at is not null then return false; end if;

  update public.pet_care_entries set deleted_at = clock_timestamp(), deleted_by = p_user_id,
    deletion_reason = 'user_removed', updated_at = clock_timestamp()
  where id = v_entry.id;

  if v_entry.episode_id is not null then
    select * into v_episode from public.pet_care_episodes ep
    where ep.id = v_entry.episode_id and ep.user_id = p_user_id and ep.pet_profile_id = v_entry.pet_profile_id
    for update;
  end if;
  v_was_active := v_episode.status in ('active', 'monitoring');

  if v_was_active or v_episode.status = 'dismissed' then
    if v_was_active then
      update public.pet_care_episodes set status = 'dismissed', dismissed_at = clock_timestamp(),
        dismissal_reason = 'user_removed', resolved_at = null, updated_at = clock_timestamp(),
        summary = jsonb_set(coalesce(summary, '{}'::jsonb), '{latestStatus}', '"dismissed"'::jsonb, true)
      where id = v_episode.id;
    end if;
    update public.pet_concerns c set status = 'dismissed', dismissed_at = coalesce(c.dismissed_at, clock_timestamp()),
      dismissal_reason = 'user_removed', active_episode_id = null, resolved_at = null,
      resolution_note = null, updated_at = clock_timestamp()
    where c.user_id = p_user_id and c.pet_profile_id = v_entry.pet_profile_id
      and c.status in ('active', 'monitoring', 'reopened', 'dismissed')
      and (c.lifecycle_episode_id = v_episode.id or c.active_episode_id = v_episode.id
        or (c.id = v_entry.concern_id and c.identity_provenance = 'canonical_episode'));
  end if;

  select exists(select 1 from public.pet_care_episodes ep where ep.user_id = p_user_id
    and ep.pet_profile_id = v_entry.pet_profile_id and ep.status in ('active', 'monitoring')),
    exists(select 1 from public.pet_care_episodes ep where ep.user_id = p_user_id
      and ep.pet_profile_id = v_entry.pet_profile_id and ep.status = 'active'
      and (ep.episode_type = 'symptom' or ep.severity = 'urgent'))
  into v_remaining_active, v_remaining_urgent;

  if v_episode.id is not null and (v_was_active or v_episode.status = 'dismissed') then
    update public.pet_current_state pcs set
      active_episode_ids = array_remove(pcs.active_episode_ids, v_episode.id),
      monitoring_episode_ids = array_remove(pcs.monitoring_episode_ids, v_episode.id),
      state = jsonb_set(coalesce(pcs.state, '{}'::jsonb), '{wellbeing}', jsonb_build_object(
        'overall', case when v_remaining_urgent then 'urgent' when v_remaining_active then 'monitoring' else 'uncertain' end
      ), true),
      state_version = pcs.state_version + 1, computed_at = clock_timestamp(), updated_at = clock_timestamp()
    where pcs.pet_profile_id = v_entry.pet_profile_id and pcs.user_id = p_user_id;
  end if;
  return true;
end;
$$;
revoke all on function private.remove_ask_action_care_entry(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.execute_ask_action_capability(
  p_capability_id uuid,
  p_assistant_message_id uuid,
  p_user_id uuid,
  p_mode text,
  p_correction_source_message_id uuid
)
returns table(action jsonb, changed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v public.ask_action_capabilities%rowtype;
  v_action jsonb;
  v_now timestamptz := clock_timestamp();
  v_changed boolean := false;
  v_error text := null;
  v_result text := null;
  v_pet public.dog_profiles%rowtype;
  v_entry public.pet_care_entries%rowtype;
  v_concern public.pet_concerns%rowtype;
  v_category text;
  v_detail text;
  v_title text;
  v_row_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_mode not in ('confirm', 'cancel', 'auto') then
    raise exception using errcode = '22023', message = 'ACTION_CAPABILITY_MODE_INVALID';
  end if;
  if p_correction_source_message_id is not null and p_mode <> 'cancel' then
    raise exception using errcode = '22023', message = 'ACTION_CAPABILITY_CORRECTION_MODE_INVALID';
  end if;

  select * into v from public.ask_action_capabilities
  where id = p_capability_id and assistant_message_id=p_assistant_message_id and user_id=p_user_id
  for update;
  if v.id is null then return; end if;

  -- A correction is authoritative only when the service binds it to a later
  -- user message in the same conversation. Capability locking then gives the
  -- correction and confirmation a single deterministic terminal order.
  if p_correction_source_message_id is not null and (
    v.action_kind not in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive')
    or not exists (
      select 1 from public.ask_conversation_messages source_message
      join public.ask_conversation_messages correction_message
        on correction_message.conversation_id = source_message.conversation_id
        and correction_message.id = p_correction_source_message_id
        and correction_message.user_id = v.user_id
        and correction_message.role = 'user'
        and correction_message.sequence_number > source_message.sequence_number
      where source_message.id = v.source_message_id
        and source_message.user_id = v.user_id
        and source_message.role = 'user'
    )
  ) then
    raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_CORRECTION_MESSAGE_BINDING_INVALID';
  end if;

  -- Stable duplicate replay: terminal rows can never be reopened or re-executed.
  if v.status <> 'pending' then
    return query select v.receipt, false;
    return;
  end if;

  -- Foreign keys alone do not prove roles, ownership, common conversation, or
  -- that the conversation still belongs to the capability's exact pet.
  if not exists (
    select 1 from public.ask_conversation_messages source_message
    join public.ask_conversation_messages assistant_message
      on assistant_message.conversation_id = source_message.conversation_id
      and assistant_message.id = v.assistant_message_id
      and assistant_message.user_id = v.user_id and assistant_message.role = 'furvise'
    join public.ask_conversations conversation_row
      on conversation_row.id = source_message.conversation_id
      and conversation_row.user_id = v.user_id and conversation_row.pet_profile_id = v.pet_profile_id
    where source_message.id = v.source_message_id
      and source_message.user_id = v.user_id and source_message.role = 'user'
      and source_message.request_id is not null
      and source_message.request_id = assistant_message.request_id
      and assistant_message.sequence_number = source_message.sequence_number + 1
  ) then
    v_error := 'That action is no longer available.';
  end if;

  select * into v_pet from public.dog_profiles
  where id = v.pet_profile_id and user_id = v.user_id for update;
  if v_error is null and v_pet.id is null then
    v_error := 'This action is not available for that pet.';
  end if;

  if v_error is null and p_mode = 'cancel' then
    v_action := v.action_payload || jsonb_build_object(
      'id', v.id,
      'status', 'cancelled',
      'resultMessage', case when p_correction_source_message_id is null
        then 'The action was cancelled.'
        else 'The unconfirmed lifecycle report was cleared. The saved profile was not changed.' end,
      'errorMessage', null
    );
    update public.ask_action_capabilities set status='cancelled',receipt=v_action,terminal_at=v_now,updated_at=v_now
    where id=v.id;
    return query select v_action, false;
    return;
  end if;

  if v_error is null and p_mode = 'auto' and not (
    v.safety_class = 'LOW_RISK_REVERSIBLE'
    and v.confirmation_policy = 'explicit_intent'
    and v.confirmation_policy <> 'always'
    and v.explicit_intent
  ) then
    v_error := 'That action requires confirmation.';
  end if;

  if v_error is null and v.action_kind = 'care_history.add' then
    v_detail := nullif(btrim(v.action_payload#>>'{input,detail}'), '');
    v_title := nullif(btrim(v.action_payload#>>'{input,title}'), '');
    v_category := lower(regexp_replace(coalesce(v.action_payload#>>'{input,category}', ''), '[^a-z0-9]+', '_', 'g'));
    if v_detail is null then
      v_error := 'That care-history update is incomplete.';
    else
      insert into public.pet_care_entries(
        user_id, pet_profile_id, category, title, note, occurred_at,
        intelligence_source_message_id, intelligence_source_type, idempotency_key
      ) values (
        v.user_id, v.pet_profile_id,
        case when v_category in ('symptom','food','medication','activity','grooming','vet_visit','behavior','general') then v_category else 'general' end,
        left(coalesce(v_title, 'Care update'), 120), left(v_detail, 1000), v_now,
        v.source_message_id, 'ask_application_action', v.id
      ) on conflict do nothing;
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      if not v_changed and not exists (
        select 1 from public.pet_care_entries where user_id=v.user_id and pet_profile_id=v.pet_profile_id
          and idempotency_key=v.id
      ) then
        v_error := 'That update could not be added to care history.';
      else
        v_result := case when v_changed then 'The update was added to care history.' else 'That update was already in care history.' end;
      end if;
    end if;
  elsif v_error is null and v.action_kind in ('care_history.edit', 'care_history.remove') then
    select * into v_entry from public.pet_care_entries
    where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
      and deleted_at is null for update;
    if v_entry.id is null then
      v_error := 'The original history update is no longer available.';
    elsif v.action_kind = 'care_history.remove' then
      v_changed := private.remove_ask_action_care_entry(v.user_id, v.target_id);
      if v_changed then v_result := 'The history update was removed.';
      else v_error := 'The original history update is no longer available.';
      end if;
    else
      v_detail := nullif(btrim(v.action_payload#>>'{input,detail}'), '');
      v_title := nullif(btrim(v.action_payload#>>'{input,title}'), '');
      v_category := lower(regexp_replace(coalesce(v.action_payload#>>'{input,category}', ''), '[^a-z0-9]+', '_', 'g'));
      if v_entry.updated_at is distinct from v.target_updated_at then
        v_error := 'That history update changed after this action was prepared.';
      elsif v_detail is null then
        v_error := 'That care-history update is incomplete.';
      else
        update public.pet_care_entries set
          note=left(v_detail,1000),
          title=case when v_title is null then title else left(v_title,120) end,
          category=case when v_category in ('symptom','food','medication','activity','grooming','vet_visit','behavior','general') then v_category else category end,
          updated_at=v_now
        where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
          and deleted_at is null and updated_at = v.target_updated_at;
        get diagnostics v_row_count = row_count;
        v_changed := v_row_count > 0;
        if v_changed then v_result := 'The history update was edited.';
        else v_error := 'The original history update is no longer available.';
        end if;
      end if;
    end if;
  elsif v_error is null and v.action_kind in ('care_state.resolve', 'care_state.reopen') then
    select * into v_concern from public.pet_concerns
    where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
      and ((v.action_kind='care_state.resolve' and status in ('active','monitoring','reopened'))
        or (v.action_kind='care_state.reopen' and status='resolved'))
    for update;
    if v_concern.id is null then
      v_error := 'The original concern is no longer available.';
    elsif v.action_kind = 'care_state.resolve' then
      update public.pet_concerns set status='resolved',resolved_at=v_now,updated_at=v_now
      where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id
        and status in ('active','monitoring','reopened');
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      v_result := 'The concern was marked resolved.';
    else
      update public.pet_concerns set status='reopened',resolved_at=null,updated_at=v_now
      where id=v.target_id and user_id=v.user_id and pet_profile_id=v.pet_profile_id and status='resolved';
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      v_result := 'The concern was reopened.';
    end if;
  elsif v_error is null and v.action_kind in ('pet.mark_deceased','pet.mark_active','pet.archive') then
    if v_pet.lifecycle_status is distinct from v.lifecycle_status_at_mint
      or v_pet.lifecycle_changed_at is distinct from v.lifecycle_changed_at_at_mint then
      v_error := 'The pet profile lifecycle changed after this action was prepared.';
    elsif (v.action_kind='pet.mark_deceased' and v_pet.lifecycle_status <> 'active')
      or (v.action_kind='pet.mark_active' and v_pet.lifecycle_status not in ('deceased','archived'))
      or (v.action_kind='pet.archive' and v_pet.lifecycle_status not in ('active','deceased')) then
      v_error := 'The pet profile state changed before this action was confirmed.';
    else
      update public.dog_profiles set lifecycle_status=case v.action_kind
        when 'pet.mark_deceased' then 'deceased'
        when 'pet.mark_active' then 'active'
        else 'archived' end
      where id=v.pet_profile_id and user_id=v.user_id;
      get diagnostics v_row_count = row_count;
      v_changed := v_row_count > 0;
      if v.action_kind='pet.mark_deceased' then
        insert into public.pet_care_entries(
          user_id,pet_profile_id,category,title,note,severity,occurred_at,
          intelligence_source_message_id,intelligence_source_type,idempotency_key
        ) values (
          v.user_id,v.pet_profile_id,'general',left(coalesce(v_pet.name,'The pet') || ' died',120),
          left('Owner reported that ' || coalesce(v_pet.name,'the pet') || ' died. ' || (v.action_payload->>'evidence'),1000),
          'moderate',v_now,v.source_message_id,'ask_application_action',v.id
        ) on conflict do nothing;
        if not exists (
          select 1 from public.pet_care_entries where user_id=v.user_id and pet_profile_id=v.pet_profile_id
            and idempotency_key=v.id
        ) then
          raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_DEATH_HISTORY_REQUIRED';
        end if;
        v_result := 'The profile was marked as passed away. Its history was preserved.';
      elsif v.action_kind='pet.mark_active' then
        v_result := 'The pet profile was marked active.';
      else
        v_result := 'The pet profile was archived.';
      end if;
    end if;
  elsif v_error is null then
    -- Unsupported mutation kinds never fall back to response_data or application code.
    v_error := 'That action is not available yet.';
  end if;

  if v_error is null then
    v_action := v.action_payload || jsonb_build_object(
      'id',v.id,'status','succeeded','resultMessage',v_result,'errorMessage',null
    );
  else
    v_changed := false;
    v_action := v.action_payload || jsonb_build_object(
      'id',v.id,'status','failed','resultMessage',null,'errorMessage',v_error
    );
  end if;
  update public.ask_action_capabilities set
    status=case when v_action->>'status'='succeeded' then 'succeeded' else 'failed' end,
    receipt=v_action,terminal_at=v_now,updated_at=v_now
  where id=v.id;
  return query select v_action, v_changed;
end;
$$;

revoke all on function public.execute_ask_action_capability(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.execute_ask_action_capability(uuid, uuid, uuid, text, uuid)
  to service_role;
