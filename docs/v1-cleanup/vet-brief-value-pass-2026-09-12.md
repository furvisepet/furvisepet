# Vet Brief value refinement — September 12, 2026

The user's renewed concern was product value and cognitive load. The preceding redesign improved mechanics, but the live weight report still introduced itself as appointment preparation and separated the two comparison values. Sparse generated reports should not imply comprehensive knowledge.

## Implemented

- Evidence-first synopsis, with requested comparison values together and their historical/current scopes preserved.
- Relevant recorded interventions and responses must survive summarization.
- Concise appointment reason, without copying report-generation instructions.
- One or two useful discussion questions instead of filler.
- Shared screen/PDF/print/text presentation strips only three known leading system attribution wrappers from dated entries. Report-level owner attribution and embedded source attribution remain; saved documents do not change.
- Compact document spacing and visual emphasis on the overview.
- Unconfirmed drafts with fewer than two included dated entries explain that history is limited and link to Ask for missing observations. This is a content-count signal, not a clinical completeness score.

## Checks

- TypeScript passed locally.
- 13 focused report tests passed, including negation, dose, embedded attribution, source-document immutability, exact deduplication and section exclusions.
- Five PDF examples regenerated; representative output rendered and inspected.
- PR345 CI and final production acceptance pending at this checkpoint.

## Product limitations

This change does not implement lifetime retrieval, external vet-record import, or clinical validation. Vet Brief still selects bounded history (up to 300 care entries over at most 730 days, plus bounded memories). The report is owner-recorded appointment preparation, not a diagnosis or a complete medical record. Willingness to pay and practitioner usefulness cannot be established by software tests.

## PR345 production result and recovery finding

PR345 passed all CI gates (2,220 tests) and deployed as `737a1cbd4fcb3b161df64b76647e1426670d7a22`, deployment `dpl_3fT5saq9JKEnG3i88cvmDrZjsDo4`.

The first deployed Mochi weight retry FAILED. Both generation attempts were rejected by the independent reviewer; no draft was published and the credit was released. Runtime diagnostics showed only counts of failed criteria, because arrays are deliberately redacted to counts. The repair step received criterion names but no concrete explanation of the failure.

Follow-up: require bounded, private repair instructions from the reviewer and pass them to the existing one-repair sequence. Log only joined server-defined criterion names. Patient-bearing instructions are not logged or published. Global owner attribution is explicitly sufficient; a dated entry need not repeat it. No factual checks are removed and no extra repair calls are added.
