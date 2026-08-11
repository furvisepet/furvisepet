import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ASK_REQUEST_KEYS,
  buildAskRequestPayload,
  hasOnlyAskRequestKeys,
} from "../app/lib/ask-request-contract.ts";

const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const petId = "123e4567-e89b-42d3-a456-426614174001";

test("Ask client builds first-question and follow-up payloads with only server-approved fields", () => {
  const firstQuestion = buildAskRequestPayload({
    conversationId: null,
    locale: "en-CA",
    message: "What should I track?",
    petId,
    previousResponse: null,
    question: "What should I track?",
    requestId,
  });
  const previousResponse = { directAnswer: "Track appetite and energy.", summary: "Keep a short daily log." };
  const followUp = buildAskRequestPayload({
    conversationId: "123e4567-e89b-42d3-a456-426614174002",
    locale: "en-CA",
    message: "For how long?",
    petId,
    previousResponse,
    question: "For how long?",
    requestId,
  });

  assert.deepEqual(Object.keys(firstQuestion).sort(), [...ASK_REQUEST_KEYS].sort());
  assert.deepEqual(Object.keys(followUp).sort(), [...ASK_REQUEST_KEYS].sort());
  assert.equal(hasOnlyAskRequestKeys(firstQuestion), true);
  assert.equal(hasOnlyAskRequestKeys(followUp), true);
  assert.equal(firstQuestion.message, firstQuestion.question);
  assert.equal(followUp.message, followUp.question);
  assert.equal(followUp.previousResponse, previousResponse);
  assert.doesNotMatch(page, /storedAnalysis|readRelevantStoredAnalysis/);
  assert.match(page, /requestPayload = retry\?\.payload \|\| buildAskRequestPayload\(/);
  assert.match(page, /body: JSON\.stringify\(requestPayload\)/);
});

test("Ask route contract continues to reject unsupported fields", () => {
  const valid = buildAskRequestPayload({
    conversationId: null,
    locale: "en-CA",
    message: "Is this normal?",
    petId,
    previousResponse: null,
    question: "Is this normal?",
    requestId,
  });

  assert.equal(hasOnlyAskRequestKeys({ ...valid, storedAnalysis: { source: "browser" } }), false);
  assert.match(route, /if \(!hasOnlyKeys\(rawBody, ASK_REQUEST_KEYS\)\)/);
  assert.match(route, /askFailure\("INVALID_MESSAGE", "The request contains unsupported fields\.", 400/);
});
