-- A pending task carries USER sources and authority, never assistant prose.
create table private.ask_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ask_conversations(id) on delete cascade,
  source_message_id uuid not null references public.ask_conversation_messages(id) on delete cascade,
  authorization_message_id uuid not null references public.ask_conversation_messages(id) on delete cascade,
  last_message_id uuid not null references public.ask_conversation_messages(id) on delete cascade,
  last_sequence bigint not null,
  kind text not null default 'owner_note' check(kind='owner_note'),
  status text not null check(status in ('awaiting_subject','awaiting_answer','completed','cancelled','superseded')),
  requires_answer boolean not null default false,
  revision integer not null default 1 check(revision>0),
  pet_id uuid references public.dog_profiles(id) on delete cascade,
  entry_id uuid references public.pet_care_entries(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(conversation_id,source_message_id)
);
alter table private.ask_tasks enable row level security;
revoke all on private.ask_tasks from public,anon,authenticated;
create unique index ask_tasks_one_pending on private.ask_tasks(conversation_id) where status in ('awaiting_subject','awaiting_answer');

create function public.read_ask_task_context(p_user_id uuid,p_conversation_id uuid,p_message_ids uuid[] default array[]::uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_receipts jsonb;
begin
  perform private.require_service_role_request();
  if not exists(select 1 from public.ask_conversations where id=p_conversation_id and user_id=p_user_id) then
    raise exception using errcode='42501',message='ASK_TASK_NOT_OWNED';
  end if;
  select jsonb_build_object('id',t.id,'revision',t.revision,'kind',t.kind,'status',t.status,
    'authorizationMessageId',t.authorization_message_id,'requiresAnswer',t.requires_answer,'petId',t.pet_id,'entryId',t.entry_id,
    'petName',(select name from public.dog_profiles where id=t.pet_id and user_id=p_user_id),
    'request',jsonb_build_object('id',a.id,'role',a.role,'text',a.user_text,'createdAt',a.created_at),
    'source',jsonb_build_object('id',m.id,'role',m.role,'text',m.user_text,'createdAt',m.created_at)) into v_result
  from private.ask_tasks t join public.ask_conversation_messages m on m.id=t.source_message_id
    join public.ask_conversation_messages a on a.id=t.authorization_message_id and a.user_id=p_user_id and a.role='user'
  where t.conversation_id=p_conversation_id and t.user_id=p_user_id and t.status in ('awaiting_subject','awaiting_answer')
    and m.user_id=p_user_id and m.role='user';
  if coalesce(cardinality(p_message_ids),0)>64 then raise exception using errcode='22023',message='ASK_TASK_CONTEXT_LIMIT'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('messageId',m.id,'petId',e.pet_profile_id,
    'record',jsonb_build_object('id',e.id,'note',e.note,'occurredAt',e.occurred_at))), '[]'::jsonb) into v_receipts
  from private.ask_tasks t join public.pet_care_entries e on e.id=t.entry_id
    join public.ask_conversation_messages m on (m.id=any(p_message_ids) or t.status='awaiting_answer')
      and m.id in(t.source_message_id,t.authorization_message_id,t.last_message_id)
  where t.user_id=p_user_id and t.conversation_id=p_conversation_id and t.status in ('completed','awaiting_answer','cancelled')
    and m.user_id=p_user_id and m.conversation_id=p_conversation_id and m.role='user'
    and e.user_id=p_user_id and e.pet_profile_id=t.pet_id and e.deleted_at is null
    and exists(select 1 from public.dog_profiles p where p.id=e.pet_profile_id and p.user_id=p_user_id);
  return jsonb_build_object('pendingTask',v_result,'receipts',v_receipts);
end;
$$;

create function public.apply_ask_task(
  p_user_id uuid,p_conversation_id uuid,p_message_id uuid,p_intent text,
  p_source_id uuid,p_source_text text,p_pet_id uuid,p_task_id uuid,p_revision integer,
  p_occurred_at timestamptz default null,p_explicit_time text default null,p_requires_answer boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_task private.ask_tasks%rowtype; v_pending private.ask_tasks%rowtype;
  v_current public.ask_conversation_messages%rowtype; v_source public.ask_conversation_messages%rowtype;
  v_entry public.pet_care_entries%rowtype;
begin
  perform private.require_service_role_request();
  -- Conversation lock serializes creation, cancellation, resumption and replay.
  perform 1 from public.ask_conversations where id=p_conversation_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='42501',message='ASK_TASK_NOT_OWNED'; end if;
  select * into v_current from public.ask_conversation_messages
    where id=p_message_id and conversation_id=p_conversation_id and user_id=p_user_id and role='user' for update;
  select * into v_source from public.ask_conversation_messages
    where id=p_source_id and conversation_id=p_conversation_id and user_id=p_user_id and role='user' for share;
  if v_current.id is null or v_source.id is null or v_source.sequence_number>v_current.sequence_number
    or v_source.user_text is distinct from p_source_text or char_length(p_source_text) not between 1 and 1200
    or p_intent is null or p_intent not in ('save','resume','cancel')
    or char_length(coalesce(p_explicit_time,''))>120 then
    raise exception using errcode='42501',message='ASK_TASK_SOURCE_MISMATCH';
  end if;
  select * into v_task from private.ask_tasks where conversation_id=p_conversation_id and source_message_id=p_source_id for update;
  -- Exact transport replay does not re-execute or restore a later cancelled task.
  if v_task.last_message_id=p_message_id then
    if v_task.status in ('completed','awaiting_answer') then
      select * into v_entry from public.pet_care_entries where id=v_task.entry_id;
      if v_entry.id is null or v_entry.user_id is distinct from p_user_id or v_entry.deleted_at is not null
        or v_entry.note<>p_source_text or v_entry.pet_profile_id<>v_task.pet_id
        or not exists(select 1 from public.dog_profiles where id=v_task.pet_id and user_id=p_user_id) then
        raise exception using errcode='22023',message='ASK_TASK_SOURCE_CHANGED';
      end if;
    end if;
    return jsonb_build_object('id',v_task.id,'revision',v_task.revision,'status',v_task.status,'entryId',v_task.entry_id,'petId',v_task.pet_id);
  end if;
  -- Never execute a stale request after a newer owner turn or task transition.
  if exists(select 1 from public.ask_conversation_messages where conversation_id=p_conversation_id and role='user' and sequence_number>v_current.sequence_number)
    or v_task.last_sequence>=v_current.sequence_number then
    raise exception using errcode='40001',message='ASK_TASK_STALE_TURN';
  end if;
  select * into v_pending from private.ask_tasks where conversation_id=p_conversation_id and status in ('awaiting_subject','awaiting_answer') for update;
  if v_pending.id is distinct from p_task_id or v_pending.revision is distinct from p_revision then
    raise exception using errcode='40001',message='ASK_TASK_REVISION_CONFLICT';
  end if;
  if p_intent in ('resume','cancel') and (v_pending.id is null or v_pending.source_message_id<>p_source_id) then
    raise exception using errcode='22023',message='ASK_TASK_NOT_PENDING';
  end if;
  if p_intent='cancel' then
    update private.ask_tasks set status='cancelled',revision=revision+1,last_message_id=p_message_id,
      last_sequence=v_current.sequence_number,updated_at=now() where id=v_pending.id returning * into v_task;
  else
    if p_pet_id is not null then
      perform 1 from public.dog_profiles where id=p_pet_id and user_id=p_user_id and lifecycle_status<>'archived' for share;
      if not found then raise exception using errcode='42501',message='ASK_TASK_PET_NOT_OWNED'; end if;
    end if;
    if v_pending.id is not null and v_pending.source_message_id<>p_source_id then
      update private.ask_tasks set status='superseded',revision=revision+1,last_message_id=p_message_id,
        last_sequence=v_current.sequence_number,updated_at=now() where id=v_pending.id;
    end if;
    if p_pet_id is not null then
      select * into v_entry from public.pet_care_entries where user_id=p_user_id and intelligence_source_message_id=p_source_id for update;
      if v_entry.id is not null and (v_entry.deleted_at is not null or v_entry.note<>p_source_text or v_entry.pet_profile_id<>p_pet_id
        or v_entry.intelligence_source_type is distinct from 'owner_note') then
        raise exception using errcode='22023',message='ASK_TASK_SOURCE_CHANGED';
      end if;
      if v_entry.id is null then
        insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,
          intelligence_source_message_id,intelligence_request_id,intelligence_source_type,care_event_metadata)
        values(p_user_id,p_pet_id,'general','Owner note',p_source_text,coalesce(p_occurred_at,v_source.created_at),
          p_source_id,v_source.request_id,'owner_note',jsonb_build_object('authority','owner_report',
          'authorizationMessageId',case when p_intent='resume' then v_pending.authorization_message_id else p_message_id end,
          'sourceRecordedAt',v_source.created_at,'occurrenceBasis',case when p_occurred_at is null then 'recorded_at' else 'explicit' end,
          'explicitTime',p_explicit_time,'clinicalStatus','unconfirmed')) returning * into v_entry;
      end if;
    end if;
    insert into private.ask_tasks(user_id,conversation_id,source_message_id,authorization_message_id,last_message_id,last_sequence,status,pet_id,entry_id,requires_answer)
    values(p_user_id,p_conversation_id,p_source_id,case when p_intent='resume' then v_pending.authorization_message_id else p_message_id end,
      p_message_id,v_current.sequence_number,case when p_pet_id is null then 'awaiting_subject'
        when coalesce(p_requires_answer,false) or (p_intent='resume' and coalesce(v_pending.requires_answer,false)) then 'awaiting_answer' else 'completed' end,p_pet_id,v_entry.id,
      coalesce(p_requires_answer,false) or (p_intent='resume' and coalesce(v_pending.requires_answer,false)))
    on conflict(conversation_id,source_message_id) do update set
      authorization_message_id=excluded.authorization_message_id,last_message_id=excluded.last_message_id,
      last_sequence=excluded.last_sequence,status=excluded.status,requires_answer=excluded.requires_answer,pet_id=excluded.pet_id,entry_id=excluded.entry_id,
      revision=private.ask_tasks.revision+1,updated_at=now() returning * into v_task;
  end if;
  return jsonb_build_object('id',v_task.id,'revision',v_task.revision,'status',v_task.status,'entryId',v_task.entry_id,'petId',v_task.pet_id);
end;
$$;
revoke all on function public.read_ask_task_context(uuid,uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.apply_ask_task(uuid,uuid,uuid,text,uuid,text,uuid,uuid,integer,timestamptz,text,boolean) from public,anon,authenticated;
grant execute on function public.read_ask_task_context(uuid,uuid,uuid[]) to service_role;
grant execute on function public.apply_ask_task(uuid,uuid,uuid,text,uuid,text,uuid,uuid,integer,timestamptz,text,boolean) to service_role;


-- Complete the remaining answer in the SAME transaction that finalizes its
-- server-reviewed response. There is no crash gap or extra completion RPC.
create function private.complete_ask_task_from_answer()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.role<>'furvise' or new.response_data->'turn'->>'finalStage' is distinct from 'COMPLETED'
    or new.response_data->'turn'->>'taskOutcome' is distinct from 'complete'
    or new.response_data->'turn'->>'answerOutcome' is distinct from 'complete' then return new; end if;
  perform private.require_service_role_request();
  update private.ask_tasks t set status='completed',revision=t.revision+1,updated_at=now()
  from public.ask_conversation_messages u, public.pet_care_entries e, public.dog_profiles p
  where t.status='awaiting_answer' and t.last_message_id=u.id and u.role='user'
    and u.request_id=new.request_id and u.conversation_id=new.conversation_id and u.user_id=new.user_id
    and t.conversation_id=new.conversation_id and t.user_id=new.user_id
    and e.id=t.entry_id and e.user_id=t.user_id and e.deleted_at is null
    and p.id=t.pet_id and e.pet_profile_id=p.id and p.user_id=t.user_id;
  return new;
end;
$$;
revoke all on function private.complete_ask_task_from_answer() from public,anon,authenticated;
create trigger complete_ask_task_from_answer after insert or update of response_data
on public.ask_conversation_messages for each row execute function private.complete_ask_task_from_answer();
