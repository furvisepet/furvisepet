-- Forward-only task-writer coexistence guard. Historical definitions remain immutable.
-- Both exact retained signatures are REQUIRED. Missing V2 aborts this statement;
-- it is not invented or silently described as guarded on a source-only install.
-- READ COMMITTED sequential proof only: no deadlock/two-session/isolation guarantee.
DO $task_guard$
declare target record; fn oid; before_row jsonb; after_row jsonb;
  definition text; revised text; old_body text; expected_body text;
  before_defaults text; after_defaults text;
  lock_anchor constant text := $lock$where id=p_source_id and conversation_id=p_conversation_id and user_id=p_user_id and role='user' for share;$lock$;
  lock_replacement constant text := $lock$where id=p_source_id and conversation_id=p_conversation_id and user_id=p_user_id and role='user' for update;$lock$;
  branch_anchor constant text := $branch$  else
    if p_pet_id is not null then$branch$;
  branch_replacement constant text := $branch$  else
    if private.is_canonical_ask_source(p_source_id) then
      raise exception using errcode='42501',message='CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN';
    end if;
    if p_pet_id is not null then$branch$;
begin
  -- Resolve both before replacing either; the entire DO is atomic on failure.
  for target in select * from (values
    ('public.apply_ask_task(uuid,uuid,uuid,text,uuid,text,uuid,uuid,integer,timestamptz,text,boolean)','9023f4851b79f9f5cb8c1a98eae661a19608f652d5acaa3b055c38d755e008ed','06badbad96eb839ae171e17206606637b809a5cbbb6486b9cd6cb3693fbe0092','386c3a6813aae7677ac7219883b13261cbcd076d8c54e7232728b2baaf90bfec','cc2cd071b363139c38624e08e4d731deae2f38ba1bd7e04465d575354f5e11d4'),
    ('public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)','9f2c87b6662c434ba4e9b168090bb32375ddc17be13e2eee76aaab9306ac53ca','82d9c2841051260b3945c0a16f1c79b71b78dd7c96b23e062805a7eb294d28f3','d8708ff8f15a62b19dabf3b96463fb4afa314f9f10bab9079dde2ff721753a10','c11e687c88b11c68158e66c671a7b39c01e80dcf558af5d85e107e0f0ae2fdf2')
  ) as known(signature,before_hash,after_hash,before_definition_hash,after_definition_hash) loop
    fn:=pg_catalog.to_regprocedure(target.signature);
    if fn is null then raise exception 'TASK_WRITER_REQUIRED_SIGNATURE_MISSING: %',target.signature; end if;
  end loop;
  if pg_catalog.to_regprocedure('private.is_canonical_ask_source(uuid)') is null then
    raise exception 'TASK_WRITER_CANONICAL_HELPER_REQUIRED';
  end if;
  for target in select * from (values
    ('public.apply_ask_task(uuid,uuid,uuid,text,uuid,text,uuid,uuid,integer,timestamptz,text,boolean)','9023f4851b79f9f5cb8c1a98eae661a19608f652d5acaa3b055c38d755e008ed','06badbad96eb839ae171e17206606637b809a5cbbb6486b9cd6cb3693fbe0092','386c3a6813aae7677ac7219883b13261cbcd076d8c54e7232728b2baaf90bfec','cc2cd071b363139c38624e08e4d731deae2f38ba1bd7e04465d575354f5e11d4'),
    ('public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)','9f2c87b6662c434ba4e9b168090bb32375ddc17be13e2eee76aaab9306ac53ca','82d9c2841051260b3945c0a16f1c79b71b78dd7c96b23e062805a7eb294d28f3','d8708ff8f15a62b19dabf3b96463fb4afa314f9f10bab9079dde2ff721753a10','c11e687c88b11c68158e66c671a7b39c01e80dcf558af5d85e107e0f0ae2fdf2')
  ) as known(signature,before_hash,after_hash,before_definition_hash,after_definition_hash) loop
    fn:=pg_catalog.to_regprocedure(target.signature);
    select to_jsonb(p),p.prosrc,pg_catalog.pg_get_expr(p.proargdefaults,0)
      into strict before_row,old_body,before_defaults from pg_catalog.pg_proc p where p.oid=fn;
    if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(old_body,'UTF8')),'hex')<>target.before_hash
      or before_row->>'prosecdef'<>'true' or pg_catalog.pg_get_userbyid((before_row->>'proowner')::oid)<>'postgres'
      or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(fn),'UTF8')),'hex')<>target.before_definition_hash
      or before_row->>'provolatile'<>'v' or before_row->>'prokind'<>'f'
      or before_row->'proconfig' is distinct from jsonb_build_array('search_path=""')
      or (before_row->>'prorettype')::oid<>'jsonb'::regtype
      or not pg_catalog.has_function_privilege('service_role',fn,'EXECUTE')
      or pg_catalog.has_function_privilege('anon',fn,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'TASK_WRITER_EXACT_SOURCE_OR_SECURITY_PRECONDITION: %',target.signature;
    end if;
    if (length(old_body)-length(replace(old_body,lock_anchor,'')))/length(lock_anchor)<>1
      or (length(old_body)-length(replace(old_body,branch_anchor,'')))/length(branch_anchor)<>1 then
      raise exception 'TASK_WRITER_UNIQUE_ANCHOR_REQUIRED: %',target.signature;
    end if;
    expected_body:=replace(replace(old_body,lock_anchor,lock_replacement),branch_anchor,branch_replacement);
    if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(expected_body,'UTF8')),'hex')<>target.after_hash then
      raise exception 'TASK_WRITER_EXACT_RESULT_REQUIRED: %',target.signature;
    end if;
    definition:=pg_catalog.pg_get_functiondef(fn);
    revised:=replace(replace(definition,lock_anchor,lock_replacement),branch_anchor,branch_replacement);
    execute revised;
    select to_jsonb(p),pg_catalog.pg_get_expr(p.proargdefaults,0)
      into strict after_row,after_defaults from pg_catalog.pg_proc p where p.oid=fn;
    if after_row->>'prosrc' is distinct from expected_body
      -- Default parse-tree character offsets are not default semantics. Compare
      -- their canonical expressions and the entire emitted definition exactly.
      or (after_row-array['prosrc','proargdefaults']) is distinct from (before_row-array['prosrc','proargdefaults'])
      or after_defaults is distinct from before_defaults
      or pg_catalog.pg_get_functiondef(fn) is distinct from revised
      or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(revised,'UTF8')),'hex')<>target.after_definition_hash then
      raise exception 'TASK_WRITER_CATALOG_OR_BODY_POSTCONDITION: %',target.signature;
    end if;
  end loop;
end
$task_guard$;
