# Furvise bounded repair and Case A retest — stopped
Date: 2026-09-24. Status: **Repair committed; real-app acceptance BLOCKED at Case A**.
Base HEAD: f32449590c860dabe65fd6da9e32b7a54ea651da.
Repair commit: **9b8c2b93f913d882707e7da5c580d2f13b7a1a3e** — fix: publish certified sufficient result sets.

## Repair
The old buildLabsList rule rejected a non-selection read when outputs.completeness was not exhaustive and request.quantity was not records. It vetoed the previously certified Case A result before publication authority could use it.
The replacement composes existing supportedHistoryPublication and isOrderedResultSet capability checks with coverage.resultSet.certified, complete/complete_empty coverage, and resultSetSnapshotMatches. The latter validates matching-set/representation consistency, exact retained/omitted IDs, subject/window binding, and lineage.
No new certificate store or semantic interpreter was created. Sufficient completeness no longer vetoes a complete deterministic proof; insufficient proof still cannot produce ordinary Labs.
The existing typed recall capability remains. Count, comparison, aggregation, navigation, tasks, projections, evidence needs, independent requirements, profile/stored domains, calculations, episodes, and mutations cannot borrow this ordinary result-set path.
The existing records/measurement contract was reused, not expanded with a measurement-only exception. No added production weight/weighed/weighing/September/Milo or raw-wording checks.
Selection and Calculation Labs operand transport remain separate. Multiple certified records retain exact bodies and order; Labs does not select one from singular wording. Explicit limit/selection obligations cannot enter plain result-set publication.
Existing lexical-empty caution and effective-stream absence rules remain. No Brain, Lungs, Heart, SQL, Brief, or Immune implementation changes.
Diagnostics retire legacy.non_exhaustive_non_records and report result-set eligibility and source binding as observers only.

## Offline verification
| Gate | Passed / total |
| --- | --- |
| New generic eligibility tests | 45 / 45 |
| Requested focused publication suites | 189 / 189 |
| G1 | 94 / 94 |
| G2 | 89 / 89 |
| G3A | 89 / 89 |
| G3C | 74 / 74 |
| Retirement | 5 / 5 |
| Retrieval | 239 / 239 |
| Brain | 78 / 78 |
| Body | 188 / 188 |
| Core | 51 / 51 |
| Publication baseline group | 85 / 85 |
| Profile | 78 / 78 |
| Mutations | 184 / 184 |
| Security | 84 / 84 |
| Safety | 54 / 56 |
| Audit | 209 / 222 |

Safety's two and Audit's thirteen failure names exactly match the established baseline. Groups overlap; do not sum as unique tests.
Typecheck, fresh production build (43 static pages), clean-copy typecheck, and git diff --check passed.
Legitimate existing-test changes: remove obsolete certified-sufficient measurement rejection; assert earlier null for uncertified result sets; preserve stale Labs review/validation rejection and source-free limitation assertions.
The first new-test run found four fixture issues (frozen tickets and an overbroad logging stub), corrected without production changes. The first broad run found two obsolete Body builder expectations; after the above adjustment Body passed 188/188. No unrelated expectations were weakened.

## Local environment
Actual production-mode Next application with repaired source; real local Supabase Auth/Postgres/API and Redis; synthetic bearer-authenticated client; GPT-5.4 Mini unchanged.
All 135 repository migrations applied. CLI reset applied 104, then failed because its execution of an older LOCK TABLE lacked a transaction. The remaining 31 unchanged migrations were replayed in explicit transactions, with the exact final ledger verified.
Reset recreated database port/network configuration. Loopback-only binding and the shared test network were restored before successful seeding. Auth/API health returned 200 before acceptance.
Two failed account-creation setup attempts returned upstream errors while the database was on the wrong Docker network; auth.users remained zero. No provider calls occurred in setup.
Successful seed: two synthetic users, four pets, thirteen history records; cross-user RLS reads empty and client access to service-only RPC denied.
This is HTTP/client acceptance, not browser visual verification. Logs label NODE_ENV as production, but every application backend here was local; no hosted production migration/deployment occurred.

## Case A retest — Class B
Prompt: **What was Milo's recorded weight on September 1, 2026?**
Expected: Body weight: 10 kg., occurred_at 2026-09-01T12:00:00Z.
Source record: 0f7971a6-8b45-4042-bd79-a9adb951f41a. Pet: f33c7c9c-1e66-4d6f-b39c-fd85b7cd8932.
Request: 64acdf26-158e-4022-83ab-1798eea29954.
Attempt: 82737e3e-59d0-4bdf-9370-ead655407d5a.
Conversation: 2f074271-fdb8-4438-bb58-76981f79d507.
User message: 72578348-a630-4fda-b24f-9708fb0a8ed9.
HTTP **503**, 9,127 ms. Public code TEMPORARY_PROVIDER_FAILURE; diagnostic ASK_INTERPRETATION_FAILED.
Brain proposed read/recall, named Milo, saved_history, no write; window September 1 through September 2, 2026; text predicates weight/weighed/weighing/recorded weight/body weight.
The proposal also contained **outputs.strategy: temporal_endpoints** with **operation: read**, selection null, sufficient completeness, ascending order, limit null.
Binder rejected **ASK_REQUEST_CONTRACT_READ_TICKET**, field **outputs.strategy**, rule **temporal_endpoints_requires_compare**.
This is a new observed interpretation-contract failure before Lungs/Labs. The binder correctly failed closed. It is not evidence that the repaired publication gate failed; the live request did not reach that gate.
The supported Case A question remains unfulfilled, so acceptance stopped as instructed. No retries, alternate prompt, provider repair/fallback, Cases B–T, or later architecture phases ran.

## Cost, mutations, cleanup
One interpretation call: 22,177 input tokens; 820 output tokens; 8,617 ms. Not a timeout.
Application-estimated cost: **$0.020323** this retest; **$0.039930** combined with the preceding stopped run. This is guard accounting, not a provider invoice.
Credit released; settlement reconciled. No factual generation/review call.
Care history remained unchanged; no write actions. The user message persisted, but no assistant answer persisted; the seeded 10 kg source was verified before cleanup.
Both synthetic sessions revoked; both users and all seeded/generated user-owned records deleted. Verified zero auth users/sessions, pets/history/conversations, and every public/private table carrying user_id.
Private session file removed. Local app/Supabase stopped; Redis containers removed. No listeners remained on the test ports. Only the cleaned local schema backup remains.
The five specified unrelated untracked public assets were untouched.

## Current status
Repair committed; foundational real-app acceptance still incomplete. Classes 4, 9, and 10 remain partial with no new completion denominator. Previously reported closures for Classes 1/2/3/5/6/7/8/11/12 are not newly re-certified by this stopped run.
Launch blockers: current interpretation-contract failure, unfinished acceptance, partial Classes 4/9/10, existing fifteen baseline failures, final authority sweep/gates and production-schema reconciliation.
**Production cutover remains blocked and requires explicit GO.**
Raw evidence is committed under docs/audits/sufficient-result-set-evidence-2026-09-24 in C:\Users\gwara\furvise-preview-fa92d01.
