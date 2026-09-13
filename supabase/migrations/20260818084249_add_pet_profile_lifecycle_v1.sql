begin;

-- Pet lifecycle is a retained profile state, not deletion and not a care concern.
-- The constant text default is metadata-only on supported PostgreSQL versions, so
-- existing rows become active without a table rewrite. A null changed timestamp
-- means the profile has never left its initial active state.
alter table public.dog_profiles
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists lifecycle_changed_at timestamptz,
  add column if not exists deceased_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'dog_profiles_lifecycle_status_check'
      and conrelid = 'public.dog_profiles'::regclass
  ) then
    alter table public.dog_profiles
      add constraint dog_profiles_lifecycle_status_check
      check (lifecycle_status in ('active', 'deceased', 'archived')) not valid;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'dog_profiles_lifecycle_timestamps_check'
      and conrelid = 'public.dog_profiles'::regclass
  ) then
    alter table public.dog_profiles
      add constraint dog_profiles_lifecycle_timestamps_check
      check (
        (lifecycle_status = 'active' or lifecycle_changed_at is not null)
        and (lifecycle_status <> 'deceased' or deceased_at is not null)
        and (deceased_at is null or lifecycle_changed_at is not null)
        and (deceased_at is null or deceased_at <= lifecycle_changed_at)
      ) not valid;
  end if;
end;
$$;

alter table public.dog_profiles
  validate constraint dog_profiles_lifecycle_status_check;

alter table public.dog_profiles
  validate constraint dog_profiles_lifecycle_timestamps_check;

create index if not exists dog_profiles_owner_lifecycle_idx
  on public.dog_profiles(user_id, lifecycle_status, updated_at desc);

create table if not exists public.pet_profile_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  from_status text not null check (from_status in ('active', 'deceased', 'archived')),
  to_status text not null check (to_status in ('active', 'deceased', 'archived')),
  changed_at timestamptz not null,
  changed_by uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('authenticated_user', 'service_role', 'system')),
  constraint pet_profile_lifecycle_events_transition_check check (from_status <> to_status)
);

create index if not exists pet_profile_lifecycle_events_owner_pet_changed_idx
  on public.pet_profile_lifecycle_events(user_id, pet_profile_id, changed_at desc);

alter table public.pet_profile_lifecycle_events enable row level security;
alter table public.pet_profile_lifecycle_events force row level security;

drop policy if exists "Users can select their pet lifecycle events" on public.pet_profile_lifecycle_events;
create policy "Users can select their pet lifecycle events"
  on public.pet_profile_lifecycle_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.pet_profile_lifecycle_events
  from public, anon, authenticated, service_role;
grant select on table public.pet_profile_lifecycle_events
  to authenticated, service_role;

create schema if not exists private;
revoke all on schema private
  from public, anon, authenticated, service_role;

create or replace function private.prepare_pet_profile_lifecycle_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_changed_at timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    -- Every profile starts active. Retained-state changes must use a separate
    -- update so confirmation, timestamps, and the audit trigger cannot be bypassed.
    new.lifecycle_status := 'active';
    new.lifecycle_changed_at := null;
    new.deceased_at := null;
    return new;
  end if;

  if new.lifecycle_status is not distinct from old.lifecycle_status then
    -- Lifecycle timestamps are controlled by lifecycle transitions, not by
    -- ordinary profile edits or client-authored success claims.
    new.lifecycle_changed_at := old.lifecycle_changed_at;
    new.deceased_at := old.deceased_at;
    return new;
  end if;

  new.lifecycle_changed_at := v_changed_at;
  new.updated_at := v_changed_at;

  if new.lifecycle_status = 'deceased' then
    -- A caller may supply a known owner-reported time. If it supplied no new
    -- value, use the transition time, including after an earlier correction.
    if new.deceased_at is not distinct from old.deceased_at then
      new.deceased_at := v_changed_at;
    end if;
  else
    -- Reactivation and archival preserve the last recorded death timestamp as
    -- provenance. The audit event records that the current state was corrected.
    new.deceased_at := old.deceased_at;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_pet_profile_lifecycle_transition()
  from public, anon, authenticated, service_role;

drop trigger if exists prepare_pet_profile_lifecycle_insert on public.dog_profiles;
create trigger prepare_pet_profile_lifecycle_insert
before insert on public.dog_profiles
for each row execute function private.prepare_pet_profile_lifecycle_transition();

drop trigger if exists prepare_pet_profile_lifecycle_update on public.dog_profiles;
create trigger prepare_pet_profile_lifecycle_update
before update of lifecycle_status, lifecycle_changed_at, deceased_at on public.dog_profiles
for each row execute function private.prepare_pet_profile_lifecycle_transition();

create or replace function private.audit_pet_profile_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_actor_user_id uuid := auth.uid();
begin
  if new.lifecycle_status is distinct from old.lifecycle_status then
    insert into public.pet_profile_lifecycle_events (
      user_id,
      pet_profile_id,
      from_status,
      to_status,
      changed_at,
      changed_by,
      actor_type
    ) values (
      new.user_id,
      new.id,
      old.lifecycle_status,
      new.lifecycle_status,
      new.lifecycle_changed_at,
      case
        when v_actor_role = 'service_role' then null
        else v_actor_user_id
      end,
      case
        when v_actor_role = 'service_role' then 'service_role'
        when v_actor_user_id is not null then 'authenticated_user'
        else 'system'
      end
    );
  end if;
  return new;
end;
$$;

revoke all on function private.audit_pet_profile_lifecycle_transition()
  from public, anon, authenticated, service_role;

drop trigger if exists audit_pet_profile_lifecycle_transition on public.dog_profiles;
create trigger audit_pet_profile_lifecycle_transition
after update of lifecycle_status on public.dog_profiles
for each row execute function private.audit_pet_profile_lifecycle_transition();

comment on column public.dog_profiles.lifecycle_status is
  'Current retained profile lifecycle state. Deletion remains a separate explicit destructive operation.';
comment on column public.dog_profiles.lifecycle_changed_at is
  'Server-controlled time of the latest lifecycle transition. Null means the profile has remained active since creation.';
comment on column public.dog_profiles.deceased_at is
  'Last owner-reported death time. Preserved as provenance after reactivation or archival; current truth is lifecycle_status.';
comment on table public.pet_profile_lifecycle_events is
  'Append-only audit of retained pet profile lifecycle transitions. Rows cascade only when the pet or account is permanently deleted.';

commit;
