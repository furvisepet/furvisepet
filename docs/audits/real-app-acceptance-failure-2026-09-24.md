# Furvise architecture completion run — stopped at Phase 2
Date: 2026-09-24. Status: **BLOCKED — Class B at the first admitted Case A**.
Application source tested: addfa7cb2bab3196cd4fb27b1c1be960a0744a1f.
Completed checkpoint commits: 8015b76 (baseline), 55f92e8 (local database compatibility).
No application code or tests were changed. No production migration or deployment occurred.

## Failure
Prompt: **What was Milo's recorded weight on September 1, 2026?**
Expected: **10 kg**, from care record 30200a69-7166-4f35-8b1e-f9cd8c38438a.
Stored body: `Body weight: 10 kg.`; occurred_at: 2026-09-01T12:00:00Z.
Pet: Milo, dcceaa9c-6837-48d4-ab52-cc50a27f0687.
HTTP 200 in 7,293 ms; answer/task outcome limited; no source IDs published.
Actual answer, also verified in the persisted assistant message:
> I couldn’t certify the requested history result from the available evidence. This does not establish that matching records are absent.

This is a supported simple history read that withheld the available certified result, classified Class B for this run. It is not a wording-only issue or a claim that matching history is absent.
Request: b425eb49-5d9f-4746-a52c-01b7912f7255.
Attempt: 63841373-c816-4edb-ae5d-44b1b83b129b.
Conversation: b350e0eb-829b-45da-b4b3-7dc4f576e4a9.
Assistant message: 54dc3b14-ecec-4c1a-9c84-c31beb5e3beb.

## Authority evidence
Brain produced one read/recall request, quantity measurement, prose, sufficient completeness, no write job, no selection, no calculation plan.
ReadTicket targeted only Milo, 2026-09-01T00:00:00Z through 2026-09-02T00:00:00Z, text_any terms weight/weighed/weighing, ascending order.
Lungs returned exactly the expected care record. Coverage complete; matchingSetComplete, representationComplete, and resultSet.certified were true; omitted IDs empty; lineage closed and replacement seeds exhausted.
Consistency was explicitly read_committed_no_snapshot, with reason no_cross_query_snapshot; this run does not claim cross-query snapshot isolation.
Publication diagnostics rejected eligibility as **legacy.non_exhaustive_non_records**.
The operative guard is `buildLabsList` in `app/lib/intelligence/labs-list.ts`, line 42: no selection + completeness other than exhaustive + quantity other than records returns null.
The diagnostics observer reports this existing gate; it does not authorize anything.
Obligation dispatch then used path unavailable, no authorized source IDs, no model generation, and no repair.
This identifies the observed failure boundary. No repair design was attempted or authorized after the stop condition.

## Cost and mutations
One GPT-5.4 Mini interpretation call: 22,476 input tokens, 611 output tokens, 6,696 ms.
Application guard recorded **19,607 microdollars ($0.019607 estimated)**, below the $1 cap. This is application accounting, not a provider invoice.
No generation, review, fallback, or repair provider call occurred. The user's credit was released and settlement reconciled.
Case A changed no care history; actionCount 0, dataChanged false, carePersistence skipped, mutationOutcome not_requested.
Conversation persistence succeeded and the stored answer matched the HTTP result.

## Harness and test scope
Actual locally built production-mode Next application, real local Supabase Auth/Postgres/API and Redis, synthetic authenticated account, and real provider interpretation.
The client used the supported non-browser bearer HTTP path. Browser UI, rendering, refresh UI, and visual acceptance were not tested.
The original A capture returned 403 ORIGIN_NOT_ALLOWED before Brain/provider admission because the HTTP client supplied a local HTTP Origin. It made zero provider calls.
Only the temporary client was corrected to omit Origin for the supported non-browser bearer path. A1 is the single admitted Case A. The application origin policy was unchanged.
A direct service-role conversation table read during evidence capture was denied (42501), as expected under its firewall. Persisted-response verification used read-only local Postgres.
No Case B–T, architecture completion phase, final sweep, or cutover packet was attempted after the Class B result.

## Phase 0 baseline
Tracked tree clean at the starting SHA; direct dependency/lock versions complete; typecheck, fresh production build (43 static pages), clean-copy typecheck, and git diff --check passed.
Gate groups overlap; these counts are not a sum of unique tests.

| Gate | Passed / total |
| --- | --- |
| G1 | 94 / 94 |
| G2 | 89 / 89 |
| G3A | 89 / 89 |
| G3C focused | 74 / 74 |
| Retirement | 5 / 5 |
| Retrieval | 239 / 239 |
| Brain | 78 / 78 |
| Body | 188 / 188 |
| Core | 51 / 51 |
| Publication | 85 / 85 |
| Profile | 78 / 78 |
| Mutations | 184 / 184 |
| Security | 84 / 84 |
| Safety | 54 / 56 |
| Audit | 209 / 222 |

The two Safety and thirteen Audit failures exactly matched the established baseline names. They remain unresolved; no tests were weakened or migrated.

## Phase 1 database proof
Replayed the repository baseline of 128 migrations into isolated local Supabase, then applied exactly the seven pending 20260923 migrations in order, reaching 135.
A separate network-isolated Postgres replay also applied all 135 migrations.
Real SQL suites: isolation 29/29; suggestion 37/37; generalized replace 16/16; remove 31/31; permanent pet remove 28/28 — **141/141**.
Actual application authority clients proved canonical suggestion continuation, exact append-body preservation, durable receipt, idempotent replay, foreign-owner denial, RLS filtering, and service-only RPC restrictions.
Local metadata showed only the hosted default main branch; no hosted branch was created or mutated.
The repository baseline ends 20260920000100, while the supplied production retirement timestamp was 20260920074613. Local replay is compatibility evidence, not proof of production schema equality.

## Cleanup and remaining status
Deleted both synthetic auth users, all four pets, all fourteen care entries, both conversations/four messages, the suggestion, capability, billing fixture, and all other user-owned test rows.
Verified auth/users, profiles/history/conversations, and every public/private table with a user_id column had zero rows after cleanup.
Removed the private session credential file. Stopped the local app and Supabase stack; removed the isolated validation and Redis containers. The stopped Supabase backup contains the cleaned schema/data.
The five specified unrelated untracked public assets were untouched.
Classes 1, 2, 3, 5, 6, 7, 8, 11, and 12 retain their prior reported closure status; this run does not renew their full acceptance. The newly exposed READ publication failure blocks launch.
Classes 4, 9, and 10 remain partial; no new denominator or completion claim is made because their phases did not run.
Known launch blockers: Case A; incomplete Classes 4/9/10; fifteen existing baseline failures; outstanding remaining acceptance and final gates; unverified production schema equality.
**Do not proceed to production cutover.** Further repair work requires a follow-up instruction because the user's stop-on-first-Class-A/B rule ended this run.

## Evidence files
The adjacent `architecture-completion-evidence-2026-09-24` directory contains the original A/A1 HTTP captures and A1 runtime log, synthetic fixture, persisted-response proof, cleanup counts, baseline gate results, migration replay result, SQL gate results, and application authority-client proof.
All evidence is synthetic and excludes credentials.
