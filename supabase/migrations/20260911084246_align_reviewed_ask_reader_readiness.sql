-- The writer-proven episode-alias migration changed the reviewed reader body.
-- Pin that exact, tested body; preserve all owner, role and definition checks.
do $migration$
declare
  definition text;
  old_hash constant text := 'df7965345a0c326eaf89c3b923d7cf73';
  reviewed_hash constant text := 'e55415cfe3420e87d60dfedbf695f117';
begin
  if md5(replace(pg_get_functiondef('public.read_ask_episode_sources(uuid,text[],uuid[],timestamptz,timestamptz)'::regprocedure),chr(13),'')) <> reviewed_hash then
    raise exception 'Episode reader does not match the reviewed implementation';
  end if;
  definition := pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])'::regprocedure);
  if (length(definition)-length(replace(definition,old_hash,'')))/length(old_hash) <> 1 then
    raise exception 'Unexpected Ask reader compatibility definition';
  end if;
  execute replace(definition,old_hash,reviewed_hash);
end;
$migration$;
