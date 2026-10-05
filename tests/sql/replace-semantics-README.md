# Native SQL status: UNEXECUTED

No native SQL was run. No authorized disposable target exists in this task. Nothing installs, starts, provisions, connects to a cloud database or applies migrations. All native syntax, fixture compatibility and assertions remain unverified until separately authorized execution.

The candidate migration adds private instant/WRITE validators and replaces only canonical_replace_matches. All 136 historical migrations remain immutable. Dependencies: prior owner/capability binder, generalized replacement matcher/executor, canonical suggestion delegation, isolated care provenance and the atomic source-semantics stamp (through 20260927061142). It has BEGIN/COMMIT, dependency checks, no data/backfill, no new client grants; new functions are not manually idempotent.

## Exact shared temporal contract

source-semantics-instant.v1: Gregorian years 0001–9999; valid month/day including leap rules; hours 00–23, minutes/seconds 00–59; optional 1–3 fractional decimal digits; required Z or ±HH:MM, maximum absolute offset 14:00. Unknown-zone -00:00, missing zones, leap seconds, 24:00, normalized rollovers and excess precision reject. +00:00 is valid. Null scope endpoints remain valid; present endpoints retain their exact original text. Two present endpoints must increase as instants. No rewriting or calendar normalization. The shared fixture JSON contains independently specified valid/invalid expectations consumed by TS and native SQL; TS parity is not native execution proof.

## Replay prerequisites and limits

A separately authorized, empty, fully migrated LOCAL Supabase-compatible database named furvise_disposable_* is required. The runner checks loopback host and SQL checks actual server/database plus empty auth.users. An installed psql and privileged schema-owner/superuser fixture session are required. It never provisions or migrates. It opens one transaction ending ROLLBACK, including fixture functions and failure trigger. Explicit UTF-8 is used for fixture, vectors, SQL, subprocess and PGCLIENTENCODING.

JWT request claims exercise the existing request-role guard only. They are NOT SET ROLE service_role; native service-role ACL/RLS proof is NOT supplied. Initial canonical append provenance and concurrent post-mint source/record edits are privileged fixture seams. SQL tests do not prove the JavaScript HTTP route or live database durability. Unexpected fixture/schema incompatibility must be reported, not worked around by disabling production guards.

Generate fixtures with the production Binder helper tests/helpers/replace-semantics-fixtures.mjs, an unused FURVISE_REPLACE_FIXTURE path, and the accepted transform-types loader. Under separate local SQL authorization only:

    python tests/sql/run-replace-semantics-native.py --host 127.0.0.1 --database furvise_disposable_contract --user postgres --fixture /absolute/binder-fixtures.json --ack-disposable-local

The specification requires exactly one current owner/pet/source/local-key/version non-effective claim, +1 total delta, immutable old snapshots, unconfirmed/reported/none state, zero relation edges, persisted receipt equality, exact replay and stamp-failure rollback of care/capability/receipt/claim state. It includes a real second owner/pet/source, foreign mint/confirm, post-mint source/version drift, latest selector, canonical suggestion delegation, legacy absent semantics versus prohibited absent canonical job, strict classification/date vectors and Unicode UTF-16 bounds. None is called native PASS until actually executed.

Release remains HOLD. This source repair is not schema application, ACL clearance, production compatibility or native SQL clearance.
