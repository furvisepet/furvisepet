# Owner-note pre-Brain boundary inspection — 20 September 2026

**Blocked. No implementation or route-wide pass is claimed. Application source and tests remain at `50fb787`.**

The requested owner-note-only cut cannot establish the stated route-wide stop condition while leaving the other pre-Brain paths untouched. This inspection identifies the concrete blockers rather than adding a spans-only test and calling the route one interpreter.

## Requested stop conditions

| Condition | Observed state |
| --- | --- |
| Splitter supplies source spans/ticket fields | Not met: returns note/question strings, plus resolver authorization fields; no offsets or span IDs. |
| Companion question reaches Brain | It does on the current mixed fast path, but only after the note was already written. |
| No pre-Brain answer/retrieval except confirmed Heart write | Not met: several independent answer paths and factual context loading precede Brain. |
| Frozen confirmation and receipt adapter | Left unchanged. Existing raw owner-note persistence is a separate path from the capability receipt adapter. |
| Audit retains only the same 14 failures | Confirmed by a fresh offline run: 208 pass / 14 fail, all 222 names and outcomes unchanged. |
| Zero paid APIs/live operations | Met. No model/API calls, live Ask, preview, push, merge, or deployment. |

## Exact requested splitter reproduction

Executed the real pure functions locally with:

`log that Cedar refused lunch. what are his last two weights`

`resolveOwnerNoteRequest` returned:

```json
{
  "note": "Cedar refused lunch.",
  "occurredAt": null,
  "explicitTime": null,
  "needsAnswer": true,
  "companionQuestion": "what are his last two weights",
  "authorizationSource": "current_turn",
  "authorizationEvidence": "log that Cedar refused lunch."
}
```

`splitOwnerNoteAndCompanion` returned the note and companion question strings. It did not retrieve, return an answer, or set memory depth. The route is where these strings become authority and branching decisions. A focused test asserting only that the splitter has no `answer` property would already pass while leaving the unwanted bypass live; it would not prove this task.

## Route findings at 50fb787

| File / location | Current behavior | Why a splitter-only change does not close it |
| --- | --- | --- |
| `app/api/ask/route.ts`, owner-note block near 434–472 | Natural-language resolver result enters `if (ownerNote)`, calls `persistOwnerNote`, and can return `savedNoteResponse` before Brain. | No typed append/read job is required before this write. The boolean `needsAnswer` controls whether Brain is reached. |
| Same file, companion selection near 476 | Companion becomes `reasoningQuestion` only after `ownerNotePersistence` exists. | The write already happened before companion interpretation. |
| `app/lib/intelligence/persist-owner-note.ts`, near 31 | Calls `persist_ask_owner_note` and accepts its entry ID. Uses current-turn or transport authorization. | It does not go through `executeActionCapability` / `confirmFurviseWriteReceipt`; no separate confirmation click occurs on this path. This is an existing path, not a newly introduced regression. |
| `app/lib/application-actions/capabilities.ts`, near 120–140 | Executes `execute_ask_action_capability` and reloads/certifies the bound receipt. | This is the frozen Heart adapter. Wiring the former path here is an execution-path migration, not just adding spans. |
| `app/api/ask/route.ts`, near 480 | Calls `buildFurviseContext` before `interpretAskQuestion` near 838. | Context loading itself retrieves facts before Brain. |
| `app/lib/intelligence/retrieve-context.ts`, near 109–125 | Loads care entries, memory sources, concerns, episodes, current state, and conditionally recovers saved-note references from request wording. | A planning-only context boundary is needed to make the literal no-pre-Brain-retrieval proof true. |
| `app/api/ask/route.ts`, near 579–602 | Performs an existing-save lookup and can return an “already saved” orchestration; conditional-safety replies also precede Brain. | Separate from the owner-note splitter. |
| Same file, near 603–738 | Pending/current lifecycle branches can prepare replies and actions before Brain. | Separate route decisions, not splitter output. |
| Same file, near 742–765 | Deterministic commands and acknowledgements can bypass Brain. | Separate pre-Brain executors. |
| Same file, near 812–836 | Ambiguous backward-reference handler can return a clarification before interpretation. | Separate reference interpreter. |
| Same file, near 281–302 | Provider-independent immediate-emergency response occurs before entitlement/context/planning. | A blanket “only Heart may answer before Brain” change would also alter this safety behavior. It was not removed. |

Infrastructure validation failures and replay of an already-persisted response are not new semantic answers. The table distinguishes actual semantic/retrieval paths from those transport concerns.

## Existing tests explain the mismatch

`tests/owner-note-write-isolation.test.mjs` explicitly checks that owner-note persistence happens before context loading and AI admission. Its HTTP fixtures expect a raw natural-language save to succeed while AI is unavailable. These tests guard the previous product contract and were not deleted, rewritten, or silently excluded to claim a new route proof.

The 222-case audit exercises interpretation and `generateAskHistoryAnswer` through the synthetic harness. It does not execute the full `/api/ask` HTTP route. Its green migrated cases therefore cannot establish absence of the route bypasses above.

## Fresh offline audit

| Baseline | Passed | Failed | Introduced failures |
| --- | ---: | ---: | ---: |
| Production reference | 213 | 9 | 0 |
| 50fb787, fresh rerun | 208 | 14 | 6 |

All 222 names/outcomes match the previous ledger. The six introduced failures remain C055, C056, C113, C166, C196, C212. The same eight baseline failures remain C063, C096, C153, C155, C156, C176, C177, C215. No repair pass was restored.

No new implementation, fixture migration, focused test, typecheck, or lint result is claimed for this inspection. Those source files were not changed. The pure splitter reproduction and the full audit were run locally without network/model calls.

## Concrete scope required to finish the requested proof

1. Return source-bound note/question spans with offsets and source IDs; keep the original message available to one Brain call. Spans alone cannot authorize a write.
2. Replace the natural-language pre-Brain save/answer branch with typed job handling. Bind append content to the original source and use the existing confirmation/capability path and receipt adapter; preserve Heart internals.
3. Separate planning metadata/dialogue loading from factual context/history loading. Retrieve facts only after the validated ticket.
4. Move or replace the independent pre-Brain semantic gates listed above. Explicitly preserve or decide the provider-independent emergency behavior; do not silently remove it to satisfy grep.
5. Migrate the HTTP tests that intentionally require the old write-before-Brain behavior, retaining ownership, idempotency, confirmation, and receipt assertions. Add a route-level mixed Cedar test that proves one Brain pass and no write or answer based on splitter output alone.

Items 2–4 cross the current “owner-note splitter only” limit. No source patch was made under that ambiguous scope, and no partial patch was presented as completion. The branch remains blocked; no preview or live proof is earned by this inspection.
