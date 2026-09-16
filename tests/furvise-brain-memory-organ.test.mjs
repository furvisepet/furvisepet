import assert from "node:assert/strict";
import test from "node:test";

import { planFurviseMemoryRead } from "../app/lib/furvise-brain/memory-organ.ts";
import { createFurviseTurnAuthority } from "../app/lib/furvise-brain/turn-authority.ts";

test("unresolved subject disables memory retrieval", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: [], source: "unresolved", unresolved: true },
    memoryNeed: "lifetime",
  });
  const read = planFurviseMemoryRead(turn);
  assert.equal(read.depth, "none");
  assert.deepEqual(read.petIds, []);
});

test("memory organ receives exactly the brain-approved pets", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: ["pebble", "mochi"], source: "explicit", unresolved: false },
    memoryNeed: "lifetime",
  });
  const read = planFurviseMemoryRead(turn);
  assert.equal(read.depth, "lifetime");
  assert.deepEqual(read.petIds, ["pebble", "mochi"]);
  assert.equal(Object.isFrozen(read), true);
  assert.equal(Object.isFrozen(read.petIds), true);
});

test("working-memory conversation does not trigger lifetime retrieval", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: ["pebble"], source: "selected_pet", unresolved: false },
    memoryNeed: "working",
  });
  const read = planFurviseMemoryRead(turn);
  assert.equal(read.depth, "working");
  assert.deepEqual(read.petIds, ["pebble"]);
});
