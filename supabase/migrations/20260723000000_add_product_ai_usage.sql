create table if not exists public.product_ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  used_count integer not null default 0 check (used_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_key)
);

alter table public.product_ai_usage
  add column if not exists used_count integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_ai_usage'
      and column_name = 'count'
  ) then
    update public.product_ai_usage
    set used_count = greatest(used_count, count)
    where count is not null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_ai_usage_used_count_nonnegative'
      and conrelid = 'public.product_ai_usage'::regclass
  ) then
    alter table public.product_ai_usage
      add constraint product_ai_usage_used_count_nonnegative check (used_count >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_ai_usage_user_month_key'
      and conrelid = 'public.product_ai_usage'::regclass
  ) then
    alter table public.product_ai_usage
      add constraint product_ai_usage_user_month_key unique(user_id, month_key);
  end if;
end;
$$;

alter table public.product_ai_usage enable row level security;

drop policy if exists "Users can select their Product AI usage" on public.product_ai_usage;
create policy "Users can select their Product AI usage"
  on public.product_ai_usage
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their Product AI usage" on public.product_ai_usage;
create policy "Users can insert their Product AI usage"
  on public.product_ai_usage
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their Product AI usage" on public.product_ai_usage;
create policy "Users can update their Product AI usage"
  on public.product_ai_usage
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists product_ai_usage_user_month_idx
  on public.product_ai_usage(user_id, month_key);

create or replace function public.product_ai_usage_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_ai_usage_touch_updated_at on public.product_ai_usage;
create trigger product_ai_usage_touch_updated_at
before update on public.product_ai_usage
for each row
execute function public.product_ai_usage_touch_updated_at();
