# Read-ticket hygiene — 20 September 2026

**The requested eight pass offline. Only those eight audit outcomes changed. The interpreter branch remains blocked and undeployed.**

Branch `codex/one-interpreter`, starting at `57485cd`. Production remains `e2ab3a0`; this run made no production calls or changes. No live Ask, preview, push, merge, or deployment. No next cut was started.

## Counts

| Same 222 audit cases | Passed | Failed | Introduced failures vs production |
| --- | ---: | ---: | ---: |
| Production baseline | 213 | 9 | 0 |
| Previous draft | 200 | 22 | 14 |
| This cut | 208 | 14 | 6 |

All 222 case names remain intact. The remaining 14 failures are the six repair-policy conflicts plus eight baseline failures. The ninth original baseline failure already passed before this cut; it was not changed here.

## Selected proofs

| ID | Result | Obligation and evidence |
| --- | --- | --- |
| C090 | Pass | A read containing a forged assertion frame stays read-only with an empty semantic frame. The discarded frame cannot reach mutation execution. |
| C097 | Pass | A conversation subject must match a complete owned name in USER text. “Bramble” cannot be established by “brambleberry”; rejection identifies the conversation-subject boundary. |
| C134 | Pass | The typed as-of window has no lower bound and an exclusive August 21 cutoff. The August 17 source remains visible and its own date survives the reviewed answer. One mocked answer and review call. |
| C138 | Pass | Referenced USER text establishes Cedar; assistant text cannot substitute Bramble. Assistant-only or ambiguous multi-pet context clarifies with no subjects and no history read. |
| C165 | Pass | Original standalone wording remains the question and reference question; contradictory paraphrase requirements are removed. |
| C219 | Pass | Ticket `subjectScope: selected` overrides legacy `scope: account`. All three existing sentences retain only the selected pet. No phrase-based scope rule was added. |
| C204 | Pass | A mixed proposal with a typed read and declined persistence becomes read-only; the current owner report still reaches review alongside saved evidence. No care or semantic writes; one review. |
| C217 | Pass | A contradictory task-resume hint is discarded from a read. Exactly one mocked planner call; no task or extra subject remains. |

## What changed

Only two runtime files changed: `app/lib/intelligence/ask-request-contract.ts` and `app/lib/furvise-brain/read-ticket.ts`.

The request boundary now normalizes advisory frame/task/mutation hints out of a typed read. It does not convert them into executable jobs. A simultaneous `writeJob`, update-mode ticket, malformed ticket, or unauthorized subject still fails closed. For mixed requests, the existing persistence-veto guard may narrow an already-present saved-history read ticket to read-only. It never constructs a read from English or grants persistence permission.

The read ticket now carries `subjectScope` with selected/named/conversation/account values. It is required in the provider schema. The binder resolves owned IDs, keeps named subsets and exclusions, and uses the ticket selector ahead of the legacy top-level scope. Old ticket payloads without this field still use their existing scope as compatibility input; the bound request carries the resulting selector and owned IDs on its ticket. Retrieval does not receive a raw question or a second selection mechanism.

Conversation binding rejects unknown reference IDs and removes assistant IDs from the retained reference list. Only USER text establishes an identity, using the existing complete-name matcher and recent-subject state. When names are omitted, a unique user-established focus can bind the subject. Missing or ambiguous focus returns clarification, an empty subject set, and no history plan. No memory depth, date range, or answer is selected by this recovery.

For standalone reads whose proposed question differs from the current user message, ungrounded paraphrase requirements are dropped. The original full user message remains authoritative. Typed needs, output format, predicates, and temporal obligations continue through the existing contract.

As-of behavior uses the existing `temporal.from/to` representation: null lower bound plus an exclusive cutoff. Schema descriptions now state that interpretation explicitly. There is no runtime as-of phrase parser or change to Lungs filtering.

## Fixture migration and assertion preservation

Three audit fixture locations changed; **all 624 existing audit assertion calls are unchanged** by AST comparison against `57485cd` (117 evidence-contract assertions + 507 shared-contract assertions).

- **C134:** supplies the intended typed open-lower-bound window instead of relying on the old English path to repair a one-day legacy interval. Conflicting legacy date fields remain in the fixture to verify that the ticket wins.
- **C204:** supplies the missing read ticket for the declined-persistence mixed proposal. Its shared read/mixed fixture also supplies the equivalent explicit ticket to the already-passing C203 read variant; C203's result and assertions are unchanged.
- **C219:** supplies the intended typed selected-subject dimension while retaining the conflicting legacy account hint. This proves field precedence and bound scope, not live model classification.

The focused interpreter suite was updated in two places. Its rejection test still rejects foreign subjects and now tests conflicting write jobs/update/mixed modes; advisory frame/task/mutation hints are instead checked in the new suite to normalize to an empty frame and null task/mutation/write-job fields. The read-obligation fixture now uses the actual current question when asserting that its requirements survive. These changes reflect the requested normalization behavior, not permission to write.

Five new focused tests cover read conflicts with one planner call; declined mixed persistence; typed selector precedence/ownership/exclusions; USER-only conversational identity and ambiguity; and as-of boundaries with original wording. Source proposals are not mutated.

## Verification

- Selected audit run: **8/8 passed**, zero skipped.
- Full audit: **208 passed / 14 failed**; only the requested eight changed outcome. Nonzero audit exit remains expected and is not waived.
- Focused Heart/Lungs/serializer/interpreter/episode/needs/correction/hygiene suites: **90/90 passed**, zero skipped.
- Typecheck, targeted ESLint, and `git diff --check`: passed.
- AST comparison: **624 audit assertions unchanged**; no audit cases removed, renamed, or skipped.
- Actual model/API calls: **0**; model/API cost: **$0**. Provider and database responses were offline mocks.
- Live Ask, previews, pushes, merges, and deployments: **0**.

Heart, confirmation, receipts, Lungs retrieval, serializer, direct evidence, episode/need logic, owner-note splitter, mouth copy, Brief, Immune, and paywall were not changed. No planner/review pass was added or planner repair restored.

## Limits and stop

These tests prove contract normalization with supplied semantic tickets. They do not prove the live planner emits the correct as-of cutoff or selected/account classification. Legacy scope-only compatibility remains supported; this cut does not claim that an incorrect legacy account scope is semantically corrected from English. The new provider schema requests the typed selector, and C219 proves that selector overrides the stale legacy hint.

Mixed proposals still require an actual read ticket for this path. The persistence veto narrows authority only; it does not infer a missing read. Existing USER-focus reconstruction is reused without rewriting the subject subsystem. Unknown references and unresolved identities do not gain ledger access.

The only introduced audit reds are **C055, C056, C113, C166, C196, C212**. They remain failures, not accepted exceptions. No second planner was re-enabled. The splitter and subsequent architecture work remain unopened. No live Dune or merge is authorized by this offline result.

## Remaining failures

| ID | Origin | Case |
| --- | --- | --- |
| C055 | Introduced; repair policy | premise repair is bounded and revalidates exact user evidence |
| C056 | Introduced; repair policy | a premise repair cannot authorize invented pets or mutation scope |
| C063 | Baseline | read planner can omit extraction while writes still require a valid frame |
| C096 | Baseline | five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose |
| C113 | Introduced; repair policy | real admission lets a repaired planner reach composition without opening extra repair cycles |
| C153 | Baseline | supplied premises narrow stale owned-history plans without granting writes |
| C155 | Baseline | general knowledge never widens owned authority and saved history still validates ownership |
| C156 | Baseline | supplied-context classification requires actual verbatim user premises |
| C166 | Introduced; repair policy | missing premises use bounded repair without inventing evidence |
| C176 | Baseline | event evidence survives both budgets among verbose routine observations |
| C177 | Baseline | rejected event answers retain relevant source excerpts instead of the latest profile |
| C196 | Introduced; repair policy | new observation plus calculation can repair an invalid correction plan without weakening validation |
| C212 | Introduced; repair policy | profile contract mistakes get one bounded repair with full ownership revalidation |
| C215 | Baseline | a failed mixed answer cannot commit proposed observation side effects |

Full machine-readable ledger: [read-ticket-hygiene-2026-09-20.json](read-ticket-hygiene-2026-09-20.json).

## Reproduce offline

```sh
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs tests/ask-direct-evidence-ticket.test.mjs tests/furvise-read-obligations.test.mjs tests/furvise-episode-ticket.test.mjs tests/furvise-multi-need-ticket.test.mjs tests/furvise-correction-provenance.test.mjs tests/ask-read-ticket-hygiene.test.mjs
npm run typecheck
npx eslint app/lib/furvise-brain/read-ticket.ts app/lib/intelligence/ask-request-contract.ts tests/ask-one-interpreter.test.mjs tests/ask-read-ticket-hygiene.test.mjs scripts/audits/ask-shared-request-contract.cases.mjs
```
