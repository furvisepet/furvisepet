# Canonical suggestion SQL validation — September 5, 2026

Follow-up to 9545bb23b8737a1352e70e3d07c05fb1c291c975. This supersedes the Docker blocker in the preceding report.

Docker startup logs identified a missing ProgramData environment variable in the remote command session. Restoring its standard Windows CommonApplicationData value for the launch process allowed startup. No persistent environment setting or Docker data was reset. This explains the observed startup failure; the internal cause of the earlier backend memory growth was not independently profiled.

Existing WSL cap: 2 GB RAM, 2 CPUs, 1 GB swap. The authorized disposable container was additionally limited to 768 MB memory, 1 GB combined memory/swap, one CPU. Only furvise-stage2-db-2788f0b / stage2_validation was accessed. It remained network-none. No other containers were started by commands in this task.

Real PostgreSQL validation passed:
- Transactional migration application: CREATE FUNCTION, REVOKE, GRANT.
- Service-role save and retry; one canonical memory and no legacy insert.
- Changed reviewed content rejected without state mutation.
- Wrong owner rejected with P0002; mismatched expected pet rejected with 40001.
- RPC grants exclude anon/authenticated and allow service_role.
- Forgotten memory is not recreated by retry.
- Transactional migration rollback, reapplication, and SQL suite rerun.
- Final synthetic user/memory counts and other database sessions: zero.

The fixture suite ended with ROLLBACK on every successful run. The schema remained installed after reapplication. Container memory measured 64.16 MiB of 768 MiB after checks. No large fixture or benchmark was run. The container and Docker Desktop were stopped afterward to release RAM.

Only SQL tests and documentation changed. Application checks were not repeated: previous 2,233 full tests, typecheck and lint remain the prior verified results. This run does not establish concurrent ownership-transfer behavior, HTTP/PostgREST integration, live provider behavior or production readiness. No remote migration, push, merge or deployment.
