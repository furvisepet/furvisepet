**Ask route ordering implemented locally. Cedar’s offline mixed-route proof passes. No preview, push, merge, deployment, paid model call, or database migration was run.**

Branch: `codex/one-interpreter`. Base: `b855c1d` (the prior inspection report); previous implementation: `50fb787`. This report is included in the local commit `fix(ask): prove Cedar mixed route through confirmed Heart`. The commit is not pushed. Production remains outside this work; the supplied production reference is `e2ab3a0`.

**What changed**

- `/api/ask` now builds a metadata-only planning context and calls `interpretAskQuestion` once before loading factual context. Planning reads owned pet identities, the owned conversation, and USER dialogue; its factual arrays are empty. Invalid tickets do not reach the factual loader.
- The splitter exposes exact source spans with offsets and IDs. It does not persist, retrieve, answer, or set memory depth. The original message also reaches Brain, so span suggestions cannot discard parts of the request.
- A source-bound `appendJob` can accompany the read ticket in the same validated request. Its jobs are frozen; text must be an exact, unambiguous USER substring, the pet must be owned, and body/companion spans cannot overlap. Alternate write subjects require an explicit owned reference.
- Append proposal publication uses the existing application-action capability path. It creates a confirmation card, not a History row. Proposal persistence records a completed proposal turn with mutation pending; it does not report the care write as complete.
- The existing confirmation endpoint executes Heart and verifies the durable receipt with the unchanged `confirmFurviseWriteReceipt` adapter. Only then can it continue the stored, owned read ticket through Lungs. The client submits only capability ID and confirm/cancel, not read scope or action semantics.
- Continuation keeps ticket dimensions and original request obligations, rechecks source and ownership after JSON transport, then uses the shipped deterministic list serializer and completeness review. Its provider client throws if anything tries to open another model phase. The UI accepts this existing response shape after confirmation.
- Removed Ask’s raw owner-note persistence helper, unfinished-task executor, already-saved phrase lookup, pre-planner command/ack and backward-reference answer shortcuts, and fallback subject-extraction provider call. Legacy task payloads may clarify; they cannot execute `apply_ask_task` from Ask.
- Removed the route’s direct `persistIntelligenceLearnings` execution: extracted model observations cannot independently commit care facts. Appends in the ordinary action-publication path also wait for confirmation.
- Existing deterministic lifecycle logic remains in the route after interpretation and before answer generation. Lifecycle helpers and copy were not rewritten into Mouth.
- `persist_ask_owner_note` has no remaining application caller. Heart does not use it. An additive migration retires that RPC without CASCADE; historical migrations remain unchanged. **The retirement migration has not been applied**, so production retains its current schema until an explicitly authorized release.

**Emergency exception**

The existing high-confidence emergency detector and fixed safety guidance remain before Brain and factual loading. This path performs no ledger read, creates no capability, saves no note, and consumes no provider call. The fixture includes “Cedar cannot breathe. Save this note.” with provider/storage unavailable. It returns the existing emergency line without claiming a save. Idempotent replay of an already persisted response is also retained; it replays the same request rather than constructing a new factual answer.

**Cedar proof — offline, not a live database claim**

The harness transpiles and executes the actual Ask POST handler and actual confirmation POST handler. It uses the real planner validator, span binder, capability creator/executor, receipt adapter, Lungs adapter, lineage handling, serializer, and list review. Authentication, provider responses, conversation persistence and database IO are fixtures. Network calls are prohibited.

Input: `log that Cedar refused lunch. what are his last two weights`

| Check | Observed result |
| --- | --- |
| Planner | One mocked provider response, one validated request containing append + read |
| Note span | `[9,29)` → `Cedar refused lunch.` |
| Companion span | `[30,59)` → `what are his last two weights` |
| Before confirmation | Zero new History rows, zero receipts, zero factual reads |
| Confirm | One new row, exact note body, matching durable receipt verified by real Heart adapter |
| After receipt | Real Lungs code returns fixture IDs ending `0052`, `0051`, dated 2025-07-15 and 2025-06-15, 9.4 kg then 9.2 kg |
| Repeat confirm | No duplicate row; changed=false; no planner call |
| Lost write acknowledgement | First confirmation fails verification transport; retry recovers the same receipt and row |
| Provider down after proposal | Confirmation and deterministic companion read still work |
| Missing receipt | HTTP 503; no weight retrieval or publication |
| Read unavailable after save | Saved row and receipt remain; empty labs carry unavailable coverage and existing unavailable copy |
| Foreign owner/wrong message/guessed capability | Rejected; no write or factual read |
| Cancel | No History row, no companion read |
| Invalid first ticket | One attempt, rejection, no ledger read/write, no repair |

The SQL mutation itself is simulated by the database fixture. This proves application ordering and adapter enforcement, not deployed SQL, Cloudflare, browser behavior, or a production History row. Automatic continuation is currently the ticketed-list publication path; a job needing non-list composition cannot silently launch another provider and returns unavailable continuation instead. This cut does not claim arbitrary mixed-job live coverage.

**Validation**

| Gate | Result |
| --- | --- |
| Typecheck | Pass |
| ESLint on changed code/tests | Pass, zero lint warnings/errors |
| Diff whitespace | Pass |
| Route/write-isolation/capability/emergency/source-gate suites | 92 passed, 0 failed |
| Existing Heart/Lungs/serializer/interpreter focused suites | 90 passed, 0 failed |
| Changed architectural authority boundary | 1 passed |
| Full 222 audit | 208 passed, 14 failed; no changed outcomes or names |
| Separate lifecycle regression suite | 19 passed, 8 failed; same eight against pre-cut route |

The owner-note HTTP fixtures no longer require writes before Brain. Ownership, idempotency, permission failures, exact source text, confirmation, receipts, and model-down confirmation assertions remain. No test cases were deleted. Emergency ordering assertions now reference the single interpreter instead of the removed second extractor. The two lifecycle ordering assertions now require deterministic handling after Brain and before generation.

The 222 audit files were not edited. Compared with production’s 213/9, this branch retains eight production failures and six repair-policy failures. One former production failure was already fixed before this cut. This cut changes none of those outcomes.

| ID | Classification | Existing failed case |
| --- | --- | --- |
| C055 | Retained repair-policy failure | premise repair is bounded and revalidates exact user evidence |
| C056 | Retained repair-policy failure | a premise repair cannot authorize invented pets or mutation scope |
| C063 | Retained production failure | read planner can omit extraction while writes still require a valid frame |
| C096 | Retained production failure | five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose |
| C113 | Retained repair-policy failure | real admission lets a repaired planner reach composition without opening extra repair cycles |
| C153 | Retained production failure | supplied premises narrow stale owned-history plans without granting writes |
| C155 | Retained production failure | general knowledge never widens owned authority and saved history still validates ownership |
| C156 | Retained production failure | supplied-context classification requires actual verbatim user premises |
| C166 | Retained repair-policy failure | missing premises use bounded repair without inventing evidence |
| C176 | Retained production failure | event evidence survives both budgets among verbose routine observations |
| C177 | Retained production failure | rejected event answers retain relevant source excerpts instead of the latest profile |
| C196 | Retained repair-policy failure | new observation plus calculation can repair an invalid correction plan without weakening validation |
| C212 | Retained repair-policy failure | profile contract mistakes get one bounded repair with full ownership revalidation |
| C215 | Retained production failure | a failed mixed answer cannot commit proposed observation side effects |

The separate lifecycle suite’s eight unchanged failures are not included in those 222 audit counts and are not waived:

- the exact production traumatic-death report is a confirmed loss, not active emergency treatment
- confirmed loss variants are recognized while uncertainty, hypotheticals, missing status, and corrections are preserved
- provider-independent loss subject resolution is strict for names, species, pronouns, and outside animals
- a confirmed death builds one standalone history event for post-confirmation persistence
- the lifecycle proposal is server-bound to the selected pet and always requires confirmation
- a death report cannot manufacture an unrelated or destructive model action
- grief continuity is derived from persisted pending action state, not a follow-up phrase list
- an optional lifecycle-card preparation failure preserves a truthful non-success action state

The lifecycle comparison substitutes the pre-cut route source in an otherwise identical offline run. Its helper implementations are unchanged. The eight failures were left alone.

**Scope and stop**

Heart capability execution, confirmation policy and receipt adapter; Lungs retrieval; the serializer/reviewer implementations; episode/needs organs; paywall; Brief; and lifecycle copy are unchanged. The only UI change carries the confirmed continuation response into the existing message.

No new repair loop, phrase executor, model fallback, or homework/Immune work was added. No live Dune, live Cedar, preview, push, merge, deployment, launch, or paid model request occurred. No database migration was applied. The offline stop condition is met; live semantic and browser proof remains unclaimed.

Machine-readable case mapping and counts: `ask-route-ordering-2026-09-20.json`.

**Reproduction commands**

```sh
npm run typecheck
node --experimental-transform-types --test tests/ask-route-ordering.test.mjs tests/owner-note-write-isolation.test.mjs tests/ask-task-route.test.mjs tests/ask-action-capability-v1.test.mjs tests/ask-emergency-preflight.test.mjs tests/furvise-brain-owner-note-gate.test.mjs
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs tests/ask-direct-evidence-ticket.test.mjs tests/furvise-read-obligations.test.mjs tests/furvise-episode-ticket.test.mjs tests/furvise-multi-need-ticket.test.mjs tests/furvise-correction-provenance.test.mjs tests/ask-read-ticket-hygiene.test.mjs
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
node --experimental-transform-types --import ./tests/helpers/ask-route-ordering.mjs --test tests/ask-grief-lifecycle-regression.test.mjs
rg -n 'persist_ask_owner_note|persistOwnerNote' app
```

The audit and lifecycle commands intentionally exit nonzero for the documented failures. The final grep returns no matches. The harness import resolves the existing extensionless TypeScript imports and forbids network calls.
