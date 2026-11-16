# Trusted release runner — November 16, 2026

The existing repository runner was independently rechecked before changes: ID 27, `furvise-grok-v16-ci`, Linux x64, online and idle, labels `self-hosted, Linux, X64, furvise-ci`. Its existing Docker container is nonprivileged, has no host mounts, 3,221,225,472 bytes RAM / 2 CPUs, and restart policy `unless-stopped`. No runner was registered, restarted or reconfigured.

`.github/workflows/trusted-release-ci.yml` is a release-scoped check. It accepts an owner push to `release/journal-first-20261116`, or an owner dispatch on that exact branch with a matching reviewed SHA. It has no PR/fork or pull_request_target trigger. The first step verifies the runner name, Linux/X64 identity, exact commit and hard cgroup resource bounds before checkout.

One 25-minute job runs steps serially. Node heap is capped at 1,536 MB, test concurrency is one and the Next build uses two workers. Official checkout/setup actions are pinned by full commit SHA. Checkout uses the event SHA with persisted credentials disabled. The job has contents-read permission, no repository secrets, blank provider key, disabled AI and dummy Supabase configuration. It cannot deploy or promote.

The existing `Security CI` workflow and `Ask Human Architecture Diagnostic` workflow remain unchanged. In particular, original `verify` and `ask-database-contract` checks and the unfiltered suite have not been removed or replaced. The new `Trusted release checks` result is separate; it cannot be reported as a pass of the original hosted workflow. Live branch protection returned 404 “Branch not protected” and repository rulesets were empty; no protection was changed.

The trusted profile runs journal/publication/ownership regressions, the existing focused security selection, both disposable PGlite contracts, TypeScript, lint, production dependency audit, build and a built-server HTTP check. This is deployment safety validation, not online Ask qualification. Zero provider prompts are sent; the blocked-Ask HTTP probe has an empty body.

Local pre-push validation: 319 release tests and 162 security tests passed; TypeScript and scoped lint passed. The artwork hashes were verified against commit 06adc805; only SVG CRLF checkout normalization in the test changed, not the artwork. One initial Windows History UI worker failed without a diagnostic; its isolated nine cases and the subsequent complete release run passed. The original failure log remains in private evidence.

Actual GitHub execution and the exact preview SHA/status are recorded in PR #536 after push. An online listener alone is not a CI pass, and account-level billing can still block assignment. Main, PR #531, the dirty shared checkout, care records and profiles are outside this change.
