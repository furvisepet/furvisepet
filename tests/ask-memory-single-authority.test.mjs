import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/intelligence/persist-learnings.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(error = null, { care = false, owned = true } = {}) {
  const calls = [];
  const rows = [];
  const learning = { subjectType: "pet", subjectId: "pet-a", factKey: "routine", factValue: "Evening walks", sourceExcerpt: "Evening walks" };
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === "persist_furvise_ask_intelligence" && error) return { data: null, error };
    rows.push({ id: "memory-a", subject_type: "pet", pet_id: "pet-a", fact_key: "routine", normalized_value: "Evening walks" });
    return { data: [{ memories_created: 1 }], error: null };
  };
  const query = (table) => {
    let select = "";
    const chain = { select(value) { select = value; return chain; },
      then(resolve, reject) { return Promise.resolve({ data: table === "dog_profiles" ? (owned ? [{ id: "pet-a" }] : []) : select.startsWith("id,") ? rows : [], error: null }).then(resolve, reject); } };
    for (const method of ["eq", "in", "or", "is", "limit", "returns"]) chain[method] = () => chain;
    return chain;
  };
  const mocks = {
    "server-only": {},
    "./memory-policy": { normalizeMemoryValue: value => value },
    "./logging": { logIntelligenceError() {} },
    "./preference-semantics": { historicalPreferenceTargetIdentity: () => null, normalizeKnownPreferenceMemory: () => null },
    "./persistence-partition": { groupLearningsByPersistencePet: values => new Map([["pet-a", values]]) },
    "./semantic-event-persistence": {},
    "./care-history-policy.ts": { findEquivalentRecentCareEntry: () => care ? { id: "care-a" } : null },
    "./memory-integrity.ts": { prepareTypedMemoryCandidate: value => ({ accepted: true, learning: value }), isEligibleStoredMemory: () => false },
    "../operations/admin-client.ts": { createOperationsAdminClient: () => ({ rpc }) },
    "./care-authority-client.ts": { createCanonicalCareAuthorityClient: () => { throw new Error("Unexpected care RPC"); } },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) { assert.ok(name in mocks, name); return mocks[name]; } });
  return { calls, run: () => exports.persistIntelligenceLearnings({
    assistantMessageId: "assistant", authorizedPetIds: ["pet-a"], careActions: care ? [{ action: "log_care", title: "Walk", details: "Walk" }] : [],
    learnings: [learning], currentMessage: "Evening walks", operationOwnerToken: "test-lease", payloadHash: "test-hash",
    petId: "pet-a", requestId: "request", sourceMessageId: "source", userId: "owner",
    supabase: { from: query, rpc },
  }) };
}
for (const error of [
  { code: "PGRST202", message: "Could not find the function public.persist_furvise_ask_intelligence(p_pet_id) in the schema cache" },
  { code: "42501", message: "denied" },
  { code: "57014", message: "cancelled" },
]) {
  test(`memory-only authority failure ${error.code} never falls back or reports success`, async () => {
    const h = harness(error);
    await assert.rejects(h.run, /could not persist approved learnings/);
    assert.deepEqual(h.calls.map(c => c.name), ["persist_furvise_ask_intelligence"]);
  });
  test(`confirmed care survives memory authority failure ${error.code} without a memory save`, async () => {
    const h = harness(error, { care: true });
    const result = await h.run();
    assert.equal(result.carePersistence.status, "persisted");
    assert.equal(result.persistedCareEntryId, "care-a");
    assert.equal(result.memoriesCreated, 0);
    assert.equal(result.memoryIds.length, 0);
    assert.deepEqual(h.calls.map(c => c.name), ["persist_furvise_ask_intelligence"]);
  });
}
test("successful save retains lease, provenance and target bindings", async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.memoriesCreated, 1);
  assert.equal(result.memoryIds[0], "memory-a");
  const args = h.calls[0].args;
  for (const [key, value] of Object.entries({ p_user_id: "owner", p_pet_id: "pet-a", p_source_message_id: "source", p_assistant_message_id: "assistant", p_request_id: "request", p_payload_hash: "test-hash", p_operation_owner_token: "test-lease" })) assert.equal(args[key], value);
  assert.equal(args.p_authorized_pet_ids[0], "pet-a");
  assert.equal(h.calls.length, 1);
});
test("failed fresh ownership check prevents every memory RPC", async () => {
  const h = harness(null, { owned: false });
  await assert.rejects(h.run, /could not verify memory ownership/);
  assert.equal(h.calls.length, 0);
});

