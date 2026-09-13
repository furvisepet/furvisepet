# Ask architecture evaluation — 2026-09-09

The latest completed production benchmark remains **90%**: 54/60 matched questions and 18/20 previously unseen holdout questions on production commit 47868e83a1cc749950d458cf9e7c116931e85b13.

The subsequent frozen real-provider core evaluation scored **73/80 (91.25%)**: 54/60 broad repeated cases and 19/20 repeated holdout cases. Errors, partial answers and nonanswers are nonpasses. This is not a production or unseen score: the database was synthetic (43 rows, three pets), and the browser/UI and production command frontdoor were not exercised. The application's tree stayed fixed throughout all 80 requests; see the manifest.

## Nonpasses retained
- Full60 #4: partial; correctly rejects continuous coughing but overstates "not noticed at a visit" as proof the cough was absent.
- Full60 #22: error; planner double-escaped a literal source quotation, which strict provenance validation rejected.
- Full60 #34: fail; planner changed the user's furniture topic to a different medical topic. No question-specific substitution was added.
- Full60 #49 and #58: errors; planner exceeded its 25-second cap. Safe failure did not answer the requested task.
- Full60 #54: fail; clarification did not explain the requested plan-access boundary.
- Repeat20 #5: partial; rejects attribution to one changed variable but still implies the combined package explains the improvement.

## Changes and verification
PR256 addresses whole-command language preference routing, user-premise provenance, excluded subjects, retrieval before unnecessary clarification, one-body conversation composition, code-preserving validation/rendering, and coherent no-action receipts. A generic quote-serialization normalization was added after the frozen run; it still requires exact text in a user message and rejects fabricated/assistant-only sources. Its separate live confirmation passed. That confirmation does not replace the original #22 failure or revise the 80-case score.

CI includes the request-contract suite, React server-rendering checks for indentation and escaped code, type checking, linting and production build. Consult the PR's final CI state for the released head. The cloud workspace and authenticated browser remain disconnected, preventing a new end-to-end production UI run. A 95% overall production result is **not established**.

## Cost and data integrity
Measured spend in this turn: $2.465599 ($0.629995 production plus $1.835604 diagnostic). Including $8.422958 from prior additional work gives $10.888557 of the $15 authorization. Failed diagnostic calls retain $0.09071175 reserved because final provider usage was unavailable; the conservative committed total is $10.97926875, leaving $4.02073125. No more paid requests are running.

Production care-entry, memory and suggestion fingerprints matched their baselines after benchmarks 8 and 9; no care/memory/suggestion mutation occurred. Normal test conversations were saved. Diagnostic runs used synthetic state; accepted care, memory and event writes were zero. Raw attempts and the cumulative diagnostic ledger are retained alongside this report.

## Reliability measurements
Across the frozen core80, the planner made 80 calls: median 6,376 ms, p95 19,234 ms, with two 25-second timeouts. Total core provider calls were 168 at $0.91734675 measured cost. The remaining architecture work is planner latency/recovery and semantic fidelity, plus stronger uncertainty and access-boundary explanations. These measurements support addressing shared pipeline behavior rather than adding question-specific answers.

Final code candidate after bounded quote-decoding coverage: 97fca18c06d131ee331f7e5d0ae7281abcdfa90e. The frozen core score belongs to a8c04bd, not this later candidate. Nested-quotation and exact-source counterexample tests passed locally; final CI/deployment is recorded in PR256.
