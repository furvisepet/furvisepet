# V1 feature inventory

Snapshot: `origin/main` at `1cf5da2`, September 10, 2026. Availability below is
established from repository entry points and rendering, not a claim that live
credentials, feature flags or external integrations were verified.

## User-facing features

| Feature | Entry points and behavior | Required supporting paths |
|---|---|---|
| Public site and legal pages | `/`, `/privacy`, `/terms`; metadata, robots, sitemap, manifest and brand artwork | `homepage-client.tsx`, `app/lib/seo.ts`, `public/`, root layout |
| Sign-in, signup and recovery | `/login`, `/forgot-password`, `/reset-password/confirm`, `/update-password`; email OTP, password capabilities and optional Google OAuth | `/api/auth/*`, `/auth/callback`, auth/session/routing helpers, Supabase clients, Turnstile and Redis abuse protection |
| Account access and settings | `/account`, `/settings/security`, `/settings/data-privacy`; password changes, export and deletion | `/api/account/*`, billing-aware deletion tombstones, recent-auth checks, private cache policy |
| Membership | `/membership`; Free/Plus entitlements, checkout, portal and payment recovery | `app/lib/billing/*`, `/api/billing/*`, `get_my_entitlements`, subscription projections, credit reservation/settlement |
| Pet onboarding | `/onboarding`; four-step Quick Start, owner-scoped draft/resume, pet limits, edit redirect | `onboarding-drafts.ts`, active-pet selection, `/api/pets`, database plan-limit trigger |
| Pets | `/pets`, `/pets/[id]`, edit/care/memories/feedback subroutes; creation, switching, lifecycle and management | `app/lib/pet-*`, `supabase.ts`, `app/dogs/[id]/*` (some remain implementations re-exported by `/pets`) |
| Today | `/today`; selected pet, present care context, recent notes and quick updates | `today.ts`, history/care loaders, freshness events, profile and care-entry API boundaries |
| History and corrections | `/history`, pet care/memories pages; create/edit/remove care entries and manage remembered details | `history-archive`, `care-log-workspace`, effective-history and canonical memory readers; `/api/care-entries`, `/api/memories`, `/api/legacy-memories` |
| Ask | `/ask`; submit, deliver responses, select pets, load/rename/delete/reload conversations, governed suggestions and actions | `/api/ask/*`, orchestrator/provider, typed interpretation, retrieval/evidence/publication, cancellation, budgets, idempotency and SQL authority |
| Vet Brief | `/vet-brief`, `/vet-briefs/[id]/print`; source-grounded draft/review/save, PDF, Letter/A4, viewing and sharing | `/api/vet-briefs/*`, deterministic builder, optional AI enrichment, draft isolation, `pdf-lib`, document renderer |
| Products placeholder | `/shop` renders authenticated **Products coming soon** with responsive artwork | Shop layout, auth guard, product hero PNGs. No search UI is mounted here. |
| Compatibility URLs | `/dashboard` redirects to Today, `/care-log` to History, `/results` to the selected pet | Redirect pages and private layouts remain. `/dogs/*` must remain because `/pets/*` re-exports implementations. |

## Operations required or retained

| Operation | Evidence and disposition |
|---|---|
| Framework deployment | Next 16.3.4, webpack scripts, proxy, metadata and instrumentation are framework-discovered roots, not dead files with zero imports. |
| CI/dependencies | GitHub workflow runs lint, typecheck, security/full tests, production audit and build; Dependabot and all 19 direct dependencies remain. |
| Database | All 102 ordered migrations and 49 SQL test files retained. RLS, grants, triggers, RPC signatures, readiness contracts and historical upgrade steps are dependencies. |
| Webhooks | Stripe `/api/billing/webhook` is externally invoked; raw-body limits, signature checks, ordering, idempotent projection and deleted-account reconciliation remain. |
| OAuth/recovery callbacks | `/auth/callback` and recovery continuation/confirmation paths are externally or browser-invoked; lack of static imports is irrelevant. |
| Health/readiness | `/api/health` and protected `/api/readiness`; capability probes and safe diagnostics retained. |
| Spending and abuse | Redis TTL-backed rate/concurrency/daily admission, HMAC identifiers, feature switches, provider budgets, database settlement and emergency controls retained. |
| Maintenance | Cleanup, integrity, account deletion reconciliation and repair scripts are documented operator entry points. `vercel.json` has no cron; no workflow schedule or verified external scheduler is present. |
| Catalogue ingestion | Package scripts dispatch CSV/JSON, provider-001, authorized upload and organic workflows with trust/publication gates. Only the never-dispatched internal-curated adapter was removed. |
| Development verification | Tests, fixtures, SQL probes, local load tooling, brand/PDF generation and sample PDFs retained. Some SQL/browser scripts require local tooling or a particular disposable container. |
| Evidence | Frozen benchmark questions, responses, grades, budgets and reports remain unchanged. Twelve former `tmp/` artifacts are archived, not discarded. |

## Product and architectural decisions left open

| ID | Specific decision needed | Preserved scope and reason |
|---|---|---|
| D1 | Is v1 Products deliberately a placeholder, or should catalogue browsing be restored? | `/shop` is coming-soon; APIs, static fallback, search, feedback, regional eligibility and ingestion remain. Older `products-navigation.md` and `catalog-architecture.md` describe behavior no longer mounted. |
| D2 | Can `/api/analyze` and `/api/safety-followup` be retired as public API contracts? | The removed results screen was already unmounted, but these are deployed endpoints with entitlements, safety and usage safeguards. Repository search cannot exclude external clients. Old provider methods and schemas remain. |
| D3 | Should the optional V2 phase-3 shadow/dual-write rollout be retired, enabled or maintained as rollback capacity? | `FURVISE_ASK_V2_PHASE3_MODE` defaults off; dual writes require tenant allowlisting. Runtime calls and shared canonical V2 types/governance remain active dependencies. Do not delete the V2 directory as a unit. |
| D4 | Is `/catalog/test-grooming-brush` still an intended public organic-catalogue destination? | It is a real framework route and an explicit validation target. Its name does not prove disuse. |
| D5 | Which legacy test-only models remain useful specifications, and which need current-path coverage before removal? | Old billing monthly-counter helpers, Ask standalone generator/harness, dashboard/profile presentation helpers and onboarding mode/field/summary helpers have tests but no traced runtime callers. Preserve requirements until coverage is migrated deliberately. |
| D6 | Should paid live benchmark orchestration and local agent queues remain supported developer tooling? | Live scripts and queues are not run. Evidence stays regardless. Some `.cases.mjs` audit scripts are invoked by ordinary offline tests and must stay. |
| D7 | Which older SQL suites should target the final schema versus their historical migration checkpoint? | Supplemental checks found obsolete signatures/fixtures and missing pgTAP support. Do not delete or weaken them to advertise a green launch. |

## Scenario-specific logic

`history-units.ts`, dimensional arithmetic, date validation, owner/pet identity,
RLS, correction provenance and quantity validation are reusable domain rules.
Catalogue unit conversion and Ask source-bound calculations have different
validation contracts. The two CSV parsers also differ in limits, accepted row
shape, CR/quoting behavior and error semantics; they are not interchangeable.

`ask-plan-recovery.ts`, `planHistoricalQuery` in `history-retrieval.ts`, and
`episode-reference-language.ts` contain finite wording/keyword heuristics for
recurrence, food, weight ordering, references and follow-ups. They are reachable
and protect tested retrieval/safety requirements. Removing them without a
replacement would strand those requirements. A separate architectural change
should move intent recovery toward typed evidence/request dimensions, evaluate
paraphrase invariance with mocked providers, and retain deterministic safety,
authorization, calculation and provenance checks. This cleanup changes none of
those answer templates, phrase rules or expected results.

`app/lib/ai/ask-furvise.ts` and old onboarding helpers are test-only code in this
snapshot, unlike the current orchestrator and Quick Start. The manifest marks
them for a coverage decision rather than conflating old tests with live behavior.
