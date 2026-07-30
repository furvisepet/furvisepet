# AI admission and spending controls (Stage S2C)

Status: implemented in repository; production Redis state, environment values, and OpenAI billing reconciliation are not externally verified.

## Verified provider inventory

All repository calls to the paid OpenAI Responses API now pass through `executeAdmittedProviderCall`. The provider boundary requires an active `AiOperationAdmission` outside the Node test runtime or an explicitly enabled development-only override. No public operator endpoint was added.

| Operation | Route or caller | Guard feature | Model | Calls per operation | Context/input bound | Output cap | User credit | Retry / fallback | Timeout | Deterministic or stored fallback |
|---|---|---|---|---:|---|---:|---|---|---:|---|
| Ask Furvise | `POST /api/ask` -> `runFurviseIntelligence` | `ask` | configured primary, currently `gpt-5.4-mini` | 2 (primary plus one existing repair/fallback at most) | 20,000 estimated tokens / 80,000 serialized characters; route also bounds message, recent updates, memories, and conversation turns | 4,096 | one shared credit per user-facing turn; released on failed experience | exactly one existing secondary attempt; no recursive retry | route 50s; provider 25s | deterministic status-update handling; completed conversations remain readable |
| Care-plan analysis | `POST /api/analyze` -> `OpenAiAnalysisProvider.analyzeDogProfile` | `care_plan` | `gpt-5.4-mini` | 1 | 12,000 estimated tokens / 48,000 characters; validated profile and bounded memories | 1,600 | one shared credit; released on failure | none | 25s | safe unavailable response |
| Product request interpretation | `POST /api/shop/interpret-query` | `product_query` | configured primary | 1 | 12,000 estimated tokens / 48,000 characters; query 240 characters and bounded context | 520 | one shared credit; released on failure | provider wrapper has no recursive retry | 25s | deterministic interpretation and catalog browsing |
| Product candidate ranking | `filterAndRankShopProducts` | none | none | 0 | bounded catalog candidates in application code | n/a | none | n/a | n/a | deterministic; deliberately not counted |
| Product fit explanation | `POST /api/shop/explain-product-fit` | `product_explanation` | configured primary | 1 | 12,000 estimated tokens / 48,000 characters; one owned pet and one catalog product | 360 | one shared credit; released on failure | no recursive retry | 25s | deterministic fit explanation |
| Product-specific question | `POST /api/shop/product-question` | `product_question` | configured primary | 1 | 12,000 estimated tokens / 48,000 characters; question 320 and query 240 characters | 650 | one shared credit; released on failure | no recursive retry | 25s | deterministic answer; browsing remains available |
| Safety follow-up | `POST /api/safety-followup` | `safety_followup` | configured primary | 1 | 12,000 estimated tokens / 48,000 characters; at most three bounded Q/A pairs | 650 | one shared credit; released on failure | no paid fallback | 25s | deterministic safety floor still applies; no generated follow-up on denial |
| Vet Visit Brief generation and refresh | `POST /api/vet-briefs/draft` | `vet_brief` | configured primary | 1 | 40,000 estimated tokens / 160,000 characters; 730-day range, 1,200-character note, bounded retrieved records | 1,800 | one shared credit; released on failure | no paid formatting pass | route lease 90s; provider 25s | existing saved briefs remain readable; deterministic draft inputs remain intact |
| Memory extraction/classification | embedded in Ask, Product, and Safety structured outputs | no extra provider call | same call as originating feature | 0 additional | originating feature bound | originating feature cap | no additional credit | no separate retry or fallback model | originating timeout | `FURVISE_AI_MEMORY_EXTRACTION_ENABLED=false` rejects proposed memories while manual memory management remains available |
| Legacy grounded Ask helper | `generateGroundedAskAnswer`; no current route caller found | requires surrounding admission if reactivated | `gpt-5.4-mini` | 1 | provider boundary enforces the active feature policy | 1,600 | no independent ledger | none | 40s | returns null on ordinary compatibility failure |
| Legacy provider methods | `OpenAiAnalysisProvider` safety/product helpers; current feature routes use the structured intelligence runner | requires surrounding admission if reactivated | `gpt-5.4-mini` | 1 each | active feature policy | 700-900 | no independent ledger | none | 25s | method-specific safe error path |

No hidden validation, diagnostic, repair, development script, Chat Completions call, or second OpenAI client invocation was found outside the three approved provider wrappers. Product catalog reads, product filtering/ranking, deterministic safety classification, and reading stored AI results are not admitted or counted.

## Canonical enforcement sequence

Feature routes retain their S2A/S2B controls. For new paid work the verified order is:

1. Parse bounded request data, authenticate, and verify ownership.
2. Resolve request idempotency, enforce S2B user/IP limits, and acquire the shared per-user AI lease.
3. Evaluate `FURVISE_AI_ENABLED`, the feature flag, required daily configuration, known model pricing, and the Redis emergency state.
4. Create or reuse one HMAC-derived logical operation record; reject the same request ID with a different payload.
5. Atomically reserve one daily provider-call unit and the feature's worst-case estimated cost.
6. Check the existing monthly/shared user entitlement and reserve one user-facing credit.
7. At the common provider boundary, enforce serialized context, estimated input-token, output-token, model, and operation-call budgets; then mark the call started.
8. Reconcile actual provider usage to fixed-point estimated cost before returning provider output.
9. Complete or release the user credit under the existing ledger policy. Provider cost remains counted if a later validation or persistence step fails.
10. Release an unstarted daily reservation and the S2B concurrency lease in `finally` paths.

Existing route-specific canonical replays still happen before admission where implemented. A completed operation reaching the central guard is denied rather than causing another provider call. Expanding canonical replay behavior across every legacy Product write remains idempotency work, not S2C spending logic.

## Feature and global controls

All variables below are server-only and must never use a `NEXT_PUBLIC_` prefix:

- `FURVISE_AI_ENABLED`
- `FURVISE_AI_ASK_ENABLED`
- `FURVISE_AI_CARE_PLAN_ENABLED`
- `FURVISE_AI_PRODUCTS_ENABLED`
- `FURVISE_AI_SAFETY_FOLLOWUP_ENABLED`
- `FURVISE_AI_VET_BRIEF_ENABLED`
- `FURVISE_AI_MEMORY_EXTRACTION_ENABLED`
- `FURVISE_AI_DAILY_CALL_LIMIT`
- `FURVISE_AI_DAILY_COST_LIMIT_USD`

`FURVISE_AI_ENABLED=false` always denies new admissions before a daily reservation or user-credit reservation. Feature flags deny only their mapped operations. Environment disablement overrides any Redis emergency state. Production fails closed if either positive daily ceiling is absent or invalid.

Two development-only switches exist for controlled local diagnosis and must remain false in preview/production:

- `FURVISE_AI_ALLOW_UNKNOWN_MODEL_IN_DEVELOPMENT=true`
- `FURVISE_AI_ALLOW_UNGUARDED_PROVIDER_IN_DEVELOPMENT=true`

## Daily call and cost guards

Daily buckets use UTC. Redis Lua scripts atomically check and increment the global call count, global reserved/committed cost, per-feature call count, and per-operation call count. Keys expire after the next UTC boundary plus a two-hour reconciliation margin.

The logical key families are versioned and contain HMAC operation identities, not raw user IDs:

- `furvise:ai:v1:day:<UTC-day>:calls`
- `furvise:ai:v1:day:<UTC-day>:cost`
- `furvise:ai:v1:day:<UTC-day>:feature:<feature>:calls`
- `furvise:ai:v1:operation:<HMAC operation identity>`
- `furvise:ai:v1:call:<HMAC operation identity>:<random call ID>`
- `furvise:ai:v1:emergency`

The authoritative shared monetary counter is integer microdollars. Before a call, it reserves the feature policy's maximum input and output estimate. After a successful provider response, OpenAI `input_tokens`, cached-input tokens, and `output_tokens` reconcile the reservation down or up. A started call is never released as though it were free. If reconciliation temporarily fails, the worst-case reservation remains and new work fails safely when accounting cannot be trusted. This is an operational estimate; the OpenAI invoice and project dashboard remain authoritative.

## Pricing registry

The only enabled model price is centralized in `app/lib/ai/usage-guard/cost-estimator.ts`:

| Model | Standard input / 1M | Cached input / 1M | Output / 1M | Effective / reviewed | Source |
|---|---:|---:|---:|---|---|
| `gpt-5.4-mini` | $0.75 | $0.075 | $4.50 | 2026-07-29 | OpenAI API pricing page, operator review required before model changes |

When a model identifier or price changes, an operator must verify the current official price, update the registry/effective date/source note, run focused S2C tests, compare worst-case feature reservations, and deploy the price update before enabling that model. Unknown pricing fails closed in production and never assumes zero cost.

## Provider-call and token budgets

Each direct Product, Safety, Vet Brief, and care-plan HTTP operation is one paid call. The existing Ask reasoning path alone permits a second call because it already has one deliberate, bounded fallback/repair path. The count is kept in Redis per operation, so a process restart or retry cannot reset the paid-call budget. Provider retries and model fallbacks pass through the same executor and therefore consume the budget. Recursive retry and unbounded fallback chains are not available.

The feature registry centrally owns maximum serialized characters, conservative estimated input tokens (one token per three serialized characters), maximum output tokens, model, and maximum calls. Clients cannot select any of these values or report token/cost usage.

## User credit versus provider cost

These are deliberately separate ledgers:

- One successful user-facing Furvise operation consumes one existing shared AI credit, even if the admitted Ask operation legitimately used two paid calls.
- Pre-provider global, feature, daily, pricing, emergency, or reservation denial consumes no user credit and no provider cost.
- A failed user experience may release its user credit under the existing ledger policy.
- Once a provider call starts, its actual/reconciled cost remains in platform accounting even if schema validation, persistence, or response delivery later fails.

## Emergency shutdown

Deployment kill switch:

```powershell
$env:FURVISE_AI_ENABLED='false'
```

Runtime Redis switch (use task-specific operator credentials already configured in the shell):

```powershell
node scripts/ai-emergency-control.mjs status
node scripts/ai-emergency-control.mjs disable --reason "incident reference or short reason"
node scripts/ai-emergency-control.mjs enable --confirm-enable
```

The script requires the server-only Upstash URL/token, has a two-second timeout, never prints credentials, requires a reason to disable, and requires explicit confirmation to re-enable. It records an action ID, timestamp, reason, and state. There is no browser or HTTP admin endpoint.

Recovery sequence:

1. Keep `FURVISE_AI_ENABLED=false` while investigating if a deployment-level shutdown is required.
2. Confirm OpenAI project spend/call activity and Redis daily snapshots through authorized consoles.
3. Correct configuration or provider behavior and verify model pricing.
4. Check script `status`; clear the Redis emergency state with the explicit enable command only if appropriate.
5. Re-enable the environment flag only after daily limits and Redis connectivity are confirmed.
6. Make one controlled low-token operation and compare its recorded usage with OpenAI dashboard usage.

Currently executing provider calls are not force-cancelled by changing the switch. New admissions stop. Saved conversations and briefs remain readable, and manual history/profile/medication/memory work plus deterministic Product browsing remain available.

## Failure policy and safe responses

Production model-backed work fails closed before OpenAI when configuration, Redis, emergency state, pricing, daily reservation, or pre-call accounting is unavailable. Stable public codes are:

- `AI_TEMPORARILY_UNAVAILABLE`
- `AI_DAILY_CAP_REACHED`
- `AI_FEATURE_UNAVAILABLE`
- `AI_OPERATION_CONFLICT`

Provider-call budget details remain internal and map to temporary unavailability. Product routes return bounded deterministic results with `aiUnavailable` and a stable code; they do not mislabel platform denial as exhausted user credit. Ask and Vet Brief return private/no-store unavailable responses, preserving saved content and request inputs client-side under the existing UI behavior.

Safe structured events include request/operation IDs, feature, model, call number, estimated/actual tokens, reserved/reconciled microdollars, daily snapshots, denial reason, duration, emergency state, and safe error class. They exclude prompts, responses, raw user IDs, IPs, medical narratives, credentials, and session tokens. A no-op metrics interface is present for a later monitoring stage; S2C adds no vendor.

## Recommended initial thresholds (operator confirmation required)

The production values are intentionally blank in `.env.example`. The examples below assume every beta user has 20 shared AI uses, 10% of the total entitlement is consumed on a peak day, and every operation is the most expensive current path: two worst-case Ask calls. One worst-case Ask call reserves approximately $0.033432; one two-call Ask operation reserves approximately $0.066864.

| Beta users | Total shared uses | Assumed peak-day operations | Worst-case calls | Worst-case estimated exposure | Example ceiling for review |
|---:|---:|---:|---:|---:|---|
| 25 | 500 | 50 | 100 | $3.34 | 100 calls and $4/day |
| 100 | 2,000 | 200 | 400 | $13.37 | 400 calls and $15/day |
| 250 | 5,000 | 500 | 1,000 | $33.43 | 1,000 calls and $35/day |

These are conservative examples, not chosen production settings and not an invoice guarantee. The operator should select a row or calculate another scenario using observed activation, expected operations per active user, acceptable financial exposure, current model prices, and OpenAI's separate project budget/alerts. Keep separate preview and production Redis databases/tokens and much lower preview ceilings.

## Production setup and validation

Required external work:

1. Set positive operator-approved `FURVISE_AI_DAILY_CALL_LIMIT` and `FURVISE_AI_DAILY_COST_LIMIT_USD` in each Vercel environment.
2. Confirm the existing Upstash credentials and HMAC secret are distinct per preview/production and server-only.
3. Verify the production OpenAI project model, budget, alerts, and pricing against the registry.
4. Exercise one admission across two real serverless instances to verify the shared Redis counters; local tests prove adapter semantics, not deployed multi-instance behavior.
5. At UTC rollover, verify a new daily bucket is used and prior keys expire after the reconciliation margin.
6. Compare Furvise daily estimated completed cost/tokens with the OpenAI project dashboard. Investigate drift; do not treat Furvise estimates as billing records.
7. Test disable/status/enable using restricted operator credentials and record the exercise outside application logs.

No database migration was required. Existing `ai_usage_events` remains the canonical user-credit ledger; the Redis guard is the global admission/spend safety counter rather than a competing user entitlement table.
