-- One-time privileged operator repair, not a migration or browser RPC.
-- Evidence: the failed request has only a 503 preparation error. The confirmed
-- document exactly matches a later successful request with a completed credit.
-- No age-only automatic refunds. Stop if any reviewed identity/state changed.
begin;
do $$
declare
  v_event public.ai_usage_events%rowtype;
  v_operation public.idempotency_operations%rowtype;
  v_count integer;
  v_result record;
begin
  select * into strict v_event from public.ai_usage_events
  where feature = 'vet_brief'
    and created_at = timestamptz '2026-09-13 05:59:51.154594+00'
  for update;
  if v_event.status = 'released' and v_event.settlement_disposition = 'release' then
    return; -- Idempotent operator replay.
  end if;
  if v_event.status <> 'reserved' or v_event.settlement_disposition is not null
    or v_event.credits_used <> 1 then
    raise exception 'REPAIR_REVIEW_REQUIRED: credit state changed';
  end if;
  select * into strict v_operation from public.idempotency_operations
  where user_id = v_event.user_id and idempotency_key = v_event.request_id
    and operation_type = 'vet_brief.generate'
  for update;
  if v_operation.status <> 'failed_retryable' or v_operation.response_status <> 503
    or v_operation.response_body->>'code' is distinct from 'VET_BRIEF_PREPARATION_FAILED'
    or v_operation.response_body ? 'document' or v_operation.resource_id is not null
    or v_operation.lease_expires_at > now() then
    raise exception 'REPAIR_REVIEW_REQUIRED: failed operation changed';
  end if;
  select count(*) into v_count from public.vet_visit_briefs b
  join public.idempotency_operations i on i.user_id=b.user_id
    and i.operation_type='vet_brief.generate' and i.status='completed'
    and i.response_status=200 and i.response_body->'document'=b.confirmed_data
  join public.ai_usage_events u on u.user_id=i.user_id and u.request_id=i.idempotency_key
    and u.status='completed' and u.settlement_disposition='complete'
  where b.user_id=v_event.user_id
    and b.generated_at=timestamptz '2026-09-13 06:11:56.125+00'
    and i.idempotency_key<>v_event.request_id;
  if v_count <> 1 then
    raise exception 'REPAIR_REVIEW_REQUIRED: later output attribution changed';
  end if;
  -- Explicit operator decision, then the canonical private settlement authority.
  update public.ai_usage_events set settlement_disposition='release', settlement_decided_at=now()
  where id=v_event.id;
  select * into strict v_result from private.reconcile_ai_credit_event(
    v_event.user_id,v_event.request_id,v_event.logical_request_id,
    v_event.feature,v_event.payload_hash,'release');
  if v_result.event_status <> 'released' or v_result.credits_used <> 0 then
    raise exception 'REPAIR_FAILED';
  end if;
end;
$$;
commit;
select public.furvise_readiness_snapshot();
