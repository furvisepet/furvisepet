# Membership PostgreSQL validation

Validated after implementation commit 56020d06e261778364d8866952514cd82b16c283 on the existing disposable furvise-stage2-db-2788f0b / stage2_validation, PostgreSQL17.6. Docker Engine29.7.2 was reachable on this retry. Container inspected: network none, no port bindings. Initial care rows0 and other database sessions0. No other containers were changed.

Applied supabase/drafts/ask_episode_membership_contract.sql directly using docker exec psql -U postgres -d stage2_validation -v ON_ERROR_STOP=1 -f. BEGIN/CREATE FUNCTION/REVOKE/GRANT/NOTIFY/COMMIT succeeded. This is direct SQL application, not CLI migration registration.

Executed supabase/tests/ask_episode_membership_contract.sql with ON_ERROR_STOP. All assertions completed through final ROLLBACK, including actual claim membership, authenticated scope, imported source hashes, changed/deleted sources and overflow cases in that test file.

Executed supabase/tests/ask_episode_membership_reversal.sql: prior reader restoration and function/grant assertions completed, followed by outer ROLLBACK. This validates transactional reversal and restores the new reader after rollback; it is not a separately committed rollback/reapplication cycle.

Final inspection: care rows0, synthetic auth users with prefix91000000 zero, other sessions0, membership.v1 present in installed function body. Free RAM5.79GB, versus5.53GB before retry. No scale workload or provider calls. Docker and disposable container remain running and healthy at this checkpoint.

Earlier report's database-unvalidated status is superseded only for these exact local SQL assertion/reversal tests. SQL remains a draft requiring migration packaging. Real PostgREST/authenticated HTTP, production rollout, query plans/scale, atomic snapshots and completeness/exact-count implementation remain unvalidated or unimplemented. Original lifetime audit remains14/3; it was not rerun for documentation-only validation. No push/merge/deployment.
