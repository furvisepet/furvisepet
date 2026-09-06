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
 join public.ask_conversations c on c.id=msg.conversation_id and c.user_id=p.user_id and c.pet_profile_id=p.pet_id
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
     and c.user_id=p_user_id and c.pet_profile_id=p_pet_id for share of msg,c;
   if source_text is null or proof->>'version' is distinct from 'ask-governed-source.v1'
     or proof->>'sourceHash' is distinct from encode(extensions.digest(convert_to(source_text,'UTF8'),'sha256'),'hex')
     or proof->>'noteHash' is distinct from encode(extensions.digest(convert_to(p_event->>'sourceExcerpt','UTF8'),'sha256'),'hex')
     or proof->>'petId' is distinct from p_pet_id::text
     or coalesce(proof->>'inventoryTopic','') not in ('vomiting','soft_stool','breathing','outside_supported_topics')
     or proof->>'topic' is distinct from p_event->>'topic'
     or proof->>'transition' is distinct from p_event->>'transition'
     or proof->>'transition' not in ('started','continued','observed','confirmed')
     or not (proof ? 'priorEpisodeId') then
     raise exception using errcode='22023',message='RECORDED_SOURCE_PROVENANCE_INVALID';
   end if;
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
         else 'unknown' end;
       insert into private.ask_recorded_source_evidence values(e.id,p_user_id,p_pet_id,p_source_message_id,m.id,
         proof || jsonb_build_object('ownerId',p_user_id,'careId',e.id,'episodeId',e.episode_id,'membershipId',m.id,'role',role),
         encode(extensions.digest(convert_to(to_jsonb(e)::text,'UTF8'),'sha256'),'hex'),
         encode(extensions.digest(convert_to(to_jsonb(m)::text,'UTF8'),'sha256'),'hex'));
     end if;
   end if;
   return query select r.persistence_status,r.care_entry_id,r.episode_id,r.normalized_topic,r.resulting_state,r.already_persisted;
 end loop;
end $$;
revoke all on function public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.persist_furvise_server_semantic_event(uuid,uuid,uuid,jsonb) to service_role;
commit;
