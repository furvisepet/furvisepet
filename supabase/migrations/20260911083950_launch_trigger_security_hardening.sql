-- These legacy timestamp triggers use only pg_catalog.now() and NEW.
-- Pin resolution without replacing their implementation, owner or trigger wiring.
do $$
declare
  function_name text;
  target regprocedure;
begin
  foreach function_name in array array[
    'ask_furvise_usage_touch_updated_at',
    'shop_search_usage_touch_updated_at',
    'shop_query_interpretations_touch_updated_at',
    'product_question_usage_touch_updated_at',
    'product_ai_usage_touch_updated_at'
  ] loop
    target := to_regprocedure(format('public.%I()', function_name));
    if target is not null then
      execute format('alter function %s set search_path = pg_catalog', target);
    end if;
  end loop;
  -- Installed by the project operator; event triggers are not browser RPCs.
  -- Keep the automatic-RLS event trigger and its owner fully operational.
  target := to_regprocedure('public.rls_auto_enable()');
  if target is not null then
    if (select prorettype <> 'event_trigger'::regtype from pg_proc where oid = target) then
      raise exception 'Unexpected rls_auto_enable signature';
    end if;
    execute format('revoke execute on function %s from public, anon, authenticated', target);
  end if;
end;
$$;
