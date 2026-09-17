import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { planFurviseMemoryRead } = await import("../app/lib/furvise-brain/memory-organ.ts");
const { createFurviseTurnAuthority } = await import("../app/lib/furvise-brain/turn-authority.ts");

test("unresolved subject with no approved memory pets cannot read history", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: [], source: "unresolved", unresolved: true },
    memoryNeed: "lifetime",
    memoryPetIds: [],
  });
  const read = planFurviseMemoryRead(turn);
  assert.equal(read.depth, "lifetime");
  assert.deepEqual(read.petIds, []);
});

test("memory organ receives exactly the brain-approved pets", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: ["pebble"], source: "explicit", unresolved: false },
    memoryNeed: "lifetime",
    memoryPetIds: ["pebble", "mochi"],
  });
  const read = planFurviseMemoryRead(turn);
  assert.equal(read.depth, "lifetime");
  assert.deepEqual(read.petIds, ["pebble", "mochi"]);
  assert.equal(Object.isFrozen(read), true);
  assert.equal(Object.isFrozen(read.petIds), true);
});

test("read scope may remain valid while a separate write subject is unresolved", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: [], source: "unresolved", unresolved: true },
    memoryNeed: "targeted",
    memoryPetIds: ["mochi"],
  });
  assert.deepEqual(planFurviseMemoryRead(turn).petIds, ["mochi"]);
});

test("working memory keeps pet scope without triggering deep retrieval", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: ["pebble"], source: "selected_pet", unresolved: false },
    memoryNeed: "working",
  });
  const read = planFurviseMemoryRead(turn);
  assert.equal(read.depth, "working");
  assert.deepEqual(read.petIds, ["pebble"]);
});