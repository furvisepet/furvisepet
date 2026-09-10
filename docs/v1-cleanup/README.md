# Repository cleanup audit

Base: `1cf5da2` (`origin/main`, September 10, 2026). Branch:
`codex/repository-v1-cleanup`. Work occurred in a separate worktree. The original
checkout's deleted images, untracked scripts, QA output and local state were not
included or modified. No deployment, merge, paid AI benchmark or live data
mutation was performed.

## Scope and method

The [feature inventory](feature-inventory.md) covers the whole application and
operations. [file-classification.csv](file-classification.csv) contains one row
for every base tracked path and every added path, including removed and relocated
paths. `current_path` distinguishes a deletion from an archive move. Hashes refer
to the scanned working-tree bytes; generated audit artifacts omit their own hashes
to avoid recursive content changes.

Every base tracked file was read by the inventory scanner: JavaScript/TypeScript
and extensionless bridges through the TypeScript AST; SQL, docs, fixtures and
configuration through content/reference scans; binary assets through byte hashes,
type/size and URL-reference checks. Candidate deletions and their callers were
then reviewed in source, including framework conventions, script dispatch and
tests. This is a complete structural classification, **not a claim of a manual
line-by-line security review of every file, visual review of every image/PDF, or
proof that dynamic/external callers cannot exist**. Uncertain items are retained.

[dependency-map.json](dependency-map.json) records imports/re-exports/type and
literal dynamic imports, framework roots, HTTP URLs/templates, RPCs, table
names, SQL declarations/references, script/config/asset references and environment
keys. The map is a base snapshot so reviewers can inspect removed paths too.
It contains names/paths, not environment values or user records. Dynamic SQL,
computed imports, generated asset paths and external callers still require source
and operational interpretation; lexical references are conservative evidence, not
executable reachability. An import count alone was never used to delete a file.

Re-run the read-only scanner from the repository root with:
`node scripts/audits/repository-inventory.mjs > <local-output.json>`.
It imports no application modules and makes no network/database requests. The
classification CSV is a reviewed snapshot, not an automatic deletion list.

## Changes and evidence

| Removed path | Evidence; callers and preserved behavior |
|---|---|
| `app/components/back-button.tsx` | `BackButton` has no imports, references or mounted JSX callers; current navigation is in app/header/account controls. Not a framework entry point. |
| `app/components/onboarding-steps.tsx` | `OnboardingSteps` has no callers; Quick Start renders `OnboardingSurface` and its own four-step controls. |
| `app/lib/ai/response-generator.ts` | Uncalled forwarding wrapper `generateAskResponse`; active intelligence calls `generateContextAwareAskResponse` directly. Provider budgets and reasoning remain. |
| `app/lib/catalog-ingestion/adapters/internal-curated-adapter.ts` | Class never imported or dispatched. CLI selects CSV/JSON/Purina/authorized/organic adapters; seed has its own supported entry point. No catalogue behavior removed. |
| `app/lib/navigation/safe-back.ts` | `canUseSameSiteNavigationHistory` has no callers or test imports. No route/config discovery mechanism targets it. |
| `app/lib/ai/usage-guard/index.ts` | Unused barrel; all callers import concrete admission/config/budget modules. Those safeguards remain. |
| `app/lib/intelligence/episodes/index.ts` | Unused barrel; direct implementation/type imports and SQL-backed behavior retained. |
| `app/lib/intelligence/memory-freshness/index.ts` | Unused barrel; direct freshness policy/calculation/selection imports retained. |
| `app/lib/intelligence/pet-state/index.ts` | Unused barrel; state types, reducers and tests retained. |
| `app/lib/intelligence/v2/index.ts` | Unused barrel; actual canonical and optional shadow callers use concrete modules. No V2 implementation removed. |
| `app/lib/security/headers/index.ts` | Unused barrel; config/proxy/tests import concrete policy/header modules. Security headers retained. |
| `app/components/app-footer.tsx` | No mounted caller; active homepage has `MarketingFooter`, legal pages their own shell. Only obsolete source assertions referenced this component. Active privacy/terms and signed-in/out footer tests remain. |
| `app/components/pet-overflow-menu.tsx` | No mounted caller; pet directory explicitly omits this old management menu. Active profile lifecycle controls, account utility and shared overflow implementation remain. Only this component's source assertions retired. |
| `app/components/today-greeting.tsx` | No JSX/import caller in current Today. Its unused hook wrapper removed; greeting formatter and domain tests retained. |
| `app/lib/action-copy.ts` | No consumer of `ACTION_COPY` or `askAboutPet`; current pages render their own labels. Active pet-action label tests remain. |
| `tests/shop-page-source.test.mjs` | Sole test asserted headings in the unmounted Results screen. Removed with that retired implementation; product absence and the live redirect remain covered by catalogue tests and the new mounted redirect tests. |

`app/results/page.tsx` remains a client redirect under its unchanged private
layout. Its default export mounted only `ResultsRedirect`; the 1,360-line
`ResultsPageContent` and helpers were kept alive solely by `void ResultsPageContent`
and stale source assertions. They had no exports or rendered callers. Removing
them cannot remove the already-retired screen from the current user flow.
Three new tests mount the actual redirect with isolated hooks, check selected-pet
and untrusted-ID handling, and retain the private/no-index contract. Five whole
tests and two assertions tied to the retired Results implementation were removed;
pet authorization/RLS, safety API and current-flow tests were retained.

The later retired-UI commit removes one whole obsolete pet-menu source test plus
assertions solely about the four removed modules. Assertions for active menus,
homepage footer, navigation geometry and action labels retain their expectations.
No expected result was relaxed to pass a remaining behavior test.

## Consolidation and preservation

- Fifteen duplicate `.gitignore` rules were removed, keeping their last occurrence
  and override order. A 1,490-path comparison against base confirmed equivalent
  matching except intentional `/tmp/`, `__pycache__/` and `*.pyc` additions.
- Twelve historical files moved from `tmp/` to `docs/archive/pre-v1-cleanup/`
  with identical bytes. Old references inside reports were not rewritten.
- README now describes actual development, offline tests, database setup and
  operational entry points instead of generic create-next-app instructions.
- No npm dependency was removed. All 10 runtime and 9 development dependencies
  have concrete uses; package and lock files are unchanged. Framework-transitive
  modules such as `@next/env` are also used by scripts and are not separately
  removable from the Next dependency tree.
- All migrations, public assets, benchmark evidence, sample PDFs and SQL test
  files remain unchanged. The partial historical `supabase/schema.sql` remains
  for reference; README explicitly excludes it as a complete setup path.
- Extensionless `app/lib/*` bridges are intentional Node test/runtime resolution
  compatibility, not duplicate implementations. They remain.
- No runtime auth, billing, entitlement, rate/concurrency, cancellation, safety,
  provenance, correction or persistence code was rewritten.

## Resulting architecture and dependency decisions

Next pages/layouts/proxy form the UI and request entry layer. Authenticated API
boundaries and Supabase RLS/RPCs enforce tenant and mutation authority. Ask flows
through admission and idempotency, typed interpretation, bounded historical
retrieval, governed generation, evidence validation/publication and persisted
conversation/credit settlement. Vet Brief composes recorded facts into a document
and PDF. Catalogue APIs and operator ingestion remain behind the placeholder
Products UI. Stripe projects subscription events into authoritative entitlements;
Redis provides transient abuse/concurrency/spending state. Sentry and protected
readiness support operations.

| Dependency | Retained use |
|---|---|
| `next`, `react`, `react-dom` | Framework, UI rendering, portals and isolated DOM verification |
| `@supabase/ssr`, `@supabase/supabase-js` | Cookie/session clients, authenticated data/RPCs and operator tooling |
| `@upstash/redis` | Rate, concurrency, recovery, daily guard and emergency state |
| `openai` | Admitted/mocked provider implementations for Ask and retained feature endpoints |
| `pdf-lib` | Vet Brief PDF generation and samples |
| `stripe` | Checkout/portal and webhook subscription projection |
| `@sentry/nextjs` | Framework instrumentation, privacy-filtered monitoring and optional artifact upload |
| `typescript`, three `@types/*` packages | Typecheck, React/Node declarations and existing test transpilation |
| `eslint`, `eslint-config-next` | Required lint workflow |
| `tailwindcss`, `@tailwindcss/postcss` | CSS compilation |
| `supabase` | Local/linked CLI operations and migration tooling |

Counts and raw validation outcomes are in [metrics.json](metrics.json) and
[validation.json](validation.json). File counts include *all tracked paths*,
including archives, lockfiles, assets and this audit. Lockfile package counts
exclude the root package entry and include platform-specific optional packages;
they are not the count installed on this Windows host.

## Validation and limits

The base suite passed 2,511 Node tests. An initial preload used a relative URL,
causing four temporary-directory child-process failures; all passed with an
absolute offline guard, without test changes. The final suite and required
checks are recorded in `validation.json`; the net test-count change is
minus six retired tests plus three redirect tests. Lint's 39 existing audit-script
warnings are preserved rather than hidden.

All 102 migrations applied in order to a new, task-owned PGlite 0.5.8 database
(PostgreSQL 18.3/WASM) with synthetic Supabase Auth scaffolding. Seven SQL suites
and the actual writer/reader/Ask-generation callback passed. This verifies the
fresh application migration chain and exercises historical definitions followed
by their upgrades. Migration bytes are unchanged, so this cleanup introduces no
additional existing-install migration requirement. It does **not** verify the
deployed ledger, arbitrary preexisting customer data, native Postgres concurrency,
PostgREST, pgTAP or production Supabase Auth parity.

A supplemental attempt to run every SQL test sequentially in that disposable
database completed 17 suites (12 passed, 5 failed), then was stopped after slow
execution (the lexical plan probe alone took 93 seconds). Failures include an outdated `reserve_ai_credit` signature,
a fixture missing `logical_request_id`, unavailable pgTAP `extensions.plan`, and
an authority assertion. They are recorded, not silently skipped or called passed.
The remaining 32 suites did not complete in this supplemental run. A dedicated
isolated native Postgres/pgTAP run is still needed to resolve schema/test-version
compatibility; no SQL assertions or migrations were changed.

Isolated Chrome memory-management and Ask conversation/reload fixtures passed.
The separate presentation snapshot fixture fails `Two-point layout lost after
reload/render` both here and in a detached untouched base worktree with the same
dependencies. The cleanup does not change its 23-module rendering/fixture path.
This existing failure remains visible and should be triaged before launch.

Automatic approval review rejected the local production-server command
`npm run start -- --hostname 127.0.0.1 --port 3147`, stating only `blocked by policy`.
No alternative full-app server launch was attempted. Therefore full Next/browser
sign-in, pet creation, history write, Ask submission, Vet Brief and membership
journeys were not exercised against a running application. Their offline test
coverage remains, but it is not an end-to-end integration pass.

Live Auth/email/Google/Turnstile, Redis, Stripe checkout/webhook delivery,
catalogue provider credentials/retailer links, alerting, backup/PITR, scheduling,
deployment parity and paid AI quality were deliberately not verified or modified.
This PR is a bounded cleanup with explicit launch gaps, not launch certification.
