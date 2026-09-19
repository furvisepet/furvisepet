-- Local preparation only: deploy before enabling successful correction reads.
-- No shadow write or projection cutover. Existing owner/pet RLS remains intact.
create extension if not exists pg_trgm with schema extensions;
create index if not exists care_history_owner_pet_cursor_idx
  on public.pet_care_entries(user_id, pet_profile_id, occurred_at, id) where deleted_at is null;
-- Existing installations may have pg_trgm in public rather than extensions.
-- Resolve its actual namespace; do not relocate an existing shared extension.
do $$ declare trgm_schema name; begin
  select n.nspname into strict trgm_schema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index if not exists care_history_note_search_idx on public.pet_care_entries using gin(note %I.gin_trgm_ops) where deleted_at is null', trgm_schema);
  execute format('create index if not exists care_history_title_search_idx on public.pet_care_entries using gin(title %I.gin_trgm_ops) where deleted_at is null', trgm_schema);
end $$;
create index if not exists ask_correction_subject_event_idx
  on public.semantic_claims(user_id, subject_id, occurred_at, id)
  where operation_type in ('correct', 'supersede');

-- Fail-closed memory of a removed destructive edge. This is not a new effective
-- claim, and never restores a target. It covers future administrative/cascade
-- deletions; previously hard-deleted edges cannot be reconstructed from text.
create table public.ask_history_removed_relation_targets (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_claim_id uuid not null,
  relation_id uuid not null,
  legacy_row_id uuid,
  removed_at timestamptz not null default now(),
  primary key(user_id, target_claim_id, relation_id)
);
alter table public.ask_history_removed_relation_targets enable row level security;
alter table public.ask_history_removed_relation_targets force row level security;
create index ask_history_removed_source_idx on public.ask_history_removed_relation_targets(user_id,legacy_row_id) where legacy_row_id is not null;
revoke all on public.ask_history_removed_relation_targets from public, anon, authenticated, service_role;
create function public.preserve_removed_ask_relation_target() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and new.user_id = old.user_id and new.from_claim_id = old.from_claim_id
    and new.to_claim_id = old.to_claim_id and new.relation_type = old.relation_type then return new; end if;
  if old.relation_type in ('corrects', 'supersedes', 'retracts')
    and exists(select 1 from auth.users where id = old.user_id) then
    insert into public.ask_history_removed_relation_targets(user_id, target_claim_id, relation_id)
      values(old.user_id, old.to_claim_id, old.id) on conflict do nothing;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.preserve_removed_ask_relation_target() from public, anon, authenticated, service_role;
create trigger preserve_removed_ask_relation_target before delete or update on public.semantic_claim_relations
  for each row execute function public.preserve_removed_ask_relation_target();

-- A hard-deleted claim/lineage must not turn its original care row into a new
-- apparently unlinked assertion. Preserve the source identity independently
-- of the deleted claim FK. This marker is conservative and is not auto-cleared
-- by restoration/reimport; an explicit governed repair is required.
create function public.preserve_removed_ask_lineage() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and new.user_id = old.user_id and new.claim_id = old.claim_id
    and new.legacy_row_id = old.legacy_row_id and new.legacy_table = old.legacy_table then return new; end if;
  if old.legacy_table = 'pet_care_entries' and exists(select 1 from auth.users where id = old.user_id) then
    insert into public.ask_history_removed_relation_targets(user_id,target_claim_id,relation_id,legacy_row_id)
      values(old.user_id,old.claim_id,old.claim_id,old.legacy_row_id) on conflict do nothing;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.preserve_removed_ask_lineage() from public, anon, authenticated, service_role;
create trigger preserve_removed_ask_lineage before delete or update on public.semantic_claim_legacy_lineage
  for each row execute function public.preserve_removed_ask_lineage();

-- Claims are deliberately service-only. This bounded read boundary exposes no
-- writes and scopes every table/endpoint/source join to the authenticated owner.
create or replace function public.read_ask_history_correction_page(
  p_care_ids uuid[] default '{}', p_claim_ids uuid[] default '{}',
  p_seed_pet_ids uuid[] default '{}', p_event_from timestamptz default null,
  p_event_to timestamptz default null, p_terms text[] default '{}'
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  owner_id uuid := auth.uid();
  roots uuid[]; endpoints uuid[];
  edges jsonb; claim_rows jsonb; source_rows jsonb; links jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(cardinality(p_care_ids), 0) > 64 or coalesce(cardinality(p_claim_ids), 0) > 64
    or coalesce(cardinality(p_seed_pet_ids), 0) > 3 or coalesce(cardinality(p_terms), 0) > 6
    or exists(select 1 from unnest(p_terms) term where term is null or length(term) < 3 or length(term) > 32 or term ~ '[%_]') then
    raise exception 'History read bound exceeded' using errcode = '22023';
  end if;
  select coalesce(array_agg(id), '{}') into roots from (
    select c.id from public.semantic_claims c
    where c.user_id = owner_id and (c.id = any(p_claim_ids) or c.id in (
      select l.claim_id from public.semantic_claim_legacy_lineage l
      join public.pet_care_entries e on e.id = l.legacy_row_id and e.user_id = owner_id
      where l.user_id = owner_id and l.legacy_table = 'pet_care_entries' and e.id = any(p_care_ids)
    ) or (
      -- Reassignment may leave no legacy row under the corrected subject.
      -- Only stored destructive-edge authors seed this lookup, not shadow
      -- assertions or an inferred relationship from correction wording.
      c.subject_type = 'pet' and c.subject_id = any(p_seed_pet_ids)
      and exists(select 1 from public.dog_profiles p where p.id = c.subject_id and p.user_id = owner_id)
      and c.operation_type in ('correct', 'supersede')
      and (p_event_from is null or c.occurred_at >= p_event_from)
      and (p_event_to is null or c.occurred_at < p_event_to)
      and (coalesce(cardinality(p_terms), 0) = 0 or exists(select 1 from unnest(p_terms) term
        where concat_ws(' ', c.structured_value->>'note', c.structured_value->>'title', c.canonical_concept_key) ilike '%' || term || '%'))
      and exists(select 1 from public.semantic_claim_relations r where r.user_id = owner_id
        and r.from_claim_id = c.id and r.relation_type in ('corrects', 'supersedes'))
    )) order by c.id limit 129
  ) bounded;
  select coalesce(jsonb_agg(to_jsonb(e)), '[]') into edges from (
    select r.* from public.semantic_claim_relations r
    where r.user_id = owner_id and (r.from_claim_id = any(roots) or r.to_claim_id = any(roots))
    order by r.id limit 129
  ) e;
  select coalesce(array_agg(distinct id), '{}') into endpoints from (
    select unnest(roots) id union select (e->>'from_claim_id')::uuid from jsonb_array_elements(edges) e
    union select (e->>'to_claim_id')::uuid from jsonb_array_elements(edges) e
  ) ids;
  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into claim_rows from (
    select c.* from public.semantic_claims c join public.dog_profiles p on p.id = c.subject_id and p.user_id = owner_id
    where c.user_id = owner_id and c.subject_type = 'pet' and c.id = any(endpoints) order by c.id limit 129
  ) c;
  select coalesce(jsonb_agg(to_jsonb(l)), '[]') into links from (
    select l.* from public.semantic_claim_legacy_lineage l
    where l.user_id = owner_id and l.claim_id = any(endpoints) and l.legacy_table = 'pet_care_entries'
    order by l.id limit 129
  ) l;
  select coalesce(jsonb_agg(to_jsonb(e)), '[]') into source_rows from (
    select e.* from public.pet_care_entries e join public.dog_profiles p on p.id = e.pet_profile_id and p.user_id = owner_id
    where e.user_id = owner_id and (e.id = any(p_care_ids) or e.id in (
      select (l->>'legacy_row_id')::uuid from jsonb_array_elements(links) l
    )) order by e.id limit 193
  ) e;
  return jsonb_build_object('claims', claim_rows, 'relations', edges, 'lineage', links, 'sources', source_rows,
    'withheld_claim_ids', coalesce((select jsonb_agg(distinct m.target_claim_id) from public.ask_history_removed_relation_targets m
      where m.user_id = owner_id and m.target_claim_id = any(endpoints)), '[]'::jsonb),
    'withheld_source_ids', coalesce((select jsonb_agg(distinct m.legacy_row_id) from public.ask_history_removed_relation_targets m
      where m.user_id = owner_id and m.legacy_row_id = any(p_care_ids)), '[]'::jsonb),
    'truncated', cardinality(roots) > 128 or jsonb_array_length(claim_rows) > 128 or jsonb_array_length(edges) > 128
      or jsonb_array_length(links) > 128 or jsonb_array_length(source_rows) > 192);
end;
$$;
revoke all on function public.read_ask_history_correction_page(uuid[], uuid[], uuid[], timestamptz, timestamptz, text[]) from public, anon, service_role;
grant execute on function public.read_ask_history_correction_page(uuid[], uuid[], uuid[], timestamptz, timestamptz, text[]) to authenticated;
