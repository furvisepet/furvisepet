create table if not exists public.dog_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  species text,
  breed text,
  age_value numeric,
  age_unit text,
  weight_value numeric,
  weight_unit text,
  current_food text,
  main_concern text,
  wellness_goal text,
  avoid_ingredients text[] default '{}',
  monthly_budget numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dog_profiles
  add column if not exists species text;

alter table public.dog_profiles
  add column if not exists wellness_goal text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dog_profiles_species_check'
      and conrelid = 'public.dog_profiles'::regclass
  ) then
    alter table public.dog_profiles
      add constraint dog_profiles_species_check
      check (species is null or species in ('dog', 'cat'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dog_profiles_wellness_goal_check'
      and conrelid = 'public.dog_profiles'::regclass
  ) then
    alter table public.dog_profiles
      add constraint dog_profiles_wellness_goal_check
      check (
        wellness_goal is null
        or wellness_goal in ('nutrition', 'dental_care', 'grooming', 'activity', 'preventive_care', 'reminders', 'something_else')
      );
  end if;
end $$;

create table if not exists public.dog_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  type text,
  text text not null,
  confidence text,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.dog_product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  feedback_type text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint dog_product_feedback_type_check check (
    feedback_type in (
      'saved',
      'tried',
      'worked',
      'did_not_work',
      'too_expensive',
      'avoid_product'
    )
  )
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country text,
  country_source text default null,
  country_detected_at timestamptz,
  country_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists country text;

alter table public.user_profiles
  add column if not exists country_source text default null;

alter table public.user_profiles
  add column if not exists country_detected_at timestamptz;

alter table public.user_profiles
  add column if not exists country_updated_at timestamptz;

alter table public.user_profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.user_profiles
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_country_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_country_check
      check (country is null or country in ('US', 'CA'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_country_source_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_country_source_check
      check (country_source is null or country_source in ('detected', 'manual', 'env_default'));
  end if;
end $$;

alter table public.user_profiles enable row level security;

drop policy if exists "Users can select their account profile" on public.user_profiles;
create policy "Users can select their account profile"
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their account profile" on public.user_profiles;
create policy "Users can insert their account profile"
  on public.user_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their account profile" on public.user_profiles;
create policy "Users can update their account profile"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.dog_profiles enable row level security;
alter table public.dog_memories enable row level security;
alter table public.dog_product_feedback enable row level security;

drop policy if exists "Users can select their dog profiles" on public.dog_profiles;
create policy "Users can select their dog profiles"
  on public.dog_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their dog profiles" on public.dog_profiles;
create policy "Users can insert their dog profiles"
  on public.dog_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their dog profiles" on public.dog_profiles;
create policy "Users can update their dog profiles"
  on public.dog_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their dog profiles" on public.dog_profiles;
create policy "Users can delete their dog profiles"
  on public.dog_profiles
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can select their dog memories" on public.dog_memories;
create policy "Users can select their dog memories"
  on public.dog_memories
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their dog memories" on public.dog_memories;
create policy "Users can insert their dog memories"
  on public.dog_memories
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.dog_profiles
      where dog_profiles.id = dog_memories.dog_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their dog memories" on public.dog_memories;
create policy "Users can update their dog memories"
  on public.dog_memories
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.dog_profiles
      where dog_profiles.id = dog_memories.dog_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their dog memories" on public.dog_memories;
create policy "Users can delete their dog memories"
  on public.dog_memories
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can select their dog product feedback" on public.dog_product_feedback;
create policy "Users can select their dog product feedback"
  on public.dog_product_feedback
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their dog product feedback" on public.dog_product_feedback;
create policy "Users can insert their dog product feedback"
  on public.dog_product_feedback
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.dog_profiles
      where dog_profiles.id = dog_product_feedback.dog_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their dog product feedback" on public.dog_product_feedback;
create policy "Users can update their dog product feedback"
  on public.dog_product_feedback
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.dog_profiles
      where dog_profiles.id = dog_product_feedback.dog_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their dog product feedback" on public.dog_product_feedback;
create policy "Users can delete their dog product feedback"
  on public.dog_product_feedback
  for delete
  using (auth.uid() = user_id);

create index if not exists dog_profiles_user_id_idx
  on public.dog_profiles(user_id);

create index if not exists dog_memories_user_id_idx
  on public.dog_memories(user_id);

create index if not exists dog_memories_dog_profile_id_idx
  on public.dog_memories(dog_profile_id);

create index if not exists dog_product_feedback_user_id_idx
  on public.dog_product_feedback(user_id);

create index if not exists dog_product_feedback_dog_profile_id_idx
  on public.dog_product_feedback(dog_profile_id);

create unique index if not exists dog_product_feedback_unique_type_idx
  on public.dog_product_feedback(user_id, dog_profile_id, product_id, feedback_type);

create table if not exists public.pet_care_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  category text not null,
  title text,
  note text not null,
  severity text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_care_entries_category_check check (
    category in (
      'symptom',
      'food',
      'medication',
      'activity',
      'grooming',
      'vet_visit',
      'behavior',
      'general'
    )
  ),
  constraint pet_care_entries_severity_check check (
    severity in ('mild', 'moderate', 'severe') or severity is null
  ),
  constraint pet_care_entries_note_check check (btrim(note) <> '')
);

alter table public.pet_care_entries enable row level security;

drop policy if exists "Users can select their care entries" on public.pet_care_entries;
create policy "Users can select their care entries"
  on public.pet_care_entries
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their care entries" on public.pet_care_entries;
create policy "Users can insert their care entries"
  on public.pet_care_entries
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.dog_profiles
      where dog_profiles.id = pet_care_entries.pet_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their care entries" on public.pet_care_entries;
create policy "Users can update their care entries"
  on public.pet_care_entries
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.dog_profiles
      where dog_profiles.id = pet_care_entries.pet_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their care entries" on public.pet_care_entries;
create policy "Users can delete their care entries"
  on public.pet_care_entries
  for delete
  using (auth.uid() = user_id);

create index if not exists pet_care_entries_user_id_idx
  on public.pet_care_entries(user_id);

create index if not exists pet_care_entries_pet_profile_id_idx
  on public.pet_care_entries(pet_profile_id);

create index if not exists pet_care_entries_occurred_at_desc_idx
  on public.pet_care_entries(occurred_at desc);

create index if not exists pet_care_entries_user_id_pet_profile_id_idx
  on public.pet_care_entries(user_id, pet_profile_id);

create or replace function public.pet_care_entries_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pet_care_entries_touch_updated_at on public.pet_care_entries;
create trigger pet_care_entries_touch_updated_at
before update on public.pet_care_entries
for each row
execute function public.pet_care_entries_touch_updated_at();

create table if not exists public.ask_furvise_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_key)
);

alter table public.ask_furvise_usage enable row level security;

drop policy if exists "Users can select their Ask Furvise usage" on public.ask_furvise_usage;
create policy "Users can select their Ask Furvise usage"
  on public.ask_furvise_usage
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their Ask Furvise usage" on public.ask_furvise_usage;
create policy "Users can insert their Ask Furvise usage"
  on public.ask_furvise_usage
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their Ask Furvise usage" on public.ask_furvise_usage;
create policy "Users can update their Ask Furvise usage"
  on public.ask_furvise_usage
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ask_furvise_usage_user_month_idx
  on public.ask_furvise_usage(user_id, month_key);

create or replace function public.ask_furvise_usage_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ask_furvise_usage_touch_updated_at on public.ask_furvise_usage;
create trigger ask_furvise_usage_touch_updated_at
before update on public.ask_furvise_usage
for each row
execute function public.ask_furvise_usage_touch_updated_at();

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
