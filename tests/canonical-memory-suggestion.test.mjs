import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { prepareMemorySuggestion } from "../app/lib/intelligence/memory-suggestion.ts";
const id = "00000000-0000-4000-8000-000000000001";
const pet = "00000000-0000-4000-8000-000000000002";
const suggestion = { id, user_id: "owner", pet_profile_id: pet, type: "memory", status: "pending",
  details: "Milo gets nervous around the vacuum.", payload: { memoryType: "behavior" } };
const source = readFileSync(new URL("../app/api/ask/suggestions/[id]/route.ts", import.meta.url), "utf8");
function harness(result = { data: [{ apply_status: "applied", memory_id: "memory" }], error: null }, row = suggestion) {
  const calls = [];
  const db = { auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from(table) {
    const q = { maybeSingle: async () => ({ data: table === "ai_update_suggestions" ? row : null, error: null }) };
    for (const method of ["select", "eq", "or", "order", "limit"]) q[method] = () => q;
    q.insert = () => { throw new Error("Legacy insertion forbidden"); };
    return q;
  } };
  const authority = { rpc: async (name, args) => { calls.push({ name, args }); return result; },
    from: () => { throw new Error("Non-atomic suggestion write forbidden"); } };
  const mocks = {
    "@supabase/supabase-js": { createClient: () => db },
    "../../../../lib/security/headers/origin-policy": { validateSensitiveRequestOriginResponse: () => null },
    "../../../../lib/security/logging": { safeErrorForLog: () => ({}) },
    "../../../../lib/security/request": { API_BODY_LIMITS: { standard: 1000 }, isUuid: value => value === id,
      hasOnlyKeys: () => true, readBoundedJson: request => request.json() },
    "../../../../lib/security/idempotency": { beginIdempotentRateLimitedOperation: async () => ({ operation: { execute: fn => fn() } }) },
    "../../../../lib/intelligence/memory-suggestion.ts": { prepareMemorySuggestion },
    "../../../../lib/intelligence/care-authority-client.ts": { createCanonicalCareAuthorityClient: () => authority },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require(name) { assert.ok(name in mocks, name); return mocks[name]; }, Response,
      crypto: globalThis.crypto, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "http://unused.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only" } },
      console: { error() {} } });
  return { calls, run: () => exports.PATCH(new Request("http://local/api/ask/suggestions/" + id,
    { method: "PATCH", headers: { authorization: "Bearer test-only", "content-type": "application/json" }, body: '{"action":"save"}' }), { params: Promise.resolve({ id }) }) };
}
test("actual PATCH saves through one canonical atomic RPC with reviewed target and note", async () => {
  const h = harness();
  assert.equal((await h.run()).status, 200);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, "save_ask_memory_suggestion");
  assert.equal(h.calls[0].args.p_expected_pet_id, pet);
  assert.equal(h.calls[0].args.p_expected_note, suggestion.details);
  assert.equal(h.calls[0].args.p_user_id, "owner");
});
for (const [code, status] of [["42501",403],["P0002",404],["40001",409],["22023",422],["PGRST202",503],["23505",503]]) {
  test("actual PATCH does not claim a save after " + code, async () => {
    assert.equal((await harness({ data: null, error: { code } }).run()).status, status);
  });
}
test("saved retry still uses fresh database authority and does not recreate forgotten memory", async () => {
  const h = harness({ data: [{ apply_status: "already_applied", memory_id: null }], error: null }, { ...suggestion, status: "saved" });
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).memoryId, null);
  assert.equal(h.calls.length, 1);
});
test("unconfirmed result fails instead of claiming success", async () => {
  assert.equal((await harness({ data: [], error: null }).run()).status, 503);
});
test("invalid durable-memory input never reaches the write RPC", async () => {
  const h = harness(undefined, { ...suggestion, details: "true" });
  assert.equal((await h.run()).status, 422);
  assert.equal(h.calls.length, 0);
});
test("memory preparation preserves review text and rejects clinical or oversized input", () => {
  assert.equal(prepareMemorySuggestion(suggestion).note, suggestion.details);
  assert.equal(prepareMemorySuggestion({ ...suggestion, payload: { memoryType: "symptom" } }), null);
  assert.equal(prepareMemorySuggestion({ ...suggestion, details: "x".repeat(1001) }), null);
});
