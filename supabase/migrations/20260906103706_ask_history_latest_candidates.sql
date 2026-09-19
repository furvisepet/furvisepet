-- Requires 20260905080008_ask_history_candidate_read.sql.
-- Additive endpoint: deploy before the application. Ascending callers unchanged.
begin;
set local lock_timeout='5s';
do $$ begin
  if current_user <> 'postgres' or not exists(select 1 from pg_catalog.pg_roles
    where rolname=current_user and rolcreaterole and rolbypassrls) then
    raise exception 'Requires postgres migration role with CREATEROLE and BYPASSRLS';
  end if;
end $$;
-- Required only for ownership transfer, removed before commit.
grant create on schema public to ask_history_candidate_reader;
create function public.read_ask_history_candidates_latest(
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
    /* history_candidate_latest */
    select e.id,e.user_id,e.pet_profile_id,e.category,e.title,e.note,e.severity,
      e.occurred_at,e.created_at,e.updated_at,e.deleted_at
    from public.pet_care_entries e
    where e.user_id=$1 and e.pet_profile_id=$2 and e.deleted_at is null
      and exists(select 1 from public.dog_profiles p where p.id=$2 and p.user_id=$1)
      and (e.note ilike any($3) or e.title ilike any($3))
      and ($4 is null or (e.occurred_at >= $4 and e.occurred_at < $5))
      and ($6 is null or e.occurred_at < $6 or (e.occurred_at=$6 and e.id<$7))
    order by e.occurred_at desc,e.id desc limit $8
  $sql$ using owner_id,p_pet_id,patterns,p_from,p_to,p_after_time,p_after_id,p_limit;
end $fn$;
revoke all on function public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) to authenticated;
alter function public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer) owner to ask_history_candidate_reader;

revoke create on schema public from ask_history_candidate_reader;

-- Register only this newly created reader; existing authority checks stay intact.
do $readiness$
declare
  definition text;
  needle text := '    ''public.get_my_ask_allowance_status()'',';
  signature text := 'public.read_ask_history_candidates_latest(uuid,text[],timestamptz,timestamptz,timestamptz,uuid,integer)';
  pinned_hash text;
  guard text;
begin
  definition := pg_get_functiondef('public.furvise_security_compatibility_snapshot_v2_pre_billing(text[])'::regprocedure);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'Unexpected readiness allowlist';
  end if;
  definition := replace(definition,needle,format('    %L,',signature)||chr(10)||needle);
  -- Capture the definition created above, then embed its literal hash in the
  -- readiness function. Later mutations cannot update this pin themselves.
  pinned_hash := md5(replace(pg_get_functiondef(signature::regprocedure),chr(13),''));
  guard := format($guard$
  -- BEGIN ASK LATEST READER AUTHORITY
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid=pg_catalog.to_regprocedure(%L) and p.prosecdef
      and r.rolname='ask_history_candidate_reader'
      and pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid),pg_catalog.chr(13),''))=%L
      and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then v_failures:=pg_catalog.array_append(v_failures,'ask_history_latest_reader_authority'); end if;
  -- END ASK LATEST READER AUTHORITY
$guard$,signature,pinned_hash);
  needle := '  foreach v_name in array v_protected_rpc_names loop';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'Unexpected readiness authority loop';
  end if;
  execute replace(definition,needle,guard||needle);
end
$readiness$;

notify pgrst, 'reload schema';
commit;
