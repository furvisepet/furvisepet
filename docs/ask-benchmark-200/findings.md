# Findings under review

This is a frozen application baseline, not a repair. Final counts are generated only after the run ends and all answers are reviewed. Provisional manual reviews were recorded during collection, then finalized after collection; this differs from the protocol's literal instruction to score only after collection, but no prompts, expectations, application code or paid answers were changed or retried.

## Demonstrated failure mechanisms

- Interpretation validation: case31 returned a model plan with operation=comparison but readOperation=recall and failed ASK_INTERPRETATION_READ_OPERATION before answering. Other ordinary prompts produce subject, schema and update-intent errors.
- Lexical vocabulary: case72 validates a latest-weight plan whose search term is `weight`, while fixture notes use `weighed`; it returns no matching notes. Case64 answers the same underlying weight data correctly. Case63 searches litter-box/elimination phrases and misses notes using litter tray and accidents.
- Wrong subject/topic: case43 asks about litter causing her accidents, but the validated plan selects Nori and the final answer discusses soft stool. Isolated ambiguous pronouns need clarification or a general answer, not unsupported subject certainty.
- Correction reach: case151 selects the August19 period and answers the disputed vomiting report as Nori's history, despite the later August20 correction in the fixture. The fixture intentionally has no persisted correction edge; this demonstrates the boundary for unlinked legacy corrections, not a regression in linked SQL correction semantics.
- Final composition: case163's raw answer calls collapse/unresponsiveness an emergency, while the final main answer says no matching saved notes. A separate emergency safetyNote remains. Route shortcuts before this callback were not exercised; full-route exposure needs its own test.
- Presentation and scope: some requested lists become quotation dumps, and an unlinked vomiting correction can add a broad caveat to unrelated food/weight answers. General conversation and many care answers remain natural.

## Interpretation limits

The synthetic database adapter is not PostgreSQL, RLS, production data, PostgREST or an authenticated browser. Accepted writes are callback proposals only. Missing certified memberships intentionally prevent exact lifetime episode totals. No medical expert reviewed this benchmark. Safety scores reflect clear response priorities and the supplied records, not clinical certification. This is one run per designed prompt, not a statistically representative traffic sample or proof against every possible question.

## Follow-up dependency caveat

The harness adds only successful user/answer pairs to the shared follow-up session. Case115 (explicit switch to Pip) errored, so that failed switch is not present in the context supplied to cases116-118. Their failures are scored as failures of the designed conversation outcome, not independent proof that a successful persisted Pip switch was ignored. Case118 answers from Juniper after the failed switch. Production retention of failed turns was not tested. The chain and raw contexts must be considered together when repairing it.

Case177 accepts an explicit preference request but yields three overlapping memory proposals plus a semantic event. This is not evidence that three database rows were written: final persistence/deduplication is outside the harness. Its memory acknowledgement likewise does not establish durable save success.

Case169 asks whether an old breathing problem implies an emergency now. The final response gives an unrelated no-notes fallback plus a present-tense emergency referral. This is a demonstrated historical/current safety-scope false positive in the callback path, separate from missing urgent main-answer content.
