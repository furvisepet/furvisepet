# Ten-year Ask stress fixture

Synthetic-only data: September 4, 2016 through September 3, 2026, three pets, 10,956 daily grooming entries and 12 decisive milestones (10,968 total). No account care records are imported or modified.

Run `node --experimental-transform-types --test scripts/audits/ask-ten-year-history.cases.mjs`. The default test suite also runs this through `tests/ask-ten-year-history.test.mjs`.

Nine checks cover leap-day coverage and unique IDs; oldest/latest weights and arithmetic; three model routing variants for old explicit date intervals; a dated quantity lookup; cross-pet medication/recurrence retrieval; a late unlinked correction; and refusal to invent an absent diagnosis.

The actual retrieval, interpretation validation, evidence selection and answer pipeline run against an in-memory database adapter. Provider responses are mocked and network calls forbidden. These tests establish code behavior under the fixture, not model accuracy, real SQL latency, production ingestion performance or universal recall. The application must retain correction uncertainty rather than treating the disputed note as definitive.

Observed local run: nine checks pass. Each answer used 17-32 simulated queries and 7,352-15,437 serialized prompt characters. Model input limits, ownership scope and write boundaries remain enforced. That run reported 2,405 passing top-level tests; subsequent inspection found five unrelated nested audit wrappers were exiting without running their child cases. Those wrappers now clear NODE_TEST_CONTEXT and require a nonzero executed test count. The direct ten-year run was unaffected.

Repairs alongside this fixture normalize explicit elapsed-day requests across validated read operations; extract unambiguous recorded weight clauses while rejecting competing subjects/uncertainty; preserve separately requested pet lines; and explicitly instruct generation/review to retain the original question and uncertainty relationship on reformulation.

No schema migration, model change, output-token increase or timeout increase is included. Live quality verification is required after deployment; prompt instructions are not deterministic entailment guarantees.

## Denser monthly measurements

A further 120 monthly weights (11,088 total entries) exposed a failed endpoint comparison: ascending-only retrieval stopped at 2021 and missed the 2026 measurement. The repair divides the existing 64 candidates and four pages between ascending and descending retrieval. It still discloses partial coverage and does not certify global semantic endpoints. Explicit endpoint arithmetic retains every tied endpoint, rejects conflicting quantities and refuses a delta when retrieval or source consistency fails.

The expanded suite has 12 passing checks, including the dense comparison, an unavailable newest page and conflicting newest measurements. The dense comparison used 19 simulated queries and 27,204 input characters in the recorded run; no live provider calls. The overall default suite remains 2,405 top-level tests because these additional cases run inside its existing audit wrapper.


## Follow-up verification

The ten-year suite now executes 13 checks, including a dated count reformulation and rejection of uncertain, corrected, foreign, compound or additional accident evidence. A narrow deterministic composer answers the stated count without rewriting unrelated uncertainty. Separate named weight months exclude intervening measurements; broad recorded-food requests discard stale weight terms only after validating read-only intent and term shape.

The final local default suite executes 2,407 top-level tests successfully with the five previously inert audit wrappers repaired. A direct run of ten-year, reviewed-composition and weight-comparison audits executes 77 cases, all passing. Typecheck passes; lint has zero errors (pre-existing warnings). The weight audit supplies the validated interpretation that production requires and retains its arithmetic, ambiguity, source-integrity and ownership assertions.


A subsequent fixed-release live set found additional timeline and reference failures. Explicit lists of three to eight chronological dates now retain their requested days through planning and fallback composition; a review that omits available requested-day citations is rejected. Narrow causal follow-ups inherit only the immediately preceding user-authored, dated change question. An explicit saved-correction question can mention an outside animal without granting it account ownership. Three new integration cases and three planning checks bring the local default suite to 2,410 passing top-level tests. A disclaimer-only live food answer remains unreproduced; no fix is claimed for it.
