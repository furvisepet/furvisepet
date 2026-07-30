# Production operations

No external alert, backup, scheduler, or production deployment was verified by repository work.

| Component | Owner / environment | Secret | Failure symptom | Shutdown / recovery | Signal and retained data | Status evidence |
|---|---|---|---|---|---|---|
| Vercel Next.js | application operator; preview/production | Vercel deployment credentials and environment variables | 5xx, failed readiness, failed deploy | roll back application artifact; do not roll back irreversible DB writes blindly | request/build logs | repository configuration only |
| Supabase Auth | identity operator; separate projects | publishable and secret keys, SMTP/provider credentials | login/email/session failures | disable signup/provider in Dashboard; restore configuration | Auth identities and audit data | linked database only; Dashboard unverified |
| Supabase Postgres/functions | database operator | DB password, secret key, management token | readiness DB unavailable, integrity findings | stop writes/AI, restore isolated copy, forward-fix | all canonical user data and migration history | parity through `20260730032000` after apply |
| Upstash Redis | platform operator | REST URL/token, HMAC secrets | rate store unavailable, AI fail-closed | disable AI; restore Redis/config | ephemeral rate, concurrency, AI daily guard and emergency state | adapter prepared; external service not reverified here |
| OpenAI | AI operator | production API key | provider failure/cost cap | `FURVISE_AI_ENABLED=false` or emergency script | provider billing/usage | settings and budget unverified |
| Turnstile | Auth operator | public site key and Dashboard secret | CAPTCHA failures | coordinated Dashboard rollback retaining Auth limits | provider challenge telemetry | repository integration only |
| SMTP/email | Auth operator | SMTP credentials | confirmation/recovery delivery failure | pause signup/recovery if abuse or delivery is unsafe | provider delivery logs | unverified |
| GitHub/CI | repository owner | GitHub-managed tokens only | failed/missing required checks | block promotion, revert application commit | workflow history | files prepared; external settings unverified |
| Migrations | database operator | linked CLI/DB credentials | parity mismatch/readiness failure | stop deployment; investigate before writes | schema migration history | CLI parity check required per deploy |
| Operator scripts | security/database operator | service-role or Upstash operator credentials | nonzero exit / safe error | dry-run, correct config, rerun | aggregate counts only | scripts in `scripts/` |
| Logs/events | incident commander | operations HMAC secret | missing correlation or unsafe output | retain request reference; use local structured adapter | allowlisted operational events | local adapter prepared; no vendor configured |
| Account deletion/export | support/privacy operator | service role behind authenticated routes | reconciliation status/export limit | ban partial deletion; operator reconcile; assisted export | deletion ledger 30 days; export not retained | implemented; legal policy unverified |

Operator scripts currently include AI emergency control, catalog ingestion/seed, idempotency cleanup, operational cleanup, integrity diagnostics, concern repair, environment validation, safe load testing, and local Vet Brief fixtures. Mutation scripts default to dry-run where applicable and require explicit apply confirmation.
