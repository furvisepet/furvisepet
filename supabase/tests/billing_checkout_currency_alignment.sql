begin;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values
  ('47000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'billing-currency@example.test', '', now(), now(), now()),
  ('47000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'billing-currency-legacy@example.test', '', now(), now(), now())
on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_user constant uuid := '47000000-0000-4000-8000-000000000007';
  v_legacy_user constant uuid := '47000000-0000-4000-8000-000000000008';
  v_first record;
  v_second record;
  v_reclaimed record;
  v_legacy record;
begin
  select * into strict v_first
  from public.claim_billing_checkout_single_flight_v2(
    v_user, 'furvise_plus_monthly', 120, 'https://www.furvise.com', 'cad'
  );
  if v_first.claim_outcome <> 'claimed'
    or v_first.checkout_currency <> 'cad'
    or v_first.owner_token is null then
    raise exception 'first currency-aware claim invalid: %', row_to_json(v_first);
  end if;

  select * into strict v_second
  from public.claim_billing_checkout_single_flight_v2(
    v_user, 'furvise_plus_monthly', 120, 'https://www.furvise.com', 'usd'
  );
  if v_second.claim_outcome <> 'in_progress'
    or v_second.attempt_id <> v_first.attempt_id
    or v_second.checkout_currency <> 'cad' then
    raise exception 'concurrent request changed durable checkout currency: %', row_to_json(v_second);
  end if;

  if not public.abandon_billing_checkout_single_flight(
    v_user, 'furvise_plus_monthly', v_first.attempt_id, v_first.owner_token
  ) then
    raise exception 'currency-aware checkout abandon failed';
  end if;

  select * into strict v_reclaimed
  from public.claim_billing_checkout_single_flight_v2(
    v_user, 'furvise_plus_monthly', 120, 'https://www.furvise.com', 'usd'
  );
  if v_reclaimed.claim_outcome <> 'claimed'
    or v_reclaimed.attempt_id <> v_first.attempt_id
    or v_reclaimed.checkout_currency <> 'cad'
    or v_reclaimed.owner_token is null then
    raise exception 'retry did not preserve durable checkout currency: %', row_to_json(v_reclaimed);
  end if;

  insert into private.billing_checkout_single_flights(
    user_id, product_key, state, attempt_id, owner_token, lease_expires_at,
    return_origin, checkout_currency
  ) values (
    v_legacy_user, 'furvise_plus_monthly', 'creating', gen_random_uuid(), null,
    now() - interval '1 minute', 'https://www.furvise.com', null
  );

  select * into strict v_legacy
  from public.claim_billing_checkout_single_flight_v2(
    v_legacy_user, 'furvise_plus_monthly', 120, 'https://www.furvise.com', 'usd'
  );
  if v_legacy.claim_outcome <> 'legacy_reconcile'
    or v_legacy.checkout_currency is not null then
    raise exception 'ambiguous pre-currency attempt did not fail closed: %', row_to_json(v_legacy);
  end if;
end;
$$;

savepoint browser_role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform public.claim_billing_checkout_single_flight_v2(
      '47000000-0000-4000-8000-000000000007',
      'furvise_plus_monthly',
      120,
      'https://www.furvise.com',
      'cad'
    );
    raise exception 'authenticated role unexpectedly selected checkout currency';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback to savepoint browser_role;

rollback;
