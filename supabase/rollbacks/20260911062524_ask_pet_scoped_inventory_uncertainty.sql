-- Restore conservative account-wide readers without deleting scoped receipts.
create or replace function public.invalidate_ask_recorded_inventory() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare affected uuid;
begin
 if tg_table_name in ('semantic_concepts','semantic_concept_aliases') then
   update public.ask_recorded_registry_revision set revision=revision+1 where singleton;
 else
   -- Both sides of an ownership change invalidate, in deterministic lock order.
   for affected in select distinct value::uuid from jsonb_array_elements_text(jsonb_build_array(
     case when tg_op<>'INSERT' then to_jsonb(old)->>'user_id' end,
     case when tg_op<>'DELETE' then to_jsonb(new)->>'user_id' end)) where value is not null order by 1 loop
     insert into public.ask_recorded_inventory_revision(user_id,revision)
       select affected,2 where exists(select 1 from auth.users where id=affected)
     on conflict(user_id) do update set revision=public.ask_recorded_inventory_revision.revision+1;
   end loop;
 end if;
 if tg_op='DELETE' and tg_table_name in ('pet_care_entries','pet_care_episodes','pet_care_episode_events','semantic_claims','semantic_claim_relations','semantic_claim_legacy_lineage','ask_history_removed_relation_targets','ask_recorded_source_evidence') then
   insert into public.ask_recorded_inventory_removals(user_id) select id from auth.users where id=(to_jsonb(old)->>'user_id')::uuid on conflict do nothing;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.invalidate_ask_recorded_inventory() from public,anon,authenticated,service_role;

create or replace function private.ask_native_episode_census(p_pet_id uuid,p_keys text[],p_from timestamptz,p_to timestamptz)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with scoped_episodes as materialized (
   select e.* from public.pet_care_episodes e where e.user_id=auth.uid() and e.pet_profile_id=p_pet_id
     and regexp_replace(e.normalized_key,'^health_','')=any(p_keys)
     and (p_from is null or e.started_at>=p_from and e.started_at<p_to)
 ), evidence as materialized (
   select e.*,private.read_ask_recorded_source_evidence(e.id) proof
   from public.pet_care_entries e where e.user_id=auth.uid() and e.pet_profile_id=p_pet_id
     and (p_from is null or e.occurred_at>=p_from and e.occurred_at<p_to
       or e.episode_id in (select id from scoped_episodes))
 ), relevant as materialized (
   select * from evidence where episode_id in (select id from scoped_episodes)
     or proof is null or proof->>'inventoryTopic'=any(p_keys)
 ), imported_copies as materialized (
   -- Import identities are aliases of the original care source, never new
   -- episodes. Validate the import writer's exact source-row hash and payload.
   select c.id,c.subject_id,l.legacy_row_id from public.semantic_claims c
   join public.semantic_claim_legacy_lineage l on l.claim_id=c.id and l.user_id=auth.uid()
     and l.legacy_table='pet_care_entries' and l.claim_role='primary'
   join evidence e on e.id=l.legacy_row_id and e.proof is not null
   join public.pet_care_episode_events m on m.care_entry_id=e.id and m.user_id=auth.uid() and m.pet_profile_id=p_pet_id
   join lateral (
     select ce.*,p.species,m.event_role as membership_role from public.pet_care_entries ce
     join public.dog_profiles p on p.id=ce.pet_profile_id and p.user_id=auth.uid() where ce.id=e.id
   ) source_row on true
   where c.user_id=auth.uid() and c.subject_type='pet' and c.subject_id=p_pet_id
     and c.source_type='legacy_import' and c.knowledge_status='effective' and c.operation_type in ('assert','confirm')
     and c.structured_value->>'note'=e.note and (c.structured_value->>'title') is not distinct from e.title
     and (c.structured_value->>'severity') is not distinct from e.severity
     -- An import may have no registry concept. Its exact source alias cannot
     -- add independent topic authority or a second count; native proof owns it.
     and (c.canonical_concept_key is null or c.canonical_concept_key=e.care_event_metadata->>'semanticTopic')
     and c.polarity='affirmed' and c.modality in ('asserted','reported')
     and c.occurred_at=e.occurred_at and c.lifecycle_role=m.event_role
     and l.source_row_hash=encode(extensions.digest(convert_to(to_jsonb(source_row)::text,'UTF8'),'sha256'),'hex')
 ), groups as (
   select ep.id, count(r.id) members,
     count(r.id) filter(where r.proof->>'role'='opening' and r.occurred_at=ep.started_at) openings,
     bool_and(r.proof is not null and r.proof->>'inventoryTopic'=any(p_keys)
       and r.proof->>'role' in ('opening','continuation','resolution')) valid
   from scoped_episodes ep left join relevant r on r.episode_id=ep.id group by ep.id
 )
 select case when
   exists(select 1 from public.dog_profiles where id=p_pet_id and user_id=auth.uid())
   and not exists(select 1 from relevant r where r.proof is null or r.episode_id is null
     or r.episode_id not in (select id from scoped_episodes) or r.deleted_at is not null)
   and not exists(select 1 from groups where members=0 or openings<>1 or valid is distinct from true)
   and not exists(select 1 from scoped_episodes where status not in ('active','monitoring','resolved')
     or cardinality(missing_source_event_ids)>0)
   and not exists(select 1 from public.pet_care_episode_events m where m.user_id=auth.uid()
     and m.episode_id in (select id from scoped_episodes) and
       (m.claim_id is not null and not exists(select 1 from imported_copies c join relevant r on r.id=c.legacy_row_id
         where c.id=m.claim_id and r.episode_id=m.episode_id)
       or m.care_entry_id is not null and m.care_entry_id not in (select id from relevant)))
   and not exists(select 1 from public.semantic_claims c where c.user_id=auth.uid()
     and (c.subject_type='unknown' or c.subject_id=p_pet_id)
     and (p_from is null or c.occurred_at is null or c.occurred_at>=p_from and c.occurred_at<p_to
       or exists(select 1 from public.pet_care_episode_events m where m.claim_id=c.id and m.episode_id in (select id from scoped_episodes)))
     and c.id not in (select id from imported_copies))
   and not exists(select 1 from public.semantic_claim_relations where user_id=auth.uid()
     and relation_type in ('corrects','supersedes','retracts'))
   and not exists(select 1 from public.ask_recorded_inventory_removals where user_id=auth.uid())
   and not exists(select 1 from public.ask_history_removed_relation_targets where user_id=auth.uid())
 then jsonb_build_object('version','ask-native-census.v1','ownerId',auth.uid(),'petId',p_pet_id,
   'keys',p_keys,'from',p_from,'to',p_to,'episodeCount',(select count(*) from scoped_episodes),
   'sourceCount',(select count(*) from relevant),'snapshot',statement_timestamp(),
   'revision',coalesce((select revision from public.ask_recorded_inventory_revision where user_id=auth.uid()),1)::text
     || '.' || (select revision::text from public.ask_recorded_registry_revision where singleton)) end
$$;
revoke all on function private.ask_native_episode_census(uuid,text[],timestamptz,timestamptz) from public,anon,authenticated,service_role;

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
 select coalesce((select revision from public.ask_recorded_inventory_revision where user_id=auth.uid()),1)::text
   || '.' || revision::text into rev from public.ask_recorded_registry_revision where singleton;
 select coalesce(array_agg(id order by started_at,id),'{}') into ids from (
   select id,started_at from public.pet_care_episodes
   where user_id=auth.uid() and pet_profile_id=p_pet_id and (normalized_key=any(p_keys) or normalized_key=any(select 'health_'||k from unnest(p_keys) k))
     and (p_from is null or started_at>=p_from and started_at<p_to)
   order by started_at,id limit 33
 ) e;
 if cardinality(ids)>32 then failures:=array_append(failures,'episode_overflow'); end if;
 -- Include every retained source except unchanged writer-classified evidence
 -- reliably outside the requested topic. Missing classification remains in the census.
 -- Members of a scoped group are included even when their continuation is later.
 select coalesce(array_agg(id order by id),'{}') into care_ids from (
   select e.id from public.pet_care_entries e where e.user_id=auth.uid() and e.pet_profile_id=p_pet_id
     and (e.episode_id=any(ids) or coalesce(private.read_ask_recorded_source_evidence(e.id)->>'inventoryTopic'=any(p_keys),true))
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
   or coalesce(e.state_action_type,'') in ('semantic_corrected')
   or lower(coalesce(e.care_event_metadata->>'semanticTransition','')) in ('corrected','correction','retracted','dismissed','unknown')
   or not exists(
   select 1 from public.pet_care_episode_events m where m.care_entry_id=e.id and m.episode_id=any(ids)
     and m.user_id=auth.uid() and m.pet_profile_id=p_pet_id and (m.event_role in ('opening','recurrence','continuation')
       or m.event_role='resolution' and private.read_ask_recorded_source_evidence(e.id)->>'role'='resolution')
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
 -- Legacy inventory still requires application graph validation. The optional
 -- native census independently validates every source in SQL and is revision
 -- bracketed with the bounded display page by the application.
 return result || jsonb_build_object('recorded_census',private.ask_native_episode_census(p_pet_id,p_keys,p_from,p_to),'recorded_inventory',jsonb_build_object(
   'version','ask-recorded-inventory.v1','ownerId',auth.uid(),'petId',p_pet_id,'keys',p_keys,
   'from',p_from,'to',p_to,'revision',rev,'snapshot',statement_timestamp(),
   'episodeCount',cardinality(ids),'careIds',care_ids,'claimIds',claim_ids,'failures',failures));
end $$;
revoke all on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) to authenticated;

notify pgrst,'reload schema';
