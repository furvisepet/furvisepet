# Idempotency operations runbook

## Diagnose

Use the request ID from safe application logs to inspect one service-side `idempotency_operations` row and its related canonical resource/`ai_usage_events` record. Never expose `payload_hash`, `owner_token`, private response data, service keys, or global operation listings to a user. Check status, attempt count, lease expiry, resource reference, error code, and whether provider usage completed.

- `processing` with a future lease: another worker owns it; wait.
- expired `processing` without provider completion: a retry can claim it.
- completed provider usage plus incomplete persistence: reconcile from the stored canonical provider/business result; never start another provider call merely to repair persistence.
- `failed_retryable`: correct the transient cause and retry with the same key.
- `failed_final` / `POST_MUTATION_RECONCILIATION`: inspect the business resource before any manual action.
- repeated `IDEMPOTENCY_CONFLICT`: investigate a buggy or malicious client reusing one key with changed inputs.

## Cleanup

Run dry-run first:

```powershell
npm run idempotency:cleanup -- --batch=500
```

Apply only after reviewing counts and retention/reconciliation needs:

```powershell
npm run idempotency:cleanup -- --batch=500 --apply --confirm-apply
```

The script requires `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`; it never prints them. The database function rejects normal users, caps batches at 5,000, and excludes processing rows and active AI reservations. Schedule cleanup only after operational monitoring is established in a later stage.

## Incident handling

If the idempotency store or server administrative credential is unavailable, state-changing routes fail safely before executing. Restore configuration/service first; do not enable an in-memory production fallback. For suspected post-mutation ambiguity, compare the operation record, natural unique key, canonical resource, AI usage, and credit ledger. Mark/repair the canonical result through an audited service process; do not delete the operation to force a retry.

Deployments require the migration to be applied before the application version. Roll back application code before dropping any schema, and do not drop columns/table during an incident. The migration is additive; historical rows are unchanged and no duplicate history is deleted.
