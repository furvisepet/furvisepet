# Companion voice and transparent fallback presentation

The owner's simple history-summary request (logical request 4dd717e5-c1fd-4059-9052-ea7656a768dd) returned two technical disclaimers and verbatim imported notes. The validator appended an unconditional calculation warning, then restored raw source text after punctuation cleanup. Historical reads used dedicated instructions without the general path's voice guidance.

The production trace shows primary generation completed in 15,850 ms, the first review returned in 2,580 ms, and a repair started before a timeout was emitted under verification. The saved review_timeout diagnostic therefore hid the repair stage; it did not prove the initial review timed out. The exact semantic rejection reason is not retained in these logs.

Changes:
- Shared companion instructions for current historical reads, repair and v2 conversation generation: answer first, synthesize useful highlights, use ordinary words, preserve specific uncertainty, omit internal mechanics and unnecessary calculation disclaimers.
- Normalize em dashes in generated prose before independent factual review. Preserve quoted content and requested structured output; never rewrite an already reviewed receipt.
- Remove the duplicated unconditional disclaimer. Declined historical answers use a single plain-language limitation with original attributed notes in a Saved notes section. The UI exposes those through a closed View saved notes disclosure; copy and persisted content retain them.
- Preserve strict task-completion status, source attribution, safety directives and all factual qualifications. This does not turn a failed summary into a successful one.
- Label timed-out repairs as repair_timeout and emit the repair stage rather than verification.

Validation: 169 affected cases initially passed. The full suite exposed duplicate voice overhead on a legacy multi-pet evidence-budget fixture; adding shared voice only to v2 paths without existing guidance resolved it. The final targeted set passed 89 cases including the new repair-timeout case and the complete-note regression. TypeScript passed; lint had zero errors and three existing warnings. CI verifies the final full suite and production build.

No history or existing conversation content was rewritten. One live summary check is planned after deployment; it is a product smoke check, not a new accuracy benchmark.
