# Furvise Phase S1 security resource inventory

Evidence date: 2026-07-29 (America/Vancouver). Evidence sources: working tree, all local migration files, linked migration history through `20260729011000`, linked `db lint`, linked table statistics, a disposable two-user REST/RPC suite (22/22 assertions), a separate normal-role service-RPC suite (18/18 denials), and Storage API bucket listing. Both disposable users were deleted after each run. This is an inventory, not a security certification.

## Inventory field profiles

Every resource row below references a profile that supplies the requested control fields. `N/A` means the control does not apply; `none` means it applies but is absent.

| Profile | Exposure; authentication | Authorization; RLS; ownership | Service role | Validation and payload limits | Idempotency; rate limit; timeout | Private-data logging | Security evidence | Default risk/action |
|---|---|---|---|---|---|---|---|---|
| PAGE-PUBLIC | public/anonymous | public content; N/A; none | no | route params only; N/A | GET; none; platform | none found | build/source review | low; retain |
| PAGE-PRIVATE | authenticated in browser with Supabase access token | client auth gate plus owner-scoped Supabase queries/RLS; `auth.uid()` ownership | no | route UUIDs generally normalized by query layer; N/A | GET/UI writes; none; client fetch timeouts vary | development-only safe diagnostics except noted local persistence | live RLS and source tests | medium; add server-side session architecture in S2 |
| API-OWNER | authenticated bearer token verified by `auth.getUser()` | explicit `user_id`/pet ownership filters plus RLS; owner UUID | no | strict top-level keys on JSON writes; dynamic UUID checks; streamed body caps (64 KiB standard/product, 384 KiB conversations/Vet Brief); bounded domain strings/arrays | write idempotency varies; monthly AI credits where AI; provider timeout varies | user-friendly response; safe metadata after S1 logging fixes | source tests and live two-user RLS | medium; S2 schema consolidation/idempotency |
| API-S1-AI | authenticated bearer verified by `auth.getUser()` | explicit owner/pet filters plus RLS | no | strict top-level keys, UUID checks, 64 KiB streamed body; Ask 1,200 chars; product query 240, question 320 | request UUID + credit ledger where applicable; no distributed rate limit; provider 20–25 s, overall Ask 50 s | safe metadata; no raw output in production | `security-phase-s1.test.mjs`; live ownership tests | low/medium; S2 rate/concurrency controls |
| API-S1-VET | authenticated bearer verified by `auth.getUser()` | owner/pet/conversation/source IDs rechecked plus RLS | no | strict keys; 384 KiB body; UUIDs; 730-day range; reason 1,200; document text 1,200, notes 4,000, arrays 80, source IDs 300; DB JSON 256 KiB | request UUID credit idempotency for generation; no distributed limiter; provider 25 s | safe event counts only | source tests and live cross-user Vet Brief denial | low/medium; S2 rate control |
| DB-OWNER | authenticated | RLS enabled; policies bind `user_id = auth.uid()` and pet relationships; owner UUID columns | migrations/scripts only where stated | DB checks/FKs; table-specific caps | unique keys where stated; N/A; statement timeout deployment | DB does not log application payloads by repo evidence | live two-user negative reads for priority tables | low/medium; retain/test continuously |
| DB-CATALOG | anonymous/authenticated read of approved active catalog | RLS enabled; active/published/market policies, no user ownership | service role writes ingestion | DB constraints and ingestion validation | natural/unique keys; N/A | no application private data | migration inspection; linked relation observed | low; retain |
| DB-SERVICE | service only | RLS enabled; anon/auth revoked; pipeline ownership/audit columns | yes | DB constraints/raw payload bounds | batch/event keys; N/A | ingestion data may contain provider payloads; service scripts only | grant migration inspection | medium; keep out of app runtime |
| RPC-USER | authenticated | `SECURITY DEFINER`, fixed `search_path = public, pg_temp`, `auth.uid()` canonical and linked-owner checks | no | typed args; JSON actions bounded/validated in function | request/source unique keys and locks where relevant | errors use stable codes | live client-user-ID override denial | low/medium; retain |
| RPC-SERVICE | service role only | `SECURITY DEFINER`, fixed search path, public/anon/authenticated execute revoked | yes | typed args; repair dry-run default | repair-specific; N/A | scripts may print sanitized result counts | live anon/auth denial for four repair/diagnostic RPCs | low; retain |
| TRIGGER | invoked only by database trigger | fixed search path where definer; direct execute revoked for sensitive triggers | internal | row/FK/check validation | transaction atomic | none | migration inspection | low/medium; verify advisors when accessible |
| ASSET | public anonymous immutable/static | none; N/A | no | build-time file | GET; CDN | none | file inventory | low; retain |
| SCRIPT | operator/service only | local invocation and service key; RPC grants enforce service boundary | yes where stated | CLI args/provider validation varies | dry-run defaults on repair; none; provider timeouts only ingestion fetch | counts and diagnostic records; integrity script can print private issue details | source review | high operational; never expose as route |

## Next.js pages

| Path | Purpose | Profile | Risk | Required action |
|---|---|---:|---:|---|
| `/` | marketing/home | PAGE-PUBLIC | low | none |
| `/privacy`, `/terms` | legal content | PAGE-PUBLIC | low | deployment legal review |
| `/login`, `/forgot-password`, `/update-password`, `/auth/callback` | auth lifecycle | PAGE-PUBLIC | medium | callback redirect verified local; Dashboard redirect allowlist remains deployment-only |
| `/onboarding` | create/edit pet | PAGE-PRIVATE | medium | RLS and plan-limit trigger retained |
| `/dashboard`, `/today` (redirect) | private overview | PAGE-PRIVATE | medium | private cache headers in S2 |
| `/pets`, `/pets/[id]`, `/pets/[id]/edit`, `/pets/[id]/care`, `/pets/[id]/feedback`, `/pets/[id]/memories` | canonical pet workspace | PAGE-PRIVATE | medium | retain owner queries; direct URL negative tests |
| `/dogs/[id]/edit`, `/dogs/[id]/care`, `/dogs/[id]/feedback`, `/dogs/[id]/memories` | legacy pet aliases/workspaces | PAGE-PRIVATE | medium | do not remove until redirects/data compatibility are retired |
| `/care-log`, `/ask`, `/results`, `/shop` | care, AI and recommendations | PAGE-PRIVATE | medium | S2 rate/concurrency guard |
| `/vet-brief`, `/vet-briefs/[id]/print` | draft/print Vet Brief | PAGE-PRIVATE | medium | print fetch owner-checked; avoid public caching |

No root `proxy.ts`, `middleware.ts`, Server Action (`"use server"`), webhook route, scheduled function, or diagnostic HTTP route exists.

## Route handlers

| Route/method | Purpose | Profile/limits | Idempotency | Risk and required action |
|---|---|---|---|---|
| `/api/ask` GET/POST | usage and Ask orchestration | API-S1-AI | required valid request UUID; DB unique replay | medium; S2 distributed rate/concurrency/spend guard |
| `/api/analyze` POST | legacy care-plan analysis | API-S1-AI (64 KiB; provider 25 s; output 1,600) | generated UUID if absent, credit ledger | medium; strict nested schema in S2 |
| `/api/safety-followup` POST | follow-up safety reasoning | API-S1-AI (64 KiB; answers/questions parsed and capped by parsers; output 650) | request UUID/credit ledger | medium; document exact answer caps in S2 |
| `/api/shop/interpret-query` GET/POST | product intent | API-S1-AI (query 240; output configured by feature) | request UUID + cache/credit ledger | medium; S2 follow-up-session counter |
| `/api/shop/explain-product-fit` POST | fit explanation | API-S1-AI (query 240) | request UUID + credit ledger | medium; S2 rate control |
| `/api/shop/product-question` GET/POST | product follow-up | API-S1-AI (query 240, question 320) | request UUID + credit ledger | medium; S2 max rounds |
| `/api/shop/catalog` POST | authorized catalog search | API-OWNER (64 KiB, strict keys, pet UUID, query 240; result 60) | read | low/medium; S2 distributed rate control |
| `/api/ask/conversations` GET/POST | list/legacy save | API-OWNER (384 KiB; strict keys; list/messages 40; user text 1,200; DB JSON caps) | no write key | high deferred: add write idempotency |
| `/api/ask/conversations/[id]` GET/PATCH/DELETE | open/rename/delete | API-OWNER (UUID; PATCH 64 KiB strict keys; title 80) | DELETE naturally owner-filtered | low/medium; retain owner checks |
| `/api/ask/conversations/[id]/messages` POST | append legacy exchange | API-OWNER (UUID; 384 KiB strict keys; question 1,200; DB unique sequence) | no request key | high deferred: concurrency-safe append/idempotency |
| `/api/ask/suggestions/[id]` PATCH | apply/edit/dismiss suggestion | API-OWNER + S1 64 KiB/strict keys/UUID/details 1,000 | RPC/unique effect keys | low/medium |
| `/api/memories/[id]` PATCH | confirm/edit/forget memory | API-OWNER + S1 64 KiB/strict keys/UUID/value 500 | lifecycle idempotency | low |
| `/api/vet-briefs/draft` POST | generate/refresh draft | API-S1-VET | request UUID/credit ledger | medium; S2 rate control |
| `/api/vet-briefs` GET/POST | history/confirm brief | API-S1-VET | version unique; POST lacks client idempotency key | medium; S2 confirm idempotency |
| `/api/vet-briefs/[id]` GET | fetch brief | API-OWNER; owner + ID | read | low |
| `/api/vet-briefs/[id]/pdf` GET | render PDF | API-OWNER; private/no-store; nosniff | read | low; rendering timeout in S2 |
| `/api/account/detect-country` POST | save inferred country | API-OWNER; header-derived enum | upsert on user ID | low |

## Database relations

The linked project reported all 38 tables below in `public`. Migration extraction found 42 distinct function names and 22 trigger names. No public view or materialized view appears in the migrations or linked table statistics.

| Relations | Purpose/profile | RLS/ownership and action |
|---|---|---|
| `dog_profiles`, `user_profiles` | canonical pet/account; DB-OWNER | RLS; `user_id`; plan trigger; live cross-user profile denial passed |
| `dog_memories`, `dog_product_feedback`, `pet_care_entries` | legacy memories/feedback and immutable care history; DB-OWNER | RLS; `user_id` + pet FK; live care denial passed; immutable-history semantics are application/RPC-governed, direct legacy update/delete grants remain a high design review |
| `pet_concerns`, `pet_care_episodes`, `pet_current_state` | concerns, episodes, derived state; DB-OWNER | RLS; `user_id` + indexed pet; live cross-user reads passed |
| `furvise_memories` | freshness-aware memory | DB-OWNER | RLS forced; `user_id`, optional owned `pet_id`; cross-read/update denial passed |
| `ask_conversations`, `ask_conversation_messages` | Ask history | DB-OWNER | RLS; ownership triggers; live cross-user reads passed |
| `ai_usage_events`, `ai_update_suggestions` | shared credits/suggestions | DB-OWNER | RLS forced; usage client writes revoked; live cross-read and override denial passed |
| `ask_furvise_usage`, `product_ai_usage`, `shop_search_usage`, `product_question_usage`, `shop_query_interpretations` | legacy usage/cache | DB-OWNER | RLS; `user_id`; retain only for compatibility, removal deferred |
| `vet_visit_briefs` | confirmed immutable-version briefs | DB-OWNER | RLS; owner/pet trigger; 300 sources/256 KiB JSON checks; live denial passed |
| `species`, `product_brands`, `product_categories`, `products`, `product_species`, `product_markets`, `product_variants`, `retailers`, `product_sources`, `product_images`, `ingredients`, `product_ingredients`, `product_warnings`, `product_directions`, `product_offers` | approved catalog | DB-CATALOG | RLS enabled on every table; approved-market public reads; service pipeline writes |
| `product_ingestion_batches`, `product_ingestion_records`, `product_ingestion_events`, `product_ingestion_overrides` | provider ingestion/audit | DB-SERVICE | RLS; application roles revoked by reconciliation migration; service role only |

## Functions and triggers

All listed user/service RPCs are `SECURITY DEFINER` with fixed search path in their latest definition. No dynamic SQL was found.

| Functions | Profile | Ownership/grants/action |
|---|---|---|
| `reserve_ai_credit`, `complete_ai_credit`, `release_ai_credit` | RPC-USER | identity exclusively `auth.uid()`; advisory lock + request uniqueness |
| `persist_furvise_intelligence` | RPC-DISABLED | legacy Ask memory writer retained for API compatibility; execute revoked from public, anon, authenticated, and service role |
| `persist_furvise_ask_intelligence`, `persist_furvise_feature_intelligence` | RPC-SERVICE | service-only; exact operation authorization, owner, pet, source, and governed payload bindings; public/anon/authenticated execute revoked |
| `persist_furvise_care_event`, `apply_furvise_state_suggestion`, `resolve_concern_suggestion`, `manage_furvise_memory` | RPC-USER | `auth.uid()` canonical; supplied user ID must equal it; anon revoked |
| `search_catalog_product_ids` | authenticated read RPC | fixed catalog identifiers and `p_limit`; public execute revoked |
| `diagnose_furvise_integrity`, `repair_resolved_concern_suggestions`, `repair_furvise_recovery_events`, `repair_maple_qa_consistency`, `finish_maple_qa_consistency_repair`, `repair_maple_persistence_destinations`, `repair_pet_memory_lifecycle`, `backfill_pet_care_episodes`, `recompute_pet_current_state`, `refresh_product_ingestion_batch_counts` | RPC-SERVICE | live anon/auth denials passed for representative repair/diagnostic functions |
| `enforce_pet_profile_plan_limit`, `ask_conversations_validate_ownership`, `ask_conversation_messages_validate_ownership`, `vet_visit_briefs_validate_ownership`, `assign_pet_care_episode`, `apply_care_event_to_pet_state`, `sync_pet_concern_from_care_entry`, `sync_medication_episode_and_state`, `set_furvise_memory_freshness`, `supersede_previous_active_furvise_memory`, `link_superseded_furvise_memory`, `product_ingestion_events_are_append_only`, `product_ingestion_overrides_are_append_only`, `product_ingestion_preserve_raw_payload` | TRIGGER | direct execution revoked where sensitive |
| `pet_care_entries_touch_updated_at`, `ask_furvise_usage_touch_updated_at`, `product_ai_usage_touch_updated_at`, `product_question_usage_touch_updated_at`, `shop_search_usage_touch_updated_at`, `shop_query_interpretations_touch_updated_at`, `catalog_touch_updated_at`, `refresh_pet_current_medications` | TRIGGER/helper | non-user-facing; advisor grant verification still required |

Database triggers inventoried: `enforce_pet_profile_plan_limit_before_insert`, `pet_care_entries_touch_updated_at`, `ask_furvise_usage_touch_updated_at`, `product_ai_usage_touch_updated_at`, `product_question_usage_touch_updated_at`, `shop_search_usage_touch_updated_at`, `shop_query_interpretations_touch_updated_at`, three ingestion touch/append/raw triggers, two Ask ownership triggers, Vet Brief ownership, concern sync, episode assignment, Pet State application, medication state, and three memory freshness/supersession triggers.

## Storage, scripts, assets, environment and external providers

- Storage API returned **zero buckets**. Therefore there are no current object policies, signed URLs, upload MIME/byte rules, SVG/HTML handling, or cross-user stored objects to test. Pet photos are browser-local data URLs, not Supabase uploads; Vet Brief PDFs are generated on demand and returned `private, no-store`. Do not create buckets without a product requirement.
- Operator scripts: `catalog-ingestion.mjs` (service ingestion with bounded redirect-denying fetch), `seed-catalog.mjs` (service seed), `diagnose-furvise-integrity.mjs` (service diagnostic; may print private findings), `repair-resolved-concerns.mjs` (dry run by default), `generate-vet-brief-samples.mjs` (local fixture output), and `load-test/safe-local-load.mjs` (explicit non-local/write guards). Profile SCRIPT.
- Public assets (profile ASSET): `/android-192.png`, `/android-512.png`, `/App icon.png`, `/apple-touch-icon.png`, `/brand/logo.png`, `/favicon.ico`, `/favicon-16.png`, `/favicon-32.png`, `/furvise.ico`, `/images/cat.png`, `/images/dog.png`, `/manifest.webmanifest`, `/maskable-icon-512.png`. Git history contains only eight tracked icon/image artifacts and no committed UI screenshots; untracked local QA screenshots are not deployed by Next.js.
- Environment names: server-only `OPENAI_API_KEY`, `PETWISE_AI_PROVIDER`, `SUPABASE_SECRET_KEY`/legacy `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, provider ingestion credentials, diagnostic flags; browser-appropriate `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, public country/provider/feature flags. `.env.local` is ignored and untracked.
- External calls: Supabase Auth/Data/Storage; OpenAI Responses API; authorized product-provider HTTP fetches (redirect denied, host allowlist, bounded timeout/retry); Vercel OIDC is present only in local deployment environment and not referenced by application code.
- No webhook, scheduled function, upload endpoint, public storage asset, arbitrary URL-fetch route, dynamic SQL, or client-selected table/column API was found.

## Evidence status summary

## Cross-cutting audit results

### OpenAI and cost controls

- All OpenAI SDK imports and `OPENAI_API_KEY` reads are in server modules. Five general provider calls use model `gpt-5.4-mini`, feature-specific output caps of 700-1,600 tokens, strict structured-output schemas, and a 25-second abort signal. Ask reasoning separately uses bounded context selection, configured output caps, a 25-second provider timeout, and at most primary plus one fallback attempt.
- Shared `ai_usage_events` RPCs reserve atomically under an advisory lock, complete once, release to zero on failure, and bind identity to `auth.uid()`. Live duplicate/reserve/complete and reserve/release assertions passed.
- Monthly per-user limits exist. There is no repository-backed global kill switch, global daily spend guard, distributed per-user rate limiter, or cross-instance concurrent-request lock. These are verified gaps deferred to S2.
- Production OpenAI project separation, key rotation, input/output sharing off, project budget, and alerts are deployment-only and were not changed or verified.

### Authentication and session controls

- Email/password, confirmation resend, password reset, Google OAuth PKCE callback, logout, and Google identity linking are present. Local-path redirect validation rejects absolute, protocol-relative, and backslash-prefixed destinations; tests pass.
- Ownership is the Supabase Auth UUID, not email. The OAuth callback calls the canonical user/workspace helper, and the database pet-plan trigger prevents duplicate paid/free pet workspaces beyond plan limits.
- Sessions are currently browser-managed with `@supabase/supabase-js`, local/session storage, bearer API calls, and client-side private-page gates. The repository does not contain `@supabase/ssr`, a root `proxy.ts`, or server cookie refresh. This fails the requested SSR-architecture verification and is a high deferred item, not a verified secure property.
- Supabase Dashboard Site URL/redirect allowlist, password policy, email templates, anonymous-login setting, OAuth secrets, session duration, leaked-password protection, and CAPTCHA are unable to verify/deployment-only.

### Headers, caching, CORS, and uploads

| Control | Direct evidence | Status/action |
|---|---|---|
| CSP / `frame-ancestors` | none in `next.config.ts`/`vercel.json` | deferred; report-only rollout in S2 |
| HSTS | none in repository | deployment/S2 after HTTPS domain confirmation |
| `X-Content-Type-Options` | Vet Brief PDF only | global header deferred |
| Referrer/Permissions policy | absent | deferred |
| `X-Powered-By` removal | `poweredByHeader` absent | deferred |
| CORS | no application CORS headers or wildcard | verified no unsafe wildcard in repository |
| private caching | PDF is `private, no-store`; private HTML/API not globally marked | high deferred with SSR work |
| uploads | no upload route and zero Storage buckets | not applicable; future policy in S2 |

### Secrets, logging, and supply chain

- Redacted current-file scan found real-looking values only in ignored `.env.local`; ignored browser voice manifests produced two non-repository `sk-` false positives. Git history scan across all commits found zero OpenAI-key, Supabase secret/PAT, JWT-like token, private-key, or credentialed Postgres-URL patterns. No committed UI screenshots exist; tracked binary artifacts are icons only. Pixel contents of binary icons were not OCR-scanned.
- `.env.local` contains server OpenAI/Supabase/OIDC values and the public Supabase browser values, is ignored, and is not tracked. No rotation is required from repository evidence; pre-launch production-key rotation remains deployment policy.
- S1 removed raw structured provider response diagnostics and raw database message/detail logging on affected paths. The central redactor handles credential/private-content keys and safe error metadata. The operator-only integrity diagnostic intentionally prints issue objects and must remain restricted to trusted terminals.
- `npm audit` reported 0 critical and 6 high package findings; `npm audit --omit=dev` retained 3 high findings (`next` direct, `postcss` and `sharp` transitive). Next 16.2.9/PostCSS/Sharp include runtime or build-path advisories with a 16.2.12 patch available; brace-expansion/js-yaml are development-tool paths. No force upgrade was applied under S1's critical-only change policy. There is no `.github` directory/workflow to review; Dependabot, secret scanning, branch protection, and minimal CI permissions are configuration/S2 work.

- **Verified secure for tested property:** 22/22 disposable two-user assertions for the listed cross-user reads/mutations, ownership override, credit primitives, and deleted-pet access; 18/18 anon/authenticated service-RPC denials; local redirect validation; zero storage buckets; server-only provider key references.
- **Verified vulnerable and fixed:** legacy OpenAI calls lacked timeout/output caps; all four remaining JSON handlers bypassed streamed byte caps and strict top-level-key checks; several dynamic IDs were not validated; raw structured OpenAI diagnostics and database-detail logs were possible. These were fixed in S1.
- **Verified vulnerable and deferred:** missing distributed limiter/global spend guard; legacy conversation writes lack idempotency; client-only page guarding/private cache architecture; missing security headers; legacy care-history direct mutation semantics need product/data review; high dependency advisories require a patch-upgrade regression pass.
- **Unable to verify:** Dashboard advisor output, deployed browser bundle/config, Supabase Auth dashboard settings, production OpenAI project settings, backups/WAF/branch settings.
- **Deployment-only:** Supabase redirect allowlist/password/OAuth/anonymous-auth settings; separate OpenAI production project/key, data sharing off, budget/alerts; Vercel secrets and headers rollout; GitHub protection/scanning.
