begin;

-- Furvise displays a server-selected CA/US price before redirecting to Stripe.
-- Persist that selected currency with the durable financial attempt so every
-- retry sends Stripe the same parameters and Checkout cannot silently fall back
-- to a currency that disagrees with the Furvise paywall.
alter table private.billing_checkout_single_flights
  add column checkout_currency text;

alter table private.billing_checkout_single_flights
  add constraint billing_checkout_single_flights_currency_check
  check (checkout_currency is null or checkout_currency in ('cad', 'usd'));

create function public.claim_billing_checkout_single_flight_v2(
  p_user_id uuid,
  p_product_key text,
  p_lease_seconds integer,
  p_return_origin text,
  p_checkout_currency text
)
returns table(
  claim_outcome text,
  attempt_id uuid,
  owner_token uuid,
  return_origin text,
  checkout_currency text,
  stripe_checkout_session_id text,
  session_expires_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.billing_checkout_single_flights%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_candidate_attempt uuid := gen_random_uuid();
  v_candidate_owner uuid := gen_random_uuid();
  v_next_attempt uuid;
  v_next_origin text;
  v_next_currency text;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_product_key <> 'furvise_plus_monthly'
    or p_lease_seconds not between 30 and 300
    or p_checkout_currency not in ('cad', 'usd')
    or p_return_origin is null
    or not (
      p_return_origin ~* '^https://[a-z0-9.-]+(?::[0-9]{1,5})?$'
      or p_return_origin ~* '^http://(localhost|127[.]0[.]0[.]1)(?::[0-9]{1,5})?$'
    ) then
    raise exception using errcode = '22023', message = 'BILLING_CHECKOUT_SINGLE_FLIGHT_INPUT_INVALID';
  end if;

  insert into private.billing_checkout_single_flights(
    user_id, product_key, state, attempt_id, owner_token, lease_expires_at,
    return_origin, checkout_currency
  ) values (
    p_user_id, p_product_key, 'creating', v_candidate_attempt, v_candidate_owner,
    v_now + pg_catalog.make_interval(secs => p_lease_seconds), p_return_origin,
    p_checkout_currency
  )
  on conflict (user_id, product_key) do nothing;

  select flight.* into strict v_row
  from private.billing_checkout_single_flights as flight
  where flight.user_id = p_user_id and flight.product_key = p_product_key
  for update;

  if v_row.owner_token = v_candidate_owner then
    claim_outcome := 'claimed';
    attempt_id := v_row.attempt_id;
    owner_token := v_row.owner_token;
    return_origin := v_row.return_origin;
    checkout_currency := v_row.checkout_currency;
    stripe_checkout_session_id := null;
    session_expires_at := null;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  -- Existing Stripe sessions remain authoritative even if they were created by
  -- the pre-currency version. The application retrieves Stripe before deciding
  -- whether that session can be reused or reset.
  if v_row.state = 'open' then
    claim_outcome := 'existing';
    attempt_id := v_row.attempt_id;
    owner_token := null;
    return_origin := v_row.return_origin;
    checkout_currency := v_row.checkout_currency;
    stripe_checkout_session_id := v_row.stripe_checkout_session_id;
    session_expires_at := v_row.session_expires_at;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  if v_row.state = 'creating' and v_row.owner_token is not null
    and v_row.lease_expires_at > v_now then
    claim_outcome := 'in_progress';
    attempt_id := v_row.attempt_id;
    owner_token := null;
    return_origin := v_row.return_origin;
    checkout_currency := v_row.checkout_currency;
    stripe_checkout_session_id := null;
    session_expires_at := null;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (v_row.lease_expires_at - v_now)))::integer
    );
    return next;
    return;
  end if;

  -- A stale pre-currency attempt is ambiguous: Stripe might have created a
  -- Session using automatic localization even though Furvise never persisted
  -- the result. Adding currency to the same Stripe idempotency key would change
  -- request parameters, while minting a new attempt could duplicate Checkout.
  -- Fail closed and require reconciliation rather than guessing.
  if v_row.state = 'creating' and v_row.checkout_currency is null then
    claim_outcome := 'legacy_reconcile';
    attempt_id := v_row.attempt_id;
    owner_token := null;
    return_origin := v_row.return_origin;
    checkout_currency := null;
    stripe_checkout_session_id := null;
    session_expires_at := null;
    retry_after_seconds := 120;
    return next;
    return;
  end if;

  v_next_attempt := v_row.attempt_id;
  v_next_origin := v_row.return_origin;
  v_next_currency := v_row.checkout_currency;
  v_candidate_owner := gen_random_uuid();

  update private.billing_checkout_single_flights as flight
  set state = 'creating',
      attempt_id = v_next_attempt,
      owner_token = v_candidate_owner,
      lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
      return_origin = v_next_origin,
      checkout_currency = v_next_currency,
      stripe_checkout_session_id = null,
      session_expires_at = null,
      updated_at = v_now
  where flight.user_id = p_user_id and flight.product_key = p_product_key
  returning flight.* into v_row;

  claim_outcome := 'claimed';
  attempt_id := v_row.attempt_id;
  owner_token := v_row.owner_token;
  return_origin := v_row.return_origin;
  checkout_currency := v_row.checkout_currency;
  stripe_checkout_session_id := null;
  session_expires_at := null;
  retry_after_seconds := 0;
  return next;
end;
$$;

revoke all on function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)
  to service_role;

-- Preserve the already-deployed readiness implementation as a private layer and
-- add an exact authority check for the new currency-aware service RPC.
alter function public.furvise_security_compatibility_snapshot_v2(text[])
  rename to furvise_security_compatibility_snapshot_v2_pre_checkout_currency_alignment;
revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_checkout_currency_alignment(text[])
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
  v_function oid;
  v_definition text;
  v_ok boolean := true;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select snapshot.failed_checks into v_prior_failures
  from public.furvise_security_compatibility_snapshot_v2_pre_checkout_currency_alignment(
    p_required_migration_names
  ) snapshot;
  v_failures := v_failures || coalesce(v_prior_failures, '{}'::text[]);

  v_ok := v_ok and exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = pg_catalog.to_regclass('private.billing_checkout_single_flights')
      and attribute.attname = 'checkout_currency'
      and attribute.atttypid = 'text'::regtype
      and attribute.attnum > 0
      and not attribute.attisdropped
  );

  v_function := pg_catalog.to_regprocedure(
    'public.claim_billing_checkout_single_flight_v2(uuid,text,integer,text,text)'
  );
  v_ok := v_ok and v_function is not null;
  if v_function is not null then
    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    v_ok := v_ok
      and (select proc.prosecdef from pg_catalog.pg_proc proc where proc.oid = v_function)
      and coalesce((select proc.proconfig @> array['search_path=']::text[] from pg_catalog.pg_proc proc where proc.oid = v_function), false)
      and pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
      and v_definition ~* 'request[.]jwt[.]claim[.]role'
      and v_definition ~* 'service_role';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'claim_billing_checkout_single_flight_v2'
  ) <> 1 then
    v_ok := false;
  end if;

  if not v_ok then
    v_failures := pg_catalog.array_append(v_failures, 'billing_checkout_currency_authority');
  end if;

  return query
  select 2, array(
    select distinct failure
    from pg_catalog.unnest(v_failures) failure
    order by failure
  );
end;
$$;

revoke all on function public.furvise_security_compatibility_snapshot_v2(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.furvise_security_compatibility_snapshot_v2(text[])
  to service_role;
revoke all on function public.furvise_security_compatibility_snapshot_v2_pre_checkout_currency_alignment(text[])
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
