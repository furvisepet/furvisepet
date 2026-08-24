begin;

-- Checkout session creation is a financial side effect. Request-level idempotency
-- alone is insufficient because two distinct request keys can race before Stripe
-- exposes a subscription. Keep one durable server-owned attempt per user/product.
create table private.billing_checkout_single_flights (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null,
  state text not null default 'creating',
  attempt_id uuid not null,
  owner_token uuid,
  lease_expires_at timestamptz,
  stripe_checkout_session_id text,
  session_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_key),
  constraint billing_checkout_single_flights_product_key_check
    check (product_key = 'furvise_plus_monthly'),
  constraint billing_checkout_single_flights_state_check
    check (state in ('creating', 'open')),
  constraint billing_checkout_single_flights_shape_check
    check (
      (state = 'creating' and stripe_checkout_session_id is null and session_expires_at is null)
      or
      (state = 'open' and stripe_checkout_session_id is not null and session_expires_at is not null)
    )
);

revoke all on table private.billing_checkout_single_flights
  from public, anon, authenticated, service_role;

create function public.claim_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_lease_seconds integer
)
returns table(
  claim_outcome text,
  attempt_id uuid,
  owner_token uuid,
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
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_product_key <> 'furvise_plus_monthly'
    or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'BILLING_CHECKOUT_SINGLE_FLIGHT_INPUT_INVALID';
  end if;

  insert into private.billing_checkout_single_flights(
    user_id, product_key, state, attempt_id, owner_token, lease_expires_at
  ) values (
    p_user_id, p_product_key, 'creating', v_candidate_attempt, v_candidate_owner,
    v_now + pg_catalog.make_interval(secs => p_lease_seconds)
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
    stripe_checkout_session_id := null;
    session_expires_at := null;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  if v_row.state = 'open' and v_row.session_expires_at > v_now then
    claim_outcome := 'existing';
    attempt_id := v_row.attempt_id;
    owner_token := null;
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
    stripe_checkout_session_id := null;
    session_expires_at := null;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (v_row.lease_expires_at - v_now)))::integer
    );
    return next;
    return;
  end if;

  -- A stale creating attempt keeps its attempt_id. If Stripe accepted the prior
  -- request but the app lost the response, retrying with the same Stripe
  -- idempotency key recovers that exact Checkout Session instead of creating one.
  v_next_attempt := case
    when v_row.state = 'creating' then v_row.attempt_id
    else gen_random_uuid()
  end;
  v_candidate_owner := gen_random_uuid();

  update private.billing_checkout_single_flights as flight
  set state = 'creating',
      attempt_id = v_next_attempt,
      owner_token = v_candidate_owner,
      lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
      stripe_checkout_session_id = null,
      session_expires_at = null,
      updated_at = v_now
  where flight.user_id = p_user_id and flight.product_key = p_product_key
  returning flight.* into v_row;

  claim_outcome := 'claimed';
  attempt_id := v_row.attempt_id;
  owner_token := v_row.owner_token;
  stripe_checkout_session_id := null;
  session_expires_at := null;
  retry_after_seconds := 0;
  return next;
end;
$$;

create function public.complete_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_attempt_id uuid,
  p_owner_token uuid,
  p_stripe_checkout_session_id text,
  p_session_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_updated boolean := false;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_product_key <> 'furvise_plus_monthly'
    or p_attempt_id is null or p_owner_token is null
    or p_stripe_checkout_session_id is null
    or p_stripe_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
    or p_session_expires_at <= v_now
    or p_session_expires_at > v_now + interval '25 hours' then
    raise exception using errcode = '22023', message = 'BILLING_CHECKOUT_SINGLE_FLIGHT_COMPLETION_INVALID';
  end if;

  update private.billing_checkout_single_flights as flight
  set state = 'open',
      owner_token = null,
      lease_expires_at = null,
      stripe_checkout_session_id = p_stripe_checkout_session_id,
      session_expires_at = p_session_expires_at,
      updated_at = v_now
  where flight.user_id = p_user_id
    and flight.product_key = p_product_key
    and flight.state = 'creating'
    and flight.attempt_id = p_attempt_id
    and flight.owner_token = p_owner_token;
  v_updated := found;
  return v_updated;
end;
$$;

create function public.abandon_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_attempt_id uuid,
  p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean := false;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  -- Preserve attempt_id. A retry must reuse the same Stripe idempotency key in
  -- case the network failed after Stripe accepted the original create request.
  update private.billing_checkout_single_flights as flight
  set owner_token = null,
      lease_expires_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where flight.user_id = p_user_id
    and flight.product_key = p_product_key
    and flight.state = 'creating'
    and flight.attempt_id = p_attempt_id
    and flight.owner_token = p_owner_token;
  v_updated := found;
  return v_updated;
end;
$$;

create function public.reset_billing_checkout_single_flight(
  p_user_id uuid,
  p_product_key text,
  p_stripe_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean := false;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  delete from private.billing_checkout_single_flights as flight
  where flight.user_id = p_user_id
    and flight.product_key = p_product_key
    and flight.state = 'open'
    and flight.stripe_checkout_session_id = p_stripe_checkout_session_id;
  v_deleted := found;
  return v_deleted;
end;
$$;

revoke all on function public.claim_billing_checkout_single_flight(uuid,text,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reset_billing_checkout_single_flight(uuid,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_billing_checkout_single_flight(uuid,text,integer) to service_role;
grant execute on function public.complete_billing_checkout_single_flight(uuid,text,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.abandon_billing_checkout_single_flight(uuid,text,uuid,uuid) to service_role;
grant execute on function public.reset_billing_checkout_single_flight(uuid,text,text) to service_role;

comment on table private.billing_checkout_single_flights is
  'Server-owned durable single-flight state for Stripe Checkout creation. No browser or direct service-role table DML.';
comment on function public.claim_billing_checkout_single_flight(uuid,text,integer) is
  'Service-only atomic claim for one active Furvise Plus Checkout attempt per user/product.';

notify pgrst, 'reload schema';

commit;
