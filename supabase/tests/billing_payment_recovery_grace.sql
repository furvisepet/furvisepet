begin;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values (
  '47000000-0000-4000-8000-000000000007',
  'authenticated',
  'authenticated',
  'billing-recovery-grace@example.test',
  '',
  now(),
  now(),
  now()
)
on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

select set_config('request.jwt.claim.role', 'service_role', true);
select public.register_stripe_billing_customer(
  '47000000-0000-4000-8000-000000000007',
  'cus_furvise_recovery_grace',
  'price_furvise_plus_recovery'
);

do $$
declare
  v_user constant uuid := '47000000-0000-4000-8000-000000000007';
  v_first_past_due timestamptz := clock_timestamp() - interval '5 minutes';
  v_preserved timestamptz;
  v_plan text;
  v_allowance integer;
  v_max_pets integer;
  v_vet boolean;
begin
  perform public.apply_stripe_subscription_projection(
    v_user,
    'cus_furvise_recovery_grace',
    'sub_furvise_recovery_grace',
    'price_furvise_plus_recovery',
    'usd',
    true,
    'active',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '29 days',
    false,
    'evt_recovery_active_initial',
    'customer.subscription.updated',
    clock_timestamp() - interval '10 minutes'
  );

  if exists (
    select 1 from public.billing_accounts
    where user_id = v_user
      and (plan <> 'plus' or subscription_status <> 'active' or past_due_since is not null)
  ) then
    raise exception 'healthy active billing projection was incorrect';
  end if;

  select billing_plan into strict v_plan
  from private.resolve_active_billing_plan(v_user);
  if v_plan <> 'plus' then raise exception 'active subscription did not resolve Plus'; end if;

  perform public.apply_stripe_subscription_projection(
    v_user,
    'cus_furvise_recovery_grace',
    'sub_furvise_recovery_grace',
    'price_furvise_plus_recovery',
    'usd',
    true,
    'past_due',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '29 days',
    false,
    'evt_recovery_past_due_first',
    'customer.subscription.updated',
    v_first_past_due
  );

  select past_due_since into strict v_preserved
  from public.billing_accounts where user_id = v_user;
  if v_preserved is distinct from v_first_past_due then
    raise exception 'past_due transition timestamp was not persisted: % <> %', v_preserved, v_first_past_due;
  end if;

  if exists (
    select 1 from public.billing_accounts
    where user_id = v_user and (plan <> 'free' or subscription_status <> 'past_due')
  ) then
    raise exception 'Stripe projection stopped being truthful during past_due';
  end if;

  select billing_plan into strict v_plan
  from private.resolve_active_billing_plan(v_user);
  if v_plan <> 'plus' then raise exception 'fresh past_due subscription lost Plus during recovery grace'; end if;

  select allowance into strict v_allowance from private.resolve_ask_allowance(v_user);
  select max_pets, vet_prep_exports into strict v_max_pets, v_vet
  from private.resolve_account_entitlements(v_user);
  if v_allowance <> 55 or v_max_pets <> 10 or not v_vet then
    raise exception 'Plus benefits were not preserved during recovery grace: allowance %, pets %, vet %', v_allowance, v_max_pets, v_vet;
  end if;

  perform public.apply_stripe_subscription_projection(
    v_user,
    'cus_furvise_recovery_grace',
    'sub_furvise_recovery_grace',
    'price_furvise_plus_recovery',
    'usd',
    true,
    'past_due',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '29 days',
    false,
    'evt_recovery_past_due_repeat',
    'customer.subscription.updated',
    clock_timestamp() - interval '1 minute'
  );

  select past_due_since into strict v_preserved
  from public.billing_accounts where user_id = v_user;
  if v_preserved is distinct from v_first_past_due then
    raise exception 'repeated past_due event extended the grace window: % <> %', v_preserved, v_first_past_due;
  end if;

  update public.billing_accounts
  set past_due_since = clock_timestamp() - interval '8 days'
  where user_id = v_user;

  select billing_plan into strict v_plan
  from private.resolve_active_billing_plan(v_user);
  select allowance into strict v_allowance from private.resolve_ask_allowance(v_user);
  select max_pets, vet_prep_exports into strict v_max_pets, v_vet
  from private.resolve_account_entitlements(v_user);
  if v_plan <> 'free' or v_allowance <> 15 or v_max_pets <> 1 or v_vet then
    raise exception 'expired recovery grace did not fail closed: plan %, allowance %, pets %, vet %', v_plan, v_allowance, v_max_pets, v_vet;
  end if;

  perform public.apply_stripe_subscription_projection(
    v_user,
    'cus_furvise_recovery_grace',
    'sub_furvise_recovery_grace',
    'price_furvise_plus_recovery',
    'usd',
    true,
    'active',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '29 days',
    false,
    'evt_recovery_active_restored',
    'customer.subscription.updated',
    clock_timestamp()
  );

  if exists (
    select 1 from public.billing_accounts
    where user_id = v_user and (plan <> 'plus' or subscription_status <> 'active' or past_due_since is not null)
  ) then
    raise exception 'payment recovery did not restore clean active state';
  end if;

  select billing_plan into strict v_plan
  from private.resolve_active_billing_plan(v_user);
  if v_plan <> 'plus' then raise exception 'payment recovery did not restore Plus'; end if;

  perform public.apply_stripe_subscription_projection(
    v_user,
    'cus_furvise_recovery_grace',
    'sub_furvise_recovery_grace',
    'price_furvise_plus_recovery',
    'usd',
    true,
    'unpaid',
    clock_timestamp() - interval '1 day',
    clock_timestamp() + interval '29 days',
    false,
    'evt_recovery_unpaid',
    'customer.subscription.updated',
    clock_timestamp()
  );

  select billing_plan into strict v_plan
  from private.resolve_active_billing_plan(v_user);
  if v_plan <> 'free' then raise exception 'unpaid subscription retained Plus'; end if;
  if exists (select 1 from public.billing_accounts where user_id = v_user and past_due_since is not null) then
    raise exception 'unpaid transition did not clear past_due_since';
  end if;
end;
$$;

savepoint browser_write;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-000000000007', true);
do $$
begin
  begin
    update public.billing_accounts
    set past_due_since = now()
    where user_id = '47000000-0000-4000-8000-000000000007';
    raise exception 'authenticated role unexpectedly wrote past_due_since';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback to savepoint browser_write;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_failures text[];
begin
  select failed_checks into v_failures
  from public.furvise_security_compatibility_snapshot_v2(array[
    'add_pet_profile_lifecycle_v1',
    'secure_ai_credit_state_machine',
    'enforce_ai_credit_settlement_disposition',
    'enforce_furvise_memory_semantic_integrity',
    'server_authored_ask_action_capabilities',
    'harden_entitlement_and_pet_data_boundaries',
    'repair_permanent_pet_delete_admin_role',
    'authorize_ask_memory_persistence',
    'harden_ask_action_capability_targets_freshness_expiry',
    'add_controlled_care_entry_update_boundary',
    'restrict_authenticated_care_entry_writes',
    'prepare_canonical_care_state_authority',
    'enforce_canonical_care_state_authority',
    'security_compatibility_contract_v2',
    'harden_security_compatibility_contract_v2',
    'harden_security_compatibility_protected_authority_families',
    'add_billing_checkout_single_flight',
    'harden_billing_checkout_single_flight_readiness',
    'align_billing_checkout_currency_authority',
    'add_billing_payment_recovery_grace'
  ]);
  if v_failures <> '{}'::text[] then
    raise exception 'healthy payment recovery readiness failed: %', v_failures;
  end if;
end;
$$;

savepoint recovery_column_drift;
grant update (past_due_since) on public.billing_accounts to authenticated;
do $$
declare v_failures text[];
begin
  select failed_checks into v_failures
  from public.furvise_security_compatibility_snapshot_v2(array['add_billing_payment_recovery_grace']);
  if not 'billing_payment_recovery_authority' = any(v_failures) then
    raise exception 'past_due_since write drift was not detected: %', v_failures;
  end if;
end;
$$;
rollback to savepoint recovery_column_drift;

savepoint recovery_projection_drift;
alter function public.apply_stripe_subscription_projection(uuid,text,text,text,text,boolean,text,timestamptz,timestamptz,boolean,text,text,timestamptz)
  security invoker;
do $$
declare v_failures text[];
begin
  select failed_checks into v_failures
  from public.furvise_security_compatibility_snapshot_v2(array['add_billing_payment_recovery_grace']);
  if not 'billing_payment_recovery_authority' = any(v_failures) then
    raise exception 'projection SECURITY DEFINER drift was not detected: %', v_failures;
  end if;
end;
$$;
rollback to savepoint recovery_projection_drift;

rollback;
