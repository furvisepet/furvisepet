create table if not exists public.vet_visit_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  previous_version_id uuid references public.vet_visit_briefs(id) on delete set null,
  version integer not null default 1 check (version > 0),
  generated_at timestamptz not null default now(),
  date_range_start date not null,
  date_range_end date not null,
  source_entry_ids uuid[] not null default '{}',
  document_version integer not null default 1 check (document_version > 0),
  confirmed_title text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'archived')),
  confirmed_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vet_visit_briefs_date_range_check check (date_range_start <= date_range_end),
  constraint vet_visit_briefs_title_length_check check (
    char_length(btrim(confirmed_title)) between 1 and 160
  ),
  constraint vet_visit_briefs_source_count_check check (
    cardinality(source_entry_ids) <= 300
  ),
  constraint vet_visit_briefs_content_size_check check (
    octet_length(confirmed_data::text) <= 262144
  )
);

create unique index if not exists vet_visit_briefs_owner_pet_version_idx
  on public.vet_visit_briefs (user_id, pet_profile_id, version);

create index if not exists vet_visit_briefs_owner_created_idx
  on public.vet_visit_briefs (user_id, created_at desc);

create index if not exists vet_visit_briefs_pet_created_idx
  on public.vet_visit_briefs (pet_profile_id, created_at desc);

create index if not exists vet_visit_briefs_owner_status_created_idx
  on public.vet_visit_briefs (user_id, status, created_at desc);

create index if not exists vet_visit_briefs_previous_version_idx
  on public.vet_visit_briefs (previous_version_id)
  where previous_version_id is not null;

create or replace function public.vet_visit_briefs_validate_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_row public.vet_visit_briefs%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.pet_profile_id is distinct from old.pet_profile_id
    or new.previous_version_id is distinct from old.previous_version_id
    or new.version is distinct from old.version
    or new.generated_at is distinct from old.generated_at
    or new.date_range_start is distinct from old.date_range_start
    or new.date_range_end is distinct from old.date_range_end
    or new.source_entry_ids is distinct from old.source_entry_ids
    or new.document_version is distinct from old.document_version
    or new.confirmed_title is distinct from old.confirmed_title
    or new.confirmed_data is distinct from old.confirmed_data
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'confirmed Vet Visit Brief fields are immutable; create a new version instead'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.dog_profiles
    where dog_profiles.id = new.pet_profile_id
      and dog_profiles.user_id = new.user_id
  ) then
    raise exception 'Vet Visit Brief owner and pet do not match'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(new.source_entry_ids) as source_id
    where not exists (
      select 1
      from public.pet_care_entries
      where pet_care_entries.id = source_id
        and pet_care_entries.user_id = new.user_id
        and pet_care_entries.pet_profile_id = new.pet_profile_id
    )
  ) then
    raise exception 'Vet Visit Brief source entries must belong to the same owner and pet'
      using errcode = '23514';
  end if;

  if new.previous_version_id is null then
    if new.version <> 1 then
      raise exception 'an initial Vet Visit Brief must be version 1'
        using errcode = '23514';
    end if;
  else
    select * into previous_row
    from public.vet_visit_briefs
    where id = new.previous_version_id;

    if not found
      or previous_row.user_id <> new.user_id
      or previous_row.pet_profile_id <> new.pet_profile_id
      or new.version <> previous_row.version + 1
    then
      raise exception 'Vet Visit Brief version relationship is invalid'
        using errcode = '23514';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.vet_visit_briefs_validate_ownership() from public, anon, authenticated;

drop trigger if exists vet_visit_briefs_validate_ownership on public.vet_visit_briefs;
create trigger vet_visit_briefs_validate_ownership
before insert or update on public.vet_visit_briefs
for each row execute function public.vet_visit_briefs_validate_ownership();

alter table public.vet_visit_briefs enable row level security;
alter table public.vet_visit_briefs force row level security;

drop policy if exists "vet_visit_briefs_select_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_select_own"
  on public.vet_visit_briefs for select
  using (user_id = auth.uid());

drop policy if exists "vet_visit_briefs_insert_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_insert_own"
  on public.vet_visit_briefs for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.dog_profiles
      where dog_profiles.id = vet_visit_briefs.pet_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "vet_visit_briefs_update_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_update_own"
  on public.vet_visit_briefs for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.dog_profiles
      where dog_profiles.id = vet_visit_briefs.pet_profile_id
        and dog_profiles.user_id = auth.uid()
    )
  );

drop policy if exists "vet_visit_briefs_delete_own" on public.vet_visit_briefs;
create policy "vet_visit_briefs_delete_own"
  on public.vet_visit_briefs for delete
  using (user_id = auth.uid());

revoke all on table public.vet_visit_briefs from anon;
grant select, insert, update, delete on table public.vet_visit_briefs to authenticated;
