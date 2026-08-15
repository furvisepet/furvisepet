begin;

create table public.billing_deletion_tombstones (
  stripe_subscription_id text primary key,
  user_id uuid not null,
  stripe_customer_id text not null,
  terminal_status text not null check (terminal_status in ('canceled', 'incomplete_expired')),
  deletion_idempotency_key uuid not null,
  termination_verified_at timestamptz not null default now(),
  retain_until timestamptz not null default now() + interval '90 days',
  check (char_length(btrim(stripe_subscription_id)) > 0),
  check (char_length(btrim(stripe_customer_id)) > 0)
);

comment on table public.billing_deletion_tombstones is
  'Service-only terminal Stripe subscription mapping retained after Auth deletion so delayed webhooks and retries can be reconciled safely.';

create index billing_deletion_tombstones_reconciliation_idx
  on public.billing_deletion_tombstones(user_id, stripe_customer_id, retain_until);

alter table public.billing_deletion_tombstones enable row level security;
alter table public.billing_deletion_tombstones force row level security;
revoke all on table public.billing_deletion_tombstones from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_deletion_tombstones to service_role;

create or replace function public.record_billing_deletion_tombstones(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_ids text[],
  p_terminal_statuses text[],
  p_idempotency_key uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
  v_projected_subscription_id text;
  v_projected_status text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null
    or p_idempotency_key is null
    or nullif(btrim(p_stripe_customer_id), '') is null
    or coalesce(cardinality(p_stripe_subscription_ids), 0) = 0
    or cardinality(p_stripe_subscription_ids) <> cardinality(p_terminal_statuses)
    or exists (select 1 from unnest(p_stripe_subscription_ids) value where nullif(btrim(value), '') is null)
    or exists (select 1 from unnest(p_terminal_statuses) value where value not in ('canceled', 'incomplete_expired')) then
    raise exception using errcode = '22023', message = 'BILLING_DELETION_TOMBSTONE_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('billing-deletion:' || p_user_id::text, 0));
  select stripe_subscription_id into v_projected_subscription_id
  from public.billing_accounts
  where user_id = p_user_id and stripe_customer_id = p_stripe_customer_id
  for update;
  if not found then raise exception using errcode = '42501', message = 'BILLING_CUSTOMER_NOT_ASSOCIATED'; end if;

  if exists (
    select 1 from unnest(p_stripe_subscription_ids) subscription_id
    join public.billing_deletion_tombstones tombstone on tombstone.stripe_subscription_id = subscription_id
    where tombstone.user_id <> p_user_id or tombstone.stripe_customer_id <> p_stripe_customer_id
  ) then raise exception using errcode = '42501', message = 'BILLING_TOMBSTONE_OWNER_MISMATCH'; end if;

  insert into public.billing_deletion_tombstones (
    stripe_subscription_id, user_id, stripe_customer_id, terminal_status, deletion_idempotency_key
  )
  select subscription_id, p_user_id, p_stripe_customer_id, terminal_status, p_idempotency_key
  from unnest(p_stripe_subscription_ids, p_terminal_statuses) as input(subscription_id, terminal_status)
  on conflict (stripe_subscription_id) do update set
    terminal_status = excluded.terminal_status,
    deletion_idempotency_key = excluded.deletion_idempotency_key,
    termination_verified_at = now(),
    retain_until = now() + interval '90 days'
  where billing_deletion_tombstones.user_id = excluded.user_id
    and billing_deletion_tombstones.stripe_customer_id = excluded.stripe_customer_id;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(p_stripe_subscription_ids) then
    raise exception using errcode = '42501', message = 'BILLING_TOMBSTONE_WRITE_INCOMPLETE';
  end if;

  if v_projected_subscription_id is not null then
    select terminal_status into v_projected_status
    from unnest(p_stripe_subscription_ids, p_terminal_statuses) as input(subscription_id, terminal_status)
    where subscription_id = v_projected_subscription_id;
    if v_projected_status is null then
      raise exception using errcode = '22023', message = 'PROJECTED_SUBSCRIPTION_NOT_VERIFIED';
    end if;
    update public.billing_accounts set
      plan = 'free',
      subscription_status = v_projected_status,
      cancel_at_period_end = false,
      updated_at = now()
    where user_id = p_user_id and stripe_customer_id = p_stripe_customer_id;
  end if;

  return v_count;
end;
$$;

revoke all on function public.record_billing_deletion_tombstones(uuid, text, text[], text[], uuid) from public, anon, authenticated;
grant execute on function public.record_billing_deletion_tombstones(uuid, text, text[], text[], uuid) to service_role;

commit;
