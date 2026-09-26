-- Public V1: a source-bound canonical AppendJob is reversible write authority.
-- The shared executor's earlier auto gate still requires:
-- LOW_RISK_REVERSIBLE + explicit_intent policy + explicit_intent=true.
-- This patch removes the older append-only confirmation restriction without
-- adding any wording inference or alternate write path.
do $$
declare
  definition text;
  revised text;
  old_guard text := E'    if p_mode <> ''confirm'' or v.explicit_intent\n'
    || E'      or v.action_payload#>>''{appendJob,operation}'' is distinct from ''append''';
  new_guard text := E'    if p_mode not in (''confirm'',''auto'')\n'
    || E'      or v.action_payload#>>''{appendJob,operation}'' is distinct from ''append''';
begin
  definition := pg_get_functiondef(
    'private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure
  );
  if position(old_guard in definition) = 0 then
    raise exception 'CANONICAL_APPEND_AUTO_GUARD_NOT_FOUND';
  end if;
  revised := replace(definition, old_guard, new_guard);
  if revised = definition then
    raise exception 'CANONICAL_APPEND_AUTO_GUARD_UNCHANGED';
  end if;
  execute revised;
end
$$;

-- Private authority remains private. Only the existing service-role wrapper
-- may enter the canonical capability executor.
revoke all on function private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
