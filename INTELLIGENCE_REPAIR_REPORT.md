# Intelligence consolidation: generic evidence-domain repair

Workspace: C:\Users\gwara\furvise-intelligence-v1
Branch: v1/intelligence-consolidation
Base: a6679a3e4e1019de98afbd4035874bd075c6ca80

## Result

A concrete two-production-file repair is implemented. The focused offline gate passes 379/379 tests. Typecheck and an offline build pass. Changed-file lint exits 0 (three inherited warnings). Broad gates have no newly failing test names compared with the recorded baseline, but inherited failures remain: this is NOT a claim that all acceptance gates are green.

Provider calls: 0. Cost: $0. No live G, deployment, production DB access, or production mutation. No changes to Lungs, Muscle, Labs, Heart, Brief, Immune, slot execution, role semantics, or publication.

## Root cause and repair

The provider grammar specialized saved-history calculations but reused the unrestricted CalculatePlan union for supplied-context calculations. It therefore admitted saved-history slots without read authority, arbitrary question strings as numeric premises, mixed root operand forms and isolated result nodes. The history branch description also incorrectly described itself as mandatory for every supported calculation, conflicting with valid supplied-context arithmetic. Another instruction assigned arithmetic to compare/rank although calculation tickets require read/read_since_event.

The repair uses one operator/role grammar parameterized by the existing evidence domain:

- Saved-history roots use certified ReadTicket slots, a non-none owned scope, and no premise quotes.
- Supplied-context roots use numeric USER-premise operands, no read ticket, and no owned-history scope. Count/elapsed operators and cohort result selection are excluded from this domain.
- Derived nodes retain result-only operands. A lone result node has no implicit producer.
- The proposed premise quote uses the same numeric-literal grammar as its existing exact-value parser. This is validation of an emitted typed quote, never regex routing over raw user language.
- The request boundary rejects a premise-root plan mislabeled as saved history. It does not infer intent or repair the proposal.
- Evidence-source choice now comes first in the instructions. Contradictory arithmetic guidance is corrected; repeated schema prose is removed.

Free-text signed decimals, explicit unit conversion, unitless scalar quantities, Unicode source coordinates and explicitly referenced prior USER quantities remain accepted. Subject names, questions, requested measurements, labels and dates are not numerical facts merely because they occur in a request: that semantic distinction remains Brain's responsibility. A numeric substring's meaning cannot be proven by JSON Schema alone.

Existing Binder checks still own exact source identity, unique source spans, compatible units, owned subjects, slot bounds, role cardinality, sibling producer identity, topological order, depth and trusted snapshots. Static flat-array provider grammar cannot generically enforce self/forward/unknown sibling references; those adversarial forms still fail deterministically in Binder. No second planner or retry was added.

## Offline evidence

The same final 61 new cases were run against the two original production modules using a temporary test-loader override sourced from the exact base commit. No alternate application execution path was introduced.

| Gate | Baseline pass / total | Repaired pass / total |
|---|---:|---:|
| New frozen proposal regressions | 21 / 61 | 61 / 61 |
| Focused calculation/domain/premise/roles/binding | — | 379 / 379 |
| Existing calculation | 346 / 348 | 346 / 348 |
| Existing Brain | 76 / 78 | 76 / 78 |
| Existing retrieval | 243 / 244 | 243 / 244 |
| Existing 222 audit | 209 / 222 | 209 / 222 |
| Existing stress wrappers | 0 / 2 | 0 / 2 |
| Expanded calculation/Brain/publication | 777 / 797 | 791 / 797 |

Suites overlap; totals must not be added as unique test counts. No tests were skipped. The expanded-suite improvement includes both repaired grammar and updated stale schema assertions; it is not a live-model accuracy measurement.

The new corpus covers ten unrelated owned subjects, ten measurement/unit forms and unrelated date windows, reversed role serialization, six free-text numeric scenarios, seven scalar operators, Unicode, current/prior USER authority, source invention, incompatible units, domain crossing, missing producers, self/forward/unknown references, mixed forms, foreign subjects and slot bounds. Historical execution uses existing deterministic retrieval, certified Labs and publication with a foreign-subject distractor and zero provider calls. Premise cases verify exact binding; the existing public-v1 capability limitation is preserved.

The focused command is:
```
node --experimental-transform-types --test --test-reporter=tap tests/brain-evidence-domain-composition.test.mjs tests/calculation-provider-parity.test.mjs tests/typed-premise-calculation.test.mjs tests/calculation-operand-roles.test.mjs tests/ask-deterministic-calculation-bindings.test.mjs
```

Additional gates:
- npm run typecheck: exit 0.
- npx --no-install eslint on the four changed code/test files: exit 0; inherited warnings for _probes, fixture role destructuring and a fixture expression.
- npm run build: exit 0 with external networking blocked, telemetry disabled, and Next's font-response fixture pointed at an existing cached real Barlow Condensed 700 font. Application font/layout source was not edited. This verifies compilation/prerendering offline, not a live Google Fonts download.
- git diff --check: exit 0.
- Final focused, broad and build runs used an external-network guard. Recorded socket/transport blocks: 0. No app environment files were present.

Baseline logs and exact suite manifests:
C:\Users\gwara\waraich-operator\state\furvise-intelligence-v1-baseline

Final logs, baseline source loader, network guard and offline build/font fixtures:
C:\Users\gwara\waraich-operator\state\furvise-intelligence-v1-cut

INTELLIGENCE_OFFLINE_RESULTS.json records every inherited failure name and the before/after comparison. INTELLIGENCE_BASELINE.md was written before production edits.

## Inherited failures remain blockers

These failures were neither waived nor repaired by changing deterministic organs:

- Calculation: a positional schema test mistakes the added premise union member for the result member; a punctuation-only matcher parity expectation differs from current matching.
- Brain: an earliest-measurement diagnostic and its parent still expect weighed prose to be missed.
- Retrieval: the foreign-subject continuation fixture gets 503 during setup before its ownership assertion.
- Audit: legacy semantic-repair calls, scope/frame expectations, missing-premise and retired narrative/prompt expectations still fail.
- Stress: legacy frozen proposals omit required readTicket; some multi-pet cases also fail ASK_MEMORY_BRAIN_REQUIRED. The original stress suites and fixtures are unchanged.
- Remaining expanded failures: publication-path expectation (server-labs-list versus server-history-unavailable); the stale DAG schema position assertion; an Action Organ architecture assertion; an owner-note setup 503; a history-publication test module startup failure; and a missing vet-brief brand-print.png asset.

These results do not establish broad first-attempt model correctness. No provider interpretation was sampled. The demonstrated improvement is that forty previously admissible or inconsistent frozen cases now satisfy the intended structural/source contract, while the tested valid cases and deterministic authority are preserved.

## Complexity and files

No new production files or request fields. Two production files changed, net 18 lines removed.

Provider schema serialization with the same empty-frame fixture:
- Before: 196,759 bytes.
- After: 192,566 bytes (4,193 fewer).
- Instruction text: 45,346 → 45,692 bytes.
- Combined schema plus instructions: 242,105 → 238,258 bytes (3,847 fewer).

Production:
- app/lib/intelligence/ask-request-contract.ts: shared domain grammar, scope consistency, instructions and removal of duplicate schema prose.
- app/lib/furvise-brain/calculate-plan.ts: one shared numeric-literal pattern for provider quotes and the existing parser.

Tests:
- tests/brain-evidence-domain-composition.test.mjs: 61 new offline regression/generalization cases.
- tests/calculation-provider-parity.test.mjs: domain-aware structural assertions; semantic role descriptions checked at their single operator location; existing count rejection checked against its actual error.

Evidence:
- INTELLIGENCE_BASELINE.md
- INTELLIGENCE_OFFLINE_RESULTS.json
- INTELLIGENCE_REPAIR_REPORT.md

The user-provided ASTRA_INTELLIGENCE_TASK.md is preserved and excluded from the repair commit.

Next: review this generic cut and resolve the recorded broad-gate blockers before requesting any controlled live acceptance. Production remains blocked.
