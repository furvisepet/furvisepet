# Deployment and rollback

1. Promote reviewed protected-branch commits/tags through a preview environment with separate secrets.
2. Run `npm ci`, lint, typecheck, security/full tests, build, secret scan, environment validation, and migration dry-run.
3. Confirm a verified backup/PITR recovery point before schema change.
4. Disable AI for risky migrations, apply forward migrations first, verify linked parity and the service-only security compatibility probe, then deploy the compatible app. The readiness-probe migration is backward compatible with the prior app; deploying the new app before it intentionally reports `not_ready`.
5. Smoke test public health, protected readiness, Auth, private cache, deterministic Products, one test-user write/export, and AI guard without using production customer data.
6. Re-enable AI only after budgets/emergency state are verified.

Rollback criteria include sustained 5xx, Auth/session failure, cross-user denial regression, cost/accounting uncertainty, migration mismatch, or deletion reconciliation. Roll back the application artifact first. Never blindly reverse a database after user writes; prefer a reviewed forward repair. During incidents disable AI, and use Supabase Dashboard to pause signup if necessary. CSP remains report-only in this stage; if later enforcement breaks production, return to report-only. Redis outage keeps expensive/destructive routes fail-closed.

Record deploy ID, commit, migration versions, operator, timestamps, smoke evidence, rollback decision, and post-deploy alert state. No public deployment was performed by S2H.
