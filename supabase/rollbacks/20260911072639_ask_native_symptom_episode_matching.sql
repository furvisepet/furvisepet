-- Native symptom writers retain an unprefixed topic when rebuilding summary.
-- Match that typed identity without changing ownership, ambiguity, chronology,
-- advisory locks, source proofs, or the canonical writer's execution grants.
do $migration$
declare
  definition text := pg_get_functiondef('public.persist_furvise_semantic_event_exact_20260807(uuid,uuid,uuid,jsonb)'::regprocedure);
  old_predicate text := $old$(episode_row.normalized_key = v_key or (v_domain = 'health' and episode_row.episode_type = 'symptom' and episode_row.normalized_key = v_topic and coalesce(episode_row.summary->>'semanticDomain', 'health') = 'health'))$old$;
  new_predicate text := $new$episode_row.normalized_key = v_key$new$;
begin
  if (length(definition) - length(replace(definition, old_predicate, ''))) / length(old_predicate) <> 3 then
    raise exception 'Unexpected native symptom writer definition';
  end if;
  execute replace(definition, old_predicate, new_predicate);
end
$migration$;
