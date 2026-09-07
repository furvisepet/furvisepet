# Ask generalization: shared conversation, evidence and review behavior

Base: 4285e4e1f9958b834a5c1652df7e5e1048c9ac91
Branch: codex/ask-generalization
Worktree: C:/Users/gwara/furvise-ask-generalization

## Shared changes
1. Conversational act and evidence lookup are separate. A general explanation may still require recall/status retrieval. Explicit saved-history requests with an owned subject do not bypass the evidence path merely because the model used a general label. A missing duplicate readOperation is recoverable; conflicting plans still fail validation.
2. General conversation can have no pet evidence authority. The route's shared readInterpretationSubject adapter retains the selected pet only as the conversation/storage container. Its authoritative pet list stays empty. scopeConversationContext drops saved pet records, memories, concerns, state, episodes and owner-profile context. Current user text still reaches deterministic safety processing. Prior user dialogue is separately marked for reference/tone, not converted into saved evidence. These turns cannot authorize writes.
3. Read-only questions discard mutation frames entirely, including malformed frames. Genuine owner updates retain strict frame validation and existing downstream write gates.
4. Historical review may select an ordered, coherent supported subset of existing sentences. It cannot insert or reorder prose. Invalid/duplicate/out-of-range indexes, incoherent rejection payloads, unsupported source IDs and changed evidence fail closed. Final references include only retained evidence.
5. An explicit null narrative in a strict provider response no longer forces a quote dump. Plain answer prose can become a bounded review candidate using existing fact-preserving segmentation and source hints. It receives the same independent review and source/date/quantity checks; it is never trusted solely because it has source IDs. The receipt binds this plain text and its source hints too.
6. Generation guidance responds to emotional disclosure with acknowledgement and an invitation to talk, reserving practical checklists for requests for practical help. No pet-specific canned answers were introduced in this change.

## Evidence and acceptance
Six domain groups failed before the partial-selection change. Afterward, the matrix completed all72 combinations: six topics (sleep, grooming, food, travel, ears, mobility), three new names, four wording variants, and reversed record input order. This validates shared callback/composition behavior with mocked model verdicts; it is not72 live tests or proof of semantic-model accuracy.

Additional callback/boundary cases cover malformed index payloads, retained-source references, foreign-source removal and reindexing, missing readOperation, conflicting plans, ownership/date rejection, ordinary conversation, emotional support, current emergency language, mutation-frame isolation, prior dialogue, mixed general/history routing, and plain-answer review. All20 top-level generalization groups pass. The prior21 composition cases remain in the default suite.

Default suite: 2294 passed, zero failed/skipped/cancelled. Typecheck, production build and lint passed (two unchanged warnings in persist-learnings.ts). Original lifetime audit expectations were not edited or rerun; its last reported result remains14 pass /3 fail. One older expectation that malformed mutation metadata must fail a read-only question was replaced with an assertion that the frame is empty; genuine updates have a separate rejection test.

Real Chrome component-fixture rendering passed6 checks. The script initially exited1 because its owned temporary profile cleanup was incomplete. Inspection found no matching Chrome process; that exact profile was then removed successfully. No user browser profile or unrelated process was touched. This remains component-fixture validation, not authenticated browser/API/database acceptance.

## Real provider testing
Six unfamiliar conversation turns were exercised through the actual production callback with real gpt-5.4-mini calls and a synthetic database. The initial run completed5/6; the diabetes follow-up exposed the malformed mutation-frame failure, which was then repaired. The actual records and responses, including failures, remain in the live JSON artifacts.

Later targeted runs verified the question no longer errors and that emotional support answers briefly without an unsolicited task checklist. A general-labelled history question then exposed the missing-narrative fallback; that led to the shared plain-answer review change.

Two controlled real-review experiments passed:
- Reject an unsupported claim that the pet can never become seriously ill while retaining the July/August drinking summary. Interpretation and draft were mocked, review was live.
- Replay the exact captured live model's plain diabetes answer, with its null narrative, through the repaired callback and live review. It remained a natural answer with a coverage limitation rather than becoming a note dump. Interpretation/draft replay was mocked; this is not a fresh full model conversation.

Cumulative ledger across this and the preceding task:100 calls, token-based estimated cost USD0.851979; this task added21 calls and aboutUSD0.162329. Cached-input discounts are ignored. Conservative cumulative reservations USD4.367871 remain below the USD4.50 reservation stop and USD5 authorization. The harness now stops at100 calls. No further live calls are planned. Existing key only, no credentials logged, SDK retries disabled.

## Limits and rollout gate
This is an architectural improvement across classes of requests, not a guarantee for every possible question. Model interpretation, semantic review, English parsing and lexical retrieval remain fallible. Source/claim completeness and current-state certainty remain bounded. Rejected or oversized candidates can still fall back to quotations. General advice that does not request history still follows its existing generation path; this is not universal factual verification of every sentence.

Formatting is not yet consistent: a live request for two points returned a paragraph. The initial full live sequence was not rerun end to end after every later fix; targeted follow-through is identified above. No authenticated deployed-app smoke, database execution, migration, Docker startup, push, merge or deployment occurred.

Review this isolated commit, then verify the complete authenticated preview flow and formatting on the intended configuration before rollout. Do not call all V1 or lifetime-history gaps solved.
