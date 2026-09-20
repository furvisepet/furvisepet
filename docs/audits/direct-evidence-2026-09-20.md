# Direct evidence caller — 20 September 2026

**Selected cluster green offline. Entire interpreter branch still blocked. No preview, live Ask, push, merge, or deployment.**

Branch `codex/one-interpreter`; starting draft `bc643ec`. Production was not changed (`e2ab3a0`).

## Counts

| Same 222 named cases | Passed | Failed | Introduced failures vs production |
| --- | ---: | ---: | ---: |
| Production baseline | 213 | 9 | 0 |
| Previous draft | 135 | 87 | 79 |
| This cut | 177 | 45 | 37 |

**C001–C028, C030–C045, C048: 45/45 pass. Remaining new failures in this ID set: 0.** Forty-two formerly failing cases were repaired and three passing controls stayed green. The entire evidence audit file is 50/50. No case outside the selected cluster changed outcome. Eight baseline failures remain; the ninth had already passed in the preceding cut.

## Change

The direct caller accepts explicit publication obligations around the existing ReadTicket: requested answer kind, topic predicates, calendar locator with optional year, ambiguity, and completeness. This is a typed input boundary; it neither interprets the question nor performs a new retrieval or planner pass. A proposal cannot supply source IDs, coverage, totals, or a write flag.

The evidence factory binds subjects to the authenticated owner and indexes the actual loaded records before prompt selection. Topic matching uses ticket predicates, not question words or named-test word lists. The locator binds month/day/year explicitly; an omitted year remains omitted. Competing later or undated related records remain blockers even if prompt selection omits them. The original source text is not rewritten.

The existing evidence contract supplies the publication labs: represented source spans, lookup candidates and competing IDs, independent loading/lineage/extraction/grouping coverage, representation losses, and server-certified facts. The typed ticket is included in the existing fact scope key so a fact cannot be reused for a different predicate or date constraint. Certified facts require represented matching owned source spans; an empty source-ID list cannot authorize a count.

The existing answer policy and source quotation renderer keep their wording. They now receive the missing typed obligations. Unknown/unavailable coverage cannot become absence or a count; a unique represented note can be quoted exactly with the existing historical-status caveat. Ambiguous lookup retains clarification. Read-only is set by the validated ticket and the existing pipeline removes proposed writes, learnings, semantic events, and history updates. Ordinary typed reads also cannot fall through to unrestricted model prose.

Anchors, rankings, and output-limited selection are rejected by this bounded direct adapter; they must use Lungs. The adapter cannot silently bypass those operations. Supplying this ticket alongside another interpretation is rejected rather than creating two semantic authorities.

## Fixtures and safety

- Existing audit inputs now state their semantic dimensions explicitly. Helpers do not inspect the question, choose a model, fetch, certify state, or invent source IDs.
- All 222 names and every original audit assertion remain. No cases were deleted, skipped, waived, or renamed.
- Five added focused cases check subject/topic/year binding; unselected competing evidence and unavailable sources; forged metadata and duplicate interpretation; scope-bound certified facts; and ordinary-read fail-closed behavior.
- Heart, confirmation, receipt adapter, Lungs retrieval, list serializer, owner-note splitter, paywall, Immune, Brief, and mouth copy were not edited.
- No planner repair was added or restored. The six policy-conflict cases remain red.

## Gates

- `npm run typecheck`: passed.
- Targeted ESLint: passed.
- `git diff --check`: passed.
- Focused Heart/replace, Lungs, serializer, working-memory interpretation, Brain authority, interpreter, and direct-evidence tests: **66/66 passed**, no skipped tests.
- Full paired audit: **177/222 passed, 45 failed**. All 222 names match the preceding ledger exactly.
- Actual model/API calls: **0**. Test provider responses are local mocks; fetch is forbidden by the harness. Live Ask: **0**. Pushes/builds/deployments/merges: **0**.

## Limits and stop

This proves the migrated direct-caller contract and its publication obligations with mocked data/provider dependencies. It does not prove real Brain emission or the live Ask route. The proposal is explicitly supplied by migrated callers/fixtures; this cut does not wire new planner schema fields or migrate the remaining legacy callers. The old unannotated compatibility branches and pre-Brain owner-note splitter are not claimed fixed.

The full branch remains 37 new failures above production. Episode selectors, comparison endpoints, multi-need/rare-history obligations, mixed paths, and the splitter are intentionally left for their requested later cuts. No live Dune or preview is justified by this cluster passing.

**Repair-policy decision:** one planner pass. Invalid first ticket means reject or clarify; never a silent second planner. This cut does not implement a new clarification workflow or rewrite the six conflicting fixtures.

| Required red case | Current result |
| --- | --- |
| C055 — premise repair is bounded and revalidates exact user evidence | Red, retained |
| C056 — a premise repair cannot authorize invented pets or mutation scope | Red, retained |
| C113 — real admission lets a repaired planner reach composition without opening extra repair cycles | Red, retained |
| C166 — missing premises use bounded repair without inventing evidence | Red, retained |
| C196 — new observation plus calculation can repair an invalid correction plan without weakening validation | Red, retained |
| C212 — profile contract mistakes get one bounded repair with full ownership revalidation | Red, retained |

## Selected-case ledger

| ID | Case | Before | Now |
| --- | --- | --- | --- |
| C001 | named blood test cannot cite unrelated note: September 3 urine test: result normal. | fail | pass |
| C002 | named blood test cannot cite unrelated note: September 3 vet note: skin diagnosis recorded. | fail | pass |
| C003 | source wording remains identical in visible quotation and citation: September 3 blood test: result pending, not confirmed normal. | fail | pass |
| C004 | source wording remains identical in visible quotation and citation: I recorded the urine test as pending. | fail | pass |
| C005 | source wording remains identical in visible quotation and citation: I added the urine test result: pending, not normal. | fail | pass |
| C006 | source wording remains identical in visible quotation and citation: I recorded the urine test value as 2.7, with uncertainty. | fail | pass |
| C007 | ordinary assistant persistence claims remain removed, even inside model quotation marks | pass | pass |
| C008 | unsupported or ambiguous test locator abstains: test | fail | pass |
| C009 | unsupported or ambiguous test locator abstains: blood and urine test | fail | pass |
| C010 | compound test descriptors retain every named component | fail | pass |
| C011 | specific represented note reaches final answer: September 3 urine test: result pending. | fail | pass |
| C012 | specific represented note reaches final answer: September 3 urine test: result normal. | fail | pass |
| C013 | specific represented note reaches final answer: September 3 vet note: the veterinarian recorded a diagnosis of arthritis, not yet confirmed by imaging. | fail | pass |
| C014 | source rendering does not depend on the model citing the note | fail | pass |
| C015 | unselected competing evidence still blocks a quote; an earlier result does not | fail | pass |
| C016 | a valid cited ID for another topic cannot authorize a requested result | fail | pass |
| C017 | an explicit year disambiguates historical notes without assuming a year | fail | pass |
| C018 | specific lookup fails safely: missing | fail | pass |
| C019 | specific lookup fails safely: unavailable | fail | pass |
| C020 | specific lookup fails safely: ambiguous same day | fail | pass |
| C021 | specific lookup fails safely: ambiguous year | fail | pass |
| C022 | specific lookup fails safely: later contradiction | fail | pass |
| C023 | specific lookup fails safely: oversized | fail | pass |
| C024 | a dated source does not establish current medical status or exhaustive absence | fail | pass |
| C025 | bounded answer policy rejects unsupported assertion: Exactly seven soft-stool episodes were recorded. | fail | pass |
| C026 | bounded answer policy rejects unsupported assertion: The urine test was normal. | fail | pass |
| C027 | bounded answer policy rejects unsupported assertion: Oscar has arthritis. | fail | pass |
| C028 | bounded answer policy rejects unsupported assertion: The recorded weight decreased by 0.2 kg. | fail | pass |
| C030 | capped loading, intermediate and final selection are distinct losses | fail | pass |
| C031 | unknown coverage cannot authorize exhaustive answer: How many separate soft-stool episodes has Milo ever had? | fail | pass |
| C032 | unknown coverage cannot authorize exhaustive answer: Has Milo ever vomited? | fail | pass |
| C033 | unknown coverage cannot authorize exhaustive answer: Have I reported any vomiting for Milo? | fail | pass |
| C034 | unknown coverage cannot authorize exhaustive answer: Compare all Milo recorded weights. | fail | pass |
| C035 | failed loading survives to provider and definitive absence is replaced | fail | pass |
| C036 | profile-only second pet does not imply history loading | fail | pass |
| C037 | oversized evidence is omitted whole, never emitted without its correction or qualifier | pass | pass |
| C038 | certified complete server fact is rendered instead of a contradictory model total | fail | pass |
| C039 | complete retrieval without correction/grouping certification or verified total still abstains | fail | pass |
| C040 | model-proposed coverage metadata never establishes authority | fail | pass |
| C041 | a verified fact loses authority if its qualified source cannot be represented | fail | pass |
| C042 | mandatory query scope preserves multiple topics and excludes unauthorized pet IDs | fail | pass |
| C043 | ambiguous episode reference asks for clarification | fail | pass |
| C044 | qualified short source survives exactly in provenance and actual model record | pass | pass |
| C045 | date-filtered load does not claim correction completeness for requested historical period | fail | pass |
| C048 | model proposals cannot turn factual recall into new history or memory | fail | pass |

Machine-readable outcomes for all 222 cases: [direct-evidence-2026-09-20.json](direct-evidence-2026-09-20.json).

## Reproduce offline

```sh
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs tests/ask-direct-evidence-ticket.test.mjs
npm run typecheck
```
