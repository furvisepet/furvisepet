-- Owner reports are durable evidence. Interpretation is a separate, replaceable
-- projection. No provider calls or clinical judgments occur in this transaction.
create table public.owner_note_jobs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.pet_care_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_profile_id uuid not null references public.dog_profiles(id) on delete cascade,
  source_revision text not null,
  version text not null default 'owner-note.v1',
  status text not null default 'pending' check (status in ('pending','processing','completed','uninterpreted','exhausted','superseded')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(entry_id, source_revision, version)
);
alter table public.owner_note_jobs enable row level security;
revoke all on public.owner_note_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.owner_note_jobs to service_role;
create index owner_note_jobs_ready on public.owner_note_jobs(available_at, id) where status in ('pending','processing');

create or replace function private.owner_note_revision(p_entry public.pet_care_entries)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.md5(p_entry.note || '|' || p_entry.pet_profile_id::text || '|' || p_entry.user_id::text || '|' || extract(epoch from p_entry.occurred_at)::text || '|' || coalesce(extract(epoch from p_entry.deleted_at)::text,''));
$$;

create or replace function private.enqueue_owner_note_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_revision text;
begin
  if new.intelligence_source_type is distinct from 'owner_note' then
    if TG_OP='UPDATE' and old.intelligence_source_type='owner_note' then
      update public.owner_note_jobs set status='superseded',result=null,lease_token=null,finished_at=now() where entry_id=new.id;
    end if;
    return new;
  end if;
  if TG_OP='UPDATE' and old.intelligence_source_type='owner_note' and private.owner_note_revision(old)=private.owner_note_revision(new) then return new; end if;
  if TG_OP='INSERT' or old.intelligence_source_type is distinct from 'owner_note' then perform private.require_service_role_request(); end if;
  if char_length(new.note)>1200 then raise exception using errcode='22023',message='OWNER_NOTE_TOO_LONG'; end if;
  v_revision := private.owner_note_revision(new);
  update public.owner_note_jobs set status='superseded', result=null, lease_token=null, lease_until=null, finished_at=now()
    where entry_id=new.id and source_revision<>v_revision and status<>'superseded';
  if new.deleted_at is null then
    insert into public.owner_note_jobs(entry_id,user_id,pet_profile_id,source_revision)
      values(new.id,new.user_id,new.pet_profile_id,v_revision) on conflict(entry_id,source_revision,version) do update
      set status='pending',attempts=0,result=null,error_code=null,available_at=now(),finished_at=null,lease_token=null,lease_until=null;
  end if;
  return new;
end;
$$;
create trigger owner_note_revision_outbox after insert or update of note, pet_profile_id, user_id, occurred_at, deleted_at, intelligence_source_type
on public.pet_care_entries for each row execute function private.enqueue_owner_note_revision();

create or replace function public.persist_ask_owner_note(
  p_user_id uuid, p_pet_id uuid, p_source_message_id uuid, p_request_id uuid,
  p_note text, p_occurred_at timestamptz default null, p_explicit_time text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entry public.pet_care_entries%rowtype; v_message public.ask_conversation_messages%rowtype;
begin
  perform private.require_service_role_request();
  if p_user_id is null or p_pet_id is null or p_source_message_id is null or p_request_id is null
    or p_note is null or btrim(p_note)='' or char_length(p_note)>1200
    or char_length(coalesce(p_explicit_time,''))>120 then
    raise exception using errcode='22023', message='OWNER_NOTE_INVALID';
  end if;
  -- Same lock order as conversation completion. Verify source identity afresh.
  perform 1 from public.ask_conversations c join public.ask_conversation_messages m on m.conversation_id=c.id
    where m.id=p_source_message_id and c.user_id=p_user_id and c.pet_profile_id=p_pet_id for update of c;
  if not found then raise exception using errcode='42501', message='OWNER_NOTE_SOURCE_NOT_OWNED'; end if;
  select * into v_message from public.ask_conversation_messages
    where id=p_source_message_id and user_id=p_user_id and request_id=p_request_id and role='user' for update;
  if not found or v_message.user_text is distinct from p_note then
    raise exception using errcode='42501', message='OWNER_NOTE_SOURCE_MISMATCH';
  end if;
  perform 1 from public.dog_profiles where id=p_pet_id and user_id=p_user_id and lifecycle_status<>'archived' for share;
  if not found then raise exception using errcode='42501', message='OWNER_NOTE_PET_NOT_OWNED'; end if;
  select * into v_entry from public.pet_care_entries where user_id=p_user_id and intelligence_source_message_id=p_source_message_id for update;
  if v_entry.id is not null then
    -- Never resurrect a deleted/corrected/reassigned record on a transport retry.
    if v_entry.deleted_at is not null or v_entry.pet_profile_id<>p_pet_id or v_entry.note<>p_note
      or v_entry.intelligence_source_type is distinct from 'owner_note' then
      raise exception using errcode='22023', message='OWNER_NOTE_SOURCE_CHANGED';
    end if;
    return jsonb_build_object('entryId',v_entry.id,'alreadyPersisted',true);
  end if;
  insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,
    intelligence_source_message_id,intelligence_request_id,intelligence_source_type,care_event_metadata)
  values(p_user_id,p_pet_id,'general','Owner note',p_note,coalesce(p_occurred_at,now()),
    p_source_message_id,p_request_id,'owner_note',jsonb_build_object(
      'authority','owner_report','occurrenceBasis',case when p_occurred_at is null then 'recorded_at' else 'explicit' end,
      'explicitTime',p_explicit_time,'clinicalStatus','unconfirmed')) returning * into v_entry;
  return jsonb_build_object('entryId',v_entry.id,'alreadyPersisted',false);
end;
$$;
revoke all on function public.persist_ask_owner_note(uuid,uuid,uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.persist_ask_owner_note(uuid,uuid,uuid,uuid,text,timestamptz,text) to service_role;

-- The scheduler secret remains in a private schema; no browser or environment
-- variable receives it. Token verification precedes queue access.
create table private.owner_note_worker_config(id boolean primary key default true check(id), token text not null);
revoke all on private.owner_note_worker_config from public,anon,authenticated;
insert into private.owner_note_worker_config(token) values(gen_random_uuid()::text || gen_random_uuid()::text);

create or replace function public.claim_owner_note_jobs(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.owner_note_jobs%rowtype; v_entry public.pet_care_entries%rowtype; v_result jsonb:='[]'::jsonb;
begin
  perform private.require_service_role_request();
  if p_token is null or not exists(select 1 from private.owner_note_worker_config where token=p_token) then
    raise exception using errcode='42501', message='OWNER_NOTE_WORKER_UNAUTHORIZED';
  end if;
  -- Bounded work, non-overlapping leases. A crashed worker releases no data;
  -- its expired lease becomes eligible on a later scheduled invocation.
  for v_job in select * from public.owner_note_jobs
    where (status='pending' and available_at<=now()) or (status='processing' and lease_until<now())
    order by available_at,id limit 8 for update skip locked
  loop
    select * into v_entry from public.pet_care_entries where id=v_job.entry_id;
    if v_entry.id is null or v_entry.deleted_at is not null or private.owner_note_revision(v_entry)<>v_job.source_revision
      or not exists(select 1 from public.dog_profiles where id=v_job.pet_profile_id and user_id=v_job.user_id and lifecycle_status<>'archived') then
      update public.owner_note_jobs set status='superseded',result=null,finished_at=now() where id=v_job.id;
    elsif v_job.attempts>=5 then
      update public.owner_note_jobs set status='exhausted',error_code='NOTE_EXTRACTION_UNAVAILABLE',finished_at=now() where id=v_job.id;
    else
      update public.owner_note_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes'
        where id=v_job.id returning * into v_job;
      v_result:=v_result || jsonb_build_array(jsonb_build_object('id',v_job.id,'entry_id',v_job.entry_id,'user_id',v_job.user_id,
        'pet_profile_id',v_job.pet_profile_id,'pet_name',(select name from public.dog_profiles where id=v_job.pet_profile_id),
        'source_note',v_entry.note,'lease_token',v_job.lease_token,'attempts',v_job.attempts));
    end if;
  end loop;
  return v_result;
end;
$$;

create or replace function public.finish_owner_note_job(p_job_id uuid,p_lease_token uuid,p_result jsonb,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_job public.owner_note_jobs%rowtype; v_entry public.pet_care_entries%rowtype; v_entry_id uuid; v_item jsonb;
begin
  perform private.require_service_role_request();
  select entry_id into v_entry_id from public.owner_note_jobs where id=p_job_id;
  -- Source first, then job: same lock order as source edits + outbox trigger.
  select * into v_entry from public.pet_care_entries where id=v_entry_id for update;
  select * into v_job from public.owner_note_jobs where id=p_job_id for update;
  if v_job.status is distinct from 'processing' or v_job.lease_token is distinct from p_lease_token or v_job.lease_until<now() then return false; end if;
  if v_entry.id is null or v_entry.deleted_at is not null or private.owner_note_revision(v_entry)<>v_job.source_revision then
    update public.owner_note_jobs set status='superseded',result=null,lease_token=null,finished_at=now() where id=p_job_id;
    return false;
  end if;
  if p_error is not null then
    update public.owner_note_jobs set status=case when attempts>=5 then 'exhausted' else 'pending' end,
      available_at=now()+make_interval(secs=>least(3600,60*(2^attempts)::integer)),lease_token=null,lease_until=null,
      error_code='NOTE_EXTRACTION_UNAVAILABLE' where id=p_job_id;
    return true;
  end if;
  if p_result->>'version' is distinct from 'owner-note.v1' or jsonb_typeof(p_result->'observations') is distinct from 'array'
    or jsonb_array_length(p_result->'observations')>12 or octet_length(p_result::text)>20000 then
    raise exception using errcode='22023',message='NOTE_EXTRACTION_INVALID';
  end if;
  for v_item in select value from jsonb_array_elements(p_result->'observations') loop
    if coalesce(v_item->>'quote','')='' or position(v_item->>'quote' in v_entry.note)=0
      or coalesce(v_item->>'certainty','') not in ('reported','uncertain') or coalesce(v_item->>'kind','') not in ('symptom','normal_finding','care','other')
      or jsonb_typeof(v_item->'confidence') is distinct from 'number' or (v_item->>'confidence')::numeric not between 0.8 and 1 then
      raise exception using errcode='22023',message='NOTE_EXTRACTION_INVALID';
    end if;
  end loop;
  update public.owner_note_jobs set status=case when jsonb_array_length(p_result->'observations')=0 then 'uninterpreted' else 'completed' end,
    result=p_result,error_code=null,lease_token=null,lease_until=null,finished_at=now() where id=p_job_id;
  return true;
end;
$$;
revoke all on function public.claim_owner_note_jobs(text) from public,anon,authenticated;
revoke all on function public.finish_owner_note_job(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_owner_note_jobs(text) to service_role;
grant execute on function public.finish_owner_note_job(uuid,uuid,jsonb,text) to service_role;
revoke all on function private.owner_note_revision(public.pet_care_entries) from public,anon,authenticated;
revoke all on function private.enqueue_owner_note_revision() from public,anon,authenticated;
