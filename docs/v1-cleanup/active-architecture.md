# Active v1 architecture cleanup

This follow-up starts at PR #276 commit `42c604de034ab60ba4e2e612baa8c1f4eab5ab11`.
The user authorized retiring the remaining dead, legacy and scenario-specific implementation code. This branch is for review only; it has not been merged or deployed.

## Scope and evidence

Removed **202 files**: 121 application files, 31 scripts, 48 retired test files and 2 catalogue input fixtures. Five files are added: three current-contract audit files and this report plus the [per-file removal manifest](active-removals.csv). Tracked files change from **1,481 to 1,284**. Counts include documentation, assets, tests and migrations, not just executable code.

The removal manifest records each original path, rationale and base-content hash. The older feature inventory, file classification and dependency map in this directory remain snapshots of PR #276, not an inventory of this branch.

- **Ask:** removed the old provider interpretation schema/parser and nine legacy planner/reference or narrow answer modules, including the accident-count, litter-change and medication-recurrence shortcuts. Removed their dependent weight/search helpers. The provider now must submit `ask-request.v2`; an unknown or retired format is rejected with a typed diagnostic. Test fixture conversion is confined to the audit harness and never runs in the app.
- **Products:** retired the dormant catalogue, ingestion, provider adapters, recommendation engine, shop APIs, `/api/analyze`, `/api/safety-followup`, and the utility catalogue page. These are deliberate subsystem retirements, not merely files with zero imports. The mounted Products page already shows a coming-soon screen; the Results route already redirects to profiles. Both remain. Corresponding feature modes, package scripts, rate-limit policy entries and provider-selection environment examples were removed. Historical product documentation is marked retired.
- **Shadow writes:** removed the optional phase-3 preparation, dual-write persistence and cutover/audit tooling from Ask. Retained active semantic governance, existing claim/history readers and correction handling. Stored historical claims are not deleted or reinterpreted as new writes.
- **Dead implementations:** removed the old Ask/provider wrappers, test-only onboarding/episode/pet-state/profile models, old billing usage adapters, and disconnected evaluation helpers. Removed one-off historical live scripts and the optional standalone runner. Committed benchmark results and criteria remain intact.

A fresh AST/import scan across the remaining repository found no additional application-library module with zero code imports except the following required support files:

- `app/lib/account-country` and `app/lib/petwise`: extensionless Node test bridges. Next resolves their TypeScript siblings; Node consumers of extensionless imports need the bridges.
- `app/lib/vendor/liquidglass/index.d.ts` and its README: vendor declarations and documentation, not runtime modules.

Three memory-backed stores are outside the production import graph but actively support billing and authentication tests. They remain. Static reachability is evidence, not proof about unknown external clients or dynamic behavior.

## Retained architecture and safeguards

Ask enters through authentication, ownership, admission and the current typed request contract. It retrieves correction-aware history, uses deterministic measurement projection when supported, otherwise composes an answer, then performs factual/completion review and controlled delivery. Current write governance, idempotency, credit settlement, publication validation, bounded repair and honest limited-answer fallback remain.

Pet profiles, care history, account/authentication, subscriptions, Vet Briefs and operational recovery remain. All **102 migrations and 49 SQL test files** are unchanged. Existing-data readers, ledger feature identifiers and account-country compatibility remain where persisted data or active settings depend on them. Runtime dependencies remain **10**, development dependencies **9**, with an unchanged lockfile.

This cleanup does not replace the whole Ask pipeline with a new implementation. It does not fix the known live summary/repair timeouts or establish improved answer accuracy. General domain rules, source attribution, correction handling and safety checks are retained; they are not equivalent to hard-coded answers for a benchmark question.

## Test changes

Retired tests are removed with the implementations they exercise. Mixed test files retain the assertions for current behavior. Coverage that previously invoked the old planner or shortcut answer functions is migrated to the current contract and real offline callback.

The new audit includes 18 nested cases covering version rejection, ownership and diagnostics, two pets across six topics, whole-answer review, unsupported/foreign claims, malformed primary output, and 10,968 history rows with grounded endpoint arithmetic. The retained known-failure audit now obtains causality and recurrence answers from mocked general generation plus review, not server templates. These tests verify execution and enforcement, not the semantic accuracy of a live model.

The production-repair audit keeps correction/scope/no-write checks and actual provider-event/admission/credit-settlement tests. Malformed primary output is tested as a bounded incomplete answer; transport and timeout errors test release, retry and replay settlement. A test-harness assertion is never counted as a simulated provider failure. Saved-note checks inspect the actual optional notes section rather than assuming fallback excerpts are the main answer.

## Validation

- Full offline suite: **2,062 top-level tests passed**, zero failures/skips. Nested architecture audits also pass.
- Focused security suite: **160 passed**, zero failures/skips.
- TypeScript: passed.
- ESLint: zero errors; five existing warnings remain (two navigation warnings, one intentional omitted-text binding, two unused compatibility parameters).
- Dependency installation consistency: `npm ls --all` passed.
- Production dependency audit: zero vulnerabilities.
- Production build: passed using CI placeholder public Supabase values, not live credentials.
- `git diff --check`: passed.

The reduced test count reflects retired implementation coverage; it is not a reliability improvement metric. No paid provider benchmark ran, and no account or database data was changed. Authenticated browser smoke checks and SQL execution were not run in this environment. The PR remains a draft for review of those limits and the deliberate endpoint retirements.
