-- Restore conservative exact-key readers. No source data is changed.
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
    if (length(definition)-length(replace(definition,replacement,'')))/length(replacement)<>expected then
      raise exception 'Unexpected episode reader definition: %',fn;
    end if;
    execute replace(definition,replacement,old);
  end loop;
end $migration$;
drop function private.ask_episode_inventory_key(uuid,text);
notify pgrst,'reload schema';
