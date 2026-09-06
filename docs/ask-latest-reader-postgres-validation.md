# Latest Ask reader: disposable PostgreSQL validation

Validated parent: 50366bbcfa2cdb38e11528ebe23b67d2cae0c6e0.

Created only furvise-stage2-db-2788f0b from cached Supabase PostgreSQL 17.6.1.165; container ID 76f0b145202da0f11dc34b7c6ef01197d0ddff5a2cfbb1e838f97aef228023d0. Network none, no ports, read-only repository mount, 1 GiB memory/swap limit, 2 CPUs. Initial available host RAM was approximately 4 GiB. No existing containers were present.

Fresh stage2_validation used image-provided auth/storage schema definitions copied inside this container. The public schema and migration bookkeeping were owned by postgres. Baseline extensions were configured in extensions (pgcrypto, uuid-ossp), matching repository assumptions. Initial bootstrap failures from missing baseline schemas/extensions were corrected in this disposable database only; no application migration was changed to hide them. All repository migrations then applied in order, including latest-reader readiness registration.

Real SQL results:
- Ascending candidate suite passed.
- Descending candidate suite passed: 14 ordered full-value equivalence cases; 61 tied/old sources traversed in 25/25/11/0 pages without duplicates; buried 2025 record, date changes, reassignment, deletion, ownership, grants, bounds and timeout configuration checks.
- Existing correction/scoped-read suite passed.
- Latest readiness suite passed: anonymous grant drift and definition drift detected; baseline failures retained; savepoint rollback restored readiness.
- Latest migration rollback and reapplication passed. Ascending, correction and latest function fingerprints matched the pre-rollback values afterward. All four suites reran successfully after reapplication.
- Full readiness with required migration names returned an empty failed_checks array. The drift suite deliberately uses an empty required-name list, preserving compatibility_input as an unrelated baseline failure.
- Final zero counts: auth users, pet profiles, care entries, other DB sessions, disabled care-entry triggers and invalid/unready indexes. Every SQL fixture transaction rolled back.

Two test-harness fixes were needed. Direct synthetic pet reassignment initially violated the episode-event composite foreign key. The read-contract fixture now deletes only its own synthetic projection link before reassignment, without disabling tenant constraints or triggers. This tests valid reassigned reader state, not the production correction-write workflow. Grant/definition drift must run as disposable supabase_admin because the postgres migration role cannot mutate privileges on the dedicated NOLOGIN-owned reader. The test now documents that requirement. Migrations themselves applied/rolled back as postgres.

Captured fingerprints and readiness results are in ask-latest-reader-postgres-results.json. Detailed diagnostic logs remain in tmp-db-*.log in this worktree. These are local correctness tests, not production load benchmarks or PostgREST HTTP testing. Effective intended-environment PostgREST timeout, exposure/schema cache, authenticated browser behavior and live-model latency/cost still require acceptance testing. No remote migration, live provider, push, merge or deployment occurred. The disposable container is stopped after validation to release RAM, with its schema retained for later checks.
