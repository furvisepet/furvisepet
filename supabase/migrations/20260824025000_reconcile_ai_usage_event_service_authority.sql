begin;

-- Production historically retained direct service-role DML on ai_usage_events,
-- while a clean migration replay correctly routes AI-credit mutation through the
-- reviewed SECURITY DEFINER RPC boundary. Reconcile deployed authority to the
-- canonical clean-replay model. This is a no-op on already-canonical databases.
revoke select, insert, update, delete
  on table public.ai_usage_events
  from service_role;

do $$
begin
  if pg_catalog.has_table_privilege('service_role', 'public.ai_usage_events', 'SELECT')
    or pg_catalog.has_table_privilege('service_role', 'public.ai_usage_events', 'INSERT')
    or pg_catalog.has_table_privilege('service_role', 'public.ai_usage_events', 'UPDATE')
    or pg_catalog.has_table_privilege('service_role', 'public.ai_usage_events', 'DELETE') then
    raise exception using errcode = '55000', message = 'AI_USAGE_EVENT_SERVICE_DML_AUTHORITY_REMAINS';
  end if;
end;
$$;

comment on table public.ai_usage_events is
  'AI usage ledger mutated through reviewed service-executable credit RPCs; direct service_role DML is intentionally denied.';

commit;
