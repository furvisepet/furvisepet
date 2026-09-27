import assert from "node:assert/strict";
import test from "node:test";
import { engineFixture as fixture } from "./helpers/ask-route-ordering.mjs";

test("source-bound proposal has no persistence authority before confirmation", async () => {
  const f=fixture();assert.equal((await f.send()).status,200);
  assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.rows.ask_action_capabilities[0].receipt,null);
  assert.equal(f.state.events.filter(event=>event==='heart:execute').length,0);
});

import { ownerNoteSourceSpans, explicitNoteTime } from "../app/lib/intelligence/owner-note-request.ts";

// These helpers still feed the active planner/contract. Spans are suggestions,
// not write authority; the HTTP confirmation invariant above remains mandatory.
for (const [message, note, companion] of [
  ["Pebble skipped breakfast but ate dinner fine. A bit slower on the evening walk. Save that for today.", "Pebble skipped breakfast but ate dinner fine. A bit slower on the evening walk.", null],
  ["Cedar ate less this morning. Log that, then tell me Cedar's last two weights and whether this note includes a weight.", "Cedar ate less this morning.", "tell me Cedar's last two weights and whether this note includes a weight."],
  ["Log that Cedar refused breakfast. Then list Cedar\u2019s last two weights. This new note has no weight.", "Cedar refused breakfast.", "Then list Cedar\u2019s last two weights. This new note has no weight."],
  ["Save this for today on Aster: drank more water than usual after the walk. Is that the first water note I have, or did I log thirst before?", "drank more water than usual after the walk.", "Is that the first water note I have, or did I log thirst before?"],
  ["Cedar ate normally at dinner today. Log that, then tell me Cedar's last two weights and whether this note includes a weight.", "Cedar ate normally at dinner today.", "tell me Cedar's last two weights and whether this note includes a weight."],
]) test("active source-span suggestions preserve note and companion: " + message, () => {
  const spans = ownerNoteSourceSpans(message, "source");
  assert.equal(spans.find(span => span.role === "note")?.text, note);
  assert.equal(spans.find(span => span.role === "companion")?.text ?? null, companion);
  for (const span of spans) {
    assert.equal(message.slice(span.start, span.end), span.text);
    assert.equal(span.sourceMessageId, "source");
    assert.ok(Object.isFrozen(span));
  }
});

test("shared date parser preserves the source-local day without inventing undated time", () => {
  const zone = "America/Vancouver", recordedAt = "2026-09-19T07:04:12.000Z";
  for (const phrase of ["today", "this morning", "this afternoon", "this evening", "tonight"]) {
    const time = explicitNoteTime("Cedar ate normally " + phrase + ".", zone, recordedAt);
    assert.equal(time.explicitTime, "2026-09-19");
    assert.ok(time.occurredAt);
  }
  assert.equal(explicitNoteTime("Cedar ate normally yesterday.", zone, recordedAt).explicitTime, "2026-09-18");
  assert.deepEqual(explicitNoteTime("Cedar ate normally.", zone, recordedAt), { occurredAt: null, explicitTime: null });
  assert.equal(explicitNoteTime("September 14, 2026 around 7:30 PM", zone).occurredAt, "2026-09-15T02:30:00.000Z");
});
