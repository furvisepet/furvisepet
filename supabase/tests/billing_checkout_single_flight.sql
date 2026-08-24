begin;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values (
  '46000000-0000-4000-8000-000000000006',
  'authenticated',
  'authenticated',
  'billing-checkout-single-flight@example.test',
  '',
  now(),
  now(),
  now()
)
on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_user constant uuid := '46000000-0000-4000-8000-000000000006';
  v_first record;
  v_second record;
  v_reclaimed record;
  v_existing record;
  v_expired_existing record;
  v_new record;
  v_completed boolean;
  v_reset boolean;
begin
  if has_table_privilege('service_role', 'private.billing_checkout_single_flights', 'SELECT')
    or has_table_privilege('service_role', 'private.billing_checkout_single_flights', 'INSERT')
    or has_table_privilege('service_role', 'private.billing_checkout_single_flights', 'UPDATE')
    or has_table_privilege('service_role', 'private.billing_checkout_single_flights', 'DELETE')
    or has_table_privilege('authenticated', 'private.billing_checkout_single_flights', 'SELECT')
    or has_table_privilege('authenticated', 'private.billing_checkout_single_flights', 'INSERT')
    or has_table_privilege('authenticated', 'private.billing_checkout_single_flights', 'UPDATE')
    or has_table_privilege('authenticated', 'private.billing_checkout_single_flights', 'DELETE') then
    raise exception 'checkout single-flight table has direct API-role authority';
  end if;

  if has_function_privilege('authenticated', 'public.claim_billing_checkout_single_flight(uuid,text,integer,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.reset_billing_checkout_single_flight(uuid,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.claim_billing_checkout_single_flight(uuid,text,integer,text)', 'EXECUTE') then
    raise exception 'checkout single-flight RPC grants are invalid';
  end if;

  select * into strict v_first
  from public.claim_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', 120, 'https://www.furvise.com'
  );
  if v_first.claim_outcome <> 'claimed' or v_first.owner_token is null
    or v_first.return_origin <> 'https://www.furvise.com' then
    raise exception 'first checkout claim invalid: %', row_to_json(v_first);
  end if;

  select * into strict v_second
  from public.claim_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', 120, 'https://furvise.com'
  );
  if v_second.claim_outcome <> 'in_progress'
    or v_second.attempt_id <> v_first.attempt_id
    or v_second.return_origin <> 'https://www.furvise.com'
    or v_second.retry_after_seconds < 1 then
    raise exception 'concurrent checkout claim was not serialized: %', row_to_json(v_second);
  end if;

  if not public.abandon_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', v_first.attempt_id, v_first.owner_token
  ) then
    raise exception 'checkout claim abandon failed';
  end if;

  select * into strict v_reclaimed
  from public.claim_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', 120, 'https://furvise.com'
  );
  if v_reclaimed.claim_outcome <> 'claimed'
    or v_reclaimed.attempt_id <> v_first.attempt_id
    or v_reclaimed.owner_token is null
    or v_reclaimed.owner_token = v_first.owner_token
    or v_reclaimed.return_origin <> 'https://www.furvise.com' then
    raise exception 'stale checkout takeover did not preserve Stripe retry identity: %', row_to_json(v_reclaimed);
  end if;

  select public.complete_billing_checkout_single_flight(
    v_user,
    'furvise_plus_monthly',
    v_reclaimed.attempt_id,
    v_reclaimed.owner_token,
    'cs_test_furvise_single_flight_1',
    now() + interval '30 minutes'
  ) into strict v_completed;
  if not v_completed then raise exception 'checkout single-flight completion failed'; end if;

  select * into strict v_existing
  from public.claim_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', 120, 'https://furvise.com'
  );
  if v_existing.claim_outcome <> 'existing'
    or v_existing.stripe_checkout_session_id <> 'cs_test_furvise_single_flight_1'
    or v_existing.attempt_id <> v_first.attempt_id then
    raise exception 'open checkout session was not reused: %', row_to_json(v_existing);
  end if;

  -- Local expiry metadata is advisory only. Even after that timestamp passes,
  -- claim must return the existing Stripe session so the server can retrieve it
  -- and reset only after Stripe itself reports status=expired.
  update private.billing_checkout_single_flights
  set session_expires_at = now() - interval '1 minute'
  where user_id = v_user and product_key = 'furvise_plus_monthly';

  select * into strict v_expired_existing
  from public.claim_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', 120, 'https://furvise.com'
  );
  if v_expired_existing.claim_outcome <> 'existing'
    or v_expired_existing.stripe_checkout_session_id <> 'cs_test_furvise_single_flight_1'
    or v_expired_existing.attempt_id <> v_first.attempt_id then
    raise exception 'database clock incorrectly replaced Stripe expiry authority: %', row_to_json(v_expired_existing);
  end if;

  select public.reset_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', 'cs_test_furvise_single_flight_1'
  ) into strict v_reset;
  if not v_reset then raise exception 'Stripe-confirmed expired checkout reset failed'; end if;

  select * into strict v_new
  from public.claim_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', 120, 'https://furvise.com'
  );
  if v_new.claim_outcome <> 'claimed'
    or v_new.attempt_id = v_first.attempt_id
    or v_new.return_origin <> 'https://furvise.com' then
    raise exception 'terminal checkout reset did not create a fresh attempt: %', row_to_json(v_new);
  end if;
end;
$$;

savepoint browser_role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.claim_billing_checkout_single_flight(
      '46000000-0000-4000-8000-000000000006',
      'furvise_plus_monthly',
      120,
      'https://www.furvise.com'
    );
    raise exception 'authenticated role unexpectedly claimed checkout authority';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback to savepoint browser_role;

rollback;
