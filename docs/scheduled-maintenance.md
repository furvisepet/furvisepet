# Scheduled maintenance

No scheduler is configured or verified.

| Job | Suggested schedule | Command | Default/apply | Batch/timeout | Safe rerun and alert |
|---|---|---|---|---|---|
| Expired idempotency | daily 03:00 UTC | `node scripts/cleanup-idempotency-operations.mjs --batch=500` | dry-run; add `--apply --confirm-apply` | 1–5000; platform 5m | skip-locked/service-only; alert nonzero |
| Stale AI credit and completed deletion ledger | every 15m | `node scripts/cleanup-operational-records.mjs --batch=500` | dry-run; explicit apply | 1–5000; 2m | only >30m reservations and expired completed ledger; alert nonzero |
| Integrity diagnostics | hourly and after migration | `node scripts/run-integrity-diagnostics.mjs` | read-only | aggregate RPC; 2m | nonzero on critical count |
| AI emergency status | deployment + incident | `node scripts/ai-emergency-control.mjs status` | read-only | 2s Redis timeout | safe repeated status |
| Concern repair | operator incident only | `node scripts/repair-resolved-concerns.mjs` | dry-run; `--apply` | bounded candidate function | compare dry-run/apply; no scheduler |
| Account deletion reconciliation | incident/high alert | `node scripts/reconcile-account-deletions.mjs --batch=25` | dry-run; explicit apply/confirmation | 1–100; 2m | retries only failed Auth deletions; alert nonzero |

Redis concurrency and daily guard records expire through TTL. Product sessions are canonical DB records without an approved expiry policy, so no deletion job is invented. Configure Vercel Cron, Supabase Cron, or protected GitHub scheduling only after credential isolation, concurrency protection, and failure alerts are verified. There is no public maintenance endpoint.
