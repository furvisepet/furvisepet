-- Candidate-only read. Apply as the Supabase postgres migration role.
-- No fixture schema, no RLS-policy changes, no service-role application reads.
begin;
do $$ begin
  if current_user <> 'postgres' or not exists(select 1 from pg_catalog.pg_roles
    where rolname=current_user and rolcreaterole and rolbypassrls) then
    raise exception 'Requires postgres migration role with CREATEROLE and BYPASSRLS';
  end if;
end $$;
-- A collision intentionally fails: never adopt an unknown existing role.
create role ask_history_candidate_reader nologin noinherit nosuperuser nocreatedb nocreaterole bypassrls;
grant ask_history_candidate_reader to postgres with inherit false, set true;
grant usage on schema public to ask_history_candidate_reader;
grant select on public.dog_profiles,public.pet_care_entries to ask_history_candidate_reader;
-- postgres has auth USAGE, not its grant option. Resolve the auth.uid reference
-- now using a parsed SQL body; execution stays INVOKER, not postgres privileges.
-- The helper grants access to that zero-argument identity function only.
create function public.ask_history_request_owner() returns uuid
language sql stable security invoker set search_path=pg_catalog
begin atomic select auth.uid(); end;
revoke all on function public.ask_history_request_owner() from public,anon,authenticated,service_role;
grant execute on function public.ask_history_request_owner() to ask_history_candidate_reader;
-- Required only for ownership transfer, removed before commit.
grant create on schema public to ask_history_candidate_reader;
create function public.read_ask_history_candidates(
  p_pet_id uuid, p_terms text[], p_from timestamptz default null,
  p_to timestamptz default null, p_after_time timestamptz default null,
  p_after_id uuid default null, p_limit integer default 25
) returns table (
  id uuid, user_id uuid, pet_profile_id uuid, category text, title text,
  note text, severity text, occurred_at timestamptz, created_at timestamptz,
  updated_at timestamptz, deleted_at timestamptz
) language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  owner_id uuid := public.ask_history_request_owner();
  patterns text[];
  timeout_ms numeric;
begin
  if owner_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  -- The timeout must be active BEFORE this top-level RPC statement starts.
  -- SET statement_timeout inside a function does not arm that statement's timer.
  -- Fail closed on a gateway/session without the deployment prerequisite.
  timeout_ms := extract(epoch from current_setting('statement_timeout')::interval) * 1000;
  if timeout_ms <= 0 or timeout_ms > 8000 then
    raise exception using errcode='55000', message='Bounded request statement_timeout (1..8000 ms) required';
  end if;
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
revoke all on function public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) to authenticated;
alter function public.read_ask_history_candidates(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) owner to ask_history_candidate_reader;

revoke create on schema public from ask_history_candidate_reader;
notify pgrst, 'reload schema';
commit;
