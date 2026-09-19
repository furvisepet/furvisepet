alter table public.product_ingestion_batches
  add column if not exists provider_manifest jsonb check (
    provider_manifest is null or jsonb_typeof(provider_manifest) = 'object'
  );

alter table public.product_ingestion_records
  add column if not exists claim_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(claim_flags) = 'array'),
  add column if not exists quality_assessment jsonb check (
    quality_assessment is null or jsonb_typeof(quality_assessment) = 'object'
  ),
  add column if not exists quality_state text check (
    quality_state is null or quality_state in ('publishable', 'publishable_with_gaps', 'manual_review', 'blocked')
  ),
  add column if not exists source_use_status text not null default 'unresolved' check (
    source_use_status in ('permitted', 'restricted', 'unresolved')
  ),
  add column if not exists publication_gate jsonb check (
    publication_gate is null or jsonb_typeof(publication_gate) = 'object'
  ),
  add column if not exists reviewer_approved_at timestamptz,
  add column if not exists reviewer_actor text,
  add column if not exists reviewer_note text;

create table if not exists public.product_ingestion_overrides (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.product_ingestion_batches(id) on delete restrict,
  record_id uuid not null references public.product_ingestion_records(id) on delete restrict,
  field_path text not null check (field_path = btrim(field_path) and field_path <> ''),
  old_value jsonb,
  new_value jsonb,
  actor text not null check (actor = btrim(actor) and actor <> ''),
  reason text not null check (reason = btrim(reason) and reason <> ''),
  created_at timestamptz not null default now()
);

create index if not exists product_ingestion_records_quality_state_idx
  on public.product_ingestion_records(batch_id, quality_state);
create index if not exists product_ingestion_overrides_record_created_idx
  on public.product_ingestion_overrides(record_id, created_at);

create or replace function public.product_ingestion_overrides_are_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'product ingestion overrides are append-only';
end;
$$;

drop trigger if exists product_ingestion_overrides_append_only on public.product_ingestion_overrides;
create trigger product_ingestion_overrides_append_only
before update or delete on public.product_ingestion_overrides
for each row execute function public.product_ingestion_overrides_are_append_only();

alter table public.product_ingestion_overrides enable row level security;
revoke all privileges on table public.product_ingestion_overrides from anon, authenticated;
grant all privileges on table public.product_ingestion_overrides to service_role;

-- No client policies are defined. Review state, claim decisions, source-use
-- assumptions, and override history remain server-only.
