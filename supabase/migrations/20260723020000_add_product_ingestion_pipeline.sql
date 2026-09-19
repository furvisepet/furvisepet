alter table public.product_sources
  drop constraint if exists product_sources_source_type_check;

alter table public.product_sources
  add constraint product_sources_source_type_check check (
    source_type in (
      'manual', 'manufacturer_page', 'manufacturer_feed', 'retailer_feed',
      'retailer_page', 'distributor_feed', 'third_party_feed', 'api', 'csv', 'json'
    )
  );

create table if not exists public.product_ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = btrim(provider) and provider <> ''),
  source_type text not null check (
    source_type in (
      'manual', 'manufacturer_page', 'manufacturer_feed', 'retailer_feed',
      'retailer_page', 'distributor_feed', 'third_party_feed', 'api', 'csv', 'json'
    )
  ),
  source_name text,
  source_url text,
  filename text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  species_code text references public.species(code) on delete restrict,
  status text not null default 'uploaded' check (
    status in (
      'uploaded', 'parsing', 'validating', 'ready_for_review', 'partially_valid',
      'approved', 'publishing', 'published', 'failed', 'rejected', 'cancelled'
    )
  ),
  total_records integer not null default 0 check (total_records >= 0),
  processed_records integer not null default 0 check (processed_records >= 0),
  valid_records integer not null default 0 check (valid_records >= 0),
  invalid_records integer not null default 0 check (invalid_records >= 0),
  duplicate_records integer not null default 0 check (duplicate_records >= 0),
  published_records integer not null default 0 check (published_records >= 0),
  rejected_records integer not null default 0 check (rejected_records >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (processed_records <= total_records),
  check (published_records <= total_records),
  check (rejected_records <= total_records)
);

create table if not exists public.product_ingestion_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.product_ingestion_batches(id) on delete restrict,
  row_number integer check (row_number is null or row_number > 0),
  external_id text,
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  normalized_payload jsonb check (normalized_payload is null or jsonb_typeof(normalized_payload) = 'object'),
  status text not null default 'pending' check (
    status in (
      'pending', 'parsed', 'valid', 'valid_with_warnings', 'invalid',
      'possible_duplicate', 'approved', 'rejected', 'published', 'failed'
    )
  ),
  validation_errors jsonb check (validation_errors is null or jsonb_typeof(validation_errors) = 'array'),
  validation_warnings jsonb check (validation_warnings is null or jsonb_typeof(validation_warnings) = 'array'),
  duplicate_match_type text check (duplicate_match_type is null or duplicate_match_type in ('exact', 'probable', 'possible', 'none')),
  duplicate_product_id uuid references public.products(id) on delete set null,
  proposed_action text check (proposed_action is null or proposed_action in ('create', 'update', 'skip', 'merge', 'manual_review')),
  published_product_id uuid references public.products(id) on delete set null,
  content_hash text check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$'),
  normalized_hash text check (normalized_hash is null or normalized_hash ~ '^[a-f0-9]{64}$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, row_number)
);

create table if not exists public.product_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.product_ingestion_batches(id) on delete restrict,
  record_id uuid references public.product_ingestion_records(id) on delete restrict,
  event_type text not null check (event_type = btrim(event_type) and event_type <> ''),
  message text,
  metadata jsonb check (metadata is null or jsonb_typeof(metadata) = 'object'),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists product_ingestion_batches_status_created_idx
  on public.product_ingestion_batches(status, created_at desc);
create index if not exists product_ingestion_batches_provider_created_idx
  on public.product_ingestion_batches(provider, created_at desc);
create index if not exists product_ingestion_records_batch_status_idx
  on public.product_ingestion_records(batch_id, status);
create index if not exists product_ingestion_records_external_id_idx
  on public.product_ingestion_records(batch_id, external_id) where external_id is not null;
create index if not exists product_ingestion_records_content_hash_idx
  on public.product_ingestion_records(content_hash) where content_hash is not null;
create index if not exists product_ingestion_records_duplicate_product_idx
  on public.product_ingestion_records(duplicate_product_id) where duplicate_product_id is not null;
create index if not exists product_ingestion_events_batch_created_idx
  on public.product_ingestion_events(batch_id, created_at);
create index if not exists product_ingestion_events_record_created_idx
  on public.product_ingestion_events(record_id, created_at) where record_id is not null;

drop trigger if exists product_ingestion_batches_touch_updated_at on public.product_ingestion_batches;
create trigger product_ingestion_batches_touch_updated_at
before update on public.product_ingestion_batches
for each row execute function public.catalog_touch_updated_at();

drop trigger if exists product_ingestion_records_touch_updated_at on public.product_ingestion_records;
create trigger product_ingestion_records_touch_updated_at
before update on public.product_ingestion_records
for each row execute function public.catalog_touch_updated_at();

create or replace function public.product_ingestion_preserve_raw_payload()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.raw_payload is distinct from old.raw_payload then
    raise exception 'raw_payload is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists product_ingestion_records_preserve_raw_payload on public.product_ingestion_records;
create trigger product_ingestion_records_preserve_raw_payload
before update on public.product_ingestion_records
for each row execute function public.product_ingestion_preserve_raw_payload();

create or replace function public.product_ingestion_events_are_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'product ingestion events are append-only';
end;
$$;

drop trigger if exists product_ingestion_events_append_only on public.product_ingestion_events;
create trigger product_ingestion_events_append_only
before update or delete on public.product_ingestion_events
for each row execute function public.product_ingestion_events_are_append_only();

create or replace function public.refresh_product_ingestion_batch_counts(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.product_ingestion_batches b
  set
    total_records = counts.total_records,
    processed_records = counts.processed_records,
    valid_records = counts.valid_records,
    invalid_records = counts.invalid_records,
    duplicate_records = counts.duplicate_records,
    published_records = counts.published_records,
    rejected_records = counts.rejected_records
  from (
    select
      count(*)::integer as total_records,
      count(*) filter (where status <> 'pending')::integer as processed_records,
      count(*) filter (where status in ('valid', 'valid_with_warnings', 'approved', 'published'))::integer as valid_records,
      count(*) filter (where status = 'invalid')::integer as invalid_records,
      count(*) filter (where duplicate_match_type in ('exact', 'probable', 'possible'))::integer as duplicate_records,
      count(*) filter (where status = 'published')::integer as published_records,
      count(*) filter (where status = 'rejected')::integer as rejected_records
    from public.product_ingestion_records
    where batch_id = p_batch_id
  ) counts
  where b.id = p_batch_id;
end;
$$;

revoke all on function public.refresh_product_ingestion_batch_counts(uuid) from public, anon, authenticated;
grant execute on function public.refresh_product_ingestion_batch_counts(uuid) to service_role;

alter table public.product_ingestion_batches enable row level security;
alter table public.product_ingestion_records enable row level security;
alter table public.product_ingestion_events enable row level security;

-- No client policies are intentionally defined. Only service-role processes may read or write ingestion data.
