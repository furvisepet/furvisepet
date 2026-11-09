import assert from "node:assert/strict";
import test from "node:test";
import {POST,messageId,request} from "./helpers/ask-read-only-action-routes.mjs";

test("public Ask cannot execute even an existing owner-note confirmation", async () => {
  let databaseCalls=0,providerCalls=0;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>{providerCalls++;throw new Error("disabled confirmation attempted provider access");};
  globalThis.__readOnlyMutationAuth={userId:"owner",supabase:new Proxy({},{get(){databaseCalls++;throw new Error("disabled confirmation attempted database access");}})};
  try {
    const response=await POST(request(),{params:Promise.resolve({messageId})});
    assert.equal(response.status,404);
    assert.deepEqual(await response.json(),{error:"That action is no longer available."});
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.equal(databaseCalls,0);assert.equal(providerCalls,0);
  } finally {globalThis.fetch=oldFetch;delete globalThis.__readOnlyMutationAuth;}
});

import { ownerNoteSourceSpans, explicitNoteTime } from "../app/lib/intelligence/owner-note-request.ts";

// Retained shared helpers preserve source spans and local dates, without granting
// write authority. The actual public confirmation-denial invariant is tested above.
for (const [message, note, companion] of [
  ["Pebble skipped breakfast but ate dinner fine. A bit slower on the evening walk. Save that for today.", "Pebble skipped breakfast but ate dinner fine. A bit slower on the evening walk.", null],
  ["Cedar ate less this morning. Log that, then tell me Cedar's last two weights and whether this note includes a weight.", "Cedar ate less this morning.", "tell me Cedar's last two weights and whether this note includes a weight."],
  ["Log that Cedar refused breakfast. Then list Cedar\u2019s last two weights. This new note has no weight.", "Cedar refused breakfast.", "Then list Cedar\u2019s last two weights. This new note has no weight."],
  ["Save this for today on Aster: drank more water than usual after the walk. Is that the first water note I have, or did I log thirst before?", "drank more water than usual after the walk.", "Is that the first water note I have, or did I log thirst before?"],
  ["Cedar ate normally at dinner today. Log that, then tell me Cedar's last two weights and whether this note includes a weight.", "Cedar ate normally at dinner today.", "tell me Cedar's last two weights and whether this note includes a weight."],
]) test("shared source-span suggestions preserve note and companion: " + message, () => {
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
