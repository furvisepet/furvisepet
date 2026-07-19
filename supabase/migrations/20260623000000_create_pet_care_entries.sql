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
