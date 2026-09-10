# Furvise file categories

Snapshot: local commit `930ef8a1a53b293a23feaa54bfc6d33ea915a5e5`, whose application tree is published in draft PR #280. This is the consolidated draft branch, not a claim about production or main.

Classified **1,257 tracked files**, including **433 application files** under `app/`. Dependencies, build output, Git internals, transient uploads and these two new audit deliverables are excluded. No source files were moved or changed.

Each file has one primary category to avoid double counting. Shared code can serve several features; the category is an ownership recommendation, not an exclusive dependency boundary. Application files use paths and responsibilities; supporting artifacts use directory/filename topics, as recorded in the CSV. This is a file organization audit, not a fresh security or behavioral audit.

## Category summary

| Category | Application files | All tracked files | Responsibility |
| --- | ---: | ---: | --- |
| Ask Furvise | 84 | 399 | Question handling, conversations, retrieval, calculations, answer review and publication. |
| Shared pet intelligence and governance | 80 | 100 | Semantic frames, entity/concept matching, memory policies, safety state, action governance and persistence. |
| Security and request protection | 61 | 84 | Abuse protection, recent authentication, request boundaries, rate limits and idempotency. |
| Authentication and account | 46 | 79 | Sign-in, signup, password flows, account/settings screens and account APIs. |
| Pet profiles and onboarding | 29 | 49 | Creating and editing pets, profile form state, pet selection, media and onboarding. |
| History and saved memories | 23 | 37 | Care-entry UI/APIs, archives, memory management and historical saved-data compatibility. |
| Shared UI and navigation | 20 | 70 | App shell, reusable components, navigation, styling and shared visual support. |
| AI usage and cost controls | 16 | 17 | Provider admission, call budgets, token/cost accounting and usage ledgers. Distinct from customer subscriptions. |
| Billing and membership | 16 | 33 | Subscriptions, checkout, Stripe webhooks, entitlements, plan limits and membership UI. |
| Vet Brief | 16 | 25 | Brief preparation, validation, saved briefs, document display, PDFs and draft isolation. |
| Platform and operations | 13 | 43 | Operational events, readiness/health endpoints, configuration, monitoring and build/deployment setup. |
| Marketing and legal | 8 | 18 | Homepage, legal pages, SEO and public-facing brand content. |
| Products and compatibility | 8 | 29 | Products placeholder, product feedback, retained safety policy and Results redirect. Not a live catalogue engine. |
| Today | 6 | 11 | Today screen and daily care view; includes the legacy dashboard redirect. |
| Database and data access | 5 | 180 | Shared Supabase access plus migrations, SQL assertions and database configuration. |
| Shared voice and output | 2 | 4 | The two shared presentation owners: language/instructions and public response formats/messages. |
| Cross-feature QA and architecture | 0 | 79 | Repository-wide audits, mixed-feature tests and architecture/operations evidence. |
| **Total** | **433** | **1,257** | |

## File types

| Layer | Files |
| --- | ---: |
| Configuration and infrastructure | 23 |
| Pages, components and styling | 89 |
| API routes | 39 |
| Libraries and vendor support | 305 |
| Documentation and reports | 266 |
| Public assets | 42 |
| Scripts and audit tooling | 58 |
| Database schema and SQL checks | 171 |
| Tests and fixtures | 264 |

Application libraries contain 302 `.ts`/`.tsx`/`.mjs`/`.js` files, two extensionless Node bridges, and one vendor README: 305 library/support files altogether. This explains why the application inventory is larger than the 302 code-module count from consolidation.

## Where to work

| Task | Start here |
| --- | --- |
| Ask answer reliability | `app/api/ask/route.ts`, `app/lib/ai/ask-reasoning.ts`, `app/lib/intelligence/review-history-narrative.ts` |
| Ask appearance and personality | `app/lib/furvise-voice.ts`, `app/lib/furvise-output.ts`, `app/components/ask-answer-text.tsx` |
| Today behavior | `app/today/page.tsx`, `app/lib/today.ts` |
| Pet creation/editing | `app/lib/pet-profile-editing.ts`, `app/lib/pet-profile-api-server.ts`, `app/components/simple-pet-profile-form.tsx` |
| Saved care and memory management | `app/history/page.tsx`, `app/lib/care-entry-api-server.ts`, `app/lib/remembered-details.ts` |
| Vet Brief | `app/lib/vet-brief/builder.ts`, `app/lib/vet-brief/server.ts`, `app/lib/vet-brief/pdf.ts` |
| Subscription behavior | `app/lib/billing/`, `app/api/billing/`, `app/membership/page.tsx` |
| AI spend/call ceilings | `app/lib/ai/usage-guard/`, `app/lib/ai/usage-ledger.ts` |
| Semantic facts and write governance | `app/lib/intelligence/semantic-frame/`, `app/lib/intelligence/v2/governance/`, `app/lib/application-actions/` |
| Authentication and security | `app/api/auth/`, `app/lib/auth-session.ts`, `app/lib/security/` |
| Production monitoring | `app/lib/operations/`, `app/api/readiness/route.ts`, `app/api/health/route.ts` |
| Database changes | `supabase/migrations/`, `supabase/tests/` |

Important shared-use examples: Today imports the shared care-history policy; Vet Brief also uses that policy and profile formatting. The shared feature runner imports generation code currently located in `ai/ask-reasoning`. Therefore, an Ask-owned filename is not necessarily used only by Ask. Avoid moving directories solely from this primary-owner map without checking callers.

## Complete application file map

All paths below are relative to the repository root. Every tracked `app/` file appears exactly once. The companion [CSV](file-categories.csv) includes all 1,257 tracked files, including each test, script, migration, document and asset.

### Ask Furvise (84)

Question handling, conversations, retrieval, calculations, answer review and publication.

- `app/api/ask/actions/[messageId]/route.ts` — API routes
- `app/api/ask/conversations/[id]/messages/route.ts` — API routes
- `app/api/ask/conversations/[id]/route.ts` — API routes
- `app/api/ask/conversations/route.ts` — API routes
- `app/api/ask/route.ts` — API routes
- `app/api/ask/suggestions/[id]/route.ts` — API routes
- `app/ask/layout.tsx` — Pages, components and styling
- `app/ask/page.tsx` — Pages, components and styling
- `app/components/ask-answer-text.tsx` — Pages, components and styling
- `app/components/ask-usage-notice.tsx` — Pages, components and styling
- `app/lib/ai/ask-answer-economy.ts` — Libraries and vendor support
- `app/lib/ai/ask-command-router.ts` — Libraries and vendor support
- `app/lib/ai/ask-error-diagnostic.ts` — Libraries and vendor support
- `app/lib/ai/ask-internal-product-policy.ts` — Libraries and vendor support
- `app/lib/ai/ask-orchestrator.ts` — Libraries and vendor support
- `app/lib/ai/ask-provider.ts` — Libraries and vendor support
- `app/lib/ai/ask-reasoning.ts` — Libraries and vendor support
- `app/lib/ai/ask-turn-model.ts` — Libraries and vendor support
- `app/lib/ai/config.ts` — Libraries and vendor support
- `app/lib/ai/context-builder.ts` — Libraries and vendor support
- `app/lib/ai/conversation-intent.ts` — Libraries and vendor support
- `app/lib/ai/execution-deadline.ts` — Libraries and vendor support
- `app/lib/ai/history-source-transport.ts` — Libraries and vendor support
- `app/lib/ai/recovery-subject.ts` — Libraries and vendor support
- `app/lib/ai/response-planner.ts` — Libraries and vendor support
- `app/lib/ai/turn-classifier.ts` — Libraries and vendor support
- `app/lib/answer-integrity.ts` — Libraries and vendor support
- `app/lib/ask-analytics.ts` — Libraries and vendor support
- `app/lib/ask-care-history-state.ts` — Libraries and vendor support
- `app/lib/ask-conversation-authority.ts` — Libraries and vendor support
- `app/lib/ask-conversation-server.ts` — Libraries and vendor support
- `app/lib/ask-conversations.ts` — Libraries and vendor support
- `app/lib/ask-draft.ts` — Libraries and vendor support
- `app/lib/ask-experience.ts` — Libraries and vendor support
- `app/lib/ask-onboarding-entry.ts` — Libraries and vendor support
- `app/lib/ask-pet-selection.ts` — Libraries and vendor support
- `app/lib/ask-profile-read.ts` — Libraries and vendor support
- `app/lib/ask-publication.ts` — Libraries and vendor support
- `app/lib/ask-request-contract.ts` — Libraries and vendor support
- `app/lib/ask-safety-context.ts` — Libraries and vendor support
- `app/lib/ask-session-request.ts` — Libraries and vendor support
- `app/lib/ask.mjs` — Libraries and vendor support
- `app/lib/intelligence/answer-assessment.ts` — Libraries and vendor support
- `app/lib/intelligence/ask-evidence-presentation.ts` — Libraries and vendor support
- `app/lib/intelligence/ask-evidence.ts` — Libraries and vendor support
- `app/lib/intelligence/ask-request-contract.ts` — Libraries and vendor support
- `app/lib/intelligence/conversation-read-anchor.ts` — Libraries and vendor support
- `app/lib/intelligence/conversation-scope.ts` — Libraries and vendor support
- `app/lib/intelligence/correction-report.ts` — Libraries and vendor support
- `app/lib/intelligence/dated-correction-notes.ts` — Libraries and vendor support
- `app/lib/intelligence/episode-contract.ts` — Libraries and vendor support
- `app/lib/intelligence/episode-history.ts` — Libraries and vendor support
- `app/lib/intelligence/episode-membership.ts` — Libraries and vendor support
- `app/lib/intelligence/episode-presentation.ts` — Libraries and vendor support
- `app/lib/intelligence/episode-reference-language.ts` — Libraries and vendor support
- `app/lib/intelligence/evidence-need-coverage.ts` — Libraries and vendor support
- `app/lib/intelligence/evidence-needs.ts` — Libraries and vendor support
- `app/lib/intelligence/generate-ask-history.ts` — Libraries and vendor support
- `app/lib/intelligence/historical-care-state.ts` — Libraries and vendor support
- `app/lib/intelligence/historical-read-response.ts` — Libraries and vendor support
- `app/lib/intelligence/history-access.ts` — Libraries and vendor support
- `app/lib/intelligence/history-calculation.ts` — Libraries and vendor support
- `app/lib/intelligence/history-dates.ts` — Libraries and vendor support
- `app/lib/intelligence/history-limits.ts` — Libraries and vendor support
- `app/lib/intelligence/history-narrative-facts.ts` — Libraries and vendor support
- `app/lib/intelligence/history-narrative.ts` — Libraries and vendor support
- `app/lib/intelligence/history-obligations.ts` — Libraries and vendor support
- `app/lib/intelligence/history-query-relevance.ts` — Libraries and vendor support
- `app/lib/intelligence/history-read-strategies.ts` — Libraries and vendor support
- `app/lib/intelligence/history-retrieval.ts` — Libraries and vendor support
- `app/lib/intelligence/history-review-selection.ts` — Libraries and vendor support
- `app/lib/intelligence/history-review-state.ts` — Libraries and vendor support
- `app/lib/intelligence/history-synthesis.ts` — Libraries and vendor support
- `app/lib/intelligence/inspect-ask-publication.ts` — Libraries and vendor support
- `app/lib/intelligence/interpret-ask.ts` — Libraries and vendor support
- `app/lib/intelligence/read-projection.ts` — Libraries and vendor support
- `app/lib/intelligence/recorded-inventory.ts` — Libraries and vendor support
- `app/lib/intelligence/recorded-provenance.ts` — Libraries and vendor support
- `app/lib/intelligence/request-reference-context.ts` — Libraries and vendor support
- `app/lib/intelligence/review-history-narrative.ts` — Libraries and vendor support
- `app/lib/intelligence/source-note-recall.ts` — Libraries and vendor support
- `app/lib/intelligence/structured-history-json.ts` — Libraries and vendor support
- `app/lib/navigation/ask-composer-focus.tsx` — Libraries and vendor support
- `app/lib/navigation/ask-request-activity.ts` — Libraries and vendor support

### Shared pet intelligence and governance (80)

Semantic frames, entity/concept matching, memory policies, safety state, action governance and persistence.

- `app/lib/ai/concern-engine.ts` — Libraries and vendor support
- `app/lib/ai/concern-event-order.ts` — Libraries and vendor support
- `app/lib/ai/concern-symptoms.ts` — Libraries and vendor support
- `app/lib/ai/owner-assertion.ts` — Libraries and vendor support
- `app/lib/ai/pending-lifecycle.ts` — Libraries and vendor support
- `app/lib/ai/pet-loss.ts` — Libraries and vendor support
- `app/lib/ai/safety-temporal-scope.ts` — Libraries and vendor support
- `app/lib/ai/text-segmentation.ts` — Libraries and vendor support
- `app/lib/application-actions/capabilities.ts` — Libraries and vendor support
- `app/lib/application-actions/contracts.ts` — Libraries and vendor support
- `app/lib/application-actions/executor.ts` — Libraries and vendor support
- `app/lib/application-actions/index.ts` — Libraries and vendor support
- `app/lib/application-actions/memory-scopes.ts` — Libraries and vendor support
- `app/lib/application-actions/planner.ts` — Libraries and vendor support
- `app/lib/application-actions/policy.ts` — Libraries and vendor support
- `app/lib/application-actions/state-claims.ts` — Libraries and vendor support
- `app/lib/application-actions/types.ts` — Libraries and vendor support
- `app/lib/intelligence/build-context.ts` — Libraries and vendor support
- `app/lib/intelligence/care-history-policy.ts` — Libraries and vendor support
- `app/lib/intelligence/classify-message.ts` — Libraries and vendor support
- `app/lib/intelligence/concept-matching.ts` — Libraries and vendor support
- `app/lib/intelligence/concern-chronology.ts` — Libraries and vendor support
- `app/lib/intelligence/context-recovery.ts` — Libraries and vendor support
- `app/lib/intelligence/entities/recent-subject-state.ts` — Libraries and vendor support
- `app/lib/intelligence/entities/resolve-turn-subject.ts` — Libraries and vendor support
- `app/lib/intelligence/entity-matching.ts` — Libraries and vendor support
- `app/lib/intelligence/episodes/types.ts` — Libraries and vendor support
- `app/lib/intelligence/feature-failure.ts` — Libraries and vendor support
- `app/lib/intelligence/feature-modes.ts` — Libraries and vendor support
- `app/lib/intelligence/governance/authorize-actions.ts` — Libraries and vendor support
- `app/lib/intelligence/governance/index.ts` — Libraries and vendor support
- `app/lib/intelligence/governance/types.ts` — Libraries and vendor support
- `app/lib/intelligence/index.ts` — Libraries and vendor support
- `app/lib/intelligence/logging.ts` — Libraries and vendor support
- `app/lib/intelligence/memory-freshness.ts` — Libraries and vendor support
- `app/lib/intelligence/memory-integrity.ts` — Libraries and vendor support
- `app/lib/intelligence/memory-lifecycle/filter-conversation.ts` — Libraries and vendor support
- `app/lib/intelligence/memory-policy.ts` — Libraries and vendor support
- `app/lib/intelligence/memory-sources.ts` — Libraries and vendor support
- `app/lib/intelligence/memory-suggestion.ts` — Libraries and vendor support
- `app/lib/intelligence/persist-learnings.ts` — Libraries and vendor support
- `app/lib/intelligence/persist-pending-suggestion.ts` — Libraries and vendor support
- `app/lib/intelligence/persistence-destination.ts` — Libraries and vendor support
- `app/lib/intelligence/persistence-partition.ts` — Libraries and vendor support
- `app/lib/intelligence/pet-identity-persistence-policy.ts` — Libraries and vendor support
- `app/lib/intelligence/pet-state/types.ts` — Libraries and vendor support
- `app/lib/intelligence/preference-semantics.ts` — Libraries and vendor support
- `app/lib/intelligence/recovery-governance.ts` — Libraries and vendor support
- `app/lib/intelligence/response-rendering.ts` — Libraries and vendor support
- `app/lib/intelligence/retrieve-context.ts` — Libraries and vendor support
- `app/lib/intelligence/run-feature-intelligence.ts` — Libraries and vendor support
- `app/lib/intelligence/run-intelligence.ts` — Libraries and vendor support
- `app/lib/intelligence/safety-state.ts` — Libraries and vendor support
- `app/lib/intelligence/schemas.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-event-persistence.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-events.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/extract-frame.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/extract-turn-subject.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/ground-evidence.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/normalize-claim-kind.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/recover-owner-preference.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/schema.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/types.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-frame/validate-evidence.ts` — Libraries and vendor support
- `app/lib/intelligence/semantic-observability.ts` — Libraries and vendor support
- `app/lib/intelligence/types.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/concepts/normalize.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/governance/deduplicate.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/governance/entities.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/governance/evidence.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/governance/govern-turn.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/governance/persistence.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/governance/temporal.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/lifecycle/compatibility.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/observability.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/projections/legacy-memory.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/projections/rebuild.ts` — Libraries and vendor support
- `app/lib/intelligence/v2/types.ts` — Libraries and vendor support
- `app/lib/intelligence/validation/index.ts` — Libraries and vendor support
- `app/lib/intelligence/validation/validate-answer.ts` — Libraries and vendor support

### Security and request protection (61)

Abuse protection, recent authentication, request boundaries, rate limits and idempotency.

- `app/lib/security/account-password-change.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/captcha.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/config.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/email.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/index.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/keys.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/limiter.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/logging.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/login-captcha.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/memory-recovery-authorization-store.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/memory-recovery-handoff-store.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/memory-test-store.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/origin.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/password.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-authorization-types.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-authorization.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-callback.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-completion.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-confirmation.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-continuation.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-fragment.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-handoff-core.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-handoff-types.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-handoff.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-secrets.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/recovery-session-cleanup.mjs` — Libraries and vendor support
- `app/lib/security/auth-abuse/redis-store.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/responses.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/turnstile-siteverify.ts` — Libraries and vendor support
- `app/lib/security/auth-abuse/types.ts` — Libraries and vendor support
- `app/lib/security/bounded-raw-body.ts` — Libraries and vendor support
- `app/lib/security/headers/content-security-policy.ts` — Libraries and vendor support
- `app/lib/security/headers/origin-policy.ts` — Libraries and vendor support
- `app/lib/security/headers/security-headers.ts` — Libraries and vendor support
- `app/lib/security/idempotency/admin-client.ts` — Libraries and vendor support
- `app/lib/security/idempotency/claim-recovery.ts` — Libraries and vendor support
- `app/lib/security/idempotency/client.ts` — Libraries and vendor support
- `app/lib/security/idempotency/errors.ts` — Libraries and vendor support
- `app/lib/security/idempotency/index.ts` — Libraries and vendor support
- `app/lib/security/idempotency/logging.ts` — Libraries and vendor support
- `app/lib/security/idempotency/operation.ts` — Libraries and vendor support
- `app/lib/security/idempotency/payload-hash.ts` — Libraries and vendor support
- `app/lib/security/idempotency/request-key.ts` — Libraries and vendor support
- `app/lib/security/idempotency/store.ts` — Libraries and vendor support
- `app/lib/security/idempotency/types.ts` — Libraries and vendor support
- `app/lib/security/logging.ts` — Libraries and vendor support
- `app/lib/security/password-capability-admin.ts` — Libraries and vendor support
- `app/lib/security/private-routes.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/concurrency.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/config.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/errors.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/index.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/keys.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/logging.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/memory-test-adapter.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/rate-limit.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/redis-adapter.ts` — Libraries and vendor support
- `app/lib/security/rate-limit/types.ts` — Libraries and vendor support
- `app/lib/security/recent-auth.ts` — Libraries and vendor support
- `app/lib/security/recent-interactive-auth.mjs` — Libraries and vendor support
- `app/lib/security/request.ts` — Libraries and vendor support

### Authentication and account (46)

Sign-in, signup, password flows, account/settings screens and account APIs.

- `app/account/layout.tsx` — Pages, components and styling
- `app/account/page.tsx` — Pages, components and styling
- `app/api/account/change-password/route.ts` — API routes
- `app/api/account/delete/route.ts` — API routes
- `app/api/account/detect-country/route.ts` — API routes
- `app/api/account/export/route.ts` — API routes
- `app/api/account/product-country/route.ts` — API routes
- `app/api/auth/account-route/route.ts` — API routes
- `app/api/auth/login-otp/start/route.ts` — API routes
- `app/api/auth/login/route.ts` — API routes
- `app/api/auth/oauth/route.ts` — API routes
- `app/api/auth/recovery/continue/route.ts` — API routes
- `app/api/auth/recovery/route.ts` — API routes
- `app/api/auth/resend/route.ts` — API routes
- `app/api/auth/signup/route.ts` — API routes
- `app/api/auth/update-password/route.ts` — API routes
- `app/api/auth/verify-email-otp/route.ts` — API routes
- `app/auth/callback/route.ts` — API routes
- `app/components/account-access.tsx` — Pages, components and styling
- `app/components/account-settings-shell.tsx` — Pages, components and styling
- `app/components/account-utility.tsx` — Pages, components and styling
- `app/components/turnstile-challenge.tsx` — Pages, components and styling
- `app/forgot-password/layout.tsx` — Pages, components and styling
- `app/forgot-password/page.tsx` — Pages, components and styling
- `app/forgot-password/password-email-form.tsx` — Pages, components and styling
- `app/lib/account-country` — Libraries and vendor support
- `app/lib/account-country.ts` — Libraries and vendor support
- `app/lib/auth-email-otp.ts` — Libraries and vendor support
- `app/lib/auth-identity.ts` — Libraries and vendor support
- `app/lib/auth-routing.ts` — Libraries and vendor support
- `app/lib/auth-session.ts` — Libraries and vendor support
- `app/lib/authenticated-api-core.ts` — Libraries and vendor support
- `app/lib/authenticated-api-server.ts` — Libraries and vendor support
- `app/lib/google-auth-client.ts` — Libraries and vendor support
- `app/lib/password-capability.ts` — Libraries and vendor support
- `app/lib/sign-out.ts` — Libraries and vendor support
- `app/lib/turnstile-explicit-execution.ts` — Libraries and vendor support
- `app/login/layout.tsx` — Pages, components and styling
- `app/login/page.tsx` — Pages, components and styling
- `app/reset-password/confirm/layout.tsx` — Pages, components and styling
- `app/reset-password/confirm/page.tsx` — Pages, components and styling
- `app/settings/data-privacy/page.tsx` — Pages, components and styling
- `app/settings/layout.tsx` — Pages, components and styling
- `app/settings/security/page.tsx` — Pages, components and styling
- `app/update-password/layout.tsx` — Pages, components and styling
- `app/update-password/page.tsx` — Pages, components and styling

### Pet profiles and onboarding (29)

Creating and editing pets, profile form state, pet selection, media and onboarding.

- `app/api/pets/[id]/route.ts` — API routes
- `app/api/pets/route.ts` — API routes
- `app/components/local-photo.tsx` — Pages, components and styling
- `app/components/pet-limit-screen.tsx` — Pages, components and styling
- `app/components/simple-pet-profile-form.tsx` — Pages, components and styling
- `app/dogs/[id]/edit/page.tsx` — Pages, components and styling
- `app/dogs/layout.tsx` — Pages, components and styling
- `app/lib/active-pet.ts` — Libraries and vendor support
- `app/lib/local-pet-media.ts` — Libraries and vendor support
- `app/lib/onboarding-drafts.ts` — Libraries and vendor support
- `app/lib/pet-delete-client-state.ts` — Libraries and vendor support
- `app/lib/pet-lifecycle.ts` — Libraries and vendor support
- `app/lib/pet-limit.ts` — Libraries and vendor support
- `app/lib/pet-profile-api-server.ts` — Libraries and vendor support
- `app/lib/pet-profile-editing.ts` — Libraries and vendor support
- `app/lib/pet-profile-file.ts` — Libraries and vendor support
- `app/lib/pets-directory.ts` — Libraries and vendor support
- `app/lib/petwise` — Libraries and vendor support
- `app/lib/petwise.ts` — Libraries and vendor support
- `app/onboarding/initialization-key.ts` — Pages, components and styling
- `app/onboarding/layout.tsx` — Pages, components and styling
- `app/onboarding/onboarding-surface.tsx` — Pages, components and styling
- `app/onboarding/page.tsx` — Pages, components and styling
- `app/onboarding/weight-warning.ts` — Pages, components and styling
- `app/pets/[id]/edit/page.tsx` — Pages, components and styling
- `app/pets/[id]/loading.tsx` — Pages, components and styling
- `app/pets/[id]/page.tsx` — Pages, components and styling
- `app/pets/layout.tsx` — Pages, components and styling
- `app/pets/page.tsx` — Pages, components and styling

### History and saved memories (23)

Care-entry UI/APIs, archives, memory management and historical saved-data compatibility.

- `app/api/care-entries/[id]/route.ts` — API routes
- `app/api/care-entries/route.ts` — API routes
- `app/api/legacy-memories/route.ts` — API routes
- `app/api/memories/[id]/route.ts` — API routes
- `app/care-log/layout.tsx` — Pages, components and styling
- `app/care-log/page.tsx` — Pages, components and styling
- `app/components/care-entry-form.tsx` — Pages, components and styling
- `app/components/care-entry-metadata.tsx` — Pages, components and styling
- `app/components/care-log-workspace.tsx` — Pages, components and styling
- `app/components/care-timeline.tsx` — Pages, components and styling
- `app/components/history-archive.tsx` — Pages, components and styling
- `app/dogs/[id]/care/page.tsx` — Pages, components and styling
- `app/dogs/[id]/memories/page.tsx` — Pages, components and styling
- `app/history/layout.tsx` — Pages, components and styling
- `app/history/page.tsx` — Pages, components and styling
- `app/lib/care-entry-api-server.ts` — Libraries and vendor support
- `app/lib/care-log.mjs` — Libraries and vendor support
- `app/lib/effective-history.ts` — Libraries and vendor support
- `app/lib/history-archive.ts` — Libraries and vendor support
- `app/lib/pet-memory.ts` — Libraries and vendor support
- `app/lib/remembered-details.ts` — Libraries and vendor support
- `app/pets/[id]/care/page.tsx` — Pages, components and styling
- `app/pets/[id]/memories/page.tsx` — Pages, components and styling

### Shared UI and navigation (20)

App shell, reusable components, navigation, styling and shared visual support.

- `app/components/action-visual-audit.tsx` — Pages, components and styling
- `app/components/app-header.tsx` — Pages, components and styling
- `app/components/app-page.tsx` — Pages, components and styling
- `app/components/authenticated-app-chrome.tsx` — Pages, components and styling
- `app/components/brand-mark.tsx` — Pages, components and styling
- `app/components/overflow-menu.tsx` — Pages, components and styling
- `app/components/private-route-layout.tsx` — Pages, components and styling
- `app/components/product-primitives.tsx` — Pages, components and styling
- `app/components/signed-in-header.tsx` — Pages, components and styling
- `app/components/workflow-primitives.tsx` — Pages, components and styling
- `app/favicon.ico` — Pages, components and styling
- `app/globals.css` — Pages, components and styling
- `app/layout.tsx` — Pages, components and styling
- `app/lib/navigation/app-data-freshness.ts` — Libraries and vendor support
- `app/lib/navigation/mobile-navigation.ts` — Libraries and vendor support
- `app/lib/navigation/use-mobile-liquid-glass.ts` — Libraries and vendor support
- `app/lib/vendor/liquidglass/README.md` — Libraries and vendor support
- `app/lib/vendor/liquidglass/index.d.ts` — Libraries and vendor support
- `app/lib/vendor/liquidglass/index.js` — Libraries and vendor support
- `app/lib/visual-system.ts` — Libraries and vendor support

### AI usage and cost controls (16)

Provider admission, call budgets, token/cost accounting and usage ledgers. Distinct from customer subscriptions.

- `app/lib/ai/ask-admission-settlement.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/admission.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/classification.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/config.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/context.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/cost-estimator.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/daily-usage-store.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/errors.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/features.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/logging.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/memory-test-store.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/operation-identity.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/provider-call-budget.ts` — Libraries and vendor support
- `app/lib/ai/usage-guard/types.ts` — Libraries and vendor support
- `app/lib/ai/usage-ledger-admin.ts` — Libraries and vendor support
- `app/lib/ai/usage-ledger.ts` — Libraries and vendor support

### Billing and membership (16)

Subscriptions, checkout, Stripe webhooks, entitlements, plan limits and membership UI.

- `app/api/account/entitlements/route.ts` — API routes
- `app/api/billing/checkout/route.ts` — API routes
- `app/api/billing/portal/route.ts` — API routes
- `app/api/billing/webhook/route.ts` — API routes
- `app/lib/billing/account-deletion.ts` — Libraries and vendor support
- `app/lib/billing/billing-admin.ts` — Libraries and vendor support
- `app/lib/billing/billing-market.ts` — Libraries and vendor support
- `app/lib/billing/billing-presentation.ts` — Libraries and vendor support
- `app/lib/billing/entitlement-types.ts` — Libraries and vendor support
- `app/lib/billing/entitlements.ts` — Libraries and vendor support
- `app/lib/billing/launch-plans.ts` — Libraries and vendor support
- `app/lib/billing/plan-limits.ts` — Libraries and vendor support
- `app/lib/billing/stripe-projection.ts` — Libraries and vendor support
- `app/lib/billing/stripe-server.ts` — Libraries and vendor support
- `app/membership/layout.tsx` — Pages, components and styling
- `app/membership/page.tsx` — Pages, components and styling

### Vet Brief (16)

Brief preparation, validation, saved briefs, document display, PDFs and draft isolation.

- `app/api/vet-briefs/[id]/pdf/route.ts` — API routes
- `app/api/vet-briefs/[id]/route.ts` — API routes
- `app/api/vet-briefs/draft/route.ts` — API routes
- `app/api/vet-briefs/route.ts` — API routes
- `app/components/vet-brief-document.tsx` — Pages, components and styling
- `app/lib/intelligence/vet-brief.ts` — Libraries and vendor support
- `app/lib/vet-brief/builder.ts` — Libraries and vendor support
- `app/lib/vet-brief/client-drafts.ts` — Libraries and vendor support
- `app/lib/vet-brief/pdf.ts` — Libraries and vendor support
- `app/lib/vet-brief/schema.ts` — Libraries and vendor support
- `app/lib/vet-brief/server.ts` — Libraries and vendor support
- `app/lib/vet-brief/types.ts` — Libraries and vendor support
- `app/vet-brief/layout.tsx` — Pages, components and styling
- `app/vet-brief/page.tsx` — Pages, components and styling
- `app/vet-briefs/[id]/print/page.tsx` — Pages, components and styling
- `app/vet-briefs/layout.tsx` — Pages, components and styling

### Platform and operations (13)

Operational events, readiness/health endpoints, configuration, monitoring and build/deployment setup.

- `app/api/health/route.ts` — API routes
- `app/api/readiness/route.ts` — API routes
- `app/global-error.tsx` — Pages, components and styling
- `app/lib/operations/admin-client.ts` — Libraries and vendor support
- `app/lib/operations/events/index.ts` — Libraries and vendor support
- `app/lib/operations/events/logger.ts` — Libraries and vendor support
- `app/lib/operations/events/redaction.ts` — Libraries and vendor support
- `app/lib/operations/events/types.ts` — Libraries and vendor support
- `app/lib/operations/production-config.ts` — Libraries and vendor support
- `app/lib/operations/readiness.ts` — Libraries and vendor support
- `app/lib/operations/sentry-privacy.ts` — Libraries and vendor support
- `app/lib/operations/support-reference.ts` — Libraries and vendor support
- `app/lib/operations/user-data-export.ts` — Libraries and vendor support

### Marketing and legal (8)

Homepage, legal pages, SEO and public-facing brand content.

- `app/components/homepage-client.tsx` — Pages, components and styling
- `app/components/legal-page-shell.tsx` — Pages, components and styling
- `app/lib/seo.ts` — Libraries and vendor support
- `app/page.tsx` — Pages, components and styling
- `app/privacy/page.tsx` — Pages, components and styling
- `app/robots.ts` — Pages, components and styling
- `app/sitemap.ts` — Pages, components and styling
- `app/terms/page.tsx` — Pages, components and styling

### Products and compatibility (8)

Products placeholder, product feedback, retained safety policy and Results redirect. Not a live catalogue engine.

- `app/api/product-feedback/route.ts` — API routes
- `app/dogs/[id]/feedback/page.tsx` — Pages, components and styling
- `app/lib/intelligence/product-safety.ts` — Libraries and vendor support
- `app/pets/[id]/feedback/page.tsx` — Pages, components and styling
- `app/results/layout.tsx` — Pages, components and styling
- `app/results/page.tsx` — Pages, components and styling
- `app/shop/layout.tsx` — Pages, components and styling
- `app/shop/page.tsx` — Pages, components and styling

### Today (6)

Today screen and daily care view; includes the legacy dashboard redirect.

- `app/dashboard/layout.tsx` — Pages, components and styling
- `app/dashboard/page.tsx` — Pages, components and styling
- `app/lib/today.ts` — Libraries and vendor support
- `app/today/layout.tsx` — Pages, components and styling
- `app/today/page.tsx` — Pages, components and styling
- `app/today/today.module.css` — Pages, components and styling

### Database and data access (5)

Shared Supabase access plus migrations, SQL assertions and database configuration.

- `app/lib/intelligence/care-authority-client.ts` — Libraries and vendor support
- `app/lib/supabase.ts` — Libraries and vendor support
- `app/lib/supabase/account-route-admin.ts` — Libraries and vendor support
- `app/lib/supabase/proxy.ts` — Libraries and vendor support
- `app/lib/supabase/server.ts` — Libraries and vendor support

### Shared voice and output (2)

The two shared presentation owners: language/instructions and public response formats/messages.

- `app/lib/furvise-output.ts` — Libraries and vendor support
- `app/lib/furvise-voice.ts` — Libraries and vendor support
