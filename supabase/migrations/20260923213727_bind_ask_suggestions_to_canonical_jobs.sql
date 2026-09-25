-- A suggestion transports an immutable canonical capability; it is never a planner.
alter table public.ai_update_suggestions
  add column canonical_capability_id uuid references public.ask_action_capabilities(id) on delete cascade,
  add column canonical_payload jsonb,
  add column invalidated_at timestamptz,
  add constraint canonical_suggestion_pair check (
    (canonical_capability_id is null) = (canonical_payload is null));
create unique index ai_update_suggestions_canonical_capability_unique
  on public.ai_update_suggestions(canonical_capability_id) where canonical_capability_id is not null;
-- Legacy uniqueness remains unchanged for legacy rows. Canonical identity is the capability.
drop index public.ai_update_suggestions_pending_effect_unique;
create unique index ai_update_suggestions_pending_effect_unique on public.ai_update_suggestions
  (user_id,source_message_id,type,coalesce(concern_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where status='pending' and source_message_id is not null and canonical_payload is null;
drop index public.ai_update_suggestions_pending_concern_unique;
create unique index ai_update_suggestions_pending_concern_unique on public.ai_update_suggestions(user_id,type,concern_id)
  where status='pending' and concern_id is not null and canonical_payload is null;

create function private.ask_suggestion_payload(c public.ask_action_capabilities)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare k text; j jsonb; n integer;
begin
  select count(*) into n from unnest(array['appendJob','replaceJob','stateTransitionJob','fieldMutationJob']) f
    where c.action_payload->f is not null and c.action_payload->f <> 'null'::jsonb;
  if n<>1 then return null; end if;
  if c.action_kind='care_history.add' then k:='append';j:=c.action_payload->'appendJob';
  elsif c.action_kind='care_history.edit' then k:='replace';j:=c.action_payload->'replaceJob';
  elsif c.action_kind in ('care_state.resolve','care_state.reopen') then k:='state_transition';j:=c.action_payload->'stateTransitionJob';
  elsif c.action_kind in ('memory.set_preference','memory.forget_preference')
    and c.action_payload#>>'{fieldMutationJob,domain}'='owner_preference'
    then k:='owner_preference';j:=c.action_payload->'fieldMutationJob';
  else return null; end if;
  if jsonb_typeof(j) is distinct from 'object' or j->>'sourceMessageId' is distinct from c.source_message_id::text
    or (k<>'owner_preference' and j->>'petId' is distinct from c.pet_profile_id::text)
    or (k in ('owner_preference','state_transition') and j->>'ownerId' is distinct from c.user_id::text)
    then return null; end if;
  return jsonb_build_object('version',1,'kind',k,'job',j,'capabilityId',c.id,
    'sourceMessageId',c.source_message_id,'targetId',c.target_id,'targetUpdatedAt',c.target_updated_at);
end $$;
revoke all on function private.ask_suggestion_payload(public.ask_action_capabilities) from public,anon,authenticated,service_role;

create function private.ask_suggestion_receipt_succeeded(c public.ask_action_capabilities)
returns boolean language sql stable security invoker set search_path='' as $$
  select c.status='succeeded' and c.terminal_at is not null and c.receipt->>'id'=c.id::text
    and c.receipt->>'status'='succeeded'
    and c.receipt-array['id','status','resultMessage','errorMessage']
      =c.action_payload-array['id','status','resultMessage','errorMessage'];
$$;
revoke all on function private.ask_suggestion_receipt_succeeded(public.ask_action_capabilities) from public,anon,authenticated,service_role;

create function private.protect_canonical_suggestion()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare c public.ask_action_capabilities%rowtype; conversation uuid; source_unlinked boolean:=false; concern_unlinked boolean:=false;
begin
  if tg_op='UPDATE' and (new.canonical_payload is distinct from old.canonical_payload
    or new.canonical_capability_id is distinct from old.canonical_capability_id) then
    raise exception using errcode='23514',message='CANONICAL_SUGGESTION_IMMUTABLE';
  end if;
  if new.canonical_payload is null then return new; end if;
  if current_user <> pg_get_userbyid((select relowner from pg_class where oid=tg_relid)) then
    raise exception using errcode='42501',message='CANONICAL_SUGGESTION_SERVER_REQUIRED';
  end if;
  -- Foreign-key cleanup may unlink a deleted display reference, never rebind a job.
  if tg_op='UPDATE' then
    source_unlinked:=new.source_message_id is null and old.source_message_id is not null
      and not exists(select 1 from public.ask_conversation_messages where id=old.source_message_id);
    concern_unlinked:=new.concern_id is null and old.concern_id is not null
      and not exists(select 1 from public.pet_concerns where id=old.concern_id);
  end if;
  select * into c from public.ask_action_capabilities where id=new.canonical_capability_id;
  select conversation_id into conversation from public.ask_conversation_messages where id=c.assistant_message_id;
  if c.id is null or private.ask_suggestion_payload(c) is null
    or new.canonical_payload is distinct from private.ask_suggestion_payload(c)
    or new.user_id is distinct from c.user_id or new.pet_profile_id is distinct from c.pet_profile_id
    or (new.source_message_id is distinct from c.assistant_message_id and not source_unlinked) or new.conversation_id is distinct from conversation
    then raise exception using errcode='23514',message='CANONICAL_SUGGESTION_BINDING'; end if;
  if tg_op='UPDATE' and (new.user_id is distinct from old.user_id
    or new.pet_profile_id is distinct from old.pet_profile_id or (new.source_message_id is distinct from old.source_message_id and not source_unlinked)
    or new.conversation_id is distinct from old.conversation_id or new.type is distinct from old.type
    or (new.concern_id is distinct from old.concern_id and not concern_unlinked)
    or (old.invalidated_at is not null and new.invalidated_at is distinct from old.invalidated_at)) then
    raise exception using errcode='23514',message='CANONICAL_SUGGESTION_IMMUTABLE';
  end if;
  if new.invalidated_at is not null and c.status not in ('cancelled','failed') then
    raise exception using errcode='23514',message='CANONICAL_SUGGESTION_INVALIDATION_REQUIRED'; end if;
  if tg_op='UPDATE' and (new.details is distinct from old.details or new.title is distinct from old.title
    or new.payload is distinct from old.payload) and new.invalidated_at is null then
    raise exception using errcode='23514',message='CANONICAL_SUGGESTION_INVALIDATION_REQUIRED'; end if;
  if new.status='saved' and (new.invalidated_at is not null
    or private.ask_suggestion_receipt_succeeded(c) is not true) then
    raise exception using errcode='23514',message='CANONICAL_SUGGESTION_RECEIPT_REQUIRED'; end if;
  return new;
end $$;
revoke all on function private.protect_canonical_suggestion() from public,anon,authenticated,service_role;
create trigger aa_canonical_suggestion before insert or update on public.ai_update_suggestions
  for each row execute function private.protect_canonical_suggestion();

create function public.persist_ask_canonical_suggestion(p_user_id uuid,p_capability_id uuid)
returns setof public.ai_update_suggestions language plpgsql security definer set search_path='' as $$
declare c public.ask_action_capabilities%rowtype; s public.ai_update_suggestions%rowtype; payload jsonb; conversation uuid;
begin
  perform private.require_service_role_request();
  perform private.set_furvise_server_actor(p_user_id);
  select * into c from public.ask_action_capabilities where id=p_capability_id and user_id=p_user_id;
  payload:=private.ask_suggestion_payload(c);
  if c.id is null or payload is null then raise exception using errcode='22023',message='CANONICAL_SUGGESTION_UNSUPPORTED'; end if;
  select conversation_id into conversation from public.ask_conversation_messages where id=c.assistant_message_id and user_id=p_user_id;
  insert into public.ai_update_suggestions(user_id,pet_profile_id,conversation_id,source_message_id,type,
    title,details,payload,status,concern_id,canonical_capability_id,canonical_payload,actioned_at,applied_at)
  values(p_user_id,c.pet_profile_id,conversation,c.assistant_message_id,
    case payload->>'kind' when 'state_transition' then 'concern_resolution' when 'owner_preference' then 'memory' else 'history' end,
    c.action_payload->>'label',c.action_payload->>'description','{}',
    case when private.ask_suggestion_receipt_succeeded(c) is true then 'saved' else 'pending' end,
    case when payload->>'kind'='state_transition' then c.target_id else null end,c.id,payload,
    case when private.ask_suggestion_receipt_succeeded(c) is true then c.terminal_at else null end,
    case when private.ask_suggestion_receipt_succeeded(c) is true then c.terminal_at else null end)
  on conflict(canonical_capability_id) where canonical_capability_id is not null do nothing;
  return query select * from public.ai_update_suggestions where canonical_capability_id=c.id and user_id=p_user_id;
end $$;
revoke all on function public.persist_ask_canonical_suggestion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.persist_ask_canonical_suggestion(uuid,uuid) to service_role;

create function public.execute_ask_canonical_suggestion(p_user_id uuid,p_suggestion_id uuid,p_capability_id uuid)
returns table(action jsonb,changed boolean) language plpgsql security definer set search_path='' as $$
declare s public.ai_update_suggestions%rowtype; c public.ask_action_capabilities%rowtype; r record;
begin
  perform private.require_service_role_request();
  perform private.set_furvise_server_actor(p_user_id);
  select * into s from public.ai_update_suggestions where id=p_suggestion_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='SUGGESTION_NOT_FOUND'; end if;
  if s.canonical_payload is null or s.canonical_capability_id is distinct from p_capability_id
    or s.invalidated_at is not null or s.status='dismissed'
    then raise exception using errcode='22023',message='CANONICAL_SUGGESTION_UNSUPPORTED'; end if;
  select * into c from public.ask_action_capabilities where id=s.canonical_capability_id and user_id=p_user_id for update;
  if c.id is null or s.canonical_payload is distinct from private.ask_suggestion_payload(c)
    then raise exception using errcode='23514',message='CANONICAL_SUGGESTION_BINDING'; end if;
  -- Use the PUBLIC governed wrapper, retaining expiry/freshness and receipt checks.
  select * into r from public.execute_ask_action_capability(c.id,c.assistant_message_id,p_user_id,'confirm',null);
  select * into c from public.ask_action_capabilities where id=c.id;
  if private.ask_suggestion_receipt_succeeded(c) is true then
    update public.ai_update_suggestions set status='saved',actioned_at=c.terminal_at,applied_at=c.terminal_at
      where id=s.id;
  end if;
  return query select r.action,r.changed;
end $$;
revoke all on function public.execute_ask_canonical_suggestion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.execute_ask_canonical_suggestion(uuid,uuid,uuid) to service_role;

-- Workflow changes never create patient facts. Edits cancel executable authority.
create function public.edit_ask_canonical_suggestion(p_user_id uuid,p_suggestion_id uuid,p_details text)
returns setof public.ai_update_suggestions language plpgsql security definer set search_path='' as $$
declare s public.ai_update_suggestions%rowtype; c public.ask_action_capabilities%rowtype;
begin
  perform private.require_service_role_request();perform private.set_furvise_server_actor(p_user_id);
  if p_details is null or length(btrim(p_details))=0 or length(p_details)>1000 then
    raise exception using errcode='22023',message='SUGGESTION_INVALID'; end if;
  select * into s from public.ai_update_suggestions where id=p_suggestion_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='SUGGESTION_NOT_FOUND'; end if;
  if s.status<>'pending' then raise exception using errcode='40001',message='SUGGESTION_CONFLICT'; end if;
  if s.canonical_capability_id is not null then
    select * into c from public.ask_action_capabilities where id=s.canonical_capability_id and user_id=p_user_id for update;
    if c.status='succeeded' then raise exception using errcode='40001',message='SUGGESTION_CONFLICT'; end if;
    perform * from public.execute_ask_action_capability(c.id,c.assistant_message_id,p_user_id,'cancel',null);
  end if;
  update public.ai_update_suggestions set details=p_details,invalidated_at=coalesce(invalidated_at,clock_timestamp())
    where id=s.id;
  return query select * from public.ai_update_suggestions where id=s.id;
end $$;
revoke all on function public.edit_ask_canonical_suggestion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edit_ask_canonical_suggestion(uuid,uuid,text) to service_role;

create or replace function public.transition_ask_suggestion(p_user_id uuid,p_suggestion_id uuid,p_action text)
returns table(apply_status text,suggestion_id uuid,concern_id uuid,care_entry_id uuid,concern_status text,applied_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare s public.ai_update_suggestions%rowtype; c public.ask_action_capabilities%rowtype;
begin
  perform private.require_service_role_request();perform private.set_furvise_server_actor(p_user_id);
  if p_action is distinct from 'dismiss' then raise exception using errcode='22023',message='CANONICAL_SUGGESTION_UNSUPPORTED'; end if;
  select * into s from public.ai_update_suggestions where id=p_suggestion_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='SUGGESTION_NOT_FOUND'; end if;
  if s.canonical_capability_id is not null then
    select * into c from public.ask_action_capabilities where id=s.canonical_capability_id and user_id=p_user_id for update;
    if private.ask_suggestion_receipt_succeeded(c) is true then
      return query select 'already_applied'::text,s.id,s.concern_id,s.care_entry_id,null::text,c.terminal_at;return;
    end if;
    perform * from public.execute_ask_action_capability(c.id,c.assistant_message_id,p_user_id,'cancel',null);
  elsif s.status='saved' then
    return query select 'already_applied'::text,s.id,s.concern_id,s.care_entry_id,null::text,s.applied_at;return;
  end if;
  update public.ai_update_suggestions set status='dismissed',actioned_at=coalesce(actioned_at,clock_timestamp()) where id=s.id;
  return query select 'dismissed'::text,s.id,s.concern_id,s.care_entry_id,null::text,s.applied_at;
end $$;

-- Retire legacy factual continuation, including direct compatibility delegates.
do $migration$
declare signature text; definition text; header text;
begin
  foreach signature in array array[
    'public.apply_furvise_state_suggestion(uuid,uuid)',
    'public.save_ask_memory_suggestion(uuid,uuid,uuid,text,text)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    header:=split_part(definition,'AS $function$',1);
    if header=definition then raise exception 'Unexpected suggestion delegate %',signature; end if;
    execute header||$body$AS $function$ begin
      raise exception using errcode='22023',message='CANONICAL_SUGGESTION_REQUIRED';
    end $function$;$body$;
  end loop;
end $migration$;
