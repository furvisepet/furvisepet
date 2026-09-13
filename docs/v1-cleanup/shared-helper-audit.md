# Shared helper consolidation audit

Base: presentation PR #278, commit `b6b1f0f532ab3f275beed953bea06660507988e5`.
Branch: `codex/shared-helper-consolidation`.

The initial PR #279 pass described below reduces file fragmentation without changing the Ask pipeline,
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


## Final consolidation pass after PR #279

Base: `1cc47cebb3c68c11954a1dae27620011b0fb470a`.
Branch: `codex/final-helper-consolidation`.

The preceding sections describe the PR #279 snapshot. The inventory now maps
all 322 original paths to their final owners after this additional pass.

| Responsibility | Files combined | Owner | Files saved |
| --- | --- | --- | ---: |
| Pet-profile forms | `add-pet-validation.ts`, `edit-pet-profile.ts`, `pet-profile-draft.ts`, `pet-profile-save-validation.ts` | `app/lib/pet-profile-editing.ts` | 3 |
| Lexical concept matching | `intelligence/concepts/normalize-concept.ts`, `retrieve-candidates.ts`, `provisional-concepts.ts` | `app/lib/intelligence/concept-matching.ts` | 2 |
| Entity/reference candidate matching | `intelligence/entities/policy.ts`, `candidate-retrieval.ts`, `resolve-entities.ts`, `resolve-references.ts` | `app/lib/intelligence/entity-matching.ts` | 3 |
| Vet Brief PDF layout/theme | `vet-brief/pdf-theme.ts`, `pdf.ts` | `app/lib/vet-brief/pdf.ts` | 1 |

This pass reduces library code files from **311 to 302**, another **9 fewer**.
Combined with PR #279, the reduction is **20 files**, from **322 to 302**, beyond
the earlier voice/output consolidation.

All selected modules were read in full. A declaration-level comparison verifies
**66/66 original declarations** retain their exact bodies. The static import
scan reports zero unresolved relative module paths. Imports now target the
owners directly. The obsolete PDF-theme exclusions were removed from the brand
color tests; the entire PDF source now receives the existing assertions.

Preserved boundaries:

- Onboarding validation, edit validation, draft reduction and server input
  normalization remain separate functions. Their distinct rules and messages
  are unchanged. Ownership/authentication and database writes remain in the
  profile API server.
- Lexical candidates and provisional concept resolution share one pure module.
  The v2 governed registry resolver remains separate and confers its own
  authority; matching does not silently promote a candidate into a governed fact.
- Entity policy, scoring and reference matching share one pure module. The
  authoritative turn-subject resolver, source evidence grounding, recent-subject
  state, authorization and persistence remain separate. Type imports do not
  introduce Supabase runtime access into candidate matching.
- PDF styling stays with the PDF renderer. Deterministic brief construction,
  schema validation, stored documents and client draft state stay separate.

This completes the selected file-ownership consolidation. The retained
candidates and duplicate utilities documented above still have distinct
boundaries or do not yield a useful reduction in containing files. No additional
merge is proposed solely because a file is small.

Final-pass validation: **2,062 tests passed**, zero failures/skips; TypeScript
and production build passed; ESLint has zero errors and the five existing
warnings; `git diff --check` passed. No live provider benchmark or authenticated
browser acceptance run was performed. No merge or deployment is included.


## Unused internal code cleanup

This pass removes 87 unreferenced declarations from 26 active modules, plus
orphaned imports. Application source shrinks by 716 net lines; no application
file, route, migration, dependency, or framework entry point is deleted. The file
category inventory remains valid. Factual validation, write authorization,
idempotency, billing settlement, and evidence receipts retain their own owners.

Candidates were checked against references across application code, tests and
audit scripts, including named, namespace and dynamic imports. References were
rechecked after removing callers to identify orphaned helper chains. TypeScript's
additional `--noUnusedLocals` diagnostic and ESLint caught remaining local
imports and label maps. AST comparison confirms that all 443 retained top-level
non-import statements in the edited modules have identical source text.

The major removals are the unused Today focus/suggestion engine and its helpers,
retired mock-product types, obsolete navigation-collapse logic, unused AI context
loaders, and compatibility aliases/browser wrappers that have no callers.
Legacy memory API routes remain: the active memory-management page still uses
the authenticated, idempotent gateway. Types used internally or by tests remain;
absence of a framework import alone is not sufficient evidence for deletion.

Three existing source-contract tests were updated to follow the active readers
and memory-management gateway. They continue checking memory eligibility,
soft-deletion filters, bearer authentication and API writes. The concern-only
loader is now explicitly checked to avoid legacy-memory and care-entry reads.

Removed declarations (paths relative to the repository root):

| File | Removed declarations |
| --- | --- |
| `app/lib/ai/config.ts` | `AiProviderName`, `getAiProviderName`, `getAiRuntimeDiagnostics` |
| `app/lib/ai/context-builder.ts` | `loadPetContext`, `loadRecentCareEvents`, `loadRememberedDetails` |
| `app/lib/ai/turn-classifier.ts` | `assertedRecoveryClauses`, `isDeterministicTurn` |
| `app/lib/ai/usage-ledger.ts` | `getAiCreditEventState` |
| `app/lib/ask.mjs` | `askResponseJsonSchema` |
| `app/lib/auth-identity.ts` | `friendlyOAuthError` |
| `app/lib/billing/plan-limits.ts` | `evaluateProductsAiUsageLimit` |
| `app/lib/care-log.mjs` | `CARE_ENTRY_SEVERITY_LABELS`, `buildDashboardCareEntries`, `buildDashboardCareSectionState`, `formatCareEntrySeverity` |
| `app/lib/furvise-output.ts` | `buildFurviseActionConfirmation`, `buildFurviseCorrectionConfirmation` |
| `app/lib/furvise-voice.ts` | `FURVISE_RESULTS_PROMPT_RULES` |
| `app/lib/intelligence/episode-history.ts` | `isEpisodeFollowUp` |
| `app/lib/intelligence/episodes/types.ts` | `EpisodeAssignment`, `EpisodeEvent`, `EpisodeRelation` |
| `app/lib/intelligence/pet-state/types.ts` | `StateEpisode`, `StateReduction` |
| `app/lib/intelligence/v2/governance/evidence.ts` | `evidenceForPersistence` |
| `app/lib/intelligence/v2/types.ts` | `ServerOwnedClaimAuthority` |
| `app/lib/navigation/mobile-navigation.ts` | `MOBILE_NAVIGATION_IDLE_EXPAND_MS`, `MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX`, `MobileNavigationState`, `resolveMobileNavigationState` |
| `app/lib/pet-profile-file.ts` | `ProfileAboutSource`, `buildPetProfileAboutDetails` |
| `app/lib/petwise.ts` | `InternalConcernTag`, `MockProduct`, `PRODUCT_SOURCES`, `ProductCategory`, `ProductEnrichmentStatus`, `ProductSource`, `ProductVerificationSource`, `RecommendationKind` |
| `app/lib/security/auth-abuse/recovery-fragment.mjs` | `RECOVERY_FRAGMENT_LIMITS` |
| `app/lib/security/auth-abuse/responses.ts` | `idempotencyConflictResponse` |
| `app/lib/security/headers/security-headers.ts` | `applySecurityHeaders` |
| `app/lib/security/idempotency/request-key.ts` | `createIdempotencyKey` |
| `app/lib/security/rate-limit/keys.ts` | `getRateLimitRequestId`, `isUuid` |
| `app/lib/supabase.ts` | `MemoryInput`, `PetMemoryRow`, `PetProductFeedbackRow`, `PetProfileRow`, `PetProfileWithMemories`, `ProductFeedbackInput`, `SaveDogMemoriesResult`, `ToggleProductFeedbackResult`, `countDogProfilesForUser`, `countPetProfilesForUser`, `deleteDogMemoriesForUser`, `deleteDogMemoryForUser`, `deletePetProfileForUser`, `isRecentAuthenticationRequiredError`, `loadPetProductFeedbackForUser`, `loadPetProfileForUser`, `loadPetProfileWithMemoriesForUser`, `loadPetProfilesWithMemories`, `petProfileRowToDraft`, `saveDogMemories`, `savePetMemories`, `toggleProductFeedbackForUser` |
| `app/lib/today.ts` | `REPEATED_CONCERNS`, `TODAY_EVERYTHING_NORMAL_ACTION`, `TodayFocus`, `TodayFocusInput`, `buildDefaultTodayFocus`, `buildFallbackTodayFocus`, `buildTodayCareNote`, `buildTodayFocus`, `findRepeatedConcern`, `findUpcomingVetVisit`, `formatVisitTiming`, `hasMeaningfulMissingProfileContext`, `hasRecentFoodChange`, `hasRecentMeaningfulActivity`, `isPastWithinDays`, `toggleTodayQuickAction` |
| `app/lib/visual-system.ts` | `CARE_CATEGORY_SURFACES`, `getCareCategoryVisual` |

Validation: **2,062 tests passed**, zero failures/skips; normal TypeScript check
and production build passed; zero unresolved relative imports. ESLint's only
new warning (the orphaned severity-label map) was removed; a focused rerun is
clean, leaving the same five pre-existing warnings elsewhere. The additional
`--noUnusedLocals` probe reports one pre-existing private `metrics` field in
`ai/usage-guard/admission.ts`; that class and its constructor assignment are
unchanged. No test, safeguard or validation gate was disabled. `git diff --check`
passes. No live-provider, database or authenticated-browser test was performed.
