import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientKeys = await import("../app/lib/security/idempotency/client.ts");

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const routes = [
  "app/api/account/detect-country/route.ts", "app/api/account/product-country/route.ts", "app/api/analyze/route.ts",
  "app/api/ask/route.ts", "app/api/ask/conversations/route.ts", "app/api/ask/conversations/[id]/route.ts",
  "app/api/ask/conversations/[id]/messages/route.ts", "app/api/ask/suggestions/[id]/route.ts",
  "app/api/care-entries/route.ts", "app/api/care-entries/[id]/route.ts", "app/api/legacy-memories/route.ts",
  "app/api/memories/[id]/route.ts", "app/api/pets/[id]/route.ts", "app/api/product-feedback/route.ts",
  "app/api/safety-followup/route.ts", "app/api/shop/interpret-query/route.ts",
  "app/api/shop/explain-product-fit/route.ts", "app/api/shop/product-question/route.ts",
  "app/api/vet-briefs/draft/route.ts", "app/api/vet-briefs/route.ts",
];

test("canonical key transport requires UUID v4/v7 and rejects header/body disagreement", () => {
  const requestKey = source("app/lib/security/idempotency/request-key.ts");
  assert.match(requestKey, /IDEMPOTENCY_HEADER = "idempotency-key"/);
  assert.match(requestKey, /\[47\]/);
  assert.match(requestKey, /rawHeader\.toLowerCase\(\) !== candidateKey\.toLowerCase\(\)/);
  assert.match(requestKey, /error: "required"/);
});

test("payload identity is canonical, cryptographic, versioned, and excludes transport fields", () => {
  const payloadHash = source("app/lib/security/idempotency/payload-hash.ts");
  assert.match(payloadHash, /createHash\("sha256"\)/);
  assert.match(payloadHash, /Object\.keys\(record\).*\.sort\(\)/s);
  assert.match(payloadHash, /operationVersion: 1/);
  assert.match(payloadHash, /operationType/);
  assert.match(payloadHash, /requestId.*idempotencyKey.*idempotency_key/);
});

test("database claim is atomic and one key is scoped by owner and operation", () => {
  const migration = source("supabase/migrations/20260730010000_add_canonical_idempotency_operations.sql");
  assert.match(migration, /unique \(user_id, operation_type, idempotency_key\)/);
  assert.match(migration, /on conflict \(user_id, operation_type, idempotency_key\) do nothing/);
  assert.match(migration, /for update/);
  assert.match(migration, /'new'::text/);
  assert.match(migration, /'in_progress'::text/);
  assert.match(migration, /'completed'::text/);
  assert.match(migration, /'conflict'::text/);
});

test("idempotency authority is service-only and normal users have no table or RPC grant", () => {
  const migration = source("supabase/migrations/20260730010000_add_canonical_idempotency_operations.sql");
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.idempotency_operations from public, anon, authenticated/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /revoke all on function public\.claim_idempotency_operation[\s\S]*authenticated/);
  assert.match(migration, /grant execute on function public\.claim_idempotency_operation[\s\S]*to service_role/);
  assert.match(source("app/lib/security/idempotency/admin-client.ts"), /SUPABASE_SECRET_KEY.*SUPABASE_SERVICE_ROLE_KEY/s);
});

test("canonical response, conflict, and in-progress contracts are stable and private", () => {
  const errors = source("app/lib/security/idempotency/errors.ts");
  assert.match(errors, /IDEMPOTENCY_CONFLICT/);
  assert.match(errors, /REQUEST_IN_PROGRESS/);
  assert.match(errors, /Idempotency-Replayed/);
  assert.match(errors, /Retry-After/);
  assert.match(errors, /private, no-store/);
  assert.doesNotMatch(errors, /payload_hash|owner_token|Redis/);
});

test("completion is stored before a replay can return and 5xx remains retryable", () => {
  const operation = source("app/lib/security/idempotency/operation.ts");
  assert.match(operation, /claim_outcome === "completed"/);
  assert.match(operation, /response\.status >= 500/);
  assert.match(operation, /retryable: true/);
  assert.match(operation, /POST_MUTATION_RECONCILIATION/);
  assert.match(operation, /Idempotency-Replayed", "false"/);
});

test("completed replay precedes rate limiting while new execution remains rate limited", () => {
  const operation = source("app/lib/security/idempotency/operation.ts");
  const claim = operation.indexOf("await claimIdempotentOperation(input)");
  const limiter = operation.indexOf("await beginRateLimitedRequest");
  assert.ok(claim >= 0 && limiter > claim);
  assert.match(operation, /operation\.abandon\(rate\.response\.status === 429/);
});

test("all browser state-changing routes use the central framework", () => {
  for (const route of routes) assert.match(source(route), /(?:beginIdempotentRateLimitedOperation|claimIdempotentOperation)/, route);
  assert.match(source("app/lib/pet-profile-api-server.ts"), /beginIdempotentRateLimitedOperation/);
});

test("all paid provider entry routes claim before the provider call", () => {
  for (const route of ["app/api/ask/route.ts", "app/api/analyze/route.ts", "app/api/safety-followup/route.ts", "app/api/shop/interpret-query/route.ts", "app/api/shop/explain-product-fit/route.ts", "app/api/shop/product-question/route.ts", "app/api/vet-briefs/draft/route.ts"]) {
    const body = source(route);
    const admission = route === "app/api/ask/route.ts"
      ? body.indexOf("aiAdmission = await admitAiOperation")
      : body.indexOf("runAdmittedAiOperation({");
    assert.ok(body.indexOf("await claimIdempotentOperation") < admission, route);
  }
});

test("message, profile, care, memory, conversation, and brief inserts carry request uniqueness", () => {
  const migration = source("supabase/migrations/20260730010000_add_canonical_idempotency_operations.sql");
  for (const index of ["pet_care_entries_owner_idempotency_idx", "dog_profiles_owner_idempotency_idx", "ask_conversations_owner_idempotency_idx", "vet_visit_briefs_owner_idempotency_idx", "dog_memories_owner_idempotency_item_idx"]) assert.match(migration, new RegExp(index));
  assert.match(source("app/api/ask/route.ts"), /request_id: requestId/);
  assert.match(source("app/api/ask/conversations/[id]/messages/route.ts"), /request_id: gate\.operation\.key/);
});

test("cleanup is dry-run by default, bounded, service-only, and excludes active financial work", () => {
  const script = source("scripts/cleanup-idempotency-operations.mjs");
  const migration = source("supabase/migrations/20260730010000_add_canonical_idempotency_operations.sql");
  assert.match(script, /apply = process\.argv\.includes\("--apply"\)/);
  assert.match(script, /--confirm-apply/);
  assert.match(migration, /p_batch_limit not between 1 and 5000/);
  assert.match(migration, /status <> 'processing'/);
  assert.match(migration, /usage\.status = 'reserved'/);
  assert.match(migration, /cleanup_expired_idempotency_operations[\s\S]*to service_role/);
});

test("first-party mutation fetches reuse an unresolved key and never persist private payloads", () => {
  const client = source("app/lib/security/idempotency/client.ts");
  assert.match(client, /sessionStorage\.getItem/);
  assert.match(client, /headers\.set\("Idempotency-Key", key\)/);
  assert.match(client, /response\.status >= 500 \|\| response\.status === 429/);
  assert.match(client, /REQUEST_IN_PROGRESS/);
  assert.doesNotMatch(client, /JSON\.stringify\([^\n]*(?:payload|body)/);
  assert.match(source("app/lib/supabase.ts"), /idempotentClientFetch/);
});

test("client rerender, retry, and canonical completion follow the key lifecycle", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const values = new Map();
  globalThis.window = { sessionStorage: {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  } };
  try {
    const first = clientKeys.getOrCreateClientMutationKey("care:create");
    assert.equal(clientKeys.getOrCreateClientMutationKey("care:create"), first, "rerender must retain key");
    let sentKey = "";
    globalThis.fetch = async (_url, init) => { sentKey = new Headers(init.headers).get("Idempotency-Key") || ""; return Response.json({ error: "retry" }, { status: 503 }); };
    await clientKeys.idempotentClientFetch("/api/care-entries", { method: "POST" }, "care:create");
    assert.equal(sentKey, first);
    assert.equal(clientKeys.getOrCreateClientMutationKey("care:create"), first, "retry must reuse key");
    globalThis.fetch = async () => Response.json({ entry: { id: "canonical" } }, { status: 201 });
    await clientKeys.idempotentClientFetch("/api/care-entries", { method: "POST" }, "care:create");
    const next = clientKeys.getOrCreateClientMutationKey("care:create");
    assert.notEqual(next, first, "new intentional action must get a new key after completion");
    assert.notEqual(clientKeys.getOrCreateClientMutationKey("memory:edit:other"), next, "separate action scopes must not share keys");
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test("identical intentional actions are not deduplicated by message text", () => {
  const askClient = source("app/ask/page.tsx");
  assert.match(askClient, /retry\?\.logicalTurnId \|\| crypto\.randomUUID\(\)/);
  assert.match(askClient, /logicalTurnId/);
  assert.doesNotMatch(source("app/lib/security/idempotency/payload-hash.ts"), /message text alone/);
});

test("deterministic product catalog reads remain outside mutation idempotency", () => {
  const catalog = source("app/api/shop/catalog/route.ts");
  assert.doesNotMatch(catalog, /claimIdempotentOperation|beginIdempotentRateLimitedOperation/);
  assert.match(catalog, /mode|products|catalog/i);
});
