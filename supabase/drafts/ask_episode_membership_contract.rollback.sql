-- UNVALIDATED REVERSAL: restore the exact prior reader implementation.
begin;

create or replace function public.read_ask_episode_sources(p_pet_id uuid,p_keys text[],p_episode_ids uuid[] default null,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare episodes jsonb; sources jsonb; ids uuid[]; timeout_ms numeric;
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
          started_at,last_event_at,resolved_at,status,updated_at
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
        started_at,last_event_at,resolved_at,status,updated_at
      from public.pet_care_episodes where id=any(p_episode_ids)
        and user_id=auth.uid() and pet_profile_id=p_pet_id and normalized_key=any(p_keys)
    ) e;
  end if;
  -- One indexed, bounded membership probe per selected episode, including deleted
  -- rows. A ninth member invalidates completeness for that whole episode.
  select coalesce(jsonb_agg(to_jsonb(e) order by e.episode_id,e.occurred_at,e.created_at,e.id),'[]'::jsonb) into sources
  from unnest(ids[1:8]) i cross join lateral (
    select id,user_id,pet_profile_id,episode_id,category,
      case when length(title)<=200 then title else null end title,
      case when length(note)<=2000 then note else null end note,
      (length(note)>2000 or length(title)>200) as content_omitted,
      severity,occurred_at,created_at,updated_at,deleted_at
    from public.pet_care_entries where episode_id=i and user_id=auth.uid()
      and pet_profile_id=p_pet_id order by occurred_at,created_at,id limit 9
  ) e;
  return jsonb_build_object('episodes',episodes,'sources',sources,
    'coverage','bounded_candidates_not_complete','snapshot',statement_timestamp());
end $$;
revoke all on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
