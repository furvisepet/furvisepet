# Backup and restore

Backup/PITR availability is Supabase-plan dependent and was not verified. The database owner must record automated backup schedule, retention, PITR window, encryption/access policy, storage-bucket coverage, and successful restore evidence. Logical `pg_dump` backups require a dedicated least-privilege operator path and encrypted storage; never commit dumps. Auth identities live in Postgres but Auth/project configuration, SMTP, provider settings, and secrets require separate configuration records. Redis is ephemeral: rate/concurrency/daily guard keys are reconstructed by TTL and configuration; the emergency switch must be checked explicitly after recovery.

## Restore drill

1. Select a dated backup and record expected recovery point.
2. Restore into an isolated non-production Supabase project/database.
3. remove production SMTP/OpenAI/Turnstile credentials and disable outbound provider calls.
4. Verify migration parity and apply only reviewed forward migrations.
5. Run `scripts/run-integrity-diagnostics.mjs`.
6. Run two-user RLS/RPC denial tests and verify pets, care, memories, conversations, AI usage and Vet Briefs.
7. Verify Auth UUID mapping without sending production email.
8. Confirm no production domain, Redis, OpenAI project, or email provider is connected.
9. Record RTO, RPO/data-loss window, failures, reviewer, and evidence.
10. Destroy the temporary environment using the provider-approved process after evidence retention.

Do not restore over production during a drill. Backups are not considered usable until this drill succeeds.
