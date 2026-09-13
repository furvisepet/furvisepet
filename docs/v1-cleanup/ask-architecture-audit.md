# Ask architecture audit — 11 September 2026

The failures need changes to shared contracts and execution ownership. More question-specific routing rules would leave the same failure modes available to differently worded requests. No application code or database records were changed in this audit.

## Evidence and scope

Baseline: repository commit `a4b2a7c0fe974b394bddf9420225583c434308b8`; the preceding production run exercised deployment `dpl_6saK7cvZqNwfYnY7V6BwfNMq7eUm`, application commit `537fcbacf2d94ed61170218bb1a4039165cb7f44`. The later baseline commit added the audit evidence, not application fixes.

The production run remains **32 pass, 6 partial, 12 fail**, including eight hard UI errors. Its prompts, rendered answers and persistence observations are in [ask-50-question-audit.md](ask-50-question-audit.md) and [ask-50-question-audit.json](ask-50-question-audit.json). This turn traced those observations through the code; it did not repeat the 50 live questions.

The accompanying [file inventory](ask-architecture-file-inventory.csv) covers **53 application files, two SQL migrations, twelve executed test entry files and five additional test/harness files**. It distinguishes full-module reviews, targeted boundary reviews and test execution. Targeted review does not certify every line of a large file. This is an audit of the affected Ask paths, not a whole-repository security or launch certification.

Additional verification:

- Twelve focused test entry files passed: **60 top-level tests, zero failures, zero skips**. Some entry tests invoke additional subprocess suites; 60 is the parent runner's count.
- [Read-only contract probes](ask-architecture-contract-probe.json) reproduce structural inconsistencies using current functions. They are diagnostic observations, not tests asserting that the broken behavior is desirable. Reproduce with `node --experimental-transform-types scripts/audits/ask-architecture-contract-probe.mjs`.
- Production logs were rechecked for Q4 and Q47. Both primary and repair provider responses completed, with `outputLimitReached: false`, followed by application error `FALLBACK_INVALID_OUTPUT`. Neither is evidence of a database write failure. The logs do **not** expose the exact rejected schema field or post-parse validation reason.
- A read-only inspection of deployed PostgreSQL function definitions confirmed the episode reader's paired-date requirement discussed in A9. No production records were changed.

## Findings

| ID | Priority | Shared problem | Production connection / confidence |
| --- | --- | --- | --- |
| A1 | P1 | Writer and reviewer use different eligible evidence | Direct source mismatch matching Q2/Q6; probe confirms filtering |
| A2 | P1 | Episode identity is entangled with the requested operation | Reproduces Q13 error class; Q14 follows the same failed reference flow |
| A3 | P1 | Multiple mutation representations depend on a valid complete answer | Confirmed architecture; exact Q4/Q47 rejected field remains unknown |
| A4 | P1 | Completion is split between incompatible review paths | Confirmed coverage gap; connects Q42/Q44 refusals and compound requests |
| A5 | P1 | Structured answers lose their typed result/provenance structure before review | Confirmed constraints; contributing risk for Q9/Q10/Q28, not a proven sole cause |
| A6 | P1 | Product capabilities and turn permissions lack a shared factual owner | Matches incorrect Q1 capability answer and failed Q5 policy answer |
| A7 | P1 | Durable turn identity, answer outcome and write outcome are separate but not reconciled end to end | Confirmed Q21→Q22 split and Q47–Q50 status limitations |
| A8 | P1 | Shared deadline exists, but stage reservations do not cover every route | Q21 primary timeout confirmed; exact provider latency cause unknown |
| A9 | P2 | Episode date contracts differ between application and SQL | Adjacent latent mismatch; normal subscription clipping protects the production route |
| A10 | P2 | Tests and diagnostics cannot establish semantic completion reliably | Local tests pass while the live run fails; Q4/Q47 validation detail is missing |

### A1 — One evidence catalog must serve generation and review

`app/lib/ai/ask-reasoning.ts:1392` builds profile records including age, breed and weight. `app/lib/intelligence/review-history-narrative.ts:54` accepts profile sources only when their IDs end in `species`, `sex` or `pronouns`. A source can therefore be supplied to the writer and rejected as ineligible by its reviewer. Repair uses that narrowed evidence set too.

The probe supplies six fully represented, loaded, owned profile fields. Review retains species, sex and pronouns, but drops age, breed and weight. This closely explains Q6 reporting dog/female while claiming age and breed were unavailable. We do not have the original Q6 model draft to prove its exact repair sequence.

There is a second shared mismatch in `enforceAskPromptContextBudget`: profile age/breed/weight can be removed as optional on historical reads without checking whether the user explicitly requested that field. Retrieval needs primarily describe care-record searches rather than all source types.

**Architectural change:** make eligible evidence and per-obligation coverage one contract used by retrieval, budgeting, generation and review. Distinguish absent, unavailable, not loaded, omitted and represented. Protect requested fields according to task need, while preserving safety context and owner scope. Do not simply whitelist two additional fields in one reviewer.

### A2 — Resolve a reference independently of what the user wants done with it

`app/lib/intelligence/ask-request-contract.ts:223–243` turns an episode operation into recall when quantity is records. For an explicit episode reference it retains the ordinal, then rejects any ordinal attached to a non-episode operation. The probe shows the same selected episode accepted for `quantity: episodes`, rejected for `quantity: records`, and accepted with its ordinal erased for `quantity: duration`.

`interpret-ask.ts` does not include `episode_reference` in its recoverable contract-repair reasons. `episode-history.ts` only retrieves episode groups for count/episode operations. `conversation-read-anchor.ts` reconstructs date/pet scope, while versioned episode references have another representation. These boundaries cannot consistently compose “selected episode” with “show sources”, “resolution date” or “duration”.

**Architectural change:** represent the owned, versioned target separately from the requested projection. Resolve an episode once; then retrieve its members, dates or count using that target. Keep stale-reference checks, owner checks and source-version validation. An unresolved target should produce a typed clarification, never an invented substitute.

### A3 — A single governed write plan must replace competing proposal channels

`ask-reasoning.ts`'s unified output still contains application actions, history proposals, care actions, semantic events and a semantic frame, alongside the answer. `run-intelligence.ts` then applies legacy care governance, semantic-event governance, v2 frame governance and an explicit-history-save path. Its v2 exception path falls back to legacy governance; this is compatibility behavior, not proof of unauthorized writing.

Full generation and its validation happen before the explicit save action is prepared. A defect in the combined output can therefore prevent a valid observation from reaching a governed persistence plan. Event-evidence repair regenerates the whole output, adding another opportunity for unrelated fields to disagree.

The completion reviewer sees prepared application actions and accepted semantic events, but its input does not include accepted legacy care actions. Consequently, execution and review do not consume precisely the same plan.

Q47 confirms a real save did not reach persistence. Logs establish a post-response validation failure after repair; they do not establish which of the above representations caused that individual rejection. Q4 similarly failed before its intended workflow completed.

**Architectural change:** normalize proposals into one typed, governed execution plan with stable operation identity, owned subject, exact source, date, target version and confirmation policy. Have completion and persistence consume that plan. Generate explanation from plan state rather than asking another model output to recreate it. Preserve explicit authorization, source grounding, idempotency and receipts; a prose failure must never become permission to save unvalidated data.

### A4 — Completion needs one task-level owner across every route

`review-task-completion.ts:112` exits whenever a history evidence contract exists. The history reviewer checks source-grounded narrative and navigation; it does not receive the same pending mutation plan. It also declines the server episode path, while `validate-answer.ts` can replace the entire answer with `episodeAnswer`. This leaves mixed history/write and episode/companion-question completion without one common final check.

The non-history status vocabulary is `answered`, `action_ready`, `limited`, `missing`, `not_requested`. Refusal and clarification are expressed through prose and must be interpreted into those categories. Q42 and Q44 safely avoided disallowed content/writes, but completion errors converted those interactions into hard failures. The exact model verdicts are not retained, so the vocabulary is a design weakness rather than proof of the sole cause of both errors.

**Architectural change:** derive a task ledger from the entire request, then track each obligation through evidence, prepared action and final disposition. Support explicit answered/refused/needs-information/unavailable/ready/applied/failed states. Run a shared completion assessment after specialist factual checks, without bypassing them. A correct refusal must be deliverable; an executed save must require its receipt; a navigation card cannot satisfy an unrelated explanation.

### A5 — Preserve typed results through computation, review and serialization

The history response already has useful structured table/JSON schemas and a server calculation verifier. These are worth retaining. However, `canonicalHistoricalRead` flattens all table rows and their citations into one narrative sentence before review. JSON similarly becomes one text/citation unit. Row-level evidence relationships are no longer explicit in that review representation.

CSV/table rows are capped using the **pet count constant (10)** rather than a record/export budget. The explicit-format schema permits no separate limitation and requires at least one row. The probe confirms empty and eleven-row exports fail, while a four-row export is structurally accepted. Therefore this row cap did **not** cause the four-note Q28 failure. Q28's recorded diagnostic was `repair_independent_review_failed`; Q9 was `review_output_invalid` and Q10 was `repair_independent_review_failed`.

`history-calculation.ts` correctly recomputes cited arithmetic, including elapsed days. But an omitted calculation proposal supplies nothing to verify. `read-projection.ts` deterministically projects only a narrow single-day body-mass case. Episode counts, note counts, member dates and requested derived results are not a general result contract. Duration additionally needs explicit calendar-day versus elapsed-time semantics.

**Architectural change:** produce typed result items with per-item provenance and explicit units before prose generation. Compute supported operations once on the server, then serialize the same result into prose/table/CSV/JSON. Keep factual/semantic review and output integrity. Model-independent serialization should support empty results and limits without inventing a row or changing the requested container. Budgets should follow result size, not an unrelated pet limit.

### A6 — Give product facts a canonical owner

`ask-internal-product-policy.ts` handles three narrow capability categories. The route's capability replacement occurs after generation/review, so it cannot rescue an earlier completion failure. The conversation composer supplies `mutationExecution: false` and `savedHistoryAccess: false` for that turn; these are permissions for a particular route, not a description of everything Furvise supports.

Q1 incorrectly denied save capability and was nevertheless assessed complete. Q5 failed instead of explaining allowance behavior. This is a factual-input and execution-contract problem as well as a model-quality problem.

**Architectural change:** separate shipped capabilities, account entitlements, current-turn permissions and completed actions. Supply product facts from the action registry and billing policy before answering. Avoid adding another intent regex per product question.

Billing note: `ask-admission-settlement.ts` already treats assessed answer completion separately from HTTP delivery. The user-credit ledger still completes a reserved credit after durable answer persistence, independent of the assessment, in `route.ts:1666`. These are distinct policies. This audit does not assume limited answers must be free or change charging rules; the policy must be explicit and accurately explainable.

### A7 — Reconcile durable identity and operation outcomes through failures

The server begins a durable conversation/user turn before generation. `app/ask/page.tsx` adopts the returned conversation ID only after successful answer validation. Its catch block now refreshes the sidebar, but does not attach a failed first turn to the server-created conversation. Q21 left a server conversation while the URL remained pet-only; Q22 started another conversation. Reusing the same retry identity is already supported and must remain intact.

For write status, the prompt context mainly exposes history and conversation, not a typed operation-status source. The special “save that” lookup requires the immediately preceding source turn and pet, which is a good narrow duplicate check, but does not serve as a general receipt query. This contributes to the imprecise Q48 response and Q49/Q50's inability to resolve the failed-save chain.

`ask-turn-model.ts` statically labels history/semantic persistence optional, and route telemetry maps `COMPLETED` to success. An explicitly requested write cannot be considered optional to *task completion*, even if answer delivery should survive its failure. Credit disposition, delivery, answer quality and mutation execution are already separate mechanisms but lack one reconciled public outcome.

**Architectural change:** return/reconcile a durable turn envelope on success and failure, with logical turn ID, conversation ID, answer disposition and per-operation receipts. Answer status questions from owned receipts, not from model recollection or absence of a matching note. Classify subsystem criticality by the requested task. Preserve payload-bound retry semantics; do not silently rewrite the retry payload after adopting an ID.

### A8 — Reserve an end-to-end budget for completion

The code does have a monotonic deadline and cancellation. Admission creates a **45-second** operation budget, the route has a **50-second** wrapper, and the browser a **55-second** timeout. Initial context work precedes admission. Interpretation and the primary conversation answer do not reserve downstream review time in the same way as historical-read generation and repair.

Q21's primary call timed out at 25 seconds. It used the compact conversation schema, so blaming the unified mutation schema for this case would be unsupported. Increasing output limits alone would not resolve stage starvation or provider latency.

**Architectural change:** budget from request entry through publication, explicitly reserving required review and persistence stages. Avoid repeat extraction/classification already represented in the task or execution plan. Define a durable, truthful timeout outcome. Keep provider cancellation and admitted call/cost caps; do not multiply retries or remove independent review.

### A9 — Align episode interval contracts; currently a latent boundary gap

The request contract accepts an independently null start or end. The deployed `read_ask_recorded_membership_batch` rejects exactly-one-null bounds with `Invalid episode period`; `read_ask_episode_sources` calls it first. The migration's inventory/census predicates also assume paired bounds.

**Qualification:** `history-access.ts` clips normal subscribed requests to a finite access window, supplying both bounds before episode retrieval. Thus this mismatch is not established as a current production failure or an incorrect count. It is exposed when an optional-access/internal caller passes the valid application-level open interval through unchanged.

**Architectural change:** define the supported effective interval once at the retrieval boundary and share that contract across references, readers and SQL. Either require bounded effective windows everywhere or support open bounds consistently. Preserve subscription access limits.

### A10 — Measure the composed system and retain safe failure detail

The focused suite includes meaningful arithmetic, integrity, timeout and persistence checks. However, integration harnesses such as `lifetime-harness.mjs` inject model outputs and reviewer verdicts; other tests assert source structure. Passing these cannot establish that a real model will satisfy all contracts together. Q1 also shows a server-derived, hash-bound assessment can faithfully bind a semantically wrong “complete” verdict: integrity is necessary but is not entailment.

Q4/Q47 logs mark provider stages completed, then expose only a generic final validation error. The exact rejected field is absent. Replacing this uncertainty with a guessed cause would repeat the earlier overconfidence.

**Architectural change:** record safe phase, contract version, validation reason code, failed obligation IDs, evidence-coverage status and mutation disposition. Do not log private source text or secrets. Add generated combinations across task/source/format/reference/effect boundaries, failure injection and real-model evaluations with externally specified expected facts and write outcomes. Keep the 50 prompts as regression evidence, not as a phrase-routing specification.

## Implementation order and acceptance gates

1. **Task and evidence contracts (A1/A2/A4):** independent targets and operations; shared eligible evidence and completion ledger. Accept new paraphrases and compound tasks without losing fields or references.
2. **Execution plan and durable turn outcome (A3/A7):** one governed plan seen by review and persistence; receipts survive errors/reloads; failed first turns remain in the same conversation; no false success or duplicate writes.
3. **Typed results and product facts (A5/A6):** source-bound calculations and exports, truthful capability/allowance answers, format-preserving limitations.
4. **Budgeting and observability (A8/A10), with interval alignment (A9):** bounded fault injection, usable refusal/timeout outcomes, diagnosable contract failures.

Build these responsibilities into the existing request, evidence, governance, outcome and presentation owners. Do not create one helper per failed question or merge factual validation and write authorization into prose code. Keep `furvise-voice.ts` and `furvise-output.ts` responsible for language/formatting; they should not decide what is true or what may be written.

Before claiming readiness: repeat the 50 live questions, add held-out combinations with different pets/dates/wording, and inspect exact responses, reload behavior and persisted effects. A high score must not hide any incorrect save, fabricated fact, lost required clause or misleading success receipt. **The current audit does not close the launch gate.**
