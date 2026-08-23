-- Interactive Ask confirmations are intentionally short-lived. The database,
-- not an application or model payload, authors the exact 15-minute lifetime.
-- Make updated_at a complete row-generation signal for both target tables.
-- This closes sibling update paths that previously changed a concern without
-- touching its timestamp and makes same-transaction test/update ordering exact.
create or replace function public.pet_care_entries_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.pet_care_entries_touch_updated_at() from public, anon, authenticated, service_role;

create or replace function private.pet_concerns_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.pet_concerns_touch_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists pet_concerns_touch_updated_at on public.pet_concerns;
create trigger pet_concerns_touch_updated_at
before update on public.pet_concerns
for each row execute function private.pet_concerns_touch_updated_at();

alter table public.ask_action_capabilities
  add column expires_at timestamptz;

-- A pre-migration target capability has no trustworthy remove/concern version.
-- Terminalize those pending rows rather than blessing the current target state
-- as though it had been captured when the capability was originally minted.
-- The old immutability trigger permits this pending-to-terminal transition.
update public.ask_action_capabilities
set status = 'failed',
  receipt = action_payload || jsonb_build_object(
    'id', id,
    'status', 'failed',
    'resultMessage', null,
    'errorMessage', 'That action must be prepared again.'
  ),
  terminal_at = clock_timestamp(),
  updated_at = clock_timestamp()
where status = 'pending'
  and action_kind in ('care_history.remove', 'care_state.resolve', 'care_state.reopen');

-- The old guard rejects every in-place update that remains pending. Remove it
-- only for the migration backfill, then recreate the stronger guard below.
drop trigger ask_action_capabilities_protect_update on public.ask_action_capabilities;

update public.ask_action_capabilities
set expires_at = created_at + interval '15 minutes';

alter table public.ask_action_capabilities
  alter column expires_at set default (clock_timestamp() + interval '15 minutes'),
  alter column expires_at set not null;

alter table public.ask_action_capabilities
  add constraint ask_action_capabilities_expiry_check
  check (expires_at = created_at + interval '15 minutes');

alter table public.ask_action_capabilities
  drop constraint ask_action_capabilities_version_binding_check;

-- Terminal legacy rows cannot execute. Give them a non-null migration marker so
-- the stronger shape constraint can apply uniformly to every target row.
update public.ask_action_capabilities capability
set target_updated_at = coalesce(
  (select entry_row.updated_at from public.pet_care_entries entry_row
    where capability.action_kind in ('care_history.edit', 'care_history.remove')
      and entry_row.id = capability.target_id),
  (select concern_row.updated_at from public.pet_concerns concern_row
    where capability.action_kind in ('care_state.resolve', 'care_state.reopen')
      and concern_row.id = capability.target_id),
  capability.created_at
)
where capability.action_kind in ('care_history.edit', 'care_history.remove', 'care_state.resolve', 'care_state.reopen')
  and capability.target_updated_at is null;

alter table public.ask_action_capabilities
  add constraint ask_action_capabilities_version_binding_check check (
    (
      action_kind in ('care_history.edit', 'care_history.remove', 'care_state.resolve', 'care_state.reopen')
      and target_updated_at is not null
    ) or (
      action_kind not in ('care_history.edit', 'care_history.remove', 'care_state.resolve', 'care_state.reopen')
      and target_updated_at is null
    )
  );

create or replace function private.validate_ask_action_capability()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_source public.ask_conversation_messages%rowtype;
  v_assistant public.ask_conversation_messages%rowtype;
  v_pet public.dog_profiles%rowtype;
  v_entry public.pet_care_entries%rowtype;
  v_concern public.pet_concerns%rowtype;
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
    new.target_updated_at := v_entry.updated_at;
  elsif new.action_kind in ('care_state.resolve', 'care_state.reopen') then
    select c.* into v_concern from public.pet_concerns c
    where c.id = new.target_id and c.user_id = new.user_id and c.pet_profile_id = new.pet_profile_id
      and ((new.action_kind = 'care_state.resolve' and c.status in ('active','monitoring','reopened'))
        or (new.action_kind = 'care_state.reopen' and c.status = 'resolved'));
    if v_concern.id is null then
      raise exception using errcode = '23514', message = 'ACTION_CAPABILITY_TARGET_BINDING_INVALID';
    end if;
    new.target_updated_at := v_concern.updated_at;
  end if;
  if new.action_kind in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive') then
    new.lifecycle_status_at_mint := v_pet.lifecycle_status;
    new.lifecycle_changed_at_at_mint := v_pet.lifecycle_changed_at;
  end if;

  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.expires_at := new.created_at + interval '15 minutes';
  return new;
end;
$$;
revoke all on function private.validate_ask_action_capability() from public, anon, authenticated, service_role;

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
    or new.expires_at is distinct from old.expires_at
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

-- Keep the proven atomic mutation/receipt implementation intact, but remove it
-- from the API schema. The public wrapper below holds the same capability and
-- target locks while enforcing expiry and target generation first.
alter function public.execute_ask_action_capability(uuid, uuid, uuid, text, uuid)
  set schema private;
revoke all on function private.execute_ask_action_capability(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;

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
  v_now timestamptz;
  v_error text := null;
  v_entry public.pet_care_entries%rowtype;
  v_concern public.pet_concerns%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_mode not in ('confirm', 'cancel', 'auto') then
    raise exception using errcode = '22023', message = 'ACTION_CAPABILITY_MODE_INVALID';
  end if;

  select * into v from public.ask_action_capabilities
  where id = p_capability_id and assistant_message_id = p_assistant_message_id and user_id = p_user_id
  for update;
  if v.id is null then return; end if;

  -- Stable duplicate/concurrent replay returns the first terminal receipt and
  -- can never reach either the freshness checks or mutation implementation.
  if v.status <> 'pending' then
    return query select v.receipt, false;
    return;
  end if;

  v_now := clock_timestamp();
  if v_now >= v.expires_at then
    v_error := 'That action expired before it was confirmed.';
  end if;

  -- Cancellation does not touch application state. Confirm/auto execution
  -- locks the exact mint-time target and compares its generation under lock.
  if v_error is null and p_mode <> 'cancel' and v.action_kind in ('care_history.edit', 'care_history.remove') then
    select * into v_entry from public.pet_care_entries
    where id = v.target_id and user_id = v.user_id and pet_profile_id = v.pet_profile_id
      and deleted_at is null for update;
    v_now := clock_timestamp();
    if v_now >= v.expires_at then
      v_error := 'That action expired before it was confirmed.';
    elsif v_entry.id is null then
      v_error := 'The original history update is no longer available.';
    elsif v_entry.updated_at is distinct from v.target_updated_at then
      v_error := 'That history update changed after this action was prepared.';
    end if;
  elsif v_error is null and p_mode <> 'cancel' and v.action_kind in ('care_state.resolve', 'care_state.reopen') then
    select * into v_concern from public.pet_concerns
    where id = v.target_id and user_id = v.user_id and pet_profile_id = v.pet_profile_id
      for update;
    v_now := clock_timestamp();
    if v_now >= v.expires_at then
      v_error := 'That action expired before it was confirmed.';
    elsif v_concern.id is null then
      v_error := 'The original concern is no longer available.';
    elsif v_concern.updated_at is distinct from v.target_updated_at then
      v_error := 'That concern changed after this action was prepared.';
    end if;
  end if;

  if v_error is not null then
    v_action := v.action_payload || jsonb_build_object(
      'id', v.id, 'status', 'failed', 'resultMessage', null, 'errorMessage', v_error
    );
    update public.ask_action_capabilities set
      status = 'failed', receipt = v_action, terminal_at = v_now, updated_at = v_now
    where id = v.id;
    return query select v_action, false;
    return;
  end if;

  return query
  select execution.action, execution.changed
  from private.execute_ask_action_capability(
    p_capability_id,
    p_assistant_message_id,
    p_user_id,
    p_mode,
    p_correction_source_message_id
  ) execution;
end;
$$;

revoke all on function public.execute_ask_action_capability(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.execute_ask_action_capability(uuid, uuid, uuid, text, uuid)
  to service_role;
