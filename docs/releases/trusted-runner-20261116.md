# Trusted release runner — November 16, 2026

The existing repository runner was independently rechecked before changes: ID 27, `furvise-grok-v16-ci`, Linux x64, online and idle, labels `self-hosted, Linux, X64, furvise-ci`. Its existing Docker container is nonprivileged, has no host mounts, 3,221,225,472 bytes RAM / 2 CPUs, and restart policy `unless-stopped`. No runner was registered, restarted or reconfigured.

`.github/workflows/trusted-release-ci.yml` is a release-scoped check. It accepts an owner push to `release/journal-first-20261116`, or an owner dispatch on that exact branch with a matching reviewed SHA. It has no PR/fork or pull_request_target trigger. The first step verifies the runner name, Linux/X64 identity, exact commit and hard cgroup resource bounds before checkout.

One 25-minute job runs steps serially. Node heap is capped at 1,536 MB, test concurrency is one and the Next build uses two workers. Official checkout/setup actions are pinned by full commit SHA. Checkout uses the event SHA with persisted credentials disabled. The job has contents-read permission, no repository secrets, blank provider key, disabled AI and dummy Supabase configuration. It cannot deploy or promote.

The existing `Security CI` workflow and `Ask Human Architecture Diagnostic` workflow remain unchanged. In particular, original `verify` and `ask-database-contract` checks and the unfiltered suite have not been removed or replaced. The new `Trusted release checks` result is separate; it cannot be reported as a pass of the original hosted workflow. Live branch protection returned 404 “Branch not protected” and repository rulesets were empty; no protection was changed.

The trusted profile runs journal/publication/ownership regressions, the existing focused security selection, both disposable PGlite contracts, TypeScript, lint, production dependency audit, build and a built-server HTTP check. This is deployment safety validation, not online Ask qualification. Zero provider prompts are sent; the blocked-Ask HTTP probe has an empty body.

Local pre-push validation: 319 release tests and 162 security tests passed; TypeScript and scoped lint passed. The artwork hashes were verified against commit 06adc805; only SVG CRLF checkout normalization in the test changed, not the artwork. One initial Windows History UI worker failed without a diagnostic; its isolated nine cases and the subsequent complete release run passed. The original failure log remains in private evidence.

Actual GitHub execution and the exact preview SHA/status are recorded in PR #536 after push. An online listener alone is not a CI pass, and account-level billing can still block assignment. Main, PR #531, the dirty shared checkout, care records and profiles are outside this change.

## First actual runner execution

Run [43847119030](https://github.com/furvisepet/furvisepet/actions/runs/43847119030), SHA 6b135920, executed on runner ID 27 / furvise-grok-v16-ci. Resource checks, exact checkout, Node, npm ci, TypeScript, 319 release tests and 162 focused security tests passed. The minimal PostgreSQL contract passed 31 assertions. The full repository migration replay failed at `20261004233000_guard_canonical_task_writers.sql`: `TASK_WRITER_REQUIRED_SIGNATURE_MISSING: public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)`. This branch contains the guard but no defining migration for that function.

No SQL guard, migration, production schema or fixture was weakened to hide the failure. Independent lint/audit/build/HTTP checks now run before the database contracts; a database failure still makes the overall job fail. This reveals a pre-existing canonical migration dependency gap and remains a release blocker. Original GitHub-hosted PR checks are separately blocked by account payment/spending limits.

## Reviewed runtime patch

The second trusted run, 43848012473 at 3cfd1e56, passed TypeScript, release/security tests and production audit, then the repository-wide Linux ESLint process exited 139 (segmentation fault) under automatically selected Node 24.22.3. This was not a lint finding or a GitHub billing rejection. The workflow now pins Node 24.19.0, matching the previously locally validated patch and remaining within the repository's Node 24 policy. Lint core dumps are disabled; neither the lint gate nor its scope is waived. One bounded rerun is used to test runtime parity; the independent missing-v2 migration blocker remains.
