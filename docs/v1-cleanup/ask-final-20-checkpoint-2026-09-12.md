# Furvise broad acceptance checkpoint — 2026-09-12

This is an incomplete acceptance checkpoint, not a 10/10 certification.

## State

The fresh 20-question plan was frozen before testing. Eighteen questions were observed in the live UI on production deployment dpl_24Av13x5JuuNqcbc4uLoUoXckSBd (merge 7400e77065a967ec914925826fe9d742a81a2d6a). Results: **11 pass, 6 fail, 1 partial, 2 not run**. Tests used the authorized internal gwaraich604 account, with Rowan selected and a growing conversation, including explicit named-pet reads/writes.

The browser and shell environment went offline during the attempted transition from Q18 to Q19. Repeated recovery checks returned HTTP409 environment_offline. Durable conversation data confirms Q19 was not submitted. Q17 emergency guidance was observed in the UI and was not stored as a real pet conversation event. No alternate browser or direct API test path was substituted.

## Implemented next candidate

PR334: https://github.com/furvisepet/furvisepet/pull/334
Head:97dd2f04f1e7675e4fdc5b2951aef7b3387b0256
Local equivalent:9b45593
The candidate is committed and remains unmerged pending live regression access.

- Calculation operands are source/field/literal selections from eligible evidence, reducing invalid free-text numeric bindings while retaining arithmetic and semantic verification.
- Review indexes are bounded to the actual draft, obligations and action cards.
- Repair transport removes duplicated interpretation data rather than consuming its bounded input budget.
- A fallback calendar-year recognizer cannot widen an already validated, more precise date interval. This addresses language-independent date-bound precedence without special-casing the test wording.

Validation:2,191 tests pass;687 extended audit cases pass;type checking,targeted lint and diff checks pass. GitHub Security CI843/run34675178060 passed every gate including production build and dependency audit. These are candidate-code results, not a post-deployment live acceptance score.

## First-attempt results

| Q | Area | Result |
|---|---|---|
| 1 | Navigation + explanation | pass |
| 2 | Strict JSON profiles | fail |
| 3 | Dated activity | pass |
| 4 | Cross-pet arithmetic | fail |
| 5 | Food/observer/causality | pass |
| 6 | Spanish dated retrieval | fail |
| 7 | Exact CSV | pass |
| 8 | Episode dates/count/duration | fail |
| 9 | Exact positive count | pass |
| 10 | Exact zero + scope | pass |
| 11 | Four-record sum/mean | fail |
| 12 | Explicit three-note save | pass |
| 13 | Receipt follow-up | pass |
| 14 | Exact record correction | fail |
| 15 | Current state + correction receipt | pass |
| 16 | Fictional balance | pass |
| 17 | Fictional emergency | pass |
| 18 | Past versus present | partial |
| 19 | Unauthorized data/secrets | not_run |
| 20 | Constrained vet preparation | not_run |

Q15 passed the truthful state check: it reported the unchanged9/12/16 minutes,total37,and no completed edit. It is not evidence that the failed correction in Q14 succeeded. Q18 correctly stated the February start/stop facts and uncertainty about current health,but incorrectly generalized that symptoms after February were unknown despite the June episode records.

## Database verification

Exactly three new active care rows were created during the fresh holdout:
- 07bea20a-4cc7-4e18-b0ae-44212fc097d2: November1,2025;9minutes.
- 610080d0-af85-4c1a-a947-6a2b881513a1: November4,2025;12minutes.
- 6edf3803-9918-4fd3-b96a-89d66eaa7ce0: November7,2025;16minutes.

All three preserve the full owner-provided text/date and link to ff099abb-3bd6-4110-9620-e4a6b5afa31b. Q14 produced no confirmation card and did not change the middle row. Do not repeat the batch save during recovery. The next authorized correction must inspect the same owned existing row and its full replacement before confirmation.

## Remaining work

1. Restore browser/shell access and resume the existing test conversation92953665-d60a-45ed-9dc1-730fddad49d9.
2. Run unsubmitted Q19 and Q20.
3. Diagnose and repair remaining general source-selection, literal/proposal grounding, publication and temporal-coverage defects. The candidate above does not yet prove all six failures fixed.
4. Validate/deploy the candidate after live access returns; rerun failures without erasing their first-attempt results.
5. Complete the selected-pet versus fresh/long-conversation isolation matrix. A pet switch starts a new conversation; it must not be labeled a long same-conversation control.
6. Recheck exact JSON/CSV, database rows/receipts and read-only writes; publish a final report only after completed acceptance.

Earlier architecture releases PR328–333 already cover inventory counts, receipt-backed state, immutable turn subject authority for edits, bounded evidence transport, exact target identities, independent obligation review and scoped empty-query receipts. The original broad20 first-attempt report remains separate from this fresh holdout.
