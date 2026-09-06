-- UNEXECUTED. Reverse both drafts inside a savepoint, assert, then restore.
begin;
create temp table governed_functions_before as select
 pg_get_functiondef('public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)'::regprocedure) as writer,
 pg_get_functiondef('public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)'::regprocedure) as reader;
savepoint reversal;
-- UNVALIDATED reversal; restores the separately validated membership reader.
create or replace function public.read_ask_episode_sources(p_pet_id uuid,p_keys text[],p_episode_ids uuid[] default null,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare episodes jsonb; sources jsonb; memberships jsonb; claims jsonb; ids uuid[]; timeout_ms numeric;
begin
  if auth.uid() is null or not exists(select 1 from public.dog_profiles
    where id=p_pet_id and user_id=auth.uid()) then
    raise exception using errcode='42501',message='Pet unavailable';
  end if;
  timeout_ms := extract(epoch from current_setting('statement_timeout')::interval)*1000;
  if timeout_ms<=0 or timeout_ms>8000 then
    raise exception using errcode='55000',message='Bounded request timeout required';
  end if;
  if (p_from is null)<>(p_to is null) or (p_from is not null and
    (not isfinite(p_from) or not isfinite(p_to) or p_from>=p_to)) then
    raise exception using errcode='22023',message='Invalid episode period';
  end if;
  if p_keys is null or cardinality(p_keys) not between 1 and 4
    or exists(select 1 from unnest(p_keys) k where k is null or k not in ('vomiting','vomit','soft_stool','stool','diarrhea','breathing'))
    or (p_episode_ids is not null and (cardinality(p_episode_ids) not between 1 and 8
      or array_position(p_episode_ids,null) is not null)) then
    raise exception using errcode='22023',message='Invalid episode scope';
  end if;
  if p_episode_ids is null then
    -- Bound each exact indexed topic probe before merging at most 36 rows.
    -- A global sort across every matching episode is not required.
    select coalesce(jsonb_agg(to_jsonb(e) order by started_at,id),'[]'::jsonb),array_agg(id order by started_at,id)
    into episodes,ids from (
      select e.* from (select distinct unnest(p_keys) k) keys cross join lateral (
        select id,user_id,pet_profile_id,normalized_key,sequence_number,recurrence_of,
          started_at,last_event_at,resolved_at,status,updated_at,missing_source_event_ids[1:9] as missing_source_event_ids
        from public.pet_care_episodes where user_id=auth.uid() and pet_profile_id=p_pet_id
          and normalized_key=k
          and (p_from is null or (started_at>=p_from and started_at<p_to))
          order by started_at,id limit 9
      ) e order by started_at,id limit 9
    ) e;
  else
    -- Pinned references use primary keys, never a chronological prefix scan.
    select coalesce(jsonb_agg(to_jsonb(e) order by started_at,id),'[]'::jsonb),array_agg(id order by started_at,id)
    into episodes,ids from (
      select id,user_id,pet_profile_id,normalized_key,sequence_number,recurrence_of,
        started_at,last_event_at,resolved_at,status,updated_at,missing_source_event_ids[1:9] as missing_source_event_ids
      from public.pet_care_episodes where id=any(p_episode_ids)
        and user_id=auth.uid() and pet_profile_id=p_pet_id and normalized_key=any(p_keys)
    ) e;
  end if;
  -- The authoritative edge table, including claim-only memberships. Raw edges
  -- are retained even if their payload is missing, changed, or oversized.
  select coalesce(jsonb_agg(to_jsonb(m) order by m.episode_id,m.event_ordinal,m.id),'[]'::jsonb)
  into memberships from unnest(ids[1:8]) i cross join lateral (
    select m.*,
      case when exists (
        select 1 from public.semantic_claim_legacy_lineage l
        left join lateral (
          -- Exactly the import writer's source-row hash shape: entry.*, species,
          -- membership_role. Never compare a projection title or date heuristic.
          select e.*, p.species, cm.event_role as membership_role
          from public.pet_care_entries e
          join public.dog_profiles p on p.id=e.pet_profile_id and p.user_id=auth.uid()
          left join public.pet_care_episode_events cm on cm.care_entry_id=e.id and cm.user_id=auth.uid()
          where e.id=l.legacy_row_id and e.user_id=auth.uid() and e.pet_profile_id=p_pet_id
        ) current_source on true
        where l.user_id=auth.uid() and l.legacy_table='pet_care_entries'
          and (l.claim_id=m.claim_id or l.legacy_row_id=m.care_entry_id)
          and (l.claim_role<>'primary' or current_source.id is null or current_source.deleted_at is not null
            or l.source_row_hash is distinct from encode(extensions.digest(convert_to(to_jsonb(current_source)::text,'UTF8'),'sha256'),'hex'))
      ) then 'legacy_source_changed_or_missing' else null end source_issue
    from public.pet_care_episode_events m
    where m.episode_id=i and m.user_id=auth.uid() and m.pet_profile_id=p_pet_id
    order by m.event_ordinal,m.id limit 9
  ) m;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.episode_id,e.id),'[]'::jsonb) into sources from (
    select e.id,e.user_id,e.pet_profile_id,e.episode_id,e.category,
      case when length(e.title)<=200 then e.title else null end title,
      case when length(e.note)<=2000 then e.note else null end note,
      (length(e.note)>2000 or length(e.title)>200) as content_omitted,
      e.severity,e.occurred_at,e.created_at,e.updated_at,e.deleted_at
    from public.pet_care_entries e
    where e.id in (select (m->>'care_entry_id')::uuid from jsonb_array_elements(memberships) m)
      and e.user_id=auth.uid() and e.pet_profile_id=p_pet_id
  ) e;
  select coalesce(jsonb_agg(case when octet_length(to_jsonb(c)::text)>16000
      or length(c.structured_value->>'note')>2000 or length(c.structured_value->>'title')>200
    then jsonb_build_object('id',c.id,'content_omitted',true) else to_jsonb(c) end order by c.id),'[]'::jsonb)
  into claims from public.semantic_claims c
  where c.id in (select (m->>'claim_id')::uuid from jsonb_array_elements(memberships) m)
    and c.user_id=auth.uid() and c.subject_type='pet' and c.subject_id=p_pet_id;
  return jsonb_build_object('episodes',episodes,'sources',sources,'memberships',memberships,'claims',claims,
    'membership_contract','ask-episode-membership.v1',
    'coverage','bounded_candidates_not_complete','snapshot',statement_timestamp());
end $$;
-- Definer is necessary because semantic claims/lineage are service-only tables.
-- No table grants, RLS changes, service-role app fallback, or write capability.
revoke all on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) to authenticated;
drop trigger ask_recorded_revision on public.dog_profiles;
drop trigger ask_recorded_no_truncate on public.dog_profiles;
drop trigger ask_recorded_revision on public.pet_care_entries;
drop trigger ask_recorded_no_truncate on public.pet_care_entries;
drop trigger ask_recorded_revision on public.pet_care_episodes;
drop trigger ask_recorded_no_truncate on public.pet_care_episodes;
drop trigger ask_recorded_revision on public.pet_care_episode_events;
drop trigger ask_recorded_no_truncate on public.pet_care_episode_events;
drop trigger ask_recorded_revision on public.semantic_claims;
drop trigger ask_recorded_no_truncate on public.semantic_claims;
drop trigger ask_recorded_revision on public.semantic_claim_relations;
drop trigger ask_recorded_no_truncate on public.semantic_claim_relations;
drop trigger ask_recorded_revision on public.semantic_claim_legacy_lineage;
drop trigger ask_recorded_no_truncate on public.semantic_claim_legacy_lineage;
drop trigger ask_recorded_revision on public.ask_history_removed_relation_targets;
drop trigger ask_recorded_no_truncate on public.ask_history_removed_relation_targets;
drop trigger ask_recorded_revision on public.semantic_concepts;
drop trigger ask_recorded_no_truncate on public.semantic_concepts;
drop trigger ask_recorded_revision on public.semantic_concept_aliases;
drop trigger ask_recorded_no_truncate on public.semantic_concept_aliases;
drop trigger ask_recorded_revision on public.ask_conversation_messages;
drop trigger ask_recorded_no_truncate on public.ask_conversation_messages;
drop trigger ask_recorded_revision on public.ask_conversations;
drop trigger ask_recorded_no_truncate on public.ask_conversations;
drop trigger ask_recorded_revision on public.furvise_memories;
drop trigger ask_recorded_no_truncate on public.furvise_memories;
drop trigger ask_recorded_revision on public.dog_memories;
drop trigger ask_recorded_no_truncate on public.dog_memories;
drop function public.read_ask_recorded_membership_batch(uuid,text[],uuid[],timestamptz,timestamptz);
drop trigger ask_recorded_revision on private.ask_recorded_source_evidence;
drop trigger ask_recorded_no_truncate on private.ask_recorded_source_evidence;
drop function public.invalidate_ask_recorded_inventory();
drop function public.reject_ask_recorded_truncate();
drop table public.ask_recorded_inventory_removals;
drop table public.ask_recorded_inventory_revision;
drop table public.ask_recorded_registry_revision;
notify pgrst,'reload schema';

-- PREPARATION ONLY. Reverse recorded completeness first.
create or replace function public.persist_furvise_server_semantic_event(
  p_user_id uuid,
  p_pet_id uuid,
  p_source_message_id uuid,
  p_event jsonb
)
returns table(
  persistence_status text,
  care_entry_id uuid,
  episode_id uuid,
  normalized_topic text,
  resulting_state text,
  already_persisted boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.set_furvise_server_actor(p_user_id);
  return query
  select * from public.persist_furvise_semantic_event(
    p_user_id, p_pet_id, p_source_message_id, p_event
  );
end;
$$;
drop function private.read_ask_recorded_source_evidence(uuid);
drop table private.ask_recorded_source_evidence;
do $$ begin
 if to_regclass('private.ask_recorded_source_evidence') is not null
   or to_regclass('public.ask_recorded_inventory_revision') is not null
   or to_regclass('public.ask_recorded_registry_revision') is not null then raise exception 'reversal retained tables'; end if;
 if position('recordedEvidence' in pg_get_functiondef('public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)'::regprocedure))>0
   or position('recorded_inventory' in pg_get_functiondef('public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)'::regprocedure))>0 then raise exception 'reversal retained contract'; end if;
 if has_function_privilege('authenticated','public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)','EXECUTE')
   or not has_function_privilege('service_role','public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)','EXECUTE') then raise exception 'reversal grant drift'; end if;
end $$;
rollback to reversal;
do $$ begin
 if (select writer<>pg_get_functiondef('public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb)'::regprocedure)
   or reader<>pg_get_functiondef('public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)'::regprocedure) from governed_functions_before)
   or to_regclass('private.ask_recorded_source_evidence') is null then raise exception 'rollback did not restore draft'; end if;
end $$;
rollback;
