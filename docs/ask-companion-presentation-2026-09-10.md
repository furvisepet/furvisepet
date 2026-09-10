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

## Live check result

PR #275 passed all CI gates and merged as 1cf5da21e264e81c17b968f298b000b465a05d00. Deployment dpl_JC7rt2MVWiRowjRTie4DKbv5hM3B became READY on furvise.com.

One first-attempt submission of the original question ran at 09:39:13 UTC. Logical request: 314b6df8-7de9-43f2-87f9-3cb826f02c89. Attempt: 91dc6a63-f47c-456b-afdb-ffba76a83f13. Conversation: daffa1ad-17f6-405e-b3c2-85ac7dbe25ed.

Presentation passed: one plain limitation, no calculation warning or em dash in assistant prose, a closed View saved notes disclosure, intact original notes when expanded, and the same clean response after reload. Task completion failed: the repair timed out and the final assessment remained limited with taskCompletion failed. This is not a successful summary or an accuracy improvement claim.

The four provider calls accounted for $0.077219: $0.043787 reconciled completed usage and $0.033432 retained reservation on one started call. The reservation is not confirmed billed spend. No retries were submitted. History remained 3,729 records with fingerprint a818b7e428832495367e3fafb08e57f7.
