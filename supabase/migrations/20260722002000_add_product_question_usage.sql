create table if not exists public.product_question_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month_key)
);

alter table public.product_question_usage enable row level security;

drop policy if exists "Users can select their product question usage" on public.product_question_usage;
create policy "Users can select their product question usage"
  on public.product_question_usage
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their product question usage" on public.product_question_usage;
create policy "Users can insert their product question usage"
  on public.product_question_usage
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their product question usage" on public.product_question_usage;
create policy "Users can update their product question usage"
  on public.product_question_usage
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists product_question_usage_user_month_idx
  on public.product_question_usage(user_id, month_key);

create or replace function public.product_question_usage_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_question_usage_touch_updated_at on public.product_question_usage;
create trigger product_question_usage_touch_updated_at
before update on public.product_question_usage
for each row
execute function public.product_question_usage_touch_updated_at();
