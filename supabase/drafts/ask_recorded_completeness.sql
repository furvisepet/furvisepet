-- CODE PREPARATION ONLY. NOT DATABASE-VALIDATED. Requires existing membership schema.
begin;
create table public.ask_recorded_inventory_revision (
 singleton boolean primary key default true check(singleton), revision bigint not null check(revision>0)
);
insert into public.ask_recorded_inventory_revision values(true,1);
create table public.ask_recorded_inventory_removals (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.ask_recorded_inventory_revision enable row level security;
alter table public.ask_recorded_inventory_removals enable row level security;
revoke all on public.ask_recorded_inventory_revision, public.ask_recorded_inventory_removals from public,anon,authenticated,service_role;
-- A transactional row update, NOT a sequence: rollback restores the old revision,
-- and concurrent writers serialize here. Readers see revision and rows via MVCC.
create function public.invalidate_ask_recorded_inventory() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 update public.ask_recorded_inventory_revision set revision=revision+1 where singleton;
 if tg_op='DELETE' and tg_table_name in ('pet_care_entries','pet_care_episodes','pet_care_episode_events','semantic_claims','semantic_claim_relations','semantic_claim_legacy_lineage','ask_history_removed_relation_targets') then
   insert into public.ask_recorded_inventory_removals(user_id) select id from auth.users where id=(to_jsonb(old)->>'user_id')::uuid on conflict do nothing;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.invalidate_ask_recorded_inventory() from public,anon,authenticated,service_role;
-- TRUNCATE cannot silently erase the inventory or its removal debt.
create function public.reject_ask_recorded_truncate() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin raise exception 'Recorded inventory requires row-level removal' using errcode='55000'; end $$;
revoke all on function public.reject_ask_recorded_truncate() from public,anon,authenticated,service_role;
create trigger ask_recorded_revision after insert or update or delete on public.dog_profiles for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.dog_profiles for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.pet_care_entries for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.pet_care_entries for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.pet_care_episodes for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.pet_care_episodes for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.pet_care_episode_events for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.pet_care_episode_events for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.semantic_claims for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.semantic_claims for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.semantic_claim_relations for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.semantic_claim_relations for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.semantic_claim_legacy_lineage for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.semantic_claim_legacy_lineage for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.ask_history_removed_relation_targets for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.ask_history_removed_relation_targets for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.semantic_concepts for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.semantic_concepts for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.semantic_concept_aliases for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.semantic_concept_aliases for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.ask_conversation_messages for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.ask_conversation_messages for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.ask_conversations for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.ask_conversations for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.furvise_memories for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.furvise_memories for each statement execute function public.reject_ask_recorded_truncate();
create trigger ask_recorded_revision after insert or update or delete on public.dog_memories for each row execute function public.invalidate_ask_recorded_inventory();
create trigger ask_recorded_no_truncate before truncate on public.dog_memories for each statement execute function public.reject_ask_recorded_truncate();
create or replace function public.read_ask_recorded_membership_batch(p_pet_id uuid,p_keys text[],p_episode_ids uuid[] default null,p_from timestamptz default null,p_to timestamptz default null)
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
revoke all on function public.read_ask_recorded_membership_batch(uuid,text[],uuid[],timestamptz,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.read_ask_episode_sources(p_pet_id uuid,p_keys text[],p_episode_ids uuid[] default null,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 result jsonb; batch jsonb; ids uuid[]; care_ids uuid[]; claim_ids uuid[];
 rev text; failures text[] := '{}'; offset_idx integer;
 episode_rows jsonb := '[]'; source_rows jsonb := '[]'; member_rows jsonb := '[]'; claim_rows jsonb := '[]';
begin
 -- Reuse all validated argument, ownership and timeout checks. Pinned references
 -- retain the existing bounded membership contract and version hashes.
 result:=public.read_ask_recorded_membership_batch(p_pet_id,p_keys,p_episode_ids,p_from,p_to);
 if p_episode_ids is not null then return result; end if;
 select revision::text into rev from public.ask_recorded_inventory_revision where singleton;
 select coalesce(array_agg(id order by started_at,id),'{}') into ids from (
   select id,started_at from public.pet_care_episodes
   where user_id=auth.uid() and pet_profile_id=p_pet_id and normalized_key=any(p_keys)
     and (p_from is null or started_at>=p_from and started_at<p_to)
   order by started_at,id limit 33
 ) e;
 if cardinality(ids)>32 then failures:=array_append(failures,'episode_overflow'); end if;
 -- Include every retained source in the requested period, irrespective of lexical
 -- matching, deletion state, classification, or whether an import found it.
 -- Members of a scoped group are included even when their continuation is later.
 select coalesce(array_agg(id order by id),'{}') into care_ids from (
   select e.id from public.pet_care_entries e where e.user_id=auth.uid() and e.pet_profile_id=p_pet_id
     and (p_from is null or e.occurred_at>=p_from and e.occurred_at<p_to or e.episode_id=any(ids))
   order by e.id limit 65
 ) e;
 select coalesce(array_agg(id order by id),'{}') into claim_ids from (
   select c.id from public.semantic_claims c where c.user_id=auth.uid() and c.subject_type='pet' and c.subject_id=p_pet_id
     and (p_from is null or c.occurred_at is null or c.occurred_at>=p_from and c.occurred_at<p_to
       or exists(select 1 from public.pet_care_episode_events m where m.claim_id=c.id and m.user_id=auth.uid() and m.pet_profile_id=p_pet_id and m.episode_id=any(ids)))
   order by c.id limit 65
 ) c;
 if exists(select 1 from public.semantic_claims c where c.user_id=auth.uid() and c.subject_type='unknown') then
   failures:=array_append(failures,'unknown_subject_classification');
 end if;
 if cardinality(care_ids)+cardinality(claim_ids)>64 then failures:=array_append(failures,'source_overflow'); end if;
 if exists(select 1 from public.ask_recorded_inventory_removals where user_id=auth.uid()) then
   failures:=array_append(failures,'retained_removal_debt');
 end if;
 if exists(select 1 from public.pet_care_entries e where e.id=any(care_ids) and (e.deleted_at is not null
   or coalesce(e.state_action_type,'') in ('semantic_corrected','resolve_concern','semantic_resolved')
   or lower(coalesce(e.care_event_metadata->>'semanticTransition','')) in ('corrected','correction','retracted','dismissed','unknown')
   or not exists(
   select 1 from public.pet_care_episode_events m where m.care_entry_id=e.id and m.episode_id=any(ids)
     and m.user_id=auth.uid() and m.pet_profile_id=p_pet_id and m.event_role in ('opening','recurrence','continuation')
 ))) or exists(select 1 from public.semantic_claims c where c.id=any(claim_ids) and (
   c.knowledge_status<>'effective' or c.operation_type not in ('assert','confirm') or c.concept_resolution_status<>'canonical'
   or c.canonical_concept_key<>all(p_keys) or c.persistence_destination<>'history' or not exists(
    select 1 from public.pet_care_episode_events m where m.claim_id=c.id and m.episode_id=any(ids)
      and m.user_id=auth.uid() and m.pet_profile_id=p_pet_id and m.event_role in ('opening','recurrence','continuation')
   ) or (c.source_type='ask_message' and not exists(
     select 1 from public.ask_conversation_messages msg join public.ask_conversations conv on conv.id=msg.conversation_id and conv.user_id=auth.uid()
     where msg.id=c.source_message_id and msg.user_id=auth.uid() and msg.role='user'
   )) or c.source_type not in ('ask_message','manual_history','legacy_import')
 )) then failures:=array_append(failures,'unclassified_or_inactive_source'); end if;
 -- Once import lineage exists for this pet, a partial frontier cannot masquerade
 -- as a fully imported register. Unimported native care alone is supported.
 if exists(select 1 from public.semantic_claim_legacy_lineage l join public.pet_care_entries e on e.id=l.legacy_row_id
    where l.user_id=auth.uid() and e.user_id=auth.uid() and e.pet_profile_id=p_pet_id and l.legacy_table='pet_care_entries')
 and exists(select 1 from unnest(care_ids) as care_root(care_id) where not exists(
   select 1 from public.semantic_claim_legacy_lineage l where l.user_id=auth.uid() and l.legacy_table='pet_care_entries'
     and l.legacy_row_id=care_root.care_id and l.claim_role='primary' and l.claim_id=any(claim_ids)
 )) then failures:=array_append(failures,'import_frontier_gap'); end if;
 if cardinality(ids)<=32 and cardinality(care_ids)+cardinality(claim_ids)<=64 then
   for offset_idx in 0..3 loop
     exit when offset_idx*8>=cardinality(ids);
     batch:=public.read_ask_recorded_membership_batch(p_pet_id,p_keys,ids[offset_idx*8+1:offset_idx*8+8],null,null);
     episode_rows:=episode_rows || (batch->'episodes'); source_rows:=source_rows || (batch->'sources');
     member_rows:=member_rows || (batch->'memberships'); claim_rows:=claim_rows || (batch->'claims');
   end loop;
   if jsonb_array_length(member_rows)>64 then failures:=array_append(failures,'membership_overflow'); end if;
   if cardinality(failures)=0 then
     result:=jsonb_build_object('episodes',episode_rows,'sources',source_rows,'memberships',member_rows,'claims',claim_rows,
       'membership_contract','ask-episode-membership.v1','coverage','bounded_candidates_not_complete');
   end if;
 end if;
 -- No semantic complete boolean or exact total is minted here. App validation
 -- must account for the census, grouping, every hash, and correction closure.
 return result || jsonb_build_object('recorded_inventory',jsonb_build_object(
   'version','ask-recorded-inventory.v1','ownerId',auth.uid(),'petId',p_pet_id,'keys',p_keys,
   'from',p_from,'to',p_to,'revision',rev,'snapshot',statement_timestamp(),
   'episodeCount',cardinality(ids),'careIds',care_ids,'claimIds',claim_ids,'failures',failures));
end $$;
revoke all on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
