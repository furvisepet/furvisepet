# Ten-year Ask stress fixture

Synthetic-only data: September 4, 2016 through September 3, 2026, three pets, 10,956 daily grooming entries and 12 decisive milestones (10,968 total). No account care records are imported or modified.

Run `node --experimental-transform-types --test scripts/audits/ask-ten-year-history.cases.mjs`. The default test suite also runs this through `tests/ask-ten-year-history.test.mjs`.

Nine checks cover leap-day coverage and unique IDs; oldest/latest weights and arithmetic; three model routing variants for old explicit date intervals; a dated quantity lookup; cross-pet medication/recurrence retrieval; a late unlinked correction; and refusal to invent an absent diagnosis.

The actual retrieval, interpretation validation, evidence selection and answer pipeline run against an in-memory database adapter. Provider responses are mocked and network calls forbidden. These tests establish code behavior under the fixture, not model accuracy, real SQL latency, production ingestion performance or universal recall. The application must retain correction uncertainty rather than treating the disputed note as definitive.

Observed local run: nine checks pass. Each answer used 17-32 simulated queries and 7,352-15,437 serialized prompt characters. Model input limits, ownership scope and write boundaries remain enforced. The new full suite passes 2,405 top-level tests.

Repairs alongside this fixture normalize explicit elapsed-day requests across validated read operations; extract unambiguous recorded weight clauses while rejecting competing subjects/uncertainty; preserve separately requested pet lines; and explicitly instruct generation/review to retain the original question and uncertainty relationship on reformulation.

No schema migration, model change, output-token increase or timeout increase is included. Live quality verification is required after deployment; prompt instructions are not deterministic entailment guarantees.
