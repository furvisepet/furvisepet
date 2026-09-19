import assert from "node:assert/strict";
import test from "node:test";

import {
  findExplicitCareRecordAuthorization,
  findExplicitPendingTaskCancellation,
} from "../app/lib/furvise-brain/mutation-authorization.ts";

for (const message of [
  "save it, please",
  "keep that as a note",
  "please put that in his care record",
  "could you record what I just told you",
  "Also add that she drank normally.",
  "guárdalo en sus notas",
  "記録に残して",
]) {
  test(`explicit care-record command is recognized: ${message}`, () => {
    assert.ok(findExplicitCareRecordAuthorization(message));
  });
}

for (const message of [
  "Pebble rolled down the hill yesterday lol",
  "I mean Pebble",
  "so what u think",
  "but i didnt asked to save notes",
  "did you save that?",
  "what does the phrase save this mean?",
  'she said "save this as a note"',
  "if it gets worse, save it",
  "pretend I said save that",
  "Keep it tied to the saved note.",
  "Keep the answer grounded in the saved record.",
]) {
  test(`non-authorizing language stays read/conversation only: ${message}`, () => {
    assert.equal(findExplicitCareRecordAuthorization(message), null);
  });
}

test("current user can explicitly cancel a pending save", () => {
  assert.ok(findExplicitPendingTaskCancellation("don't keep it"));
  assert.ok(findExplicitPendingTaskCancellation("cancel that save"));
  assert.ok(findExplicitPendingTaskCancellation("never mind"));
  assert.equal(findExplicitPendingTaskCancellation("what do you think?"), null);
});
