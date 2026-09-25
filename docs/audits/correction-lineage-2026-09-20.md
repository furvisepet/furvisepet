# Correction uncertainty — 20 September 2026

**C105 and C178 pass offline with their original fixtures and assertions. The interpreter branch remains blocked.**

Branch `codex/one-interpreter`, starting at `5ad727e`. Production remains `e2ab3a0`; this run made no production calls or changes. No live Ask, preview, push, merge, or deployment.

## Counts

| Same 222 audit cases | Passed | Failed | Introduced failures vs production |
| --- | ---: | ---: | ---: |
| Production baseline | 213 | 9 | 0 |
| Previous draft | 198 | 24 | 16 |
| This cut | 200 | 22 | 14 |

Only C105 and C178 changed outcome, both from fail to pass. The remaining 22 failures comprise 14 introduced failures and eight baseline failures. The ninth original baseline failure already passed before this cut. All 222 names are preserved; both audit files are unchanged from the starting commit.

## Selected proofs

| ID | Result | Original assertion path exercised |
| --- | --- | --- |
| C105 | Pass | Exact correction wording is publishable as an attributed report with its link explicitly unverified; provenance remains `unlinked_correction_uncertain`; no accepted semantic events; one review call. |
| C178 | Pass | Review receives both sources. Ordinary source has `provenanceStatuses: ["unverified_legacy"]`; correction source has `["unlinked_correction_uncertain"]`. Uncertainty stays attached to the correction source. No accepted semantic events; one review call. |

These are offline provider mocks, not live model proofs. No fixtures, assertions, provider-call expectations, or review logic were weakened or changed.

## Cause and fix

The existing effective-lineage resolver retained the saved correction row and attached its unlinked provenance. The ticketed history adapter then treated `unlinked_correction_uncertain` as a failed effective read. Lungs returned no records, and downstream provenance pruning removed the source. C178 therefore dereferenced a source that was absent from review; C105 could not complete its original one-review publication path.

The adapter now distinguishes a validated saved report from a verified correction link. An unlinked correction that passed the existing source ownership, freshness, and lineage-read checks survives as attributed evidence. Its existing per-source provenance is retained, and `history.coverage.corrections` remains `partial`.

Lungs coverage can carry `sourceLineage: [{ eventId, status: "unlinked" | "uncertain", authority: "attributed_report" }]`. The current adapter maps the existing unlinked provenance status to `unlinked`; the type also permits `uncertain`. The new metadata confers no supersession or effective-current authority. Ordinary sources retain their own provenance.

Regular reads return the selected source wording with partial coverage. The bounded need-reader carries the same metadata, preserving its existing partial status. Chronological boundaries and comparison endpoints are blocked when the selected evidence has unresolved lineage. An uncertain anchor cannot certify a read-since-event window. Genuine unavailable, stale, excluded, or unsupported lineage reads still fail closed.

Review already constructs each source's `provenanceStatuses` from history provenance. Restoring the source into the existing payload fixes the crash without adding a review pass or editing the reviewer. No new planner pass, phrase executor, correction edge, write, receipt, or model authorization was introduced.

## Changed files

- `app/lib/intelligence/history-retrieval.ts`: distinguish attributed unlinked reports from failed lineage reads; transport per-source metadata and partial correction coverage.
- `app/lib/furvise-brain/lungs.ts`: typed source-lineage coverage; preserve attributed records while withholding complete coverage and uncertain anchor/endpoint certification.
- `app/lib/furvise-brain/lungs-needs.ts`: carry that metadata through the existing bounded need-read result.
- `tests/furvise-correction-provenance.test.mjs`: four focused tests for attributed wording, per-source uncertainty, blocked boundary certification, unavailable lineage, and need-query evidence.
- This report and the full 222-case JSON ledger.

Heart, confirmation, receipts, source-lineage mutation/resolution, serializer, direct-evidence caller, owner-note splitter, episode logic, mouth copy, Brief, Immune, fixture/subject, and mixed-request handling are unchanged.

## Verification

- Full audit: **200 passed / 22 failed**, all **222 cases** intact; only the requested two changed result. The nonzero audit exit is expected and remains a merge blocker.
- Focused suites: **85/85 passed**, zero skipped. All preceding 81 tests remain green; four correction-provenance tests were added.
- Original C105 and C178 fixtures/assertions: unchanged; selected run **2/2 passed**.
- Typecheck, targeted ESLint, and `git diff --check`: passed.
- Actual model/API calls: **0**; model/API cost: **$0**. Database and provider responses were local mocks.
- Live Ask, previews, pushes, merges, deployments: **0**.

## Limits and stop

This cut preserves uncertain correction rows selected by the current ticketed read; it does not introduce a global correction-discovery algorithm or change predicate matching. An uncertain anchor still returns no resolved window. A failed lineage/source validation still withholds records. This is not a general rewrite of effective-current food or weight projections, and it does not prove real Brain emission or live Ask behavior.

The six repair-policy conflicts remain red: **C055, C056, C113, C166, C196, C212**. No planner repair was re-enabled. The other eight introduced failures remain in fixture/subject and mixed-request cases. No next cut was started. Stop here; the branch remains offline and blocked.

## Remaining failures

| ID | Origin | Case |
| --- | --- | --- |
| C055 | Introduced | premise repair is bounded and revalidates exact user evidence |
| C056 | Introduced | a premise repair cannot authorize invented pets or mutation scope |
| C063 | Baseline | read planner can omit extraction while writes still require a valid frame |
| C090 | Introduced | a read contract cannot grant writes even with an assertion-looking premise |
| C096 | Baseline | five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose |
| C097 | Introduced | conversation identity must match a complete owned name |
| C113 | Introduced | real admission lets a repaired planner reach composition without opening extra repair cycles |
| C134 | Introduced | inclusive as-of date is a scope anchor while the event keeps its own date |
| C138 | Introduced | empty conversational names recover only a unique user-established focus |
| C153 | Baseline | supplied premises narrow stale owned-history plans without granting writes |
| C155 | Baseline | general knowledge never widens owned authority and saved history still validates ownership |
| C156 | Baseline | supplied-context classification requires actual verbatim user premises |
| C165 | Introduced | standalone task wording cannot be replaced by a planner paraphrase |
| C166 | Introduced | missing premises use bounded repair without inventing evidence |
| C176 | Baseline | event evidence survives both budgets among verbose routine observations |
| C177 | Baseline | rejected event answers retain relevant source excerpts instead of the latest profile |
| C196 | Introduced | new observation plus calculation can repair an invalid correction plan without weakening validation |
| C204 | Introduced | plain mixed-history answers retain owner-report anchors when legacy context IDs omit the request |
| C212 | Introduced | profile contract mistakes get one bounded repair with full ownership revalidation |
| C215 | Baseline | a failed mixed answer cannot commit proposed observation side effects |
| C217 | Introduced | read mode discards contradictory mutation hints without a provider repair |
| C219 | Introduced | unnamed standalone reads cannot expand to the account from a planner hint |

Full machine-readable ledger: [correction-lineage-2026-09-20.json](correction-lineage-2026-09-20.json).

## Reproduce offline

```sh
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs tests/ask-direct-evidence-ticket.test.mjs tests/furvise-read-obligations.test.mjs tests/furvise-episode-ticket.test.mjs tests/furvise-multi-need-ticket.test.mjs tests/furvise-correction-provenance.test.mjs
npm run typecheck
npx eslint app/lib/furvise-brain/lungs.ts app/lib/furvise-brain/lungs-needs.ts app/lib/intelligence/history-retrieval.ts tests/furvise-correction-provenance.test.mjs
```
