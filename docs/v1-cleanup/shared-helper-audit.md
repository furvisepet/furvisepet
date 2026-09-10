# Shared helper consolidation audit

Base: presentation PR #278, commit `b6b1f0f532ab3f275beed953bea06660507988e5`.
Branch: `codex/shared-helper-consolidation`.

This change reduces file fragmentation without changing the Ask pipeline,
provider settings, database schema, prompts, output wording or authorization.

## Completed consolidation

Paths below are relative to `app/lib/`.

| Responsibility | Original files | Current owner | Files saved |
| --- | --- | --- | ---: |
| Memory freshness | `intelligence/memory-freshness/policy.ts`, `calculate-memory-freshness.ts`, `select-fresh-memories.ts` in that directory | `intelligence/memory-freshness.ts` | 2 |
| History calendar semantics | `intelligence/explicit-history-dates.ts`, `literal-history-window.ts`, `evidence-need-window.ts` | `intelligence/history-dates.ts` | 2 |
| Grounded arithmetic | `intelligence/history-units.ts`, `calculation-expression.ts`, `history-calculation.ts` | `intelligence/history-calculation.ts` | 2 |
| Stage and provider deadlines | `ai/operation-deadline.ts`, `provider-deadline.ts` | `ai/execution-deadline.ts` | 1 |
| Review receipt and diagnostic state | `intelligence/history-review-receipt.ts`, `history-review-diagnostic.ts` | `intelligence/history-review-state.ts` | 1 |
| AI guard metric contract/default | `ai/usage-guard/types.ts`, `metrics.ts` | `ai/usage-guard/types.ts` | 1 |
| Operational metric contract/default | `operations/events/types.ts`, `metrics.ts` | `operations/events/types.ts` | 1 |
| Shared safety copy | `furvise-output.ts`, `safety-copy.ts` | `furvise-output.ts` | 1 |

Total: **11 fewer application-library code files**, from **322 to 311**.
This count includes `.ts`, `.tsx`, `.mjs` and `.js` under `app/lib`, including
vendor declarations. It excludes extensionless Node bridges and documentation.
Existing tests remain as separate behavioral regression suites.

## Scope and method

The [inventory](shared-helper-inventory.csv) accounts for every original code
file under `app/lib`, its current owner, line counts, direct application imports
and runtime dependencies. A TypeScript AST scan covered static import/export
edges throughout `app`. The scan found **zero unresolved relative module paths**.
It is a static inventory, not a claim that every module received a full semantic
or security audit. External package resolution is additionally checked by
TypeScript and the production build; arbitrary constructed dynamic paths are
outside the static scan.

Selected modules were read in full. A declaration-level AST comparison verified
that all **113 original declarations** from those modules remain verbatim in
their new owners. Imports and re-exports were redirected; no compatibility shim
files were added. Existing source-inspection tests were redirected to their new
owners, including the memory-source test's VM module map.

## Boundaries checked

- Freshness still uses the same expiry, confidence, confirmation and selection
  policies. It imports the existing pure memory-integrity helpers; it does not
  acquire database or provider dependencies.
- Calendar functions retain their distinct rules for explicit days, months,
  report bounds, comparisons and per-need windows. Similar parsers were moved,
  not rewritten into one more permissive parser. Date parsing grants no pet or
  write authority.
- Arithmetic retains source-token grounding, dimensional units, currency
  restrictions, expression bounds, rounding and division-by-zero checks.
  Unit tables and aliases initialize before the exported functions are called.
- A shared deadline file retains both the monotonic whole-operation budget and
  individual provider cancellation. Provider timeouts cannot reset the operation
  budget or publish an unreviewed result.
- Review state retains two separate WeakMaps. Recording a diagnostic cannot
  register approval. Review signatures, object identity checks, cloning and
  invalidation remain unchanged. Both maps have the same singleton lifetime as
  before; no per-request or browser state is introduced.
- Metric interfaces/defaults are kept in dependency-free contract modules.
  Operational logging keeps its `server-only` adapter and redaction boundary.
- Safety wording moves to the existing output owner. Safety detection,
  enforcement, persistence authorization and publication validation remain in
  their existing modules.

## Additional candidates assessed

| Candidate | Decision and reason |
| --- | --- |
| `usage-guard/classification.ts` and `logging.ts` | Keep separate: classification is pure; logging imports the operational server adapter. Merging would make pure consumers load that adapter. |
| `authenticated-api-core.ts` and `authenticated-api-server.ts` | Keep the reusable core separate from authentication/server integration. |
| `evidence-needs.ts` and `evidence-need-coverage.ts` | Keep request-grounded retrieval needs separate from coverage rebuilt after evidence-budget changes. The shared date parsing was consolidated. |
| `structured-history-json.ts` and `furvise-output.ts` | Keep the evidence adapter separate; it adds source/calculation validation after the shared serializer. |
| Concept normalization and v2 governed concept resolution | Keep separate: lexical normalization does not confer registry authority or lifecycle eligibility. |
| Episode navigation, review receipts and evidence presentation | Keep their respective authority rules; assistant navigation context is explicitly unverified. |
| Auth recovery, rate limits, idempotency and billing | Keep service/policy boundaries, store adapters and test stores separate. Similar vocabulary is not evidence of the same responsibility. |
| Thin public `index.ts` files | Retain stable subsystem entry points. Removed only the redundant operational type re-export created by this merge. |
| Small helpers imported only by the large Ask route/reasoner | Do not inline merely to reduce file count; that would enlarge orchestration files without unifying ownership. |

A supplemental scan of top-level function bodies longer than 100 characters,
with whitespace normalized, found five duplicate groups: sentence splitting,
pet-name cleanup, memory-key normalization, UUID validation, and auth Redis
store factories. This is a candidate detector, not proof of equivalent behavior.
The store factories close over separate singleton state. The others are small
utilities used across distinct policies; consolidating them would not eliminate
their containing files. They remain unchanged in this file-ownership pass.

## Validation

- Full offline suite: **2,062 tests passed**, zero failures/skips.
- TypeScript: passed.
- Production build: passed.
- ESLint: zero errors, five existing warnings.
- Selected declaration preservation: **113/113** exact source matches.
- Static relative import/export resolution: zero missing targets.
- `git diff --check`: passed.

No live model calls, database writes, deployment, or authenticated browser
acceptance run is part of this consolidation. Offline passing checks do not
establish improved live Ask accuracy.
