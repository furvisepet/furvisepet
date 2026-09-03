begin;

-- Ask history remains directly readable through owner-bound RLS, but every
-- mutation must cross Furvise's authenticated API and this service-only
-- contract. Remove both table-wide and historical column-scoped write grants.
revoke all privileges on table public.ask_conversations from authenticated;
revoke all privileges on table public.ask_conversation_messages from authenticated;
revoke update (care_persistence, response_data)
  on table public.ask_conversation_messages from authenticated;
grant select on table public.ask_conversations to authenticated;
grant select on table public.ask_conversation_messages to authenticated;

drop policy if exists "ask_conversations_insert_own" on public.ask_conversations;
drop policy if exists "ask_conversations_update_own" on public.ask_conversations;
drop policy if exists "ask_conversations_delete_own" on public.ask_conversations;
drop policy if exists "ask_conversation_messages_insert_own" on public.ask_conversation_messages;
drop policy if exists "ask_conversation_messages_update_own_reconciliation" on public.ask_conversation_messages;
drop policy if exists "ask_conversation_messages_delete_own" on public.ask_conversation_messages;

alter table public.ask_conversations enable row level security;
alter table public.ask_conversations force row level security;
alter table public.ask_conversation_messages enable row level security;
alter table public.ask_conversation_messages force row level security;

-- Reserve two sequence positions per Ask turn. This lets the existing failed-
-- turn UX persist the user message before inference without allowing a second
-- concurrent turn to take its future Furvise response position.
alter table public.ask_conversations
  add column if not exists next_sequence_number integer;

with sequence_state as (
  select
    conversation_row.id,
    greatest(
      coalesce(max(message_row.sequence_number), 0) + 1,
      coalesce(max(message_row.sequence_number) filter (
        where message_row.role = 'user'
          and not exists (
            select 1
            from public.ask_conversation_messages as paired_message
            where paired_message.conversation_id = message_row.conversation_id
              and paired_message.user_id = message_row.user_id
              and paired_message.request_id = message_row.request_id
              and paired_message.role = 'furvise'
          )
      ), 0) + 2
    ) as next_sequence_number
  from public.ask_conversations as conversation_row
  left join public.ask_conversation_messages as message_row
    on message_row.conversation_id = conversation_row.id
  group by conversation_row.id
)
update public.ask_conversations as conversation_row
set next_sequence_number = sequence_state.next_sequence_number
from sequence_state
where conversation_row.id = sequence_state.id
  and conversation_row.next_sequence_number is null;

alter table public.ask_conversations
  alter column next_sequence_number set default 1,
  alter column next_sequence_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'ask_conversations_next_sequence_number_check'
      and conrelid = 'public.ask_conversations'::regclass
  ) then
    alter table public.ask_conversations
      add constraint ask_conversations_next_sequence_number_check
      check (next_sequence_number > 0);
  end if;
end;
$$;

create or replace function public.create_ask_conversation_exchange(
  p_user_id uuid,
  p_pet_id uuid,
  p_request_id uuid,
  p_title text,
  p_preview text,
  p_user_text text,
  p_response_data jsonb,
  p_save_metadata jsonb default null,
  p_context_used jsonb default null
)
returns table (
  conversation_id uuid,
  conversation_title text,
  conversation_preview text,
  conversation_status text,
  conversation_last_activity_at timestamptz,
  message_id uuid,
  message_request_id uuid,
  message_role text,
  message_user_text text,
  message_response_data jsonb,
  message_save_metadata jsonb,
  message_context_used jsonb,
  message_created_at timestamptz,
  message_sequence_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.ask_conversations%rowtype;
  v_message_count integer;
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_pet_id is null or p_request_id is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 80
    or p_preview is null or char_length(p_preview) > 220
    or p_user_text is null or char_length(p_user_text) not between 1 and 1200
    or p_response_data is null or pg_catalog.jsonb_typeof(p_response_data) <> 'object'
    or pg_catalog.octet_length(p_response_data::text) > 65536
    or pg_catalog.octet_length(coalesce(p_save_metadata::text, '')) > 16384
    or pg_catalog.octet_length(coalesce(p_context_used::text, '')) > 8192 then
    raise exception using errcode = '22023', message = 'ASK_CONVERSATION_CREATE_INVALID';
  end if;
  if not exists (select 1 from auth.users as user_row where user_row.id = p_user_id) then
    raise exception using errcode = '42501', message = 'ASK_USER_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.dog_profiles as pet_row
    where pet_row.id = p_pet_id and pet_row.user_id = p_user_id
      and pet_row.lifecycle_status <> 'archived'
  ) then
    raise exception using errcode = '42501', message = 'ASK_PET_NOT_OWNED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':ask-create:' || p_request_id::text, 0)
  );
  select conversation_row.* into v_conversation
  from public.ask_conversations as conversation_row
  where conversation_row.user_id = p_user_id
    and conversation_row.idempotency_key = p_request_id
  for update;

  if v_conversation.id is not null then
    if v_conversation.pet_profile_id <> p_pet_id
      or v_conversation.title <> p_title
      or v_conversation.preview <> p_preview then
      raise exception using errcode = '22023', message = 'ASK_IDEMPOTENCY_CONFLICT';
    end if;
    select count(*) into v_message_count
    from public.ask_conversation_messages as message_row
    where message_row.user_id = p_user_id
      and message_row.conversation_id = v_conversation.id
      and message_row.request_id = p_request_id;
    if v_message_count <> 2 or not exists (
      select 1 from public.ask_conversation_messages as message_row
      where message_row.conversation_id = v_conversation.id
        and message_row.user_id = p_user_id
        and message_row.request_id = p_request_id
        and message_row.role = 'user'
        and message_row.user_text = p_user_text
    ) or not exists (
      select 1 from public.ask_conversation_messages as message_row
      where message_row.conversation_id = v_conversation.id
        and message_row.user_id = p_user_id
        and message_row.request_id = p_request_id
        and message_row.role = 'furvise'
        and message_row.response_data = p_response_data
    ) then
      raise exception using errcode = '22023', message = 'ASK_IDEMPOTENCY_CONFLICT';
    end if;
  else
    insert into public.ask_conversations (
      user_id, pet_profile_id, title, preview, status, last_activity_at,
      idempotency_key, next_sequence_number
    ) values (
      p_user_id, p_pet_id, p_title, p_preview, 'active', pg_catalog.clock_timestamp(),
      p_request_id, 3
    ) returning * into v_conversation;

    insert into public.ask_conversation_messages (
      conversation_id, user_id, request_id, role, sequence_number, user_text
    ) values (
      v_conversation.id, p_user_id, p_request_id, 'user', 1, p_user_text
    );
    insert into public.ask_conversation_messages (
      conversation_id, user_id, request_id, role, sequence_number,
      response_data, save_metadata, context_used
    ) values (
      v_conversation.id, p_user_id, p_request_id, 'furvise', 2,
      p_response_data, p_save_metadata, p_context_used
    );
  end if;

  return query
  select
    v_conversation.id, v_conversation.title, v_conversation.preview,
    v_conversation.status, v_conversation.last_activity_at,
    message_row.id, message_row.request_id, message_row.role,
    message_row.user_text, message_row.response_data,
    message_row.save_metadata, message_row.context_used, message_row.created_at,
    message_row.sequence_number
  from public.ask_conversation_messages as message_row
  where message_row.conversation_id = v_conversation.id
    and message_row.user_id = p_user_id
    and message_row.request_id = p_request_id
  order by message_row.sequence_number;
end;
$$;

create or replace function public.append_ask_conversation_exchange(
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_id uuid,
  p_preview text,
  p_user_text text,
  p_response_data jsonb,
  p_save_metadata jsonb default null,
  p_context_used jsonb default null
)
returns table (
  message_id uuid,
  message_request_id uuid,
  message_role text,
  message_user_text text,
  message_response_data jsonb,
  message_save_metadata jsonb,
  message_context_used jsonb,
  message_created_at timestamptz,
  message_sequence_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.ask_conversations%rowtype;
  v_existing_count integer;
  v_sequence integer;
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_conversation_id is null or p_request_id is null
    or p_preview is null or char_length(p_preview) > 220
    or p_user_text is null or char_length(p_user_text) not between 1 and 1200
    or p_response_data is null or pg_catalog.jsonb_typeof(p_response_data) <> 'object'
    or pg_catalog.octet_length(p_response_data::text) > 65536
    or pg_catalog.octet_length(coalesce(p_save_metadata::text, '')) > 16384
    or pg_catalog.octet_length(coalesce(p_context_used::text, '')) > 8192 then
    raise exception using errcode = '22023', message = 'ASK_EXCHANGE_INVALID';
  end if;
  if not exists (select 1 from auth.users as user_row where user_row.id = p_user_id) then
    raise exception using errcode = '42501', message = 'ASK_USER_NOT_FOUND';
  end if;
  select conversation_row.* into v_conversation
  from public.ask_conversations as conversation_row
  join public.dog_profiles as pet_row
    on pet_row.id = conversation_row.pet_profile_id
    and pet_row.user_id = conversation_row.user_id
    and pet_row.lifecycle_status <> 'archived'
  where conversation_row.id = p_conversation_id
    and conversation_row.user_id = p_user_id
  for update of conversation_row;
  if v_conversation.id is null then
    raise exception using errcode = '42501', message = 'ASK_CONVERSATION_NOT_OWNED';
  end if;

  select count(*) into v_existing_count
  from public.ask_conversation_messages as message_row
  where message_row.user_id = p_user_id and message_row.request_id = p_request_id;
  if v_existing_count > 0 then
    if v_existing_count <> 2 or not exists (
      select 1 from public.ask_conversation_messages as message_row
      where message_row.user_id = p_user_id
        and message_row.conversation_id = p_conversation_id
        and message_row.request_id = p_request_id
        and message_row.role = 'user' and message_row.user_text = p_user_text
    ) or not exists (
      select 1 from public.ask_conversation_messages as message_row
      where message_row.user_id = p_user_id
        and message_row.conversation_id = p_conversation_id
        and message_row.request_id = p_request_id
        and message_row.role = 'furvise' and message_row.response_data = p_response_data
    ) then
      raise exception using errcode = '22023', message = 'ASK_IDEMPOTENCY_CONFLICT';
    end if;
  else
    v_sequence := v_conversation.next_sequence_number;
    update public.ask_conversations as conversation_row
    set next_sequence_number = v_sequence + 2,
        preview = p_preview,
        last_activity_at = pg_catalog.clock_timestamp()
    where conversation_row.id = p_conversation_id
      and conversation_row.user_id = p_user_id;
    insert into public.ask_conversation_messages (
      conversation_id, user_id, request_id, role, sequence_number, user_text
    ) values (
      p_conversation_id, p_user_id, p_request_id, 'user', v_sequence, p_user_text
    );
    insert into public.ask_conversation_messages (
      conversation_id, user_id, request_id, role, sequence_number,
      response_data, save_metadata, context_used
    ) values (
      p_conversation_id, p_user_id, p_request_id, 'furvise', v_sequence + 1,
      p_response_data, p_save_metadata, p_context_used
    );
  end if;

  return query
  select
    message_row.id, message_row.request_id, message_row.role,
    message_row.user_text, message_row.response_data,
    message_row.save_metadata, message_row.context_used,
    message_row.created_at, message_row.sequence_number
  from public.ask_conversation_messages as message_row
  where message_row.user_id = p_user_id
    and message_row.conversation_id = p_conversation_id
    and message_row.request_id = p_request_id
  order by message_row.sequence_number;
end;
$$;

create or replace function public.begin_ask_conversation_turn(
  p_user_id uuid,
  p_pet_id uuid,
  p_conversation_id uuid,
  p_request_id uuid,
  p_title text,
  p_preview text,
  p_user_text text
)
returns table (
  conversation_id uuid,
  user_message_id uuid,
  user_sequence_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.ask_conversations%rowtype;
  v_existing public.ask_conversation_messages%rowtype;
  v_sequence integer;
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_pet_id is null or p_request_id is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 80
    or p_preview is null or char_length(p_preview) > 220
    or p_user_text is null or char_length(p_user_text) not between 1 and 1200 then
    raise exception using errcode = '22023', message = 'ASK_TURN_INVALID';
  end if;
  if not exists (select 1 from auth.users as user_row where user_row.id = p_user_id) then
    raise exception using errcode = '42501', message = 'ASK_USER_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.dog_profiles as pet_row
    where pet_row.id = p_pet_id and pet_row.user_id = p_user_id
      and pet_row.lifecycle_status <> 'archived'
  ) then
    raise exception using errcode = '42501', message = 'ASK_PET_NOT_OWNED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':ask-turn:' || p_request_id::text, 0)
  );
  select message_row.* into v_existing
  from public.ask_conversation_messages as message_row
  where message_row.user_id = p_user_id
    and message_row.request_id = p_request_id
    and message_row.role = 'user'
  for update;
  if v_existing.id is not null then
    select conversation_row.* into v_conversation
    from public.ask_conversations as conversation_row
    where conversation_row.id = v_existing.conversation_id
      and conversation_row.user_id = p_user_id
      and conversation_row.pet_profile_id = p_pet_id
    for update;
    if v_conversation.id is null or v_existing.user_text <> p_user_text
      or (p_conversation_id is not null and p_conversation_id <> v_existing.conversation_id) then
      raise exception using errcode = '22023', message = 'ASK_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_conversation.id, v_existing.id, v_existing.sequence_number;
    return;
  end if;
  if exists (
    select 1 from public.ask_conversation_messages as message_row
    where message_row.user_id = p_user_id
      and message_row.request_id = p_request_id
  ) then
    raise exception using errcode = '22023', message = 'ASK_IDEMPOTENCY_CONFLICT';
  end if;

  if p_conversation_id is not null then
    select conversation_row.* into v_conversation
    from public.ask_conversations as conversation_row
    join public.dog_profiles as pet_row
      on pet_row.id = conversation_row.pet_profile_id
      and pet_row.user_id = conversation_row.user_id
      and pet_row.lifecycle_status <> 'archived'
    where conversation_row.id = p_conversation_id
      and conversation_row.user_id = p_user_id
      and conversation_row.pet_profile_id = p_pet_id
    for update of conversation_row;
    if v_conversation.id is null then
      raise exception using errcode = '42501', message = 'ASK_CONVERSATION_NOT_OWNED';
    end if;
    v_sequence := v_conversation.next_sequence_number;
    update public.ask_conversations as conversation_row
    set next_sequence_number = v_sequence + 2
    where conversation_row.id = v_conversation.id;
  else
    insert into public.ask_conversations (
      user_id, pet_profile_id, title, preview, status, last_activity_at,
      next_sequence_number
    ) values (
      p_user_id, p_pet_id, p_title, p_preview, 'active', pg_catalog.clock_timestamp(), 3
    ) returning * into v_conversation;
    v_sequence := 1;
  end if;

  insert into public.ask_conversation_messages (
    conversation_id, user_id, request_id, role, sequence_number, user_text
  ) values (
    v_conversation.id, p_user_id, p_request_id, 'user', v_sequence, p_user_text
  ) returning * into v_existing;
  return query select v_conversation.id, v_existing.id, v_existing.sequence_number;
end;
$$;

create or replace function public.complete_ask_conversation_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_user_message_id uuid,
  p_request_id uuid,
  p_preview text,
  p_response_data jsonb,
  p_save_metadata jsonb default null,
  p_context_used jsonb default null,
  p_intelligence_validation jsonb default null,
  p_persistence_governance jsonb default null
)
returns table (assistant_message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.ask_conversations%rowtype;
  v_user_message public.ask_conversation_messages%rowtype;
  v_assistant_message public.ask_conversation_messages%rowtype;
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_conversation_id is null or p_user_message_id is null
    or p_request_id is null or p_preview is null or char_length(p_preview) > 220
    or p_response_data is null or pg_catalog.jsonb_typeof(p_response_data) <> 'object'
    or pg_catalog.octet_length(p_response_data::text) > 65536
    or pg_catalog.octet_length(coalesce(p_save_metadata::text, '')) > 16384
    or pg_catalog.octet_length(coalesce(p_context_used::text, '')) > 8192
    or pg_catalog.octet_length(coalesce(p_intelligence_validation::text, '')) > 65536
    or pg_catalog.octet_length(coalesce(p_persistence_governance::text, '')) > 65536 then
    raise exception using errcode = '22023', message = 'ASK_TURN_COMPLETION_INVALID';
  end if;
  select conversation_row.* into v_conversation
  from public.ask_conversations as conversation_row
  join public.dog_profiles as pet_row
    on pet_row.id = conversation_row.pet_profile_id
    and pet_row.user_id = conversation_row.user_id
    and pet_row.lifecycle_status <> 'archived'
  where conversation_row.id = p_conversation_id
    and conversation_row.user_id = p_user_id
  for update of conversation_row;
  if v_conversation.id is null then
    raise exception using errcode = '42501', message = 'ASK_CONVERSATION_NOT_OWNED';
  end if;
  select message_row.* into v_user_message
  from public.ask_conversation_messages as message_row
  where message_row.id = p_user_message_id
    and message_row.conversation_id = p_conversation_id
    and message_row.user_id = p_user_id
    and message_row.request_id = p_request_id
    and message_row.role = 'user'
  for update;
  if v_user_message.id is null then
    raise exception using errcode = '42501', message = 'ASK_USER_MESSAGE_NOT_OWNED';
  end if;
  select message_row.* into v_assistant_message
  from public.ask_conversation_messages as message_row
  where message_row.user_id = p_user_id
    and message_row.request_id = p_request_id
    and message_row.role = 'furvise'
  for update;
  if v_assistant_message.id is not null then
    if v_assistant_message.conversation_id <> p_conversation_id then
      raise exception using errcode = '22023', message = 'ASK_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_assistant_message.id;
    return;
  end if;
  insert into public.ask_conversation_messages (
    conversation_id, user_id, request_id, role, sequence_number,
    response_data, save_metadata, context_used,
    intelligence_validation, persistence_governance
  ) values (
    p_conversation_id, p_user_id, p_request_id, 'furvise',
    v_user_message.sequence_number + 1, p_response_data, p_save_metadata,
    p_context_used, p_intelligence_validation, p_persistence_governance
  ) returning * into v_assistant_message;
  update public.ask_conversations as conversation_row
  set preview = p_preview,
      last_activity_at = pg_catalog.clock_timestamp()
  where conversation_row.id = p_conversation_id
    and conversation_row.user_id = p_user_id;
  return query select v_assistant_message.id;
end;
$$;

create or replace function public.update_ask_assistant_response(
  p_user_id uuid,
  p_message_id uuid,
  p_response_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_message_id is null or p_response_data is null
    or pg_catalog.jsonb_typeof(p_response_data) <> 'object'
    or pg_catalog.octet_length(p_response_data::text) > 65536 then
    raise exception using errcode = '22023', message = 'ASK_RESPONSE_UPDATE_INVALID';
  end if;
  update public.ask_conversation_messages as message_row
  set response_data = p_response_data
  where message_row.id = p_message_id
    and message_row.user_id = p_user_id
    and message_row.role = 'furvise'
    and exists (
      select 1 from public.ask_conversations as conversation_row
      join public.dog_profiles as pet_row
        on pet_row.id = conversation_row.pet_profile_id
        and pet_row.user_id = conversation_row.user_id
      where conversation_row.id = message_row.conversation_id
        and conversation_row.user_id = p_user_id
    );
  return found;
end;
$$;

create or replace function public.finalize_ask_assistant_response(
  p_user_id uuid,
  p_message_id uuid,
  p_response_data jsonb,
  p_care_persistence jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_message_id is null or p_response_data is null
    or pg_catalog.jsonb_typeof(p_response_data) <> 'object'
    or pg_catalog.octet_length(p_response_data::text) > 65536
    or pg_catalog.octet_length(coalesce(p_care_persistence::text, '')) > 65536 then
    raise exception using errcode = '22023', message = 'ASK_RESPONSE_FINALIZE_INVALID';
  end if;
  update public.ask_conversation_messages as message_row
  set response_data = p_response_data,
      care_persistence = p_care_persistence
  where message_row.id = p_message_id
    and message_row.user_id = p_user_id
    and message_row.role = 'furvise'
    and exists (
      select 1 from public.ask_conversations as conversation_row
      join public.dog_profiles as pet_row
        on pet_row.id = conversation_row.pet_profile_id
        and pet_row.user_id = conversation_row.user_id
      where conversation_row.id = message_row.conversation_id
        and conversation_row.user_id = p_user_id
    );
  return found;
end;
$$;

create or replace function public.rename_ask_conversation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_title text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_conversation_id is null or p_title is null
    or char_length(btrim(p_title)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'ASK_RENAME_INVALID';
  end if;
  update public.ask_conversations as conversation_row
  set title = p_title
  where conversation_row.id = p_conversation_id
    and conversation_row.user_id = p_user_id
    and exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = conversation_row.pet_profile_id
        and pet_row.user_id = p_user_id
    );
  return found;
end;
$$;

create or replace function public.delete_ask_conversation(
  p_user_id uuid,
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_conversation_id is null then
    raise exception using errcode = '22023', message = 'ASK_DELETE_INVALID';
  end if;
  delete from public.ask_conversations as conversation_row
  where conversation_row.id = p_conversation_id
    and conversation_row.user_id = p_user_id
    and exists (
      select 1 from public.dog_profiles as pet_row
      where pet_row.id = conversation_row.pet_profile_id
        and pet_row.user_id = p_user_id
    );
  return found;
end;
$$;

revoke all on function public.create_ask_conversation_exchange(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.append_ask_conversation_exchange(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_ask_conversation_turn(uuid,uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_ask_conversation_turn(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.update_ask_assistant_response(uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_ask_assistant_response(uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.rename_ask_conversation(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_ask_conversation(uuid,uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.create_ask_conversation_exchange(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.append_ask_conversation_exchange(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.begin_ask_conversation_turn(uuid,uuid,uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.complete_ask_conversation_turn(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.update_ask_assistant_response(uuid,uuid,jsonb)
  to service_role;
grant execute on function public.finalize_ask_assistant_response(uuid,uuid,jsonb,jsonb)
  to service_role;
grant execute on function public.rename_ask_conversation(uuid,uuid,text)
  to service_role;
grant execute on function public.delete_ask_conversation(uuid,uuid)
  to service_role;

comment on function public.create_ask_conversation_exchange(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb) is
  'Service-only atomic Ask conversation creation. Validates the authenticated owner and writable message contract.';
comment on function public.append_ask_conversation_exchange(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb) is
  'Service-only atomic two-message Ask append with row-locked sequence reservation and request replay safety.';
comment on function public.begin_ask_conversation_turn(uuid,uuid,uuid,uuid,text,text,text) is
  'Service-only reservation of one canonical user turn for the existing recoverable failed-turn Ask flow.';
comment on function public.complete_ask_conversation_turn(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb) is
  'Service-only completion of a reserved Ask turn with exactly one Furvise response.';
comment on function public.rename_ask_conversation(uuid,uuid,text) is
  'Service-only owner-scoped Ask title mutation.';
comment on function public.delete_ask_conversation(uuid,uuid) is
  'Service-only owner-scoped Ask deletion; declared foreign-key cascades remain authoritative.';

-- Extend the launch readiness contract so privilege or RPC drift fails closed.
alter function public.furvise_security_compatibility_snapshot_v2(text[])
  set schema private;
alter function private.furvise_security_compatibility_snapshot_v2(text[])
  rename to furvise_security_compatibility_snapshot_v2_pre_ask_authority;
revoke all on function private.furvise_security_compatibility_snapshot_v2_pre_ask_authority(text[])
  from public, anon, authenticated, service_role;

create function public.furvise_security_compatibility_snapshot_v2(
  p_required_migration_names text[]
)
returns table(contract_version integer, failed_checks text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failures text[] := '{}'::text[];
  v_prior_failures text[] := '{}'::text[];
  v_relation oid;
  v_function oid;
  v_signature text;
  v_definition text;
  v_authority_ok boolean := true;
  v_signatures text[] := array[
    'public.create_ask_conversation_exchange(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb)',
    'public.append_ask_conversation_exchange(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)',
    'public.begin_ask_conversation_turn(uuid,uuid,uuid,uuid,text,text,text)',
    'public.complete_ask_conversation_turn(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'public.update_ask_assistant_response(uuid,uuid,jsonb)',
    'public.finalize_ask_assistant_response(uuid,uuid,jsonb,jsonb)',
    'public.rename_ask_conversation(uuid,uuid,text)',
    'public.delete_ask_conversation(uuid,uuid)'
  ]::text[];
begin
  perform private.require_service_role_request();
  select snapshot.failed_checks into v_prior_failures
  from private.furvise_security_compatibility_snapshot_v2_pre_ask_authority(
    p_required_migration_names
  ) snapshot;
  v_failures := coalesce(v_prior_failures, '{}'::text[]);

  foreach v_relation in array array[
    'public.ask_conversations'::regclass::oid,
    'public.ask_conversation_messages'::regclass::oid
  ] loop
    v_authority_ok := v_authority_ok
      and (select class.relrowsecurity and class.relforcerowsecurity from pg_catalog.pg_class as class where class.oid = v_relation)
      and pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'TRUNCATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'TRIGGER')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'REFERENCES')
      and not exists (
        select 1
        from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = v_relation
          and attribute.attnum > 0 and not attribute.attisdropped
          and (
            pg_catalog.has_column_privilege('authenticated', v_relation, attribute.attnum, 'INSERT')
            or pg_catalog.has_column_privilege('authenticated', v_relation, attribute.attnum, 'UPDATE')
            or pg_catalog.has_column_privilege('authenticated', v_relation, attribute.attnum, 'REFERENCES')
          )
      );
  end loop;

  v_authority_ok := v_authority_ok
    and exists (
      select 1 from pg_catalog.pg_policy as policy
      where policy.polrelid = 'public.ask_conversations'::regclass
        and policy.polname = 'ask_conversations_select_own' and policy.polcmd = 'r'
    )
    and exists (
      select 1 from pg_catalog.pg_policy as policy
      where policy.polrelid = 'public.ask_conversation_messages'::regclass
        and policy.polname = 'ask_conversation_messages_select_own' and policy.polcmd = 'r'
    )
    and not exists (
      select 1 from pg_catalog.pg_policy as policy
      where policy.polrelid in (
        'public.ask_conversations'::regclass,
        'public.ask_conversation_messages'::regclass
      ) and policy.polcmd in ('a', 'w', 'd')
    );

  foreach v_signature in array v_signatures loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_authority_ok := v_authority_ok and v_function is not null;
    if v_function is not null then
      select pg_catalog.pg_get_functiondef(v_function) into v_definition;
      v_authority_ok := v_authority_ok
        and (select proc.prosecdef from pg_catalog.pg_proc as proc where proc.oid = v_function)
        and coalesce((
          select proc.proconfig @> array['search_path=""']::text[]
          from pg_catalog.pg_proc as proc where proc.oid = v_function
        ), false)
        and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
        and v_definition ~* 'private[.]require_service_role_request';
    end if;
  end loop;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = any(array[
        'create_ask_conversation_exchange', 'append_ask_conversation_exchange',
        'begin_ask_conversation_turn', 'complete_ask_conversation_turn',
        'update_ask_assistant_response', 'finalize_ask_assistant_response',
        'rename_ask_conversation', 'delete_ask_conversation'
      ]::name[])
  ) <> 8 then
    v_authority_ok := false;
  end if;

  if not v_authority_ok then
    v_failures := pg_catalog.array_append(v_failures, 'ask_conversation_mutation_authority');
  end if;
  return query
  select 2, array(
    select distinct failure
    from pg_catalog.unnest(v_failures) as failure
    order by failure
  );
end;
$$;

revoke all on function public.furvise_security_compatibility_snapshot_v2(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.furvise_security_compatibility_snapshot_v2(text[])
  to service_role;

comment on function public.furvise_security_compatibility_snapshot_v2(text[]) is
  'Service-only V2 readiness contract including the Ask conversation direct-write boundary.';

notify pgrst, 'reload schema';
commit;
