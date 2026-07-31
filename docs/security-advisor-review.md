# Supabase advisor review — Phase S1

Project reference: `sxavgqzwfahljdvmisyq`. No secrets or production records are included.

## What was directly run

- `supabase migration list --linked`: local and remote migrations matched through `20260729011000`.
- `supabase db lint --linked --level warning`: completed against `public` and `extensions`.
- `supabase inspect db table-stats --linked`: returned 38 public tables.
- Storage API `listBuckets()` with the configured server credential: returned zero buckets.
- Live disposable two-user REST/RPC suite: 22/22 assertions passed across profiles, care entries/episodes/state/concerns, memories, conversations/messages, usage events, suggestions, Vet Briefs, product feedback, owner spoofing, credit idempotency/release, and deleted-pet access; test users were deleted.
- Separate service-RPC suite: 18/18 anon/authenticated calls were denied for diagnostic, repair, backfill, and recomputation functions; its disposable user was deleted.

The Dashboard Security/Performance Advisor results could not be retrieved: no Supabase MCP was available, browser discovery returned no available session, and CLI 2.110.0 has no advisor subcommand. The official Management API advisor endpoint requires an `advisors_read` management token; extracting or repurposing the CLI's stored credential was intentionally not attempted. These results are therefore **unable to verify**, not clean.

## Database lint findings

| Finding | Classification | Evidence and disposition |
|---|---|---|
| `repair_maple_qa_consistency`: text-to-UUID local initialization warning | medium | Service-only repair; may fail when invoked. Deferred because it is not launch-path authorization exposure. |
| `finish_maple_qa_consistency_repair`: three text-to-UUID initialization warnings | medium | Service-only repair; operational correctness risk. S2 migration should add explicit typed nulls/casts. |
| `repair_maple_persistence_destinations`: text-to-UUID warning | medium | Service-only repair. S2 explicit cast. |
| `repair_pet_memory_lifecycle`: text-to-UUID-array warnings | medium | Service-only and execute-revoked from anon/auth (live denial passed); repair may fail. S2 explicit typed empty arrays. |

## Advisor categories

| Advisor category | Status/classification |
|---|---|
| RLS disabled / policy but RLS disabled / RLS without policy | Migration inspection says every application table enables RLS; linked advisor confirmation unavailable. Priority owner tables additionally passed live denial. |
| Auth users/sensitive columns exposed | No application query exposes `auth.users`; live anon/user checks showed owner isolation. Advisor confirmation unavailable. |
| Security-definer views/materialized views in API | No views/materialized views found in migrations or linked relation stats. |
| Mutable function search path | Latest user/service definer functions set `public, pg_temp`; helper-function completeness requires advisor confirmation. |
| Anonymous/authenticated SECURITY DEFINER execution | User RPCs intentionally authenticated; service repair RPCs were denied live. Trigger/helper grant completeness requires advisor confirmation. |
| Public bucket listing | zero buckets, verified through Storage API; not applicable. |
| Unindexed foreign keys, unused/duplicate indexes, multiple permissive policies | unable to verify without Performance Advisor; do not blindly change. |
| Extensions in public schema/outdated extension versions | unable to verify. |

## Required deployment action

An operator with Dashboard or Management API access must capture fresh Security and Performance Advisor JSON after S1 deployment, sanitize object names only as needed, append the finding IDs and levels here, and block launch on RLS-disabled, sensitive-column, public-bucket, mutable-search-path, or unintended definer-execute findings. Supabase documents the current advisor catalog and Management API endpoint in its [Database Advisors guide](https://supabase.com/docs/guides/database/database-advisors).
