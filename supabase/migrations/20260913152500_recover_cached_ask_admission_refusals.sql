-- Older Ask concurrency/provider limits were cached as completed answers.
-- Reopen only exact refusal shapes without an answer or unsettled/completed
-- credit work. Preserve the key, owner, payload hash and all credit records.
update public.idempotency_operations operation_row
set status = 'failed_retryable', error_code = 'RETRYABLE_ADMISSION_RESPONSE',
    completed_at = null, owner_token = null, lease_expires_at = null,
    updated_at = now()
where operation_row.operation_type = 'ask.submit.persisted_answer_v2'
  and operation_row.status = 'completed'
  and operation_row.response_body ->> 'success' = 'false'
  and (
    (operation_row.response_status in (409, 429) and operation_row.response_body ->> 'code' = 'RATE_LIMIT')
    or (operation_row.response_status = 429 and operation_row.response_body ->> 'code' = 'TEMPORARY_PROVIDER_FAILURE')
  )
  and not exists (
    select 1 from public.ask_conversation_messages message_row
    where message_row.user_id = operation_row.user_id
      and message_row.request_id = operation_row.idempotency_key
      and message_row.role = 'furvise'
  )
  and not exists (
    select 1 from public.ai_usage_events credit_row
    where credit_row.user_id = operation_row.user_id and credit_row.feature = 'ask'
      and credit_row.logical_request_id = operation_row.idempotency_key
      and credit_row.settlement_disposition is distinct from 'release'
  );
