# Event evidence retention repair — September 9, 2026

The frozen production run remains 13/15 (86.7%). No paid model calls were made during this investigation or repair.

## Finding

Both failed food-switch answers had four candidate pages, 35/36 rows, a continuation cursor on the correct transition completion date, and the `effective_evidence_budget` loss reason. This points beyond lexical discovery to final evidence selection. The saved public turn summary does not preserve the full planner proposal, so the exact production proposal cannot be reconstructed from that summary alone.

Code inspection found that `history-retrieval.ts` searches event aliases separately, then ranks final evidence using only planner topic terms. Routine feeding observations and a transition can both score equally for food. Chronological ordering then lets verbose routine records consume the 18,000-character limit before the transition. The final model-prompt budget preserves this order, so it cannot recover already discarded evidence.

## Reproduction and change

An offline real-pipeline fixture adds a transition start/completion behind 120 verbose routine observations. On the previous code, both event candidates are discovered but the start is absent from retained evidence (`retained period event-start` assertion fails).

`history-query-relevance.ts` now supplies a candidate-local event relevance score. Rare event aliases rank ahead of boilerplate such as repeated uncertainty about any change. Matching uses word prefixes consistent with event search. This is a selection hint, not proof that an event happened; negated and uncertain records are not excluded.

`history-retrieval.ts` applies event relevance before the existing topic and chronological ordering. Pet authorization, correction validation, access windows, multi-pet ordering, endpoint-comparison behavior, occurrence classification and all existing page/row/character budgets remain in place.

The regression now verifies candidate discovery, retained entries, and the actual model prompt's represented evidence for both start and completion, across period, earliest and latest selections. The previous small/short-record test did not cover this budget loss.

## Verification and limits

- New reproduction fails before the repair and passes after it, with external fetch blocked.
- Full suite: 2,474 top-level tests pass; the shared-contract wrapper additionally passes 123 internal cases.
- TypeScript passes; lint has zero errors and 39 existing warnings; whitespace check passes.
- The planner and reviewer were inspected. No speculative prompt changes were made: a reviewer cannot recover records removed before its input.
- No account history, conversations, questions or grades were edited.
- This validates an evidence-retention mechanism, not a new production answer score. A fresh paid run is still required to establish live improvement; 95% is not claimed.
