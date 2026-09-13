# Ask architecture repairs — offline verification, September 9, 2026

No paid provider requests were made. The frozen 175/200 (87.5%) rerun and original 163/200 overnight grades remain unchanged.

The fixes address shared failure mechanisms:
- Provider cancellation alone did not guarantee settlement. One shared deadline primitive now bounds planning, composition, history review and history repair even when the SDK ignores cancellation. Late results cannot replace the terminal outcome; call-admission limits remain enforced.
- Missing supplied premises now use the existing single bounded planner repair. Quoting an entire retrieval instruction is rejected as missing factual evidence. Ownership and mutation violations are still rejected.
- A generic source reference with no clinical topic or ordinal cannot accidentally invoke ordinal illness-episode lookup. Genuine episode references retain their validation.
- An exclusive date endpoint cannot omit the explicitly requested report. Subscription clipping remains downstream.
- Non-chronological history retrieval distributes its existing four-page budget across lexical groups and period context; evidence with more matching hints ranks ahead of incidental matches. Earliest/latest ordering, multi-pet fairness, correction checks and 64-candidate limits remain.
- Presentation uses a shared mutation-claim classifier. Negated receipts and attributed observations retain their uncertainty; affirmative unverified writes remain blocked. Sentence filtering preserves retained formatting.
- Generic discussion of “system instructions” is not itself an internal-data leak. Internal source identifiers and other existing leak checks remain blocked.
- Source-bound arithmetic and narrative anchoring now share a unit registry for compound rates. Distance/time ratios are dimension-checked and recomputed; wrong results, wrong dimensions, reversed operands and currency-rate inference are rejected.

Validation:
- Full offline suite: 2,470 top-level tests passed, zero failures. The shared contract wrapper additionally ran 119 internal cases.
- Typecheck passed. Lint completed with zero errors and 39 warnings in existing audit scripts.
- Added tests cover uncooperative providers, late completion, planner repair, source-date inclusion, a rare transition behind 100 routine records, compound units, and final-presentation negation/uncertainty.
- Captured responses for frozen cases 43, 185 and 186 were replayed through final presentation without new model output: all three now retain their substantive answer.
- External fetch was blocked through an inherited preload. Only local mock HTTP servers were permitted. No production history was changed.
- Older tests coupled to timeout implementation details were replaced with behavioral cancellation/timeout checks.

Limits: replaying an old model draft against improved retrieval does not measure how a new model response would perform. Cases needing another provider phase cannot be replayed to completion if that phase was never captured. Other retrieval/completeness and reasoning failures may remain. This change establishes tested architecture improvements, not a new live acceptance score or a 95% reliability claim.
