-- PREPARATION ONLY: apply before the revised ask_recorded_completeness draft.
-- No backfill. Only new, current server semantic writes may acquire provenance.
begin;
create table private.ask_recorded_source_evidence (
 care_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 pet_id uuid not null, source_message_id uuid not null, membership_id uuid not null,
 evidence jsonb not null, care_hash text not null check(care_hash ~ '^[a-f0-9]{64}$'),
 member_hash text not null check(member_hash ~ '^[a-f0-9]{64}$')
);
alter table private.ask_recorded_source_evidence enable row level security;
revoke all on private.ask_recorded_source_evidence from public,anon,authenticated,service_role;
create function private.read_ask_recorded_source_evidence(p_care_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select p.evidence from private.ask_recorded_source_evidence p
 join public.pet_care_entries e on e.id=p.care_id and e.user_id=p.user_id and e.pet_profile_id=p.pet_id
 join public.pet_care_episode_events m on m.id=p.membership_id and m.care_entry_id=e.id
   and m.user_id=p.user_id and m.pet_profile_id=p.pet_id and m.episode_id=e.episode_id
 join public.ask_conversation_messages msg on msg.id=p.source_message_id and msg.user_id=p.user_id and msg.role='user'
 join public.ask_conversations c on c.id=msg.conversation_id and c.user_id=p.user_id
 join public.dog_profiles pet on pet.id=p.pet_id and pet.user_id=p.user_id
 where p.care_id=p_care_id and p.user_id=auth.uid() and e.deleted_at is null
   and p.care_hash=encode(extensions.digest(convert_to(to_jsonb(e)::text,'UTF8'),'sha256'),'hex')
   and p.member_hash=encode(extensions.digest(convert_to(to_jsonb(m)::text,'UTF8'),'sha256'),'hex')
   and p.evidence->>'sourceHash'=encode(extensions.digest(convert_to(msg.user_text,'UTF8'),'sha256'),'hex')
   and p.evidence->>'noteHash'=encode(extensions.digest(convert_to(e.note,'UTF8'),'sha256'),'hex')
$$;
revoke all on function private.read_ask_recorded_source_evidence(uuid) from public,anon,authenticated,service_role;
create or replace function public.persist_furvise_server_semantic_event(
 p_user_id uuid,p_pet_id uuid,p_source_message_id uuid,p_event jsonb
) returns table(persistence_status text,care_entry_id uuid,episode_id uuid,normalized_topic text,resulting_state text,already_persisted boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare r record; source_text text; proof jsonb:=p_event->'recordedEvidence'; e public.pet_care_entries;
 m public.pet_care_episode_events; role text;
begin
 perform private.set_furvise_server_actor(p_user_id);
 if proof is not null then
   select msg.user_text into source_text from public.ask_conversation_messages msg
   join public.ask_conversations c on c.id=msg.conversation_id
   where msg.id=p_source_message_id and msg.user_id=p_user_id and msg.role='user'
     and c.user_id=p_user_id for share of msg,c;
   if source_text is null or proof->>'version' is distinct from 'ask-governed-source.v1'
     or proof->>'sourceHash' is distinct from encode(extensions.digest(convert_to(source_text,'UTF8'),'sha256'),'hex')
     or proof->>'noteHash' is distinct from encode(extensions.digest(convert_to(p_event->>'sourceExcerpt','UTF8'),'sha256'),'hex')
     or proof->>'petId' is distinct from p_pet_id::text
     or coalesce(proof->>'inventoryTopic','') not in ('vomiting','soft_stool','breathing','outside_supported_topics')
     or proof->>'topic' is distinct from p_event->>'topic'
     or proof->>'transition' is distinct from p_event->>'transition'
     or proof->>'transition' not in ('started','continued','observed','confirmed','resolved')
     or not (proof ? 'priorEpisodeId') then
     raise exception using errcode='22023',message='RECORDED_SOURCE_PROVENANCE_INVALID';
   end if;
   if proof ? 'assessment' and (
     proof#>>'{assessment,policy}' is distinct from 'ask-semantic-boundary.v1'
     or coalesce(proof#>>'{assessment,kind}','') not in ('opening','continuation','resolution')
     or coalesce(proof#>>'{assessment,evidence}','') = ''
     or position(proof#>>'{assessment,evidence}' in source_text)=0
     or position(proof#>>'{assessment,evidence}' in p_event->>'sourceExcerpt')=0
     or coalesce((proof#>>'{assessment,confidence}')::numeric,0) not between 0.95 and 1
     or proof#>>'{assessment,kind}' is distinct from case proof->>'transition'
       when 'started' then 'opening' when 'continued' then 'continuation' when 'resolved' then 'resolution' end
   ) then raise exception using errcode='22023',message='RECORDED_BOUNDARY_ASSESSMENT_INVALID'; end if;
 end if;
 if not exists(select 1 from public.dog_profiles where id=p_pet_id and user_id=p_user_id) then
   raise exception using errcode='42501',message='SEMANTIC_EVENT_PET_NOT_OWNED';
 end if;
 -- The underlying compatibility writer updates titles/timestamps even on a
 -- replay. Return the existing owned source before that mutation so retries do
 -- not invalidate its proof or a previously displayed reference.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_pet_id::text || ':semantic-source:' || p_source_message_id::text,0));
 select ce.* into e from public.pet_care_entries ce where ce.user_id=p_user_id and ce.pet_profile_id=p_pet_id
   and ce.intelligence_source_message_id=p_source_message_id for update;
 if e.id is not null then
   return query select 'persisted'::text,e.id,e.episode_id,
     coalesce((select ep.normalized_key from public.pet_care_episodes ep where ep.id=e.episode_id),p_event->>'topic'),
     e.care_event_metadata->>'semanticState',true;
   return;
 end if;
 for r in select * from public.persist_furvise_semantic_event(p_user_id,p_pet_id,p_source_message_id,p_event-'recordedEvidence') loop
   -- Replays cannot bless old rows, or overwrite a snapshot after a correction.
   if proof is not null and not r.already_persisted and r.care_entry_id is not null then
     select ce.* into e from public.pet_care_entries ce where ce.id=r.care_entry_id and ce.user_id=p_user_id and ce.pet_profile_id=p_pet_id;
     select em.* into m from public.pet_care_episode_events em where em.care_entry_id=e.id and em.episode_id=e.episode_id
       and em.user_id=p_user_id and em.pet_profile_id=p_pet_id;
     if m.id is not null and e.note=p_event->>'sourceExcerpt' then
       role:=case
         when proof->>'transition'='started' and proof->>'priorEpisodeId' is null and m.event_role='opening' then 'opening'
         when proof->>'transition'='continued' and proof->>'priorEpisodeId'=e.episode_id::text and m.event_role='continuation' then 'continuation'
         when proof->>'transition'='resolved' and proof->>'priorEpisodeId'=e.episode_id::text and m.event_role='resolution'
           and proof#>>'{assessment,kind}'='resolution' then 'resolution'
         else 'unknown' end;
       insert into private.ask_recorded_source_evidence values(e.id,p_user_id,p_pet_id,p_source_message_id,m.id,
         proof || jsonb_build_object('ownerId',p_user_id,'careId',e.id,'episodeId',e.episode_id,'membershipId',m.id,'role',role),
         encode(extensions.digest(convert_to(to_jsonb(e)::text,'UTF8'),'sha256'),'hex'),
         encode(extensions.digest(convert_to(to_jsonb(m)::text,'UTF8'),'sha256'),'hex'));
       -- The base writer serializes the owner/pet/topic and increments sequence.
       -- Retain the preceding resolved recorded episode as recurrence identity.
       if role='opening' then
         update public.pet_care_episodes ep set recurrence_of=(
           select prior.id from public.pet_care_episodes prior
           where prior.user_id=p_user_id and prior.pet_profile_id=p_pet_id
             and prior.normalized_key=ep.normalized_key and prior.status='resolved'
             and prior.sequence_number<ep.sequence_number and prior.last_event_at<=ep.started_at
           order by prior.sequence_number desc limit 1
         ) where ep.id=e.episode_id and ep.user_id=p_user_id and ep.pet_profile_id=p_pet_id
           and ep.recurrence_of is null;
       end if;
     end if;
   end if;
   return query select r.persistence_status,r.care_entry_id,r.episode_id,r.normalized_topic,r.resulting_state,r.already_persisted;
 end loop;
end $$;
revoke all on function public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb) to service_role;
commit;
