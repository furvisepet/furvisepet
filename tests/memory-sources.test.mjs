import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { recoverOptionalQuery } from "../app/lib/intelligence/context-recovery.ts";
import { isEligibleLegacyMemory, isEligibleStoredMemory } from "../app/lib/intelligence/memory-integrity.ts";
import { selectFreshRelevantMemories } from "../app/lib/intelligence/memory-freshness/select-fresh-memories.ts";

const source = readFileSync(new URL("../app/lib/intelligence/memory-sources.ts", import.meta.url), "utf8");
const exports = {};
const mocks = { "server-only": {}, "./context-recovery.ts": { recoverOptionalQuery },
  "./memory-integrity.ts": { isEligibleLegacyMemory, isEligibleStoredMemory },
  "./memory-freshness/select-fresh-memories.ts": { selectFreshRelevantMemories } };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, require(name) { assert.ok(name in mocks, name); return mocks[name]; } });
const now = new Date("2026-09-05T00:00:00Z");
function database(fail = "") {
  const queries = [];
  return { queries, from(table) {
    const calls = [];
    queries.push({ table, calls });
    const chain = { then(resolve, reject) {
      const inactive = calls.some(c => c[0] === "in");
      const name = table === "dog_memories" ? "legacy_memories" : inactive ? "inactive_memories" : "furvise_memories";
      return Promise.resolve({ data: [{ id: name }], error: name === fail ? { code: "TEST_UNAVAILABLE" } : null }).then(resolve, reject);
    } };
    for (const method of ["select", "eq", "or", "in", "order", "limit", "returns"]) chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
    return chain;
  } };
}
test("memory reads preserve owner/pet filters, expiry and all three bounds", async () => {
  const db = database();
  const result = await exports.loadMemorySources({ supabase: db, userId: "owner", petId: "pet", limit: 8, now });
  assert.equal(db.queries.length, 3);
  for (const q of db.queries) assert.ok(q.calls.some(c => c[0] === "eq" && c[1] === "user_id" && c[2] === "owner"));
  assert.ok(db.queries[0].calls.some(c => c[0] === "eq" && c[1] === "dog_profile_id" && c[2] === "pet"));
  for (const q of db.queries.slice(1)) assert.ok(q.calls.some(c => c[0] === "or" && c[1] === "pet_id.eq.pet,pet_id.is.null"));
  assert.deepEqual(db.queries.map(q => q.calls.find(c => c[0] === "limit")[1]), [8, 16, 40]);
  assert.ok(db.queries[1].calls.some(c => c[0] === "or" && c[1] === "expires_at.is.null,expires_at.gt.2026-09-05T00:00:00.000Z"));
  assert.equal(result.inactiveMemories.data[0].id, "inactive_memories");
});
for (const failed of ["legacy_memories", "furvise_memories", "inactive_memories"]) test(failed + " failure remains distinct from an empty successful source", async () => {
  const result = await exports.loadMemorySources({ supabase: database(failed), userId: "owner", petId: "pet", limit: 8, now });
  for (const value of Object.values(result)) {
    assert.equal(value.unavailable, value.source === failed);
    assert.equal(value.data.length, value.source === failed ? 0 : 1);
  }
});
test("source projection preserves legacy saves, applies integrity and does not mutate coverage rows", () => {
  const row = { id: "m", pet_id: "380211f7-4b9a-4690-ad68-35b141ec14a6", source_excerpt: "she sometimes flinches when I approach quickly", subject_type: "pet", category: "behavior", fact_key: "touchsensitivity",
    fact_value: "sometimes flinches when approached quickly", source_type: "ask_message", source_id: "deleted-source",
    status: "active", confidence: 0.95, current_confidence: 0.95, freshness_class: "long_lived",
    created_at: now.toISOString(), last_confirmed_at: now.toISOString() };
  const sources = { legacyMemories: { data: [{ id: "legacy", type: "behavior", text: "Mani gets nervous around the vacuum." }, { id: "noise", type: "behavior", text: "true" }] },
    sharedMemories: { data: [row] }, inactiveMemories: { data: [{ ...row, status: "superseded" }] } };
  const selected = exports.selectMemorySources(sources, { currentMessage: "vacuum", suppressedSourceMessageIds: new Set(["deleted-source"]), now, limit: 8 });
  assert.equal(selected.legacyPetMemories.length, 1);
  assert.equal(selected.memories.length, 0);
  assert.equal(selected.inactiveMemoryMarkers.length, 1);
  assert.equal(sources.sharedMemories.data.length, 1);
  assert.equal(sources.legacyMemories.data.length, 2);
});

