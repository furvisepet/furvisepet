-- LOCAL EXPERIMENT ONLY. Not a migration or an exposed PostgREST schema.
-- Setup creates the dedicated NOLOGIN BYPASSRLS role with SELECT on only these
-- two tables. Do not use postgres/service_role as the application read role.
create function ask_candidate_experiment.search(
  p_pet_id uuid, p_terms text[], p_from timestamptz default null,
  p_to timestamptz default null, p_after_time timestamptz default null,
  p_after_id uuid default null, p_limit integer default 25
) returns table (
  id uuid, user_id uuid, pet_profile_id uuid, category text, title text,
  note text, severity text, occurred_at timestamptz, created_at timestamptz,
  updated_at timestamptz, deleted_at timestamptz
) language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  owner_id uuid := auth.uid();
  patterns text[];
begin
  if owner_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if p_pet_id is null or not exists (
    select 1 from public.dog_profiles p where p.id=p_pet_id and p.user_id=owner_id
  ) then raise exception using errcode='42501', message='Pet unavailable'; end if;
  -- Accept the current planner's literal vocabulary, never caller wildcards.
  -- No normalization silently changes matching semantics.
  if p_terms is null or cardinality(p_terms) not between 1 and 6
    or array_ndims(p_terms)<>1 or array_lower(p_terms,1)<>1
    or exists(select 1 from unnest(p_terms) t where t is null
      or length(t) not between 3 and 32 or t !~ '^[A-Za-z][A-Za-z -]*[A-Za-z]$')
    or p_limit is null or p_limit not between 1 and 25 then
    raise exception using errcode='22023', message='Invalid terms or page size';
  end if;
  if (p_from is null)<>(p_to is null)
    or (p_from is not null and (not isfinite(p_from) or not isfinite(p_to) or p_from>=p_to))
    or (p_after_time is null)<>(p_after_id is null)
    or (p_after_time is not null and (not isfinite(p_after_time)
      or (p_from is not null and (p_after_time<p_from or p_after_time>=p_to)))) then
    raise exception using errcode='22023', message='Invalid period or cursor';
  end if;
  select array_agg('%'||t||'%' order by ordinal) into patterns
    from unnest(p_terms) with ordinality u(t,ordinal);
  -- EXECUTE USING creates a parameter-specific plan, including common terms.
  -- Fixed SQL only. Pet ownership is also rechecked in this candidate statement.
  -- STABLE gives the authorization read and candidate read one statement snapshot,
  -- not a promise of consistency across separate pages or correction reads.
  return query execute $sql$
    /* experimental_candidate_any */
    select e.id,e.user_id,e.pet_profile_id,e.category,e.title,e.note,e.severity,
      e.occurred_at,e.created_at,e.updated_at,e.deleted_at
    from public.pet_care_entries e
    where e.user_id=$1 and e.pet_profile_id=$2 and e.deleted_at is null
      and exists(select 1 from public.dog_profiles p where p.id=$2 and p.user_id=$1)
      and (e.note ilike any($3) or e.title ilike any($3))
      and ($4 is null or (e.occurred_at >= $4 and e.occurred_at < $5))
      and ($6 is null or e.occurred_at > $6 or (e.occurred_at=$6 and e.id>$7))
    order by e.occurred_at,e.id limit $8
  $sql$ using owner_id,p_pet_id,patterns,p_from,p_to,p_after_time,p_after_id,p_limit;
end $fn$;
revoke all on function ask_candidate_experiment.search(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
alter function ask_candidate_experiment.search(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) owner to ask_candidate_experiment_reader;
grant execute on function ask_candidate_experiment.search(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) to authenticated;
