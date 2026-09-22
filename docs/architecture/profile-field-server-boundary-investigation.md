# Profile field authority: server-only boundary investigation

Base: b75854aa6781f09f3c8a79686bbb7ce6be721925. Uncommitted draft preserved. Offline only; no provider calls, deployment or dependency changes.

## Exact import chain

`tests/ask-direct-evidence-ticket.test.mjs` ? `app/lib/intelligence/ask-evidence.ts` ? `app/lib/intelligence/episode-contract.ts` ? `app/lib/intelligence/history-review-state.ts` ? `app/lib/intelligence/publication-authority.ts` ? `app/lib/intelligence/profile-field-authority.ts` ? `server-only`.

## Classification and resolution

The module combines pure field definitions/value projection with a server-runtime authority capability: `snapshots` WeakMap, `bindProfileFieldProjection`, `profileFieldProjection`, and `carryProfileFieldProjection`. Those functions mint, verify and transfer ephemeral snapshot authority; `createHash` imports Node crypto. There is no database, network, cookie, secret, or filesystem access. The existing module is therefore treated as server-only integration (B), with a pure projection subset. Its guard was retained. No split or duplicate implementation was introduced.

The root package.json, package-lock.json and root node_modules contain no standalone server-only package. Next vendors `next/dist/compiled/server-only/{empty,index}`. `next/dist/build/create-compiler-aliases.js::createServerOnlyClientOnlyAliases` aliases the bare import to empty on server layers and the error module on client layers; webpack-config also has next-invalid-import-error-loader checks. This is framework-resolved production behavior, not evidence of a missing production dependency. A clean production build has not yet run for this draft.

The only executable change this turn is tests/ask-direct-evidence-ticket.test.mjs: the existing registerHooks resolver pattern maps exactly server-only to an empty data module, then dynamically imports application modules after hook registration. This matches tests/ask-certificate-bound-publication.test.mjs and tests/ask-labs-list.test.mjs. Production retains the poison guard. No assertions changed.

Other established mechanisms: tests/memory-sources.test.mjs and tests/ask-memory-single-authority.test.mjs supply server-only in a mocked module map; scripts/audits/helpers/lifetime-harness.mjs installs a resolver hook; security tests may inspect source text instead of executing imports. Direct Node static import graphs below do not capture every custom transpilation/mock/read-source harness. Zero graph callers means no statically discoverable runtime test import, not no coverage.

## Verification and stop

- Direct-evidence ticket load/retest: 5/5.
- Focused profile gate: 77/77 (new authority 22, characterization 8, Ask profile/profile-save 19, certificate publication 20, scalar characterization 8).
- Full publication group: 74/74.
- Firewall: 12/12.
- Event search: 37/37.
- Temporal boundary: 29/29.
- Global/resultSet: 67/67.
- Probes/multi-need: 22/22.
- Supporting context: 26/26.
- Body: 185/185.
- Brain: 77/77.
- Safety: 32 passed, four failures: two existing baseline assertions (episode membership production callback regressions; reviewed Ask effects execute inside the single Brain handoff), plus two new file-load failures.
- New load failures: tests/ask-evidence-boundaries.test.mjs and tests/ask-private-review-audit.test.mjs cannot resolve server-only through the new profile-field-authority dependency. STOPPED without patching those tests or changing application behavior.
- Full 222 audit, typecheck and clean production build: not run after stop. Prior 208/222 is not verification of this draft.
- Tracked diff whitespace: passed. No commit.

Profile semantics unchanged this turn: only name/species/sex/reported breed/weight with explicit unit; exact value, saved-profile null scope, no history substitution, no raw-wording field expansion. No calculation operand API or dependency changes.

## Complete poison-import inventory

65 tracked application modules plus the new draft module: 66 total. The table counts static/dynamic literal import reachability from test files. It is not a claim every reachable test was executed or currently loads.

| Module | Reachable direct Node test files |
| --- | ---: |
| `app/components/private-route-layout.tsx` | 0 |
| `app/lib/ai/usage-guard/admission.ts` | 0 |
| `app/lib/ai/usage-guard/daily-usage-store.ts` | 0 |
| `app/lib/ai/usage-ledger-admin.ts` | 11 |
| `app/lib/application-actions/capabilities.ts` | 6 |
| `app/lib/ask-conversation-authority.ts` | 4 |
| `app/lib/ask-conversation-server.ts` | 7 |
| `app/lib/authenticated-api-server.ts` | 2 |
| `app/lib/billing/billing-admin.ts` | 0 |
| `app/lib/billing/billing-market.ts` | 0 |
| `app/lib/billing/entitlements.ts` | 0 |
| `app/lib/billing/stripe-server.ts` | 0 |
| `app/lib/care-entry-api-server.ts` | 0 |
| `app/lib/intelligence/care-authority-client.ts` | 7 |
| `app/lib/intelligence/dated-correction-notes.ts` | 15 |
| `app/lib/intelligence/episode-history.ts` | 3 |
| `app/lib/intelligence/finalize-ask-answer.ts` | 3 |
| `app/lib/intelligence/finalize-ask-publication.ts` | 0 |
| `app/lib/intelligence/generate-ask-history.ts` | 2 |
| `app/lib/intelligence/history-retrieval.ts` | 15 |
| `app/lib/intelligence/interpret-ask.ts` | 13 |
| `app/lib/intelligence/memory-sources.ts` | 6 |
| `app/lib/intelligence/persist-learnings.ts` | 0 |
| `app/lib/intelligence/retrieve-context.ts` | 6 |
| `app/lib/intelligence/review-history-narrative.ts` | 14 |
| `app/lib/intelligence/review-task-completion.ts` | 3 |
| `app/lib/intelligence/run-feature-intelligence.ts` | 0 |
| `app/lib/intelligence/run-intelligence.ts` | 2 |
| `app/lib/intelligence/semantic-frame/extract-turn-subject.ts` | 0 |
| `app/lib/operations/admin-client.ts` | 2 |
| `app/lib/operations/dashboard-telemetry.ts` | 1 |
| `app/lib/operations/events/logger.ts` | 1 |
| `app/lib/operations/owner-dashboard-server.ts` | 1 |
| `app/lib/operations/production-config.ts` | 0 |
| `app/lib/operations/user-data-export.ts` | 0 |
| `app/lib/pet-profile-api-server.ts` | 1 |
| `app/lib/security/auth-abuse/captcha.ts` | 1 |
| `app/lib/security/auth-abuse/config.ts` | 1 |
| `app/lib/security/auth-abuse/email.ts` | 0 |
| `app/lib/security/auth-abuse/keys.ts` | 0 |
| `app/lib/security/auth-abuse/limiter.ts` | 0 |
| `app/lib/security/auth-abuse/logging.ts` | 0 |
| `app/lib/security/auth-abuse/origin.ts` | 0 |
| `app/lib/security/auth-abuse/password.ts` | 0 |
| `app/lib/security/auth-abuse/recovery-authorization.ts` | 0 |
| `app/lib/security/auth-abuse/recovery-continuation.ts` | 0 |
| `app/lib/security/auth-abuse/recovery-handoff.ts` | 0 |
| `app/lib/security/auth-abuse/redis-store.ts` | 0 |
| `app/lib/security/auth-abuse/responses.ts` | 0 |
| `app/lib/security/auth-abuse/turnstile-siteverify.ts` | 0 |
| `app/lib/security/idempotency/admin-client.ts` | 10 |
| `app/lib/security/idempotency/errors.ts` | 1 |
| `app/lib/security/idempotency/logging.ts` | 1 |
| `app/lib/security/idempotency/operation.ts` | 1 |
| `app/lib/security/idempotency/payload-hash.ts` | 1 |
| `app/lib/security/idempotency/request-key.ts` | 1 |
| `app/lib/security/idempotency/store.ts` | 1 |
| `app/lib/security/logging.ts` | 0 |
| `app/lib/security/password-capability-admin.ts` | 0 |
| `app/lib/security/recent-auth.ts` | 0 |
| `app/lib/security/request.ts` | 1 |
| `app/lib/supabase/account-route-admin.ts` | 0 |
| `app/lib/supabase/server.ts` | 2 |
| `app/lib/vet-brief/prepare.ts` | 0 |
| `app/lib/vet-brief/server.ts` | 0 |
| `app/lib/intelligence/profile-field-authority.ts` | 57 |

## Test import reachability details

### app/lib/ai/usage-ledger-admin.ts

- `tests/account-entitlements.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ai-credit-security-regression.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-credit-settlement-integrity.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-credit-settlement.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/billing-launch.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/unified-ai-credits-care-state.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/vet-brief-credit-preflight.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load

### app/lib/application-actions/capabilities.ts

- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-heart-receipt.test.mjs` ? local resolver shim present
- `tests/furvise-replace-ticket.test.mjs` ? local resolver shim present
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load

### app/lib/ask-conversation-authority.ts

- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load

### app/lib/ask-conversation-server.ts

- `tests/ask-history-pet-coverage-repair.test.mjs` ? local resolver shim present
- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/authenticated-api-server.ts

- `tests/owner-dashboard-security.test.mjs` ? local resolver shim present
- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/intelligence/care-authority-client.ts

- `tests/ask-history-pet-coverage-repair.test.mjs` ? local resolver shim present
- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/dated-correction-notes.ts

- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-one-interpreter.test.mjs` ? local resolver shim present
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-memory-organ.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-effective-selection.test.mjs` ? local resolver shim present
- `tests/furvise-episode-ticket.test.mjs` ? local resolver shim present
- `tests/furvise-lungs.test.mjs` ? local resolver shim present
- `tests/legacy-read-selection.test.mjs` ? local resolver shim present
- `tests/ordered-result-set.test.mjs` ? local resolver shim present
- `tests/ordinary-ask-authority-firewall.test.mjs` ? local resolver shim present
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/result-read-selection.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/episode-history.ts

- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-episode-ticket.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/finalize-ask-answer.ts

- `tests/ask-answer-finalization.test.mjs` ? local resolver shim present
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/generate-ask-history.ts

- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/history-retrieval.ts

- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-one-interpreter.test.mjs` ? local resolver shim present
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-memory-organ.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-effective-selection.test.mjs` ? local resolver shim present
- `tests/furvise-episode-ticket.test.mjs` ? local resolver shim present
- `tests/furvise-lungs.test.mjs` ? local resolver shim present
- `tests/legacy-read-selection.test.mjs` ? local resolver shim present
- `tests/ordered-result-set.test.mjs` ? local resolver shim present
- `tests/ordinary-ask-authority-firewall.test.mjs` ? local resolver shim present
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/result-read-selection.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/interpret-ask.ts

- `tests/ask-compositional-emission.test.mjs` ? local resolver shim present
- `tests/ask-id-free-probes.test.mjs` ? local resolver shim present
- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-one-interpreter.test.mjs` ? local resolver shim present
- `tests/ask-read-ticket-diagnostics.test.mjs` ? local resolver shim present
- `tests/ask-read-ticket-hygiene.test.mjs` ? local resolver shim present
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-working-memory-interpretation.test.mjs` ? local resolver shim present
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-replace-ticket.test.mjs` ? local resolver shim present
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/memory-sources.ts

- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/retrieve-context.ts

- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/review-history-narrative.ts

- `tests/ask-answer-finalization.test.mjs` ? local resolver shim present
- `tests/ask-certificate-bound-publication.test.mjs` ? local resolver shim present
- `tests/ask-history-pet-coverage-repair.test.mjs` ? local resolver shim present
- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-labs-list.test.mjs` ? local resolver shim present
- `tests/ask-one-interpreter.test.mjs` ? local resolver shim present
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-selection-publication.test.mjs` ? local resolver shim present
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ordered-result-set.test.mjs` ? local resolver shim present
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present
- `tests/profile-field-authority.test.mjs` ? local resolver shim present

### app/lib/intelligence/review-task-completion.ts

- `tests/ask-answer-finalization.test.mjs` ? local resolver shim present
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/intelligence/run-intelligence.ts

- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/operations/admin-client.ts

- `tests/owner-dashboard-security.test.mjs` ? local resolver shim present
- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/operations/dashboard-telemetry.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/operations/events/logger.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/operations/owner-dashboard-server.ts

- `tests/owner-dashboard-security.test.mjs` ? local resolver shim present

### app/lib/pet-profile-api-server.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/security/auth-abuse/captcha.ts

- `tests/auth-captcha-policy.test.mjs` ? local resolver shim present

### app/lib/security/auth-abuse/config.ts

- `tests/auth-captcha-policy.test.mjs` ? local resolver shim present

### app/lib/security/idempotency/admin-client.ts

- `tests/ask-history-pet-coverage-repair.test.mjs` ? local resolver shim present
- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-heart-receipt.test.mjs` ? local resolver shim present
- `tests/furvise-replace-ticket.test.mjs` ? local resolver shim present
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present

### app/lib/security/idempotency/errors.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/security/idempotency/logging.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/security/idempotency/operation.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/security/idempotency/payload-hash.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/security/idempotency/request-key.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/security/idempotency/store.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/security/request.ts

- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/supabase/server.ts

- `tests/owner-dashboard-security.test.mjs` ? local resolver shim present
- `tests/pet-profile-save-regression.test.mjs` ? local resolver shim present

### app/lib/intelligence/profile-field-authority.ts

- `tests/ask-answer-economy-v1-2.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-answer-finalization.test.mjs` ? local resolver shim present
- `tests/ask-certificate-bound-publication.test.mjs` ? local resolver shim present
- `tests/ask-completion-execution.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-compositional-emission.test.mjs` ? local resolver shim present
- `tests/ask-context-reasoning.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-direct-evidence-ticket.test.mjs` ? local resolver shim present
- `tests/ask-endpoint-cohort-projection.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-evidence-boundaries.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-final-scope-audit.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-history-pet-coverage-repair.test.mjs` ? local resolver shim present
- `tests/ask-id-free-probes.test.mjs` ? local resolver shim present
- `tests/ask-interpretation-timeout.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-labs-list.test.mjs` ? local resolver shim present
- `tests/ask-latest-saved-care-read.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-launch-quality-history-prose.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-live-complex10-regressions.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-live20-regressions.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-next40-reliability.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-one-interpreter.test.mjs` ? local resolver shim present
- `tests/ask-private-review-audit.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-publication-authority-diagnostics.test.mjs` ? local resolver shim present
- `tests/ask-read-recovery.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-read-ticket-diagnostics.test.mjs` ? local resolver shim present
- `tests/ask-read-ticket-hygiene.test.mjs` ? local resolver shim present
- `tests/ask-record-inventory.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-referent-product-leak-p0.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-reliability-repair-1.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-route-ordering.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-selection-publication.test.mjs` ? local resolver shim present
- `tests/ask-shared-operation-contracts.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-structured-output-degradation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-structured-output-reliability.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/ask-working-memory-interpretation.test.mjs` ? local resolver shim present
- `tests/event-candidates-analysis.test.mjs` ? local resolver shim present
- `tests/event-search-migration.test.mjs` ? local resolver shim present
- `tests/furvise-brain-memory-organ.test.mjs` ? local resolver shim present
- `tests/furvise-brain-owner-note-gate.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/furvise-effective-selection.test.mjs` ? local resolver shim present
- `tests/furvise-episode-ticket.test.mjs` ? local resolver shim present
- `tests/furvise-lungs.test.mjs` ? local resolver shim present
- `tests/furvise-multi-need-ticket.test.mjs` ? local resolver shim present
- `tests/furvise-replace-ticket.test.mjs` ? local resolver shim present
- `tests/intelligence-phase-3d-governance-validation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/legacy-read-selection.test.mjs` ? local resolver shim present
- `tests/ordered-result-set.test.mjs` ? local resolver shim present
- `tests/ordinary-ask-authority-firewall.test.mjs` ? local resolver shim present
- `tests/owner-note-write-isolation.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/profile-authority-characterization.test.mjs` ? local resolver shim present
- `tests/result-read-selection.test.mjs` ? local resolver shim present
- `tests/semantic-event-intelligence.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/semantic-frame-recovery-integration.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/semantic-frame-shadow.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/supporting-context.test.mjs` ? local resolver shim present
- `tests/temporal-boundary-migration.test.mjs` ? local resolver shim present
- `tests/vet-brief-model-routing.test.mjs` ? no local resolver shim detected; may rely on helper/mocks, or fail during load
- `tests/profile-field-authority.test.mjs` ? local resolver shim present


## Final resolution

The remaining direct-Node loaders were updated only with the repository's established `server-only` resolver pattern. No production dependency or application guard was removed. The affected files now load and execute normally.

A subsequent full audit exposed one real migration regression: custom JSON requests could ask for profile keys omitted by `profileFields`, while deterministic profile Labs short-circuited the legacy model path. The first profile-authority cut therefore excludes `outputFormat: json` until the structured-output contract can prove every requested field. This is an eligibility boundary, not question-text parsing.

Final profile semantics remain limited to name, species, sex, reported breed, and weight with an explicit stored unit. Mixed/unmigrated profile requests continue through existing policy. Historical facts cannot substitute for saved-profile facts, and saved-profile facts cannot satisfy historical obligations.

Final verification after that correction:
- profile-focused checks: 57/57 in the final focused rerun; previously established profile/certificate checks remain green.
- publication: 74/74.
- common-path firewall: 12/12.
- event-search migration: 37/37.
- temporal-boundary migration: 29/29.
- result-set/global selection: 67/67.
- probes/multi-need: 22/22.
- supporting context: 26/26.
- body/architecture: 185/185.
- Brain/interpreter: 77/77.
- broader safety: 46/48, exact same two baseline failures.
- full audit: 208/222, exact same fourteen baseline failures.
- typecheck: passed after restoring the already-declared local `@pdf-lib/fontkit` package from a dependency-complete checkout; no dependency files changed.
- clean-source production build: passed with Next.js 16.3.4 webpack build and TypeScript.
- whitespace: passed.

No deployment, live Ask, paid API call, calculation operand API, or persisted profile certificate was introduced.