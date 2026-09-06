# Stage 1 revision: source-note recall

Revises `a8a51f43e9317037fbcd3e960ae71b567334ca97` on the existing isolated
`codex/ask-evidence-contract-stage-1` branch. Prior commits and other worktrees
are preserved.

## Cause and bounded correction

`ask-evidence.ts:evidenceAnswerPolicy` previously routed every `record_lookup`
through exhaustive retrieval/correction/extraction/grouping certification.
That incorrectly suppressed useful statements about a specific historical note.

The contract now carries an optional server-created source-note lookup plan.
`source-note-recall.ts` locates a dated, topic-matching note among already-loaded,
owner/pet-scoped care records **before existing selection**. It adds no query,
ranking, pagination, or replacement history-selection path. Missing years are
not assumed to mean this year; multiple matching years remain ambiguous.

The final policy distinguishes:

- **Specific source contents:** one identified note, fully represented qualified
  span, matching authorized pet/source ID, no loss for that source, and no known
  competing evidence. The server quotes the complete represented value, not the
  model's interpretation. Lifetime and episode-grouping certification are not
  required merely to quote that note.
- **Current/effective status:** a historical quote does not authorize a current
  result or diagnosis. These requests retain a status-specific limitation.
- **Exhaustive totals/absence/comparisons:** existing completeness and verified-
  fact requirements remain. Recognition now also handles plural `tests`, a
  separate gap exposed by the added count control.

Missing, unavailable, ambiguous, oversized/omitted, and potentially conflicting
evidence receives a source-specific limitation. Known later or undated related
records and explicit corrections conservatively require reconciliation, even
when omitted from model selection. This is deliberately not a semantic
contradiction solver; later related records may cause conservative abstention
even when they ultimately agree. Earlier results alone do not block a dated
quote, unless they contain an explicit correction/retraction/supersession.

`validateGeneratedAnswer` uses the bounded server renderer and rebuilds final
source references from the contract spans. A model citing a real record ID does
not make its arbitrary prose trustworthy. References are also supplied when
the model fails to cite the successfully quoted note.

The actual path remains route callback -> `runFurviseIntelligence` -> real
generator -> final validator. Contract planning occurs in the existing contract
factory. Recovery/persistence gates, retrieval caps, models, output budgets,
and database schema are unchanged.

## Behavioral results and verification

The first ten added actual-provider/validator checks failed before editing
implementation: three positive source-content regressions, six checks requiring
appropriate source-specific limitations, and the plural-test count control.
The final matrix adds fourteen cases to the prior 26, with **40 passing**.

For the reported reproduction the final answer is now:

> The September 3 note says: “September 3 urine test: result pending.” This reports that note's contents, not a verified current medical status.

Tests require supported content in the final answer, not just removal of a
fabrication. Controls cover normal/pending results, a recorded diagnosis with
an imaging qualifier, named/abbreviated/ISO dates, year disambiguation,
missing/unavailable records, same-day/multi-year ambiguity, later contradictions
including unselected ones, oversized omitted evidence, wrong-topic valid IDs,
fabrications with valid IDs, absent model citations, earlier-result positive
controls, current status, exhaustive absence, and counts.

Verification:

- Default `npm test`: 2,180 passed (includes the child runner for all 40 cases).
- Direct provider/validator matrix: 40 passed.
- Focused recovery/context/pending-persistence suite: 172 passed.
- Typecheck passed; lint has zero errors and only the two existing unused
  `supabase` warnings in `persist-learnings.ts:149,378`.
- Diff checks passed.
- Remaining lifetime audit remains 22 checks: 6 pass, 16 explicitly fail.

The tests use the existing synthetic database/provider harness and real
generation/validation code. No HTTP-route, live-provider, real-RLS, or production
verification is claimed. No provider calls, schema changes, migrations, caching,
production changes, push, merge, or deployment were performed.

## Limitations

This locator is intentionally bounded to recognized result/diagnosis questions,
one authorized pet, and an explicit named month/day or ISO date. Unsupported
or ambiguous dates require clarification. It does not invent a date, retrieve
missing records, resolve conflicting medical evidence, or certify effective
history. A quote describes a historical source and is not a verified current
medical finding. Long omitted notes remain unavailable for useful recall until
a later retrieval/evidence-extraction stage addresses them.
