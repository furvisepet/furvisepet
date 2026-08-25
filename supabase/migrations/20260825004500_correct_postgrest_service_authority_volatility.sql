begin;

-- private.require_service_role_request() bridges validated PostgREST request
-- authority into legacy transaction-local claim settings. Because it calls
-- set_config(..., true), it has side effects within the current transaction and
-- must be VOLATILE. Do not classify this helper as STABLE.
alter function private.require_service_role_request()
  volatile;

commit;
