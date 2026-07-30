create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  feature text not null check (feature in ('ask', 'product_question', 'product_explanation', 'safety_followup', 'vet_brief', 'care_plan')),
  credits_used integer not null default 1 check (credits_used >= 0),
  status text not null check (status in ('reserved', 'completed', 'released')),
  period_start date not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists ai_usage_events_user_request_unique
  on public.ai_usage_events(user_id, request_id);
create index if not exists ai_usage_events_user_period_status_idx
  on public.ai_usage_events(user_id, period_start, status);

alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_events force row level security;

drop policy if exists "ai_usage_events_select_own" on public.ai_usage_events;
create policy "ai_usage_events_select_own"
  on public.ai_usage_events for select
  using (user_id = auth.uid());

revoke all on table public.ai_usage_events from public, anon;
revoke insert, update, delete on table public.ai_usage_events from authenticated;
grant select on table public.ai_usage_events to authenticated;

create or replace function public.reserve_ai_credit(
  p_request_id uuid,
  p_feature text,
  p_allowance integer default 50
)
returns table(reservation_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_existing public.ai_usage_events%rowtype;
  v_committed integer := 0;
  v_reserved integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'REQUEST_ID_REQUIRED';
  end if;
  if p_feature not in ('ask', 'product_question', 'product_explanation', 'safety_followup', 'vet_brief', 'care_plan') then
    raise exception using errcode = '22023', message = 'INVALID_AI_FEATURE';
  end if;
  if p_allowance < 1 then
    raise exception using errcode = '22023', message = 'INVALID_AI_ALLOWANCE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_period_start::text, 0));

  select * into v_existing
  from public.ai_usage_events
  where user_id = v_user_id and request_id = p_request_id;

  select
    coalesce(sum(credits_used) filter (where status = 'completed'), 0),
    coalesce(sum(credits_used) filter (where status in ('reserved', 'completed')), 0)
  into v_committed, v_reserved
  from public.ai_usage_events
  where user_id = v_user_id and period_start = v_period_start;

  if v_existing.id is not null and v_existing.status in ('reserved', 'completed') then
    return query select v_existing.status, v_existing.credits_used, greatest(0, p_allowance - v_committed);
    return;
  end if;

  if v_reserved >= p_allowance then
    return query select 'limit_reached'::text, 0, greatest(0, p_allowance - v_committed);
    return;
  end if;

  if v_existing.id is not null and v_existing.status = 'released' then
    update public.ai_usage_events
    set feature = p_feature, credits_used = 1, status = 'reserved', period_start = v_period_start,
      created_at = now(), completed_at = null
    where id = v_existing.id;
  else
    insert into public.ai_usage_events(user_id, request_id, feature, credits_used, status, period_start)
    values (v_user_id, p_request_id, p_feature, 1, 'reserved', v_period_start);
  end if;

  return query select 'reserved'::text, 1, greatest(0, p_allowance - v_committed);
end;
$$;

create or replace function public.complete_ai_credit(p_request_id uuid, p_allowance integer default 50)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_period_start::text, 0));
  update public.ai_usage_events
  set status = 'completed', credits_used = 1, completed_at = coalesce(completed_at, now())
  where user_id = v_user_id and request_id = p_request_id and status = 'reserved'
  returning * into v_event;
  if v_event.id is null then
    select * into v_event from public.ai_usage_events where user_id = v_user_id and request_id = p_request_id;
  end if;
  if v_event.id is null then raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND'; end if;
  select coalesce(sum(ai_usage_events.credits_used), 0)::integer into v_completed
  from public.ai_usage_events
  where user_id = v_user_id and period_start = v_period_start and status = 'completed';
  return query select v_event.status, v_event.credits_used, greatest(0, p_allowance - v_completed);
end;
$$;

create or replace function public.release_ai_credit(p_request_id uuid, p_allowance integer default 50)
returns table(event_status text, credits_used integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_event public.ai_usage_events%rowtype;
  v_completed integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_period_start::text, 0));
  update public.ai_usage_events
  set status = 'released', credits_used = 0, completed_at = null
  where user_id = v_user_id and request_id = p_request_id and status = 'reserved'
  returning * into v_event;
  if v_event.id is null then
    select * into v_event from public.ai_usage_events where user_id = v_user_id and request_id = p_request_id;
  end if;
  if v_event.id is null then raise exception using errcode = 'P0002', message = 'AI_RESERVATION_NOT_FOUND'; end if;
  select coalesce(sum(ai_usage_events.credits_used), 0)::integer into v_completed
  from public.ai_usage_events
  where user_id = v_user_id and period_start = v_period_start and status = 'completed';
  return query select v_event.status, v_event.credits_used, greatest(0, p_allowance - v_completed);
end;
$$;

revoke all on function public.reserve_ai_credit(uuid, text, integer) from public, anon;
revoke all on function public.complete_ai_credit(uuid, integer) from public, anon;
revoke all on function public.release_ai_credit(uuid, integer) from public, anon;
grant execute on function public.reserve_ai_credit(uuid, text, integer) to authenticated;
grant execute on function public.complete_ai_credit(uuid, integer) to authenticated;
grant execute on function public.release_ai_credit(uuid, integer) to authenticated;

create table if not exists public.pet_concerns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  title text not null,
  normalized_key text not null,
  status text not null default 'active' check (status in ('active', 'monitoring', 'resolved', 'reopened')),
  severity text not null default 'important' check (severity in ('routine', 'important', 'urgent')),
  source_care_entry_id uuid references public.pet_care_entries(id) on delete set null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);

create index if not exists pet_concerns_owner_pet_status_idx
  on public.pet_concerns(user_id, pet_profile_id, status, updated_at desc);
create index if not exists pet_concerns_pet_key_idx
  on public.pet_concerns(pet_profile_id, normalized_key, updated_at desc);

alter table public.pet_care_entries
  add column if not exists concern_id uuid references public.pet_concerns(id) on delete set null;
create index if not exists pet_care_entries_concern_idx on public.pet_care_entries(concern_id, occurred_at desc);

create table if not exists public.ai_update_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  conversation_id uuid references public.ask_conversations(id) on delete cascade,
  source_message_id uuid references public.ask_conversation_messages(id) on delete set null,
  concern_id uuid references public.pet_concerns(id) on delete set null,
  type text not null check (type in ('history', 'memory', 'concern_resolution', 'concern_opening')),
  title text not null,
  details text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'saved', 'dismissed')),
  created_at timestamptz not null default now(),
  actioned_at timestamptz
);

create index if not exists ai_update_suggestions_owner_status_idx
  on public.ai_update_suggestions(user_id, status, created_at desc);
create index if not exists ai_update_suggestions_conversation_idx
  on public.ai_update_suggestions(conversation_id, created_at);

alter table public.pet_concerns enable row level security;
alter table public.pet_concerns force row level security;
alter table public.ai_update_suggestions enable row level security;
alter table public.ai_update_suggestions force row level security;

drop policy if exists "pet_concerns_select_own" on public.pet_concerns;
drop policy if exists "pet_concerns_insert_own" on public.pet_concerns;
drop policy if exists "pet_concerns_update_own" on public.pet_concerns;
drop policy if exists "pet_concerns_delete_own" on public.pet_concerns;
create policy "pet_concerns_select_own" on public.pet_concerns for select using (user_id = auth.uid());
create policy "pet_concerns_insert_own" on public.pet_concerns for insert with check (
  user_id = auth.uid() and exists (select 1 from public.dog_profiles where id = pet_profile_id and user_id = auth.uid())
  and (source_care_entry_id is null or exists (
    select 1 from public.pet_care_entries
    where id = source_care_entry_id and pet_profile_id = pet_concerns.pet_profile_id and user_id = auth.uid()
  ))
);
create policy "pet_concerns_update_own" on public.pet_concerns for update using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.dog_profiles where id = pet_profile_id and user_id = auth.uid())
  and (source_care_entry_id is null or exists (
    select 1 from public.pet_care_entries
    where id = source_care_entry_id and pet_profile_id = pet_concerns.pet_profile_id and user_id = auth.uid()
  ))
);
create policy "pet_concerns_delete_own" on public.pet_concerns for delete using (user_id = auth.uid());

drop policy if exists "ai_update_suggestions_select_own" on public.ai_update_suggestions;
drop policy if exists "ai_update_suggestions_insert_own" on public.ai_update_suggestions;
drop policy if exists "ai_update_suggestions_update_own" on public.ai_update_suggestions;
drop policy if exists "ai_update_suggestions_delete_own" on public.ai_update_suggestions;
create policy "ai_update_suggestions_select_own" on public.ai_update_suggestions for select using (user_id = auth.uid());
create policy "ai_update_suggestions_insert_own" on public.ai_update_suggestions for insert with check (
  user_id = auth.uid() and exists (select 1 from public.dog_profiles where id = pet_profile_id and user_id = auth.uid())
  and (conversation_id is null or exists (select 1 from public.ask_conversations where id = conversation_id and user_id = auth.uid()))
  and (source_message_id is null or exists (select 1 from public.ask_conversation_messages where id = source_message_id and user_id = auth.uid()))
  and (concern_id is null or exists (select 1 from public.pet_concerns where id = concern_id and pet_profile_id = ai_update_suggestions.pet_profile_id and user_id = auth.uid()))
);
create policy "ai_update_suggestions_update_own" on public.ai_update_suggestions for update using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.dog_profiles where id = pet_profile_id and user_id = auth.uid())
  and (conversation_id is null or exists (select 1 from public.ask_conversations where id = conversation_id and user_id = auth.uid()))
  and (source_message_id is null or exists (select 1 from public.ask_conversation_messages where id = source_message_id and user_id = auth.uid()))
  and (concern_id is null or exists (select 1 from public.pet_concerns where id = concern_id and pet_profile_id = ai_update_suggestions.pet_profile_id and user_id = auth.uid()))
);
create policy "ai_update_suggestions_delete_own" on public.ai_update_suggestions for delete using (user_id = auth.uid());

revoke all on table public.pet_concerns, public.ai_update_suggestions from anon;
grant select, insert, update, delete on table public.pet_concerns, public.ai_update_suggestions to authenticated;

create or replace function public.resolve_concern_suggestion(p_suggestion_id uuid)
returns table(concern_status text, care_entry_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_suggestion public.ai_update_suggestions%rowtype;
  v_concern public.pet_concerns%rowtype;
  v_entry_id uuid;
  v_note text;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select * into v_suggestion from public.ai_update_suggestions
  where id = p_suggestion_id and user_id = v_user_id for update;
  if v_suggestion.id is null then raise exception using errcode = 'P0002', message = 'SUGGESTION_NOT_FOUND'; end if;
  if v_suggestion.status = 'saved' then
    return query select 'resolved'::text, null::uuid;
    return;
  end if;
  if v_suggestion.status <> 'pending' or v_suggestion.type <> 'concern_resolution' or v_suggestion.concern_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CONCERN_SUGGESTION';
  end if;
  select * into v_concern from public.pet_concerns
  where id = v_suggestion.concern_id and pet_profile_id = v_suggestion.pet_profile_id and user_id = v_user_id for update;
  if v_concern.id is null then raise exception using errcode = 'P0002', message = 'CONCERN_NOT_FOUND'; end if;
  v_note := coalesce(nullif(btrim(v_suggestion.payload->>'resolutionNote'), ''), nullif(btrim(v_suggestion.details), ''), 'Concern resolved.');
  insert into public.pet_care_entries(user_id, pet_profile_id, category, title, note, occurred_at, severity, concern_id)
  values (
    v_user_id,
    v_suggestion.pet_profile_id,
    'symptom',
    coalesce(nullif(btrim(v_suggestion.payload->>'title'), ''), 'Concern resolved'),
    coalesce(nullif(btrim(v_suggestion.details), ''), v_note),
    now(),
    null,
    v_concern.id
  ) returning id into v_entry_id;
  update public.pet_concerns set status = 'resolved', resolution_note = v_note, resolved_at = now(), updated_at = now()
  where id = v_concern.id;
  update public.ai_update_suggestions set status = 'saved', actioned_at = now()
  where id = v_suggestion.id;
  return query select 'resolved'::text, v_entry_id;
end;
$$;

revoke all on function public.resolve_concern_suggestion(uuid) from public, anon;
grant execute on function public.resolve_concern_suggestion(uuid) to authenticated;

create or replace function public.sync_pet_concern_from_care_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_severity text;
  v_existing public.pet_concerns%rowtype;
  v_concerning boolean;
begin
  v_concerning := (
    new.category = 'symptom' and new.severity in ('moderate', 'severe')
  ) or coalesce(new.title, '') || ' ' || new.note ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)';
  if not v_concerning then return new; end if;
  v_key := case
    when coalesce(new.title, '') || ' ' || new.note ~* '(breath|breathing)' then 'breathing'
    else regexp_replace(lower(coalesce(nullif(btrim(new.title), ''), new.category)), '[^a-z0-9]+', '_', 'g')
  end;
  v_severity := case
    when new.severity = 'severe' or coalesce(new.title, '') || ' ' || new.note ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)' then 'urgent'
    else 'important'
  end;
  select * into v_existing from public.pet_concerns
  where pet_profile_id = new.pet_profile_id and normalized_key = v_key
  order by updated_at desc limit 1;
  if v_existing.id is null then
    insert into public.pet_concerns(user_id, pet_profile_id, title, normalized_key, status, severity, source_care_entry_id, opened_at, updated_at)
    values (new.user_id, new.pet_profile_id, coalesce(nullif(btrim(new.title), ''), 'Care concern'), v_key, 'active', v_severity, new.id, new.occurred_at, now());
  elsif v_existing.status = 'resolved' then
    update public.pet_concerns set status = 'reopened', severity = v_severity, source_care_entry_id = new.id,
      updated_at = now(), resolved_at = null, resolution_note = null where id = v_existing.id;
  else
    update public.pet_concerns set status = case when status = 'monitoring' then 'monitoring' else 'active' end,
      severity = case when v_severity = 'urgent' then 'urgent' else severity end,
      source_care_entry_id = new.id, updated_at = now() where id = v_existing.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_pet_concern_from_care_entry() from public, anon, authenticated;
drop trigger if exists sync_pet_concern_from_care_entry on public.pet_care_entries;
create trigger sync_pet_concern_from_care_entry
after insert or update of title, note, category, severity on public.pet_care_entries
for each row execute function public.sync_pet_concern_from_care_entry();

insert into public.pet_concerns(user_id, pet_profile_id, title, normalized_key, status, severity, source_care_entry_id, opened_at, updated_at)
select e.user_id, e.pet_profile_id, coalesce(nullif(btrim(e.title), ''), 'Care concern'),
  case when coalesce(e.title, '') || ' ' || e.note ~* '(breath|breathing)' then 'breathing'
       else regexp_replace(lower(coalesce(nullif(btrim(e.title), ''), e.category)), '[^a-z0-9]+', '_', 'g') end,
  'active',
  case when e.severity = 'severe' or coalesce(e.title, '') || ' ' || e.note ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin)' then 'urgent' else 'important' end,
  e.id, e.occurred_at, now()
from public.pet_care_entries e
where e.occurred_at >= now() - interval '30 days'
  and ((e.category = 'symptom' and e.severity in ('moderate', 'severe'))
    or coalesce(e.title, '') || ' ' || e.note ~* '(trouble breathing|short(ness|age) of breath|labored breathing|open.?mouth breathing|collapse|seizure|severe bleeding|cannot urinate|inability to urinate|toxin|extreme lethargy|repeated vomiting)')
  and not exists (
    select 1 from public.pet_concerns c
    where c.pet_profile_id = e.pet_profile_id
      and c.source_care_entry_id = e.id
  );
