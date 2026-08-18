-- APPROVAL-GATED SCHEMA PROPOSAL. Do not apply automatically.
-- REVIEWED AND SUPERSEDED by the prepared, unapplied migration:
-- supabase/migrations/20260818084249_add_pet_profile_lifecycle_v1.sql
-- The production migration also adds server-controlled timestamp invariants and
-- an append-only pet_profile_lifecycle_events audit trail for reactivation.
-- Furvise Conversational Application Architecture V1 needs durable pet lifecycle
-- state that is separate from health concerns, memories, and deletion.

alter table public.dog_profiles
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists lifecycle_changed_at timestamptz,
  add column if not exists deceased_at timestamptz;

alter table public.dog_profiles
  drop constraint if exists dog_profiles_lifecycle_status_check;

alter table public.dog_profiles
  add constraint dog_profiles_lifecycle_status_check
  check (lifecycle_status in ('active', 'deceased', 'archived')) not valid;

alter table public.dog_profiles
  validate constraint dog_profiles_lifecycle_status_check;

create index if not exists dog_profiles_owner_lifecycle_idx
  on public.dog_profiles(user_id, lifecycle_status, updated_at desc);

comment on column public.dog_profiles.lifecycle_status is
  'Application lifecycle state. Deceased and archived profiles retain history; deletion remains a separate explicit destructive operation.';
comment on column public.dog_profiles.deceased_at is
  'Owner-reported date/time of death when known. Never inferred from an uncertain report.';
