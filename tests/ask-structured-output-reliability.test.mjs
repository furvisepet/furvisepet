import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ASK_MAX_OUTPUT_TOKENS,
  AskPipelineError,
  askUnifiedJsonSchema,
  buildAskProviderRequest,
  generateContextAwareAskResponse,
} from "../app/lib/ai/ask-reasoning.ts";
import { interpretStructuredProviderResponse } from "../app/lib/ai/ask-provider.ts";

function profile() {
  return {
    id: "pet-maple", user_id: "user-1", name: "Maple", species: "dog", breed: null,
    age_value: 4, age_unit: "years", weight_value: null, weight_unit: null,
    current_food: null, main_concern: null, wellness_goal: null, avoid_ingredients: [], monthly_budget: null,
    created_at: "2026-07-28T00:00:00Z", updated_at: "2026-07-28T00:00:00Z",
  };
}

function providerOutput(overrides = {}) {
  return {
    answer: "Contact an emergency veterinarian now because Maple's extreme tiredness with abnormal breathing after activity can be serious.",
    safetyLevel: "urgent",
    suggestedFollowUps: ["Is Maple breathing with an open mouth or using the belly to breathe?"],
    proposedHistoryUpdate: { shouldOffer: true, category: "symptom", title: "Deep breathing after activity", details: "Maple was extremely tired and taking deep breaths after running.", severity: "urgent", resolvesConcernId: null },
    responseMode: "urgent_safety",
    userIntent: "report urgent breathing change",
    relevantContextIds: ["profile:pet-maple:species"],
    messageUnderstanding: {
      primaryIntent: "new_symptom", secondaryIntents: [], userIsAskingQuestion: false,
      userIsProvidingUpdate: true, userIsCorrectingPriorInformation: false,
      userIsResolvingConcern: false, userIsProvidingPreference: false,
      userIsMakingSmallTalk: false, requestedTopic: "breathing", referencedPet: "Maple",
      safetyRelevance: "direct", needsClarification: false, canAnswerDirectly: true,
    },
    intelligenceSafety: { level: "urgent", reason: "Explicit abnormal breathing and extreme fatigue.", requiresImmediateAction: true },
    learnings: [],
    careActions: [{ action: "create_entry", category: "symptom", title: "Deep breathing after activity", details: "Maple was extremely tired and taking deep breaths after running.", severity: "urgent", confidence: 0.99, relatedRecordId: null }],
    ...overrides,
  };
}

function input(client, onProviderEvent) {
  return {
    profiles: [profile()], careEntries: [], memories: [], productFeedback: [], concerns: [], recentlyResolvedConcerns: [],
    conversationTurns: [], recentUpdates: [], question: "Maple ran hard outside and now she is extremely tired and taking deep breaths.",
    requestId: "13d00733-5d10-48b1-8e7b-bf834236dbb9", locale: "en-CA", client, onProviderEvent,
  };
}

function clientWith(responses) {
  const requests = [];
  return {
    requests,
    responses: {
      async create(request) {
        requests.push(request);
        return responses[Math.min(requests.length - 1, responses.length - 1)];
      },
    },
  };
}

test("Ask uses one canonical 4096-token native strict structured-output request", () => {
  const request = buildAskProviderRequest({ currentMessage: "hello" });
  assert.equal(ASK_MAX_OUTPUT_TOKENS, 4096);
  assert.equal(request.max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.deepEqual(request.text.format, { type: "json_schema", name: "furvise_ask_response", strict: true, schema: askUnifiedJsonSchema });
});

test("a complete structured result larger than the old 2048-character boundary parses once", async () => {
  let parseCount = 0;
  const long = providerOutput({
    answer: `Contact an emergency veterinarian now. ${"Keep Maple quiet and cool while arranging care. ".repeat(30)}`.slice(0, 1750),
    learnings: Array.from({ length: 5 }, (_, index) => ({
      subjectType: "pet", subjectId: "pet-maple", category: "observation", factKey: `explicit_update_${index}`,
      factValue: `Observed update ${index}`, confidence: 0.99, importance: "high", durability: "temporary",
      action: "create", sourceExcerpt: "Maple ran hard outside and now she is extremely tired and taking deep breaths.",
    })),
  });
  const raw = JSON.stringify(long);
  assert.ok(raw.length > 2048);
  const result = interpretStructuredProviderResponse({ status: "completed", output_text: raw }, (text) => {
    parseCount += 1;
    return JSON.parse(text);
  });
  assert.equal(result.status, "completed");
  assert.equal(parseCount, 1);
});

test("known length-limited output is classified as incomplete and never parsed", () => {
  let parseCount = 0;
  const result = interpretStructuredProviderResponse({
    status: "incomplete", output_text: '{"answer":"cut off', incomplete_details: { reason: "max_output_tokens" },
    usage: { input_tokens: 800, output_tokens: 4096 },
  }, () => { parseCount += 1; return {}; });
  assert.equal(result.status, "incomplete");
  assert.equal(result.errorCode, "ASK_OUTPUT_INCOMPLETE");
  assert.equal(result.parsingAttempted, false);
  assert.equal(parseCount, 0);
});

test("refusal and provider failure remain distinct from malformed output", () => {
  const refused = interpretStructuredProviderResponse({
    status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot comply" }] }],
  }, JSON.parse);
  const failed = interpretStructuredProviderResponse({
    status: "failed", error: { code: "provider_error", message: "Generation failed" },
  }, JSON.parse);
  assert.equal(refused.status, "refused");
  assert.equal(refused.errorCode, "ASK_OUTPUT_REFUSED");
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "provider_error");
});

test("one bounded corrected retry can recover from incomplete output", async () => {
  const client = clientWith([
    { status: "incomplete", output_text: '{"answer":"cut off', incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 900, output_tokens: 4096 } },
    { status: "completed", output_text: JSON.stringify(providerOutput()), usage: { input_tokens: 900, output_tokens: 720 } },
  ]);
  const events = [];
  const result = await generateContextAwareAskResponse(input(client, (event) => events.push(event)));
  assert.equal(result.safetyLevel, "urgent");
  assert.equal(client.requests.length, 2);
  assert.equal(client.requests[0].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.equal(client.requests[1].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.deepEqual(events.map((event) => `${event.stage}:${event.outcome}`), ["primary:started", "primary:failed", "repair:started", "repair:succeeded"]);
  assert.equal(events[1].providerErrorCode, "ASK_OUTPUT_INCOMPLETE");
  assert.equal(events[1].parsingAttempted, false);
});

test("repeated malformed completed output stops after one repair", async () => {
  const client = clientWith([
    { status: "completed", output_text: "not-json" },
    { status: "completed", output_text: '{"still":"invalid"}' },
  ]);
  await assert.rejects(generateContextAwareAskResponse(input(client)), (error) =>
    error instanceof AskPipelineError && error.stage === "fallback_invalid_output" && error.diagnostics.providerErrorCode === "ASK_OUTPUT_INVALID");
  assert.equal(client.requests.length, 2);
});

test("provider success is emitted only after parsing and schema validation", async () => {
  const events = [];
  const client = clientWith([{ status: "completed", output_text: JSON.stringify(providerOutput()) }]);
  await generateContextAwareAskResponse(input(client, (event) => events.push(event)));
  assert.deepEqual(events.map((event) => event.outcome), ["started", "succeeded"]);
  assert.equal(events[1].parsingAttempted, true);
});

test("urgent output missing explicit escalation is repaired deterministically", async () => {
  const client = clientWith([{ status: "completed", output_text: JSON.stringify(providerOutput({ answer: "Keep Maple still and monitor breathing closely." })) }]);
  const result = await generateContextAwareAskResponse(input(client));
  assert.match(result.answer.summary, /^Contact an emergency veterinarian now\./);
  assert.equal(client.requests.length, 1);
});

test("the reduced contract bounds ordinary output fields and omits deterministic metadata", () => {
  assert.equal(askUnifiedJsonSchema.properties.answer.maxLength, 1800);
  assert.equal(askUnifiedJsonSchema.properties.suggestedFollowUps.maxItems, 1);
  assert.equal(askUnifiedJsonSchema.properties.learnings.maxItems, 5);
  assert.equal(askUnifiedJsonSchema.properties.careActions.maxItems, 3);
  assert.equal("shoppingSuppressed" in askUnifiedJsonSchema.properties, false);
  assert.equal("intelligenceMetadata" in askUnifiedJsonSchema.properties, false);
});

test("canonical mutations remain after provider, schema, answer validation, and governance", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const runIndex = route.indexOf("runFurviseIntelligence({");
  const validatedIndex = route.indexOf('logAskStage("intelligence validated"');
  const assistantIndex = route.indexOf("async function persistAssistantAnswer");
  const canonicalWriteIndex = route.indexOf("persistIntelligenceLearnings({", assistantIndex);
  assert.ok(runIndex > -1 && validatedIndex > runIndex && canonicalWriteIndex > validatedIndex);
  assert.match(route.slice(route.indexOf("} catch (error) {", route.indexOf("orchestration =")), route.indexOf("const reasoning")), /safeReleaseAiCredit/);
});

test("retry UI reuses one request ID, blocks concurrent clicks, and preserves the user message", () => {
  const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
  const ask = page.slice(page.indexOf("async function ask("), page.indexOf("function editFailedMessage"));
  assert.match(ask, /retry\?\.requestId \|\| createRequestId\(\)/);
  assert.match(ask, /askRequestActiveRef\.current/);
  assert.match(ask, /if \(!retry\) setThread/);
  assert.match(ask, /setFailedRequest\(null\)/);
});

test("Ask logs provider calls, output completion details, retry reuse, and credit final state", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  for (const field of ["providerCallCount", "configuredOutputLimit", "outputTokens", "finishReason", "incompleteReason", "parsingAttempted", "creditReservationId", "creditFinalState", "retryReuse"]) {
    assert.match(route, new RegExp(field));
  }
});
