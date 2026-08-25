begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at
) values (
  '49000000-0000-4000-8000-000000000009',
  'authenticated',
  'authenticated',
  'postgrest-service-authority@example.test',
  '',
  now(),
  now(),
  now()
)
on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

-- Simulate an opaque sb_secret_* PostgREST request: the database request role is
-- service_role, while no legacy JWT claim GUC is available. The public wrappers
-- must accept this request and bridge only after proving the database role.
set local role service_role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

do $$
declare
  v_claim_outcome text;
  v_owner uuid;
  v_abandoned boolean;
begin
  select claim.claim_outcome, claim.owner_token
  into strict v_claim_outcome, v_owner
  from public.claim_idempotency_operation(
    '49000000-0000-4000-8000-000000000009',
    'profile.create',
    '49000000-0000-4000-8000-000000000091',
    repeat('a', 64),
    3600,
    30
  ) claim;

  if v_claim_outcome <> 'new' or v_owner is null then
    raise exception 'opaque service-role idempotency claim failed: %, %', v_claim_outcome, v_owner;
  end if;

  select public.abandon_idempotency_operation(
    '49000000-0000-4000-8000-000000000009',
    'profile.create',
    '49000000-0000-4000-8000-000000000091',
    v_owner,
    'TEST_CLEANUP'
  ) into strict v_abandoned;
  if not v_abandoned then raise exception 'idempotency abandon wrapper failed'; end if;
end;
$$;

do $$
declare
  v_outcome text;
  v_attempt uuid;
  v_owner uuid;
  v_abandoned boolean;
begin
  select claim.claim_outcome, claim.attempt_id, claim.owner_token
  into strict v_outcome, v_attempt, v_owner
  from public.claim_billing_checkout_single_flight_v2(
    '49000000-0000-4000-8000-000000000009',
    'furvise_plus_monthly',
    60,
    'http://localhost:3000',
    'usd'
  ) claim;

  if v_outcome <> 'claimed' or v_attempt is null or v_owner is null then
    raise exception 'opaque service-role checkout claim failed: %, %, %', v_outcome, v_attempt, v_owner;
  end if;

  select public.abandon_billing_checkout_single_flight(
    '49000000-0000-4000-8000-000000000009',
    'furvise_plus_monthly',
    v_attempt,
    v_owner
  ) into strict v_abandoned;
  if not v_abandoned then raise exception 'checkout abandon wrapper failed'; end if;
end;
$$;

do $$
declare
  v_contract integer;
  v_failures text[];
begin
  select contract_version, failed_checks
  into strict v_contract, v_failures
  from public.furvise_security_compatibility_snapshot_v2(array[
    'security_compatibility_contract_v2',
    'add_billing_checkout_single_flight',
    'harden_billing_checkout_single_flight_readiness',
    'align_billing_checkout_currency_authority',
    'add_billing_payment_recovery_grace',
    'harden_postgrest_service_authority'
  ]);

  if v_contract <> 2 or v_failures <> '{}'::text[] then
    raise exception 'PostgREST service authority readiness failed: %, %', v_contract, v_failures;
  end if;
end;
$$;

reset role;

-- Browser roles still have no entry point. This validates grants independently
-- from the runtime request-role guard.
savepoint browser_denial;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"49000000-0000-4000-8000-000000000009"}', true);
select set_config('request.jwt.claim.role', '', true);
do $$
begin
  begin
    perform public.claim_billing_checkout_single_flight_v2(
      '49000000-0000-4000-8000-000000000009',
      'furvise_plus_monthly',
      60,
      'http://localhost:3000',
      'usd'
    );
    raise exception 'authenticated role unexpectedly executed checkout authority';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback to savepoint browser_denial;

reset role;
rollback;
