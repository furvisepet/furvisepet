# Furvise Ask: 200-question baseline

Application baseline: `7092b74b41483e012665002f130a2bb59ebeda3f`. Real model: `gpt-5.4-mini`. Synthetic clock: `2026-09-15T12:00:00Z`.

## Result

Attempted 200/200 questions. Good answers: **106/200 (53.0%)**. Partial answers are not counted as passes.

| Rating | Count | Share |
|---|---:|---:|
| good | 106 | 53.0% |
| partial | 35 | 17.5% |
| fail | 31 | 15.5% |
| error | 28 | 14.0% |
| harness_blocked | 0 | 0.0% |

Returned an answer: 172/200 (86.0%). Completion is not correctness.

## By category

| Category | Good | Partial | Fail | Error | Harness blocked |
|---|---:|---:|---:|---:|---:|
| casual | 10 | 0 | 0 | 0 | 0 |
| emotional_support | 7 | 2 | 1 | 0 | 0 |
| general_care | 9 | 1 | 0 | 0 | 0 |
| food | 5 | 3 | 1 | 1 | 0 |
| behavior | 7 | 0 | 2 | 1 | 0 |
| travel_routine | 8 | 0 | 1 | 1 | 0 |
| history_summary | 3 | 3 | 2 | 2 | 0 |
| chronology | 4 | 2 | 3 | 1 | 0 |
| uncertainty | 5 | 2 | 2 | 1 | 0 |
| medical_record_gaps | 8 | 0 | 0 | 2 | 0 |
| multi_pet | 3 | 2 | 2 | 3 | 0 |
| follow_up | 4 | 0 | 5 | 1 | 0 |
| formatting | 5 | 3 | 1 | 1 | 0 |
| messy_language | 4 | 2 | 1 | 3 | 0 |
| languages | 4 | 2 | 2 | 2 | 0 |
| corrections | 4 | 3 | 3 | 0 | 0 |
| safety | 4 | 4 | 1 | 1 | 0 |
| updates_mixed | 4 | 2 | 1 | 3 | 0 |
| unavailable_injection | 5 | 2 | 1 | 2 | 0 |
| boundaries_counts | 3 | 2 | 2 | 3 | 0 |

## Cost and latency

New run: 439 provider attempts, estimated **USD3.553337**. Prior tests: USD0.851979. Accounted cumulative spend/reservations: **USD4.405316**, within the USD5 authorization. Unknown-usage attempts: 1.
Answered-turn elapsed time: median **10.87s**, p95 **17.95s**, max **30.16s**. These include callback/provider processing against a synthetic database, not production network, browser or database latency.

Prices use returned token usage at [official GPT-5.4 mini rates](https://developers.openai.com/api/docs/models/gpt-5.4-mini), ignoring cached-input discounts. This is an estimate, not an invoice; unrelated external key usage is not observable.

## Error categories

- `ASK_INTERPRETATION_READ_OPERATION`: 11
- `ASK_INTERPRETATION_UPDATE_INTENT`: 3
- `ASK_INTERPRETATION_SUBJECT`: 6
- `ASK_INTERPRETATION_SCHEMA`: 6
- `ABORT_ERR`: 1
- `ASK_INTERPRETATION_DATES`: 1

## Scope and interpretation

Every completed output, section and safety note was manually reviewed by one assistant against the frozen fixture. This is not blinded or expert clinical review. Questions cover 20 categories, ten each, including a shared ten-turn follow-up conversation. Category weights are designed, not representative of user traffic. One attempt per prompt does not establish repeatability.

Real interpretation, generation and optional verification models ran through the production callback and serializer. Auth, retrieval database boundaries and persistence were synthetic. This is not an authenticated furvise.com or full HTTP-route test. No production writes occurred. Upstream emergency shortcuts were not exercised. The unchanged application baseline was not repaired during testing.

The initial harness setup failure made no paid calls and is preserved separately under setup-failure; it is excluded from the scored run. Provisional scoring occurred during collection and was finalized after collection; no expectations or prompts were changed.

See findings.md for demonstrated mechanisms and limits, all-questions.csv for every answer and score, budget.json for token accounting, and results.json for the production callback outputs. The broad benchmark exposes real callback failures but does not prove all production behaviors or universal question coverage.

Execution note: the original conservative USD4.50 stop paused after199 cases at USD4.390437 accounted. After the process completed, one separate continuation ran only the unattempted case200 under a USD4.75 stop, within the unchanged USD5 authorization. Initial199 ledgers are preserved; no question was retried.

Verification:2295 default tests pass; typecheck and lint pass (two existing persist-learnings warnings); runner/harness syntax and diff checks pass. Application, SQL and dependencies are unchanged from the baseline. Findings are not repaired by this benchmark.

Launch assessment: this baseline does not support calling Ask broadly reliable for V1. Priorities are recoverable planning, relevance and correction scope, conversation-chain recovery, and final-answer safety/usefulness. Full-route/live-database validation remains separate.
