# Intelligence consolidation baseline

Base: a6679a3e4e1019de98afbd4035874bd075c6ca80. Recorded before production edits.

Corrected offline runner: node --experimental-transform-types --test --test-reporter=tap. Original run omitted the transform flag needed by parameter-property TypeScript imports. npm ci and typecheck succeeded.

Logs: C:\Users\gwara\waraich-operator\state\furvise-intelligence-v1-baseline (gates.json contains exact suite membership).

| Gate | Tests | Pass | Fail |
|---|---:|---:|---:|
| Calculation | 348 | 346 | 2 |
| Brain | 78 | 76 | 2 |
| Retrieval | 244 | 243 | 1 |
| Audit | 222 | 209 | 13 |
| Stress wrappers | 2 | 0 | 2 |

Failure clusters requiring separate treatment:

1. Contract/test drift: DAG schema test assumes an older operand union; punctuation-only matching and weighed-history diagnostics assume older matching behavior. Inspect rather than weaken matching authority.
2. Legacy semantic-repair expectations: audit cases demand second interpretation/repair calls, which conflict with the current one-Brain contract. These are inherited red tests, not permission to restore retries.
3. Stale stress fixtures: shared request-proposal helper emits saved_history without readTicket. Frozen supplied proposals are rejected before retrieval. Some later assertions also depend on retired model publication hooks. This does not measure model accuracy.
4. Continuation fixture setup: foreign-subject test receives 503 before its ownership assertion. Its setup failure is not evidence of an ownership bypass.
5. Remaining audit drift: old read-frame, scope narrowing, missing-premise and narrative evidence/prompt expectations. Preserve the failures and inspect individually; do not assume every failure is harmless.

Production contradiction found by inspection:

Historical calculations have specialized operator/domain schema, while supplied-context calculations reuse the unrestricted union, permitting direct saved-history slots without read authority and entire questions as premise quotes. Operator and array schema descriptions are duplicated. Instructions say every deterministic calculation needs the saved_history branch while also allowing supplied arithmetic. Arithmetic read-operation guidance conflicts with the calculation ticket contract.

Repair hypothesis: share the existing operator/domain construction, expose only compatible root operand forms per evidence domain, reuse the existing numeric literal grammar on the proposed quote (never route raw language), and order instructions by evidence authority before composition. Preserve free-text scalar inputs, exact source binding, strict role/reference validation, existing organs and one-call behavior. Offline proposal tests establish contract consistency, not measured improvement in live semantic interpretation.
