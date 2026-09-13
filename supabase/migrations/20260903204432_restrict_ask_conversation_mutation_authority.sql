begin;

-- Ask history remains directly readable through owner-bound RLS, but every
-- mutation must cross Furvise's authenticated API and this service-only
-- contract. Remove both table-wide and historical column-scoped write grants.
revoke all privileges on table public.ask_conversations from authenticated;
revoke all privileges on table public.ask_conversation_messages from authenticated;
revoke update (care_persistence, response_data)
  on table public.ask_conversation_messages from authenticated;
grant select on table public.ask_conversations to authenticated;
grant select on table public.ask_conversation_messages to authenticated;

drop policy if exists "ask_conversations_insert_own" on public.ask_conversations;
drop policy if exists "ask_conversations_update_own" on public.ask_conversations;
drop policy if exists "ask_conversations_delete_own" on public.ask_conversations;
drop policy if exists "ask_conversation_messages_insert_own" on public.ask_conversation_messages;
drop policy if exists "ask_conversation_messages_update_own_reconciliation" on public.ask_conversation_messages;
drop policy if exists "ask_conversation_messages_delete_own" on public.ask_conversation_messages;

alter table public.ask_conversations enable row level security;
alter table public.ask_conversations force row level security;
alter table public.ask_conversation_messages enable row level security;
alter table public.ask_conversation_messages force row level security;

-- Extend the launch readiness contract so privilege or RPC drift fails closed.
alter function public.furvise_security_compatibility_snapshot_v2(text[])
  set schema private;
alter function private.furvise_security_compatibility_snapshot_v2(text[])
  rename to furvise_security_compatibility_snapshot_v2_pre_ask_authority;
revoke all on function private.furvise_security_compatibility_snapshot_v2_pre_ask_authority(text[])
  from public, anon, authenticated, service_role;

create function public.furvise_security_compatibility_snapshot_v2(
  p_required_migration_names text[]
)
returns table(contract_version integer, failed_checks text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failures text[] := '{}'::text[];
  v_prior_failures text[] := '{}'::text[];
  v_relation oid;
  v_function oid;
  v_signature text;
  v_definition text;
  v_authority_ok boolean := true;
  v_signatures text[] := array[
    'public.create_ask_conversation_exchange(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb)',
    'public.append_ask_conversation_exchange(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)',
    'public.begin_ask_conversation_turn(uuid,uuid,uuid,uuid,text,text,text)',
    'public.complete_ask_conversation_turn(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'public.update_ask_assistant_response(uuid,uuid,jsonb)',
    'public.finalize_ask_assistant_response(uuid,uuid,jsonb,jsonb)',
    'public.rename_ask_conversation(uuid,uuid,text)',
    'public.delete_ask_conversation(uuid,uuid)'
  ]::text[];
begin
  perform private.require_service_role_request();
  select snapshot.failed_checks into v_prior_failures
  from private.furvise_security_compatibility_snapshot_v2_pre_ask_authority(
    p_required_migration_names
  ) snapshot;
  v_failures := coalesce(v_prior_failures, '{}'::text[]);

  foreach v_relation in array array[
    'public.ask_conversations'::regclass::oid,
    'public.ask_conversation_messages'::regclass::oid
  ] loop
    v_authority_ok := v_authority_ok
      and (select class.relrowsecurity and class.relforcerowsecurity from pg_catalog.pg_class as class where class.oid = v_relation)
      and pg_catalog.has_table_privilege('authenticated', v_relation, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'DELETE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'TRUNCATE')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'TRIGGER')
      and not pg_catalog.has_table_privilege('authenticated', v_relation, 'REFERENCES')
      and not exists (
        select 1
        from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = v_relation
          and attribute.attnum > 0 and not attribute.attisdropped
          and (
            pg_catalog.has_column_privilege('authenticated', v_relation, attribute.attnum, 'INSERT')
            or pg_catalog.has_column_privilege('authenticated', v_relation, attribute.attnum, 'UPDATE')
            or pg_catalog.has_column_privilege('authenticated', v_relation, attribute.attnum, 'REFERENCES')
          )
      );
  end loop;

  v_authority_ok := v_authority_ok
    and exists (
      select 1 from pg_catalog.pg_policy as policy
      where policy.polrelid = 'public.ask_conversations'::regclass
        and policy.polname = 'ask_conversations_select_own' and policy.polcmd = 'r'
    )
    and exists (
      select 1 from pg_catalog.pg_policy as policy
      where policy.polrelid = 'public.ask_conversation_messages'::regclass
        and policy.polname = 'ask_conversation_messages_select_own' and policy.polcmd = 'r'
    )
    and not exists (
      select 1 from pg_catalog.pg_policy as policy
      where policy.polrelid in (
        'public.ask_conversations'::regclass,
        'public.ask_conversation_messages'::regclass
      ) and policy.polcmd in ('a', 'w', 'd')
    );

  foreach v_signature in array v_signatures loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    v_authority_ok := v_authority_ok and v_function is not null;
    if v_function is not null then
      select pg_catalog.pg_get_functiondef(v_function) into v_definition;
      v_authority_ok := v_authority_ok
        and (select proc.prosecdef from pg_catalog.pg_proc as proc where proc.oid = v_function)
        and coalesce((
          select proc.proconfig @> array['search_path=""']::text[]
          from pg_catalog.pg_proc as proc where proc.oid = v_function
        ), false)
        and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
        and v_definition ~* 'private[.]require_service_role_request';
    end if;
  end loop;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = any(array[
        'create_ask_conversation_exchange', 'append_ask_conversation_exchange',
        'begin_ask_conversation_turn', 'complete_ask_conversation_turn',
        'update_ask_assistant_response', 'finalize_ask_assistant_response',
        'rename_ask_conversation', 'delete_ask_conversation'
      ]::name[])
  ) <> 8 then
    v_authority_ok := false;
  end if;

  if not v_authority_ok then
    v_failures := pg_catalog.array_append(v_failures, 'ask_conversation_mutation_authority');
  end if;
  return query
  select 2, array(
    select distinct failure
    from pg_catalog.unnest(v_failures) as failure
    order by failure
  );
end;
$$;

revoke all on function public.furvise_security_compatibility_snapshot_v2(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.furvise_security_compatibility_snapshot_v2(text[])
  to service_role;

comment on function public.furvise_security_compatibility_snapshot_v2(text[]) is
  'Service-only V2 readiness contract including the Ask conversation direct-write boundary.';

notify pgrst, 'reload schema';
commit;
