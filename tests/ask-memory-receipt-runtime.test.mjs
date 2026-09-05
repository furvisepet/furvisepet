import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { selectPhase3LowRiskTurn } from "../app/lib/intelligence/v2/phase3/cutover-policy.ts";
import { executePhase3WriteFailOpen, phase3AllowsLowRiskWrite } from "../app/lib/intelligence/v2/phase3/execution.ts";

const source = readFileSync(new URL("../app/lib/intelligence/v2/phase3/runtime.ts", import.meta.url), "utf8");
function claim(pet) {
  return { sourceLocalClaimKey: pet, subject: { type: "pet", id: pet, resolution: "owned" },
    conceptKey: "food_preference", canonicalConceptKey: "food_preference", claimKind: "preference",
    operationType: "assert", persistenceEligible: true, persistenceDestination: "pet_memory",
    safetyFloorMetadata: { level: "routine" }, governanceMetadata: {},
    groundedEvidence: [{ quote: pet + " prefers fish", surfaceText: pet + " prefers fish" }],
    structuredValue: {}, unit: null, temporal: {}, proposed: { polarity: "affirmed", modality: "asserted", evidence: [] },
  };
}
const learnings = ["milo", "luna"].map(pet => ({ subjectType: "pet", subjectId: pet, category: "preference",
  factKey: "food_preference", factValue: "fish", action: "create", sourceExcerpt: pet + " prefers fish" }));
const receipt = (learning, overrides = {}) => ({ memoryId: "memory-" + learning.subjectId, userId: "owner",
  sourceMessageId: "source", learning, ...overrides });
function harness(receipts, mode = "low_risk_dual_write") {
  const writes = [];
  const mocks = {
    "server-only": {}, "node:crypto": { createHash },
    "../persistence/persist.ts": { persistGovernedSemanticTurnV2Shadow: async input => { writes.push(input); return { data: {}, error: null }; } },
    "../persistence/server-client.ts": {}, "../projections/rebuild.ts": {}, "../concepts/registry-policy.ts": {},
    "./cutover-policy.ts": { selectPhase3LowRiskTurn },
    "./execution.ts": { executePhase3WriteFailOpen, phase3AllowsLowRiskWrite },
    "./rollout.ts": {}, "./shadow-comparison.ts": {},
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require(name) { assert.ok(name in mocks, name); return mocks[name]; }, process: { env: {} }, console: { info() {}, warn() {}, error() {} } });
  return { writes, run: () => exports.persistAskV2Phase3LowRisk({
    runtime: { mode, shadowReady: true, serviceClient: {}, conceptPolicies: new Map() },
    turn: { sourceMessageId: "source", acceptedClaims: [claim("milo"), claim("luna")], relations: [] },
    legacyLearnings: learnings,
    legacyPersistence: { memoryIds: ["memory-milo"], confirmedMemoryWrites: receipts },
    memoryPersistence: { memoryIds: ["memory-milo"], confirmedMemoryWrites: receipts },
    requestId: "request", selectedPetId: "milo", sourceMessage: "milo prefers fish; luna prefers fish", verifiedUserId: "owner",
  }) };
}
test("one pet's receipt cannot authorize a second pet's V2 write", async () => {
  const h = harness([receipt(learnings[0])]);
  assert.equal((await h.run()).status, "persisted");
  assert.deepEqual(h.writes[0].turn.acceptedClaims.map(c => c.subject.id), ["milo"]);
});
for (const [name, receipts] of [
  ["IDs without receipts", undefined],
  ["wrong owner", [receipt(learnings[0], { userId: "foreign" })]],
  ["wrong source", [receipt(learnings[0], { sourceMessageId: "old" })]],
  ["empty memory ID", [receipt(learnings[0], { memoryId: "" })]],
]) test(name + " cannot authorize V2", async () => {
  const h = harness(receipts);
  await h.run();
  assert.equal(h.writes.length, 0);
});
test("separately confirmed pets both persist", async () => {
  const h = harness(learnings.map(l => receipt(l)));
  assert.equal((await h.run()).claimCount, 2);
  assert.equal(h.writes.length, 1);
});
test("disabled V2 performs no writes even with receipts", async () => {
  const h = harness(learnings.map(l => receipt(l)), "off");
  assert.equal((await h.run()).status, "skipped");
  assert.equal(h.writes.length, 0);
});


test("a receipt for another assertion with the same pet and concept does not match", async () => {
  const h = harness([receipt({ ...learnings[0], sourceExcerpt: "milo prefers beef" })]);
  await h.run();
  assert.equal(h.writes.length, 0);
});
test("production route supplies the persistence result, not raw accepted learnings", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("persistAskV2Phase3LowRisk({");
  assert.ok(start > route.indexOf("persistIntelligenceLearnings({"));
  const call = route.slice(start, route.indexOf("}),", start));
  assert.match(call, /memoryPersistence: intelligencePersistence/);
  assert.doesNotMatch(call, /acceptedLearnings|legacyLearnings/);
});
