# Multi-need and rare-history tickets — 20 September 2026

**Requested ten pass offline. The interpreter branch remains blocked. No live Ask, preview, push, merge, or deployment.**

Branch `codex/one-interpreter`, starting at `44d9707`. Production remains `e2ab3a0`; this run made no production calls or changes.

## Counts

| Same 222 audit cases | Passed | Failed | New failures vs production |
| --- | ---: | ---: | ---: |
| Production baseline | 213 | 9 | 0 |
| Previous draft | 188 | 34 | 26 |
| This cut | 198 | 24 | 16 |

Only the requested ten changed outcome, all from fail to pass. The remaining 24 failures comprise 16 introduced failures and eight pre-existing baseline failures. The ninth baseline failure already passed before this cut. C105/C178, fixture/subject, mixed, and all six repair outcomes are unchanged.

## Selected proofs

| ID | Result | Existing obligation preserved |
| --- | --- | --- |
| C170 | Pass | Rare transition survives common-topic candidates; existing page and candidate bounds hold. |
| C173 | Pass | Food-transition and discontinued-supplement aliases reach composition; one mocked answer call and one review per scenario. |
| C180 | Pass | Reason row survives retrieval AND prompt representation for summary, comparison, and latest planner labels. |
| C185 | Pass | April 17, 2023 and latest weight both reach labs; exact dated answer preserved with one review. |
| C187 | Pass | Both grounded needs reach review and final publication; three obligations retained; one review. |
| C189 | Pass | Need queries and represented coverage remain attached to their respective pets. |
| C190 | Pass | Rare supplement evidence survives verbose routine rows and the unchanged character/record budgets. |
| C191 | Pass | Coverage keeps the actual database-returned hit despite different wording; semantic support stays unverified. |
| C193 | Pass | February 2023 target survives dense later years; target coverage records the retained anchor. |
| C194 | Pass | Dated note reaches ordinary recall; no episode result or episode clarification is created. |

## What changed

The prior ticketed path retained grounded `evidenceNeeds` for review but did not query or reserve evidence for each need. A generic bounded scan could fill with routine notes before reaching a rare transition, requested middle date, or another pet's separate need.

`ReadTicket.needs` now explicitly links each retrieval need to a validated `evidenceNeeds` ID. The request boundary checks the exact user quotation and source turn, resolves owned subjects, and binds a source-span identifier containing the turn and literal offsets. Retrieval receives pet IDs, source-span identity, explicit date bounds, an optional ISO day/month target, query ordering, and advisory term groups. It receives no question to interpret. Unknown needs, forged fields, invalid dates, incompatible episode/record-selection dimensions, and unowned bindings are rejected.

The new Lungs helper queries each need's groups through the existing scoped candidate RPCs, or through a directly requested bounded calendar-window read when a group is empty. It never retries a failed lexical query through a prose-based fallback. Rare aliases can occupy separate probes from common topic terms. Probes rotate across needs and pets before spending remaining group slots.

The helper shares the existing **four-query/page** ceiling and **32-record / 18,000-character** output limits. Its candidate pool is capped at **64 distinct rows** across need probes. It reserves the first effective candidate from each actual probe before adding interior rows. Duplicated hits do not become duplicate evidence. All candidate rows pass ownership, time, deletion, and the existing effective-lineage boundary before output. A changed source revision or invalid returned scope fails closed.

`history.coverage.needs` records actual query-returned IDs and query exhaustion/status, not a second in-memory guess about whether wording matches. C191's returned dietary-transition row therefore remains a candidate for the food-change query. Semantic support remains **unverified**. Missing, failed, clipped, and budget-limited probes are distinguished; none becomes an invented empty-query receipt. Overall multi-need coverage stays partial because bounded advisory searches do not establish exhaustive semantic history.

Dated targets flow through `history.coverage.targets`. Scanned, retained, and omitted records remain separate. Probe reservations flow through the existing `requiredSourceIds` field so downstream prompt trimming cannot cheaply discard the sole rare-alias representative. This was necessary for C180: retrieval first succeeded, but representation still lost the reason row. Existing review and trimming code remained unchanged.

No pet-level continuation offset is invented for lexical probes; their exhaustion is reported per need. A prefix-scan offset could not faithfully resume a different query/window.

## Files and narrow boundary changes

- `read-needs.ts`: typed query dimensions, source/subject binding requirements, strict schema validation.
- `read-ticket.ts`: optional need obligations and incompatible-job checks.
- `ask-request-contract.ts`: binds validated user needs to ticket fields and transports explicit need windows to review; updates the shared planner instructions.
- `lungs-needs.ts` and the small dispatch/type extension in `lungs.ts`: bounded probing, effective evidence selection, reservations, and coverage.
- `history-retrieval.ts`: uses the existing authenticated RPC signatures, transports actual need/target coverage, and preserves reservations through the existing prompt-protection contract.
- `evidence-read-ticket.ts`: a narrow guard keeps retrieval-only needs out of the direct publication caller.
- Only the ten selected audit fixtures were migrated. Their typed windows, per-need groups, and aliases are explicit mocked Brain output; no runtime phrase list was added.

No database schema, RPC definition, dependency, or infrastructure changed. Supabase adapter verification used the repository's existing contracts and offline mocks, not live queries.

## Verification

- Full audit: **198 passed / 24 failed**, all **222 names** intact. Only the selected ten changed result.
- Focused suites: **81/81 passed**, zero skipped. All preceding 76 cases remain green; five new tests cover the need boundary and bounded query behavior.
- Added checks cover actual hits with different wording; missing-query refusal; rare-alias reservation under record/character budgets; per-pet binding and query-budget loss; clipped windows; foreign/future rows; changing revisions; exact user-span binding; and rejection of forged need fields.
- AST comparison against `44d9707`: **624 existing assertion calls unchanged** across the two audit files (117 + 507). No audit assertions or provider-call expectations were removed or relaxed.
- C185 and C187 retain their **one-review** expectations. C173 retains its **one-answer-provider** expectation. No new planner, review, or repair pass was added.
- Typecheck, targeted ESLint, and `git diff --check`: passed.
- Actual model/API calls: **0**, cost **$0**. Audit provider/database responses were local mocks; the audit harness forbids network calls. Live Ask, previews, pushes, merges, and deployments: **0**.

## Limits and stop

This proves the supplied ticket dimensions, query reservation, and coverage plumbing offline. It does **not** prove real Brain emission or live Ask performance. Database matching is candidate discovery, not semantic proof. A bounded query can still miss records; query budgets and output losses remain explicit. The typed day/month target validator currently requires UTC calendar-aligned windows. No new continuation executor was implemented.

Correction uncertainty, including C105/C178, remains deferred. The new helper does not invent membership for a lineage replacement whose effective ID differs from a queried root; unrepresented candidate IDs remain visible to coverage. It does not repair correction discovery or reassignment behavior.

Heart, confirmation, receipts, episode jobs, serializer/review logic, mouth copy, Brief, mixed requests, and the owner-note splitter were not changed. The interpreter branch remains blocked with **16 new failures**. Stop here; no live Dune, preview, or merge.

## Six repair cases retained red

| ID | Case | Result |
| --- | --- | --- |
| C055 | premise repair is bounded and revalidates exact user evidence | Fail, retained |
| C056 | a premise repair cannot authorize invented pets or mutation scope | Fail, retained |
| C113 | real admission lets a repaired planner reach composition without opening extra repair cycles | Fail, retained |
| C166 | missing premises use bounded repair without inventing evidence | Fail, retained |
| C196 | new observation plus calculation can repair an invalid correction plan without weakening validation | Fail, retained |
| C212 | profile contract mistakes get one bounded repair with full ownership revalidation | Fail, retained |

One planner pass remains the policy: an invalid first ticket must reject or clarify, never silently trigger another planner. These six fixtures were not changed.

## Remaining failures

| ID | Origin | Case |
| --- | --- | --- |
| C055 | Introduced | premise repair is bounded and revalidates exact user evidence |
| C056 | Introduced | a premise repair cannot authorize invented pets or mutation scope |
| C063 | Baseline | read planner can omit extraction while writes still require a valid frame |
| C090 | Introduced | a read contract cannot grant writes even with an assertion-looking premise |
| C096 | Baseline | five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose |
| C097 | Introduced | conversation identity must match a complete owned name |
| C105 | Introduced | unlinked correction may be reported but does not create a verified edge |
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
| C178 | Introduced | review receives correction uncertainty attached to its own source |
| C196 | Introduced | new observation plus calculation can repair an invalid correction plan without weakening validation |
| C204 | Introduced | plain mixed-history answers retain owner-report anchors when legacy context IDs omit the request |
| C212 | Introduced | profile contract mistakes get one bounded repair with full ownership revalidation |
| C215 | Baseline | a failed mixed answer cannot commit proposed observation side effects |
| C217 | Introduced | read mode discards contradictory mutation hints without a provider repair |
| C219 | Introduced | unnamed standalone reads cannot expand to the account from a planner hint |

Full machine-readable ledger: [multi-need-ticket-2026-09-20.json](multi-need-ticket-2026-09-20.json).

## Reproduce offline

```sh
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs tests/ask-direct-evidence-ticket.test.mjs tests/furvise-read-obligations.test.mjs tests/furvise-episode-ticket.test.mjs tests/furvise-multi-need-ticket.test.mjs
npm run typecheck
```
