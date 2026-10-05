-- Canonical origin is permanent provenance; the existing FK is only a live link.
-- Apply atomically. No historical migration, transcript, claim or receipt is rewritten.
begin;
lock table public.pet_care_entries in access exclusive mode;
alter table public.pet_care_entries add column canonical_ask_origin_message_id uuid;
comment on column public.pet_care_entries.canonical_ask_origin_message_id is
 'Immutable canonical source coordinate, not a live message reference or authority to execute a new action.';

-- Migration-only generation preservation. Only the new coordinate may change,
-- and only by copying the already stored canonical source. Replaced below before commit.
create or replace function public.pet_care_entries_touch_updated_at()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.canonical_ask_isolated and old.canonical_ask_origin_message_id is null
  and old.intelligence_source_message_id is not null
  and new.canonical_ask_origin_message_id=old.intelligence_source_message_id
  and (to_jsonb(new)-'canonical_ask_origin_message_id')=(to_jsonb(old)-'canonical_ask_origin_message_id') then
  return new;
 end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
update public.pet_care_entries set canonical_ask_origin_message_id=intelligence_source_message_id
 where canonical_ask_isolated;
alter table public.pet_care_entries add constraint canonical_ask_origin_required
 check (canonical_ask_isolated=(canonical_ask_origin_message_id is not null));

-- VOLATILE observes the parent deletion performed by this command. SECURITY
-- DEFINER prevents RLS invisibility being mistaken for physical absence. No caller
-- role, JWT, setting or trigger depth is an authorization bypass.
create function private.canonical_ask_live_detach(old_row public.pet_care_entries,new_row public.pet_care_entries)
returns boolean language sql volatile security definer set search_path=pg_catalog as $$
 select old_row.canonical_ask_isolated and old_row.intelligence_source_message_id is not null
  and new_row.intelligence_source_message_id is null
  and old_row.canonical_ask_origin_message_id=old_row.intelligence_source_message_id
  and (to_jsonb(new_row)-'intelligence_source_message_id')=(to_jsonb(old_row)-'intelligence_source_message_id')
  and not exists(select 1 from public.ask_conversation_messages m where m.id=old_row.intelligence_source_message_id);
$$;
revoke all on function private.canonical_ask_live_detach(public.pet_care_entries,public.pet_care_entries) from public,anon,authenticated,service_role;

create or replace function private.protect_canonical_ask_isolation()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' and new.canonical_ask_isolated then
  if current_user<>pg_get_userbyid((select relowner from pg_class where oid=tg_relid)) then
   raise exception using errcode='42501',message='CANONICAL_ASK_ORIGIN_REQUIRES_WRITER';
  end if;
  if new.intelligence_source_message_id is null
   or (new.canonical_ask_origin_message_id is not null and new.canonical_ask_origin_message_id<>new.intelligence_source_message_id)
   or not exists(select 1 from public.ask_conversation_messages m
    join public.ask_conversations c on c.id=m.conversation_id and c.user_id=new.user_id
    where m.id=new.intelligence_source_message_id and m.user_id=new.user_id and m.role='user')
   or not exists(select 1 from public.dog_profiles p where p.id=new.pet_profile_id and p.user_id=new.user_id)
   or not exists(select 1 from public.ask_action_capabilities c
    where c.user_id=new.user_id and c.pet_profile_id=new.pet_profile_id
     and c.source_message_id=new.intelligence_source_message_id and c.status='pending'
     and ((c.action_kind='care_history.add' and exists(
      select 1 from jsonb_array_elements(c.action_payload#>'{appendJob,items}') item
      where item#>>'{body,id}'=new.care_event_metadata->>'sourceSpanId'
       and item#>>'{body,sourceMessageId}'=new.intelligence_source_message_id::text
       and item#>>'{body,text}'=new.note))
      or (c.action_kind='pet.mark_deceased' and new.idempotency_key=c.id))) then
   raise exception using errcode='23514',message='CANONICAL_ASK_ORIGIN_SOURCE_INVALID';
  end if;
  new.canonical_ask_origin_message_id:=new.intelligence_source_message_id;
 end if;
 if tg_op='UPDATE' then
  if new.canonical_ask_isolated is distinct from old.canonical_ask_isolated
   or new.canonical_ask_origin_message_id is distinct from old.canonical_ask_origin_message_id
   or (old.canonical_ask_isolated and (
    new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.pet_profile_id is distinct from old.pet_profile_id
    or new.intelligence_source_type is distinct from old.intelligence_source_type
    or new.care_event_metadata->>'sourceSpanId' is distinct from old.care_event_metadata->>'sourceSpanId')) then
   raise exception using errcode='23514',message='CANONICAL_ASK_ORIGIN_IMMUTABLE';
  end if;
  if old.canonical_ask_isolated and new.intelligence_source_message_id is distinct from old.intelligence_source_message_id
   and not private.canonical_ask_live_detach(old,new) then
   raise exception using errcode='23514',message='CANONICAL_ASK_LIVE_LINK_IMMUTABLE';
  end if;
 end if;
 if new.canonical_ask_isolated and (
  new.intelligence_source_type is distinct from 'ask_application_action'
  or new.canonical_ask_origin_message_id is null
  or (new.intelligence_source_message_id is not null and new.intelligence_source_message_id<>new.canonical_ask_origin_message_id)
  or new.episode_id is not null or new.concern_id is not null or new.state_action_type is not null) then
  raise exception using errcode='23514',message='CANONICAL_ASK_INFERRED_LINK_FORBIDDEN';
 end if;
 return new;
end $$;
revoke all on function private.protect_canonical_ask_isolation() from public,anon,authenticated,service_role;

create or replace function public.pet_care_entries_touch_updated_at()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if private.canonical_ask_live_detach(old,new) then return new; end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
revoke all on function public.pet_care_entries_touch_updated_at() from public,anon,authenticated,service_role;

create or replace function private.ask_source_semantics_snapshot(e public.pet_care_entries)
returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('id',e.id,'ownerId',e.user_id,'petId',e.pet_profile_id,'note',e.note,'title',e.title,
  'occurredAt',e.occurred_at,'createdAt',e.created_at,'updatedAt',e.updated_at,
  'sourceMessageId',coalesce(e.canonical_ask_origin_message_id,e.intelligence_source_message_id),
  'sourceSpanId',e.care_event_metadata->>'sourceSpanId');
$$;
revoke all on function private.ask_source_semantics_snapshot(public.pet_care_entries) from public,anon,authenticated,service_role;

-- Keep the complete current dependency exclusion logic. Only the permanent
-- source coordinate changes; terminal receipts and all safe-target gates remain.
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('private.canonical_ask_replace_safe(uuid,uuid,uuid)'::regprocedure);
 if position('c.source_message_id=e.intelligence_source_message_id' in definition)=0
  or position('sourceSemanticsPayload' in definition)=0 then raise exception 'CANONICAL_ORIGIN_SAFE_PRECONDITION'; end if;
 revised:=replace(definition,'e.intelligence_source_message_id','e.canonical_ask_origin_message_id');
 -- Non-attributed dependencies retain message lineage after their live FK detaches.
 -- Keep this inside the existing owner-scoped exclusion and attributed exemption;
 -- no knowledge-status narrowing or change to any other dependency branch.
 if position('d.source_message_lineage_id=e.id or d.source_message_id=' in revised)=0 then
  raise exception 'CANONICAL_ORIGIN_DEPENDENCY_PRECONDITION'; end if;
 revised:=replace(revised,'d.source_message_lineage_id=e.id or d.source_message_id=',
  'd.source_message_lineage_id=e.id or d.source_message_lineage_id=e.canonical_ask_origin_message_id or d.source_message_id=');
 execute revised;
 definition:=pg_get_functiondef('private.is_canonical_ask_source(uuid)'::regprocedure);
 if position('e.intelligence_source_message_id=p_source' in definition)=0 then raise exception 'CANONICAL_ORIGIN_INFERENCE_PRECONDITION'; end if;
 execute replace(definition,'e.intelligence_source_message_id=p_source',
  'coalesce(e.canonical_ask_origin_message_id,e.intelligence_source_message_id)=p_source');
end $migration$;

-- persist_ask_source_semantics deliberately retains the live FK for the claim's
-- source_message_id. A post-deletion replacement stamps the NEW care generation
-- with a null live FK and the unchanged permanent origin in its exact snapshot.
-- Existing claims, payload bytes/hashes, receipts, inventory invalidation and all
-- capability source/assistant locks and pending/terminal branches are untouched.

-- Validate the final row too: a later BEFORE trigger cannot combine detachment
-- with a protected-field/version edit after the first guard has checked it.
create function private.protect_canonical_ask_detached_generation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.canonical_ask_isolated and old.intelligence_source_message_id is not null
  and new.intelligence_source_message_id is null
  and not private.canonical_ask_live_detach(old,new) then
  raise exception using errcode='23514',message='CANONICAL_ASK_DETACH_GENERATION_CHANGED';
 end if;
 return new;
end $$;
revoke all on function private.protect_canonical_ask_detached_generation() from public,anon,authenticated,service_role;
create constraint trigger canonical_ask_detached_generation after update on public.pet_care_entries
 not deferrable for each row execute function private.protect_canonical_ask_detached_generation();

-- Claim payload/origin remains immutable. Its separate live FK may detach only
-- after physical source removal, with every other claim field byte-identical.
create or replace function private.protect_attributed_source_claim()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.governance_metadata ? 'sourceSemanticsPayload' or (tg_op='UPDATE' and old.governance_metadata ? 'sourceSemanticsPayload') then
  if tg_op='UPDATE' and old.source_message_id is not null and new.source_message_id is null
   and (to_jsonb(new)-'source_message_id')=(to_jsonb(old)-'source_message_id')
   and not exists(select 1 from public.ask_conversation_messages m where m.id=old.source_message_id) then return new; end if;
  if tg_op='UPDATE' or new.knowledge_status<>'unconfirmed' or new.operation_type<>'assert'
   or new.persistence_destination<>'none' or new.modality<>'reported'
   or new.turn_payload_hash<>encode(extensions.digest(convert_to(new.governance_metadata->>'sourceSemanticsPayload','UTF8'),'sha256'),'hex') then
   raise exception 'ATTRIBUTED_SOURCE_IMMUTABLE'; end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_attributed_source_claim() from public,anon,authenticated,service_role;

commit;
