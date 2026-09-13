# Stress benchmark architecture repair
Date: 2026-09-10. Branch: codex/ask-stress-architecture-repair.

The frozen 100-question production benchmark remains 85 pass, 1 partial, 8 fail, 6 error. This patch is offline engineering validation, not a new accuracy score. New paid API spend: $0.

| Culprit files | Finding and change |
| --- | --- |
| application-actions/state-claims.ts; intelligence/validation/validate-answer.ts | Optional-offer removal after approval changed the canonical answer and triggered publication rejection. Apply the same cleanup before approval, retaining the final integrity checks. Offer-only output now gives an explicit inability response. |
| intelligence/ask-request-contract.ts; conversation-read-anchor.ts; history-retrieval.ts | Elliptical follow-ups lost dated subjects/properties. Reconstruct retrieval references from owned pets and prior USER questions, then re-read records. Assistant answers never establish factual values. A new explicit date or unrelated question breaks inheritance. Earlier/later retain opposite temporal boundaries. |
| intelligence/literal-history-window.ts; explicit-history-dates.ts | Comparative adjectives could omit the present endpoint; coordinated dates could lose their shared explicit year. Preserve both comparison endpoints and propagate an unambiguous explicit year. Existing access and as-of constraints remain enforced. |
| intelligence/historical-read-response.ts; history-narrative.ts; csv-records.ts | The request contract supported CSV while the historical output schema did not. Add typed CSV rows, deterministic escaping, structural validation and the existing source/calculation review. |
| intelligence/interpret-ask.ts | Invalid advisory reference/scope metadata caused hard planner errors. These read-only failures now take the existing zero-authority limitation path. Invalid ownership still rejects. This does not make a ten-pet exhaustive query answerable. |
| intelligence/review-history-narrative.ts | A repair provider call was charged in the ledger but lacked a started event. Emit repair lifecycle and usage events so the persisted count includes the call. |

Validation:
- Initial 13 offline reproductions: 11 failed before changes; all passed after changes.
- Expanded focused suite: 20 cases pass, with network calls forbidden.
- Includes real retrieval under 160 distracting records, pet switching, plural comparisons, poisoned assistant values, date boundaries, CSV through grounding/review/reload, offer-only output and five-call repair telemetry.
- Full npm test suite passes. TypeScript check passes. Full ESLint passes with existing warnings in unrelated files. git diff --check passes.
- No benchmark questions, grades, production history, or account settings were modified.

Limits:
- Production provider outputs were not replayed through a paid API. Publication tests reproduce the observed mechanism; they do not recover unseen original provider wording.
- This is not proof that all benchmark failures are fixed. Table completeness, arithmetic quality, exact temporal selection, and broader end-to-end reliability still require measurement.
- The transient expired-session failure remains separate and is not fixed by this patch.
- No new deployment or improved live accuracy is claimed here.
