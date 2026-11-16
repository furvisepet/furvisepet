import assert from "node:assert/strict";
import test from "node:test";
import { isAiEnabled, isAskEnabled } from "../app/lib/ai/availability.ts";
import { GET } from "../app/api/ai/availability/route.ts";

test("the global switch disables Ask even if its feature switch is enabled", () => {
  assert.equal(isAiEnabled({ FURVISE_AI_ENABLED: "false" }), false);
  assert.equal(isAskEnabled({ FURVISE_AI_ENABLED: "false", FURVISE_AI_ASK_ENABLED: "true" }), false);
  assert.equal(isAskEnabled({ FURVISE_AI_ASK_ENABLED: "false" }), false);
  assert.equal(isAskEnabled({ FURVISE_AI_ENABLED: "true", FURVISE_AI_ASK_ENABLED: "true" }), true);
});
test("availability is a read-only, uncached capability without diagnostics or provider access", async () => {
  const before = process.env.FURVISE_AI_ENABLED;
  const fetch = globalThis.fetch;
  process.env.FURVISE_AI_ENABLED = "false";
  globalThis.fetch = () => { throw Error("Availability must not access a provider"); };
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ask: false });
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
  } finally {
    globalThis.fetch = fetch;
    if (before === undefined) delete process.env.FURVISE_AI_ENABLED;
    else process.env.FURVISE_AI_ENABLED = before;
  }
});
