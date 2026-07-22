create table if not exists public.shop_search_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_key)
);

alter table public.shop_search_usage enable row level security;

drop policy if exists "Users can select their Shop search usage" on public.shop_search_usage;
create policy "Users can select their Shop search usage"
  on public.shop_search_usage
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their Shop search usage" on public.shop_search_usage;
create policy "Users can insert their Shop search usage"
  on public.shop_search_usage
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their Shop search usage" on public.shop_search_usage;
create policy "Users can update their Shop search usage"
  on public.shop_search_usage
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists shop_search_usage_user_month_idx
  on public.shop_search_usage(user_id, month_key);

create or replace function public.shop_search_usage_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shop_search_usage_touch_updated_at on public.shop_search_usage;
create trigger shop_search_usage_touch_updated_at
before update on public.shop_search_usage
for each row
execute function public.shop_search_usage_touch_updated_at();

create table if not exists public.shop_query_interpretations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.dog_profiles(id) on delete cascade,
  normalized_query text not null,
  query_hash text not null,
  pet_context_hash text not null,
  schema_version text not null,
  interpretation_json jsonb not null,
  source text not null check (source in ('ai', 'fallback')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  hit_count integer not null default 0 check (hit_count >= 0),
  unique(user_id, pet_id, query_hash, pet_context_hash, schema_version)
);

alter table public.shop_query_interpretations enable row level security;

drop policy if exists "Users can select their Shop query interpretations" on public.shop_query_interpretations;
create policy "Users can select their Shop query interpretations"
  on public.shop_query_interpretations
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their Shop query interpretations" on public.shop_query_interpretations;
create policy "Users can insert their Shop query interpretations"
  on public.shop_query_interpretations
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their Shop query interpretations" on public.shop_query_interpretations;
create policy "Users can update their Shop query interpretations"
  on public.shop_query_interpretations
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists shop_query_interpretations_user_pet_query_idx
  on public.shop_query_interpretations(user_id, pet_id, query_hash, pet_context_hash, schema_version);

create or replace function public.shop_query_interpretations_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shop_query_interpretations_touch_updated_at on public.shop_query_interpretations;
create trigger shop_query_interpretations_touch_updated_at
before update on public.shop_query_interpretations
for each row
execute function public.shop_query_interpretations_touch_updated_at();
