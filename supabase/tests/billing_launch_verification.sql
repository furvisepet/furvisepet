begin;

do $$
declare
  v_free_user constant uuid := '41000000-0000-4000-8000-000000000001';
  v_plus_user constant uuid := '42000000-0000-4000-8000-000000000002';
  v_request uuid;
  v_result record;
  v_status record;
  v_outcome text;
  v_count integer;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
  values
    (v_free_user, 'authenticated', 'authenticated', 'billing-free@example.test', '', now(), now(), now()),
    (v_plus_user, 'authenticated', 'authenticated', 'billing-plus@example.test', '', now(), now(), now())
  on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

  delete from public.ai_usage_events where user_id in (v_free_user, v_plus_user);
  delete from public.billing_accounts where user_id in (v_free_user, v_plus_user);

  if has_table_privilege('authenticated', 'public.billing_accounts', 'select')
    or has_table_privilege('authenticated', 'public.billing_accounts', 'insert')
    or has_table_privilege('authenticated', 'public.billing_accounts', 'update') then
    raise exception 'authenticated role has direct authoritative billing privileges';
  end if;
  if has_function_privilege('authenticated', 'public.register_stripe_billing_customer(uuid,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.apply_stripe_subscription_projection(uuid,text,text,text,text,boolean,text,timestamptz,timestamptz,boolean,text,text,timestamptz)', 'execute') then
    raise exception 'authenticated role can write authoritative Stripe projection';
  end if;

  perform set_config('request.jwt.claim.sub', v_free_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  for v_count in 1..8 loop
    v_request := ('41000000-0000-4000-8000-' || lpad(v_count::text, 12, '0'))::uuid;
    select * into strict v_result from public.reserve_ai_credit(v_request, 'ask');
    if v_result.reservation_status <> 'reserved' then raise exception 'Free Ask % did not reserve: %', v_count, row_to_json(v_result); end if;
    select * into strict v_result from public.complete_ai_credit(v_request);
  end loop;
  select * into strict v_status from public.get_my_ask_allowance_status();
  if v_status.allowance <> 8 or v_status.used <> 8 or v_status.remaining <> 0 then
    raise exception 'Free allowance incorrect: %', row_to_json(v_status);
  end if;
  select * into strict v_result from public.reserve_ai_credit('41000000-0000-4000-8000-000000000009', 'ask');
  if v_result.reservation_status <> 'limit_reached' then raise exception '9th Free Ask was admitted'; end if;

  insert into public.billing_accounts (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_currency, checkout_price_id,
    plan, subscription_status, current_period_start, current_period_end
  ) values (
    v_plus_user, 'cus_plus_test', 'sub_plus_test', 'price_plus_test', 'usd', 'price_plus_test',
    'plus', 'active', now() - interval '1 day', now() + interval '29 days'
  );
  perform set_config('request.jwt.claim.sub', v_plus_user::text, true);
  for v_count in 1..55 loop
    v_request := ('42000000-0000-4000-8000-' || lpad(v_count::text, 12, '0'))::uuid;
    select * into strict v_result from public.reserve_ai_credit(v_request, 'ask');
    if v_result.reservation_status <> 'reserved' then raise exception 'Plus Ask % did not reserve: %', v_count, row_to_json(v_result); end if;
    select * into strict v_result from public.complete_ai_credit(v_request);
  end loop;
  select * into strict v_status from public.get_my_ask_allowance_status();
  if v_status.allowance <> 55 or v_status.used <> 55 or v_status.remaining <> 0 or v_status.billing_plan <> 'plus' then
    raise exception 'Plus allowance incorrect: %', row_to_json(v_status);
  end if;
  select * into strict v_result from public.reserve_ai_credit('42000000-0000-4000-8000-000000000056', 'ask');
  if v_result.reservation_status <> 'limit_reached' then raise exception '56th Plus Ask was admitted'; end if;

  select * into strict v_result from public.reserve_ai_credit('42000000-0000-4000-8000-000000000001', 'ask');
  if v_result.reservation_status <> 'completed' then raise exception 'completed replay was not idempotent'; end if;
  select count(*)::integer into v_count from public.ai_usage_events
  where user_id = v_plus_user and request_id = '42000000-0000-4000-8000-000000000001';
  if v_count <> 1 then raise exception 'canonical replay created duplicate allowance rows'; end if;

  select public.apply_stripe_subscription_projection(
    v_plus_user, 'cus_plus_test', 'sub_plus_test', 'price_plus_test', 'usd', true, 'canceled',
    now() - interval '1 day', now() + interval '29 days', false,
    'evt_newer_cancel', 'customer.subscription.deleted', now()
  ) into v_outcome;
  if v_outcome <> 'free_active' then raise exception 'cancellation did not fall back safely: %', v_outcome; end if;
  select public.apply_stripe_subscription_projection(
    v_plus_user, 'cus_plus_test', 'sub_plus_test', 'price_plus_test', 'cad', true, 'active',
    now() - interval '1 day', now() + interval '29 days', false,
    'evt_older_active', 'customer.subscription.updated', now() - interval '1 hour'
  ) into v_outcome;
  if v_outcome <> 'ignored_stale' then raise exception 'stale webhook was not ignored: %', v_outcome; end if;
  select public.apply_stripe_subscription_projection(
    v_plus_user, 'cus_plus_test', 'sub_plus_test', 'price_plus_test', 'usd', true, 'canceled',
    now() - interval '1 day', now() + interval '29 days', false,
    'evt_newer_cancel', 'customer.subscription.deleted', now()
  ) into v_outcome;
  if v_outcome <> 'replayed' then raise exception 'webhook replay was not idempotent: %', v_outcome; end if;

  perform set_config('request.jwt.claim.sub', v_plus_user::text, true);
  select * into strict v_status from public.get_my_ask_allowance_status();
  if v_status.billing_plan <> 'free' or v_status.allowance <> 8 then
    raise exception 'canceled subscription did not resolve Free: %', row_to_json(v_status);
  end if;
end;
$$;

do $$
declare
  v_projection_user constant uuid := '43000000-0000-4000-8000-000000000003';
  v_other_user constant uuid := '44000000-0000-4000-8000-000000000004';
  v_reset_user constant uuid := '45000000-0000-4000-8000-000000000005';
  v_result record;
  v_status record;
  v_outcome text;
  v_status_name text;
  v_event_number integer := 10;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
  values
    (v_projection_user, 'authenticated', 'authenticated', 'billing-projection@example.test', '', now(), now(), now()),
    (v_other_user, 'authenticated', 'authenticated', 'billing-other@example.test', '', now(), now(), now()),
    (v_reset_user, 'authenticated', 'authenticated', 'billing-reset@example.test', '', now(), now(), now());

  if not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'billing_accounts'
      and relation.relrowsecurity and relation.relforcerowsecurity
  ) then raise exception 'billing_accounts RLS is not enabled and forced'; end if;
  if has_table_privilege('authenticated', 'public.billing_accounts', 'select')
    or has_table_privilege('authenticated', 'public.billing_accounts', 'insert')
    or has_table_privilege('authenticated', 'public.billing_accounts', 'update')
    or has_table_privilege('authenticated', 'public.billing_accounts', 'delete') then
    raise exception 'authenticated role has a direct billing_accounts privilege';
  end if;
  if has_schema_privilege('authenticated', 'private', 'usage')
    or has_table_privilege('authenticated', 'private.stripe_webhook_events', 'select')
    or has_function_privilege('authenticated', 'private.resolve_active_billing_plan(uuid)', 'execute')
    or has_function_privilege('authenticated', 'private.resolve_ask_allowance(uuid)', 'execute') then
    raise exception 'authenticated role can access private billing authority';
  end if;
  if exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.proname in (
        'register_stripe_billing_customer', 'apply_stripe_subscription_projection',
        'resolve_active_billing_plan', 'resolve_ask_allowance', 'reserve_ai_credit',
        'complete_ai_credit', 'release_ai_credit'
      )
      and procedure.prosecdef
      and not ('search_path=pg_catalog' = any(coalesce(procedure.proconfig, '{}'::text[])))
  ) then raise exception 'billing security-definer function has an unsafe search_path'; end if;

  perform public.register_stripe_billing_customer(v_projection_user, 'cus_projection_test', 'price_plus_test');
  select * into strict v_status from private.resolve_ask_allowance(v_projection_user);
  if v_status.billing_plan <> 'free' or v_status.allowance <> 8 then
    raise exception 'registered customer without subscription was not Free: %', row_to_json(v_status);
  end if;

  select public.apply_stripe_subscription_projection(
    v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_unknown', 'usd', false, 'active',
    now() - interval '1 day', now() + interval '29 days', false,
    'evt_projection_unknown', 'customer.subscription.updated', now()
  ) into v_outcome;
  select * into strict v_status from private.resolve_ask_allowance(v_projection_user);
  if v_outcome <> 'free_active' or v_status.billing_plan <> 'free' or v_status.allowance <> 8 then
    raise exception 'unknown Stripe Price granted Plus: %, %', v_outcome, row_to_json(v_status);
  end if;

  foreach v_status_name in array array['past_due', 'unpaid', 'canceled'] loop
    v_event_number := v_event_number + 1;
    select public.apply_stripe_subscription_projection(
      v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_plus_test', 'usd', true, v_status_name,
      now() - interval '1 day', now() + interval '29 days', false,
      'evt_projection_status_' || v_event_number, 'customer.subscription.updated', now() + make_interval(secs => v_event_number)
    ) into v_outcome;
    select * into strict v_status from private.resolve_ask_allowance(v_projection_user);
    if v_outcome <> 'free_active' or v_status.billing_plan <> 'free' or v_status.allowance <> 8 then
      raise exception '% subscription granted Plus: %, %', v_status_name, v_outcome, row_to_json(v_status);
    end if;
  end loop;

  v_event_number := v_event_number + 1;
  perform public.apply_stripe_subscription_projection(
    v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_plus_test', 'usd', true, 'active',
    now() - interval '30 days', now() - interval '1 day', false,
    'evt_projection_expired', 'customer.subscription.updated', now() + make_interval(secs => v_event_number)
  );
  select * into strict v_status from private.resolve_ask_allowance(v_projection_user);
  if v_status.billing_plan <> 'free' or v_status.allowance <> 8 then
    raise exception 'expired active subscription granted Plus: %', row_to_json(v_status);
  end if;

  v_event_number := v_event_number + 1;
  perform public.apply_stripe_subscription_projection(
    v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_plus_test', 'cad', true, 'active',
    now() + interval '1 day', now() + interval '31 days', false,
    'evt_projection_future', 'customer.subscription.updated', now() + make_interval(secs => v_event_number)
  );
  select * into strict v_status from private.resolve_ask_allowance(v_projection_user);
  if v_status.billing_plan <> 'free' or v_status.allowance <> 8 then
    raise exception 'future active subscription granted Plus: %', row_to_json(v_status);
  end if;

  v_event_number := v_event_number + 1;
  select public.apply_stripe_subscription_projection(
    v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_plus_test', 'usd', true, 'active',
    now() - interval '29 days', now() + interval '1 day', false,
    'evt_projection_usd', 'customer.subscription.updated', now() + make_interval(secs => v_event_number)
  ) into v_outcome;
  select * into strict v_status from private.resolve_ask_allowance(v_projection_user);
  if v_outcome <> 'plus_active' or v_status.billing_plan <> 'plus' or v_status.allowance <> 55
    or (select stripe_currency from public.billing_accounts where user_id = v_projection_user) <> 'usd' then
    raise exception 'recognized USD subscription did not grant Plus: %, %', v_outcome, row_to_json(v_status);
  end if;

  perform set_config('request.jwt.claim.sub', v_projection_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select * into strict v_result from public.reserve_ai_credit('43000000-0000-4000-8000-000000000101', 'ask');
  select * into strict v_result from public.complete_ai_credit('43000000-0000-4000-8000-000000000101');
  if v_result.remaining <> 54 then raise exception 'Plus period did not consume one canonical Ask: %', row_to_json(v_result); end if;

  v_event_number := v_event_number + 1;
  select public.apply_stripe_subscription_projection(
    v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_plus_test', 'cad', true, 'active',
    now() - interval '1 second', now() + interval '30 days', false,
    'evt_projection_cad_renewal', 'customer.subscription.updated', now() + make_interval(secs => v_event_number)
  ) into v_outcome;
  select * into strict v_status from public.get_my_ask_allowance_status();
  if v_outcome <> 'plus_active' or v_status.billing_plan <> 'plus' or v_status.allowance <> 55
    or v_status.used <> 0 or v_status.remaining <> 55
    or (select stripe_currency from public.billing_accounts where user_id = v_projection_user) <> 'cad' then
    raise exception 'CAD renewal period did not start a fresh non-rollover allowance: %, %', v_outcome, row_to_json(v_status);
  end if;

  select public.apply_stripe_subscription_projection(
    v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_unknown', 'usd', false, 'canceled',
    now() - interval '1 day', now() + interval '29 days', false,
    'evt_projection_stale', 'customer.subscription.deleted', now() - interval '1 day'
  ) into v_outcome;
  if v_outcome <> 'ignored_stale'
    or (select plan from public.billing_accounts where user_id = v_projection_user) <> 'plus'
    or (select stripe_currency from public.billing_accounts where user_id = v_projection_user) <> 'cad' then
    raise exception 'stale event overwrote newer Plus projection';
  end if;
  select public.apply_stripe_subscription_projection(
    v_projection_user, 'cus_projection_test', 'sub_projection_test', 'price_unknown', 'usd', false, 'canceled',
    now() - interval '1 day', now() + interval '29 days', false,
    'evt_projection_stale', 'customer.subscription.deleted', now() - interval '1 day'
  ) into v_outcome;
  if v_outcome <> 'replayed' then raise exception 'stale event replay was not idempotent'; end if;

  begin
    perform public.register_stripe_billing_customer(v_other_user, 'cus_projection_test', 'price_plus_test');
    raise exception 'Stripe customer uniqueness was not enforced';
  exception when unique_violation then null;
  end;
  perform public.register_stripe_billing_customer(v_other_user, 'cus_other_test', 'price_plus_test');
  begin
    perform public.apply_stripe_subscription_projection(
      v_other_user, 'cus_other_test', 'sub_projection_test', 'price_plus_test', 'usd', true, 'active',
      now() - interval '1 day', now() + interval '29 days', false,
      'evt_other_duplicate_subscription', 'customer.subscription.updated', now() + interval '1 hour'
    );
    raise exception 'Stripe subscription uniqueness was not enforced';
  exception when unique_violation then null;
  end;

  insert into public.ai_usage_events(user_id, request_id, feature, credits_used, status, period_start, allowance_period_key, completed_at)
  select v_reset_user, ('45000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
    'ask', 1, 'completed', (date_trunc('month', timezone('utc', now())) - interval '1 month')::date,
    'free:' || to_char(timezone('utc', now()) - interval '1 month', 'YYYY-MM'), now() - interval '1 month'
  from generate_series(1, 8) as sequence;
  perform set_config('request.jwt.claim.sub', v_reset_user::text, true);
  select * into strict v_status from public.get_my_ask_allowance_status();
  if v_status.billing_plan <> 'free' or v_status.allowance <> 8 or v_status.used <> 0 or v_status.remaining <> 8 then
    raise exception 'Free monthly reset rolled prior usage forward: %', row_to_json(v_status);
  end if;
  select * into strict v_result from public.reserve_ai_credit('45000000-0000-4000-8000-000000000101', 'ask');
  select * into strict v_result from public.release_ai_credit('45000000-0000-4000-8000-000000000101');
  select * into strict v_status from public.get_my_ask_allowance_status();
  if v_result.event_status <> 'released' or v_result.credits_used <> 0 or v_status.used <> 0 or v_status.remaining <> 8 then
    raise exception 'released Ask was not returned to the allowance: %, %', row_to_json(v_result), row_to_json(v_status);
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform 1 from public.billing_accounts where user_id = '43000000-0000-4000-8000-000000000003';
    raise exception 'authenticated user read another billing account';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.billing_accounts set plan = 'plus', stripe_price_id = 'price_attacker'
    where user_id = '44000000-0000-4000-8000-000000000004';
    raise exception 'authenticated user changed authoritative billing state';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;
