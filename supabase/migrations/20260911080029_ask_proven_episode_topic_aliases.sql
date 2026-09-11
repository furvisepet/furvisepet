-- Resolve generated topic aliases only through intact, owner-scoped writer proof.
-- No row, source hash, episode identity, correction edge or removal debt changes.
create or replace function private.ask_episode_inventory_key(p_episode_id uuid,p_key text)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((
    select min(proof->>'inventoryTopic') from (
      select private.read_ask_recorded_source_evidence(c.id) proof
      from public.pet_care_entries c
      join public.pet_care_episodes ep on ep.id=c.episode_id and ep.user_id=c.user_id
        and ep.pet_profile_id=c.pet_profile_id
      where c.user_id=auth.uid() and ep.id=p_episode_id and ep.normalized_key=p_key
        and ep.episode_type='symptom'
    ) evidence
    where proof->>'role'='opening' and proof->>'episodeId'=p_episode_id::text
      and proof->>'topic'=regexp_replace(p_key,'^health_','')
      and proof->>'inventoryTopic' in ('vomiting','soft_stool','breathing')
    having count(distinct proof->>'inventoryTopic')=1
  ),regexp_replace(p_key,'^health_',''));
$$;
revoke all on function private.ask_episode_inventory_key(uuid,text) from public,anon,authenticated,service_role;

-- Guard against silently patching a changed function definition.
do $migration$
declare
  fn regprocedure; definition text; old text; replacement text; expected integer;
begin
  for fn,old,replacement,expected in select * from (values
    ('public.read_ask_recorded_membership_batch(uuid,text[],uuid[],timestamp with time zone,timestamp with time zone)'::regprocedure,
      $a$regexp_replace(normalized_key,'^health_','') as normalized_key$a$,
      $b$private.ask_episode_inventory_key(id,normalized_key) as normalized_key$b$,2),
    ('public.read_ask_recorded_membership_batch(uuid,text[],uuid[],timestamp with time zone,timestamp with time zone)'::regprocedure,
      $a$normalized_key in (k,'health_'||k)$a$,
      $b$private.ask_episode_inventory_key(id,normalized_key)=k$b$,1),
    ('public.read_ask_recorded_membership_batch(uuid,text[],uuid[],timestamp with time zone,timestamp with time zone)'::regprocedure,
      $a$(normalized_key=any(p_keys) or normalized_key=any(select 'health_'||k from unnest(p_keys) k))$a$,
      $b$private.ask_episode_inventory_key(id,normalized_key)=any(p_keys)$b$,1),
    ('public.read_ask_episode_sources(uuid,text[],uuid[],timestamp with time zone,timestamp with time zone)'::regprocedure,
      $a$(normalized_key=any(p_keys) or normalized_key=any(select 'health_'||k from unnest(p_keys) k))$a$,
      $b$private.ask_episode_inventory_key(id,normalized_key)=any(p_keys)$b$,1),
    ('private.ask_native_episode_census(uuid,text[],timestamp with time zone,timestamp with time zone)'::regprocedure,
      $a$regexp_replace(e.normalized_key,'^health_','')=any(p_keys)$a$,
      $b$private.ask_episode_inventory_key(e.id,e.normalized_key)=any(p_keys)$b$,1)
  ) replacements(fn,old,replacement,expected) loop
    select pg_get_functiondef(fn) into definition;
    if (length(definition)-length(replace(definition,old,'')))/length(old)<>expected then
      raise exception 'Unexpected episode reader definition: %',fn;
    end if;
    execute replace(definition,old,replacement);
  end loop;
end $migration$;
notify pgrst,'reload schema';
