-- Reconcile canonical persistence and immutable action receipts atomically.
create or replace function private.execute_ask_action_capability(
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
  v_same_turn_entries integer := 0;
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
    -- The canonical care writer runs before action execution. Reconcile only
    -- its exact owned source-turn effect, never an older similar observation.
    -- Existing source, ownership, cancellation and auto-authority checks above
    -- remain mandatory; the public wrapper still enforces expiry/freshness.
    if v.explicit_intent and v_detail is not null then
      for v_entry in
        select entry.* from public.pet_care_entries entry
        where entry.user_id = v.user_id and entry.pet_profile_id = v.pet_profile_id
          and entry.intelligence_source_message_id = v.source_message_id
          and entry.deleted_at is null
        for update
      loop
        v_same_turn_entries := v_same_turn_entries + 1;
      end loop;
      if v_same_turn_entries > 0 and (
        select count(*) from public.ask_action_capabilities sibling
        where sibling.user_id = v.user_id and sibling.pet_profile_id = v.pet_profile_id
          and sibling.source_message_id = v.source_message_id
          and sibling.action_kind = 'care_history.add'
      ) <> 1 then
        v_same_turn_entries := 2;
      end if;
    end if;
    if v_detail is null then
      v_error := 'That care-history update is incomplete.';
    elsif v_same_turn_entries > 1 then
      v_error := 'That save could not be matched to one care-history update.';
    elsif v_same_turn_entries = 1 then
      v_result := 'The update was added to care history.';
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

-- The public wrapper is the only entry point. No additional write authority.
revoke all on function private.execute_ask_action_capability(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
