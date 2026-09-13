import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ASK_REQUEST_KEYS, buildAskRequestPayload, hasOnlyAskRequestKeys } from "../app/lib/ask-request-contract.ts";

const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const logicalTurnId = "123e4567-e89b-42d3-a456-426614174000";
const petId = "123e4567-e89b-42d3-a456-426614174001";

test("Ask payload has one message and one logical-turn identity", () => {
  const payload = buildAskRequestPayload({
    conversationId: null,
    locale: "en-CA",
    logicalTurnId,
    message: "What should I track?",
    petId,
  });
  assert.deepEqual(Object.keys(payload).sort(), [...ASK_REQUEST_KEYS].sort());
  assert.equal(hasOnlyAskRequestKeys(payload), true);
  assert.equal(payload.logicalTurnId, logicalTurnId);
  assert.equal("question" in payload, false);
  assert.equal("previousResponse" in payload, false);
  assert.equal("requestId" in payload, false);
});

test("new send, retry, edit, suggestion, and action identities are separated", () => {
  assert.match(page, /const logicalTurnId = retry\?\.logicalTurnId \|\| crypto\.randomUUID\(\)/);
  assert.match(page, /requestPayload = retry\?\.payload \|\| buildAskRequestPayload\(/);
  assert.match(page, /body: JSON\.stringify\(requestPayload\)/);
  assert.match(page, /setQuestion\(failedRequest\.payload\.message\)/);
  assert.match(page, /\/api\/ask\/actions\/\$\{encodeURIComponent\(messageId\)\}/);
  assert.doesNotMatch(page, /previousResponse|\bquestion:\s*trimmed|requestId:\s*logicalTurnId/);
});

test("Ask route rejects unsupported fields", () => {
  const valid = buildAskRequestPayload({ conversationId: null, locale: "en-CA", logicalTurnId, message: "Is this normal?", petId });
  assert.equal(hasOnlyAskRequestKeys({ ...valid, previousResponse: {} }), false);
  assert.match(route, /if \(!hasOnlyKeys\(rawBody, ASK_REQUEST_KEYS\)\)/);
  assert.match(route, /askFailure\("INVALID_MESSAGE", "The request contains unsupported fields\.", 400/);
});
