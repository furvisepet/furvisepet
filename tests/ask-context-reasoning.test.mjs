import assert from "node:assert/strict";
import test from "node:test";

import {
  AskPipelineError,
  ASK_MAX_OUTPUT_TOKENS,
  areAskResponsesMateriallyIdentical,
  askUnifiedJsonSchema,
  buildAskContext,
  buildRankedAskContext,
  clearAskProviderCooldownsForTests,
  generateContextAwareAskResponse,
  getAskModelConfiguration,
} from "../app/lib/ai/ask-reasoning.ts";
import { buildRecentAskUpdates } from "../app/lib/ask-safety-context.ts";

const now = new Date("2026-07-27T20:00:00Z");

function profile(overrides = {}) {
  return {
    id: "pet-mani", user_id: "user-1", name: "Mani", species: "cat", breed: null,
    age_value: 4, age_unit: "years", weight_value: null, weight_unit: null,
    current_food: "salmon food", main_concern: null, wellness_goal: "general wellness",
    avoid_ingredients: ["chicken"], monthly_budget: null,
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-27T00:00:00Z", ...overrides,
  };
}

function care(overrides = {}) {
  return {
    id: "care-1", user_id: "user-1", pet_profile_id: "pet-mani", category: "general",
    title: "Routine note", note: "Rested after lunch", severity: null,
    occurred_at: "2026-07-27T18:00:00Z", created_at: "2026-07-27T18:01:00Z",
    updated_at: "2026-07-27T18:01:00Z", ...overrides,
  };
}

function input(overrides = {}) {
  const careEntries = overrides.careEntries || [care()];
  return {
    profiles: overrides.profiles || [profile()], careEntries,
    memories: overrides.memories || [], productFeedback: overrides.productFeedback || [], concerns: overrides.concerns || [],
    conversationTurns: overrides.conversationTurns || [], recentUpdates: buildRecentAskUpdates(careEntries, now),
    question: overrides.question || "How much play time is reasonable?", requestId: "11111111-1111-4111-8111-111111111111",
    locale: "en-CA", now, ...overrides,
  };
}

function unified(overrides = {}) {
  return {
    answer: "Short play sessions are a good starting point for Mani.",
    safetyLevel: "normal", suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    shoppingSuppressed: false, responseMode: "practical_guidance", userIntent: "routine care",
    relevantContextIds: ["profile:pet-mani:species"],
    messageUnderstanding: {
      primaryIntent: "question", secondaryIntents: [], userIsAskingQuestion: true,
      userIsProvidingUpdate: false, userIsCorrectingPriorInformation: false,
      userIsResolvingConcern: false, userIsProvidingPreference: false,
      userIsMakingSmallTalk: false, recoveryStatus: "none", recoveryConfidence: 1,
      recoveryEvidence: { outcome: "none", surfaceText: null, targetConcept: null, confidence: 1 }, requestedTopic: "routine care",
      referencedPet: "Mani", safetyRelevance: "none",
      needsClarification: false, canAnswerDirectly: true,
    },
    intelligenceSafety: {
      level: "routine", reason: "No current safety issue.",
      requiresImmediateAction: false, shoppingSuppressed: false,
    },
    learnings: [], careActions: [], semanticEvents: [],
    intelligenceMetadata: {
      confidence: "high", usedPetContext: true,
      usedCareHistory: false, usedMemories: false,
    },
    ...overrides,
  };
}

function mockClient(outputs) {
  const requests = [];
  return {
    requests,
    responses: { async create(request) { requests.push(request); const output = outputs[Math.min(requests.length - 1, outputs.length - 1)]; if (output instanceof Error) throw output; return { output_text: typeof output === "string" ? output : JSON.stringify(output) }; } },
  };
}

test("normal questions use one strict structured provider request and no planner call", async () => {
  const client = mockClient([unified()]);
  const result = await generateContextAwareAskResponse({ ...input(), client });
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0].text.format.schema, askUnifiedJsonSchema);
  assert.equal(client.requests[0].text.format.name, "furvise_ask_response");
  assert.equal(client.requests[0].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
  assert.doesNotMatch(client.requests[0].text.format.name, /planner/i);
  assert.equal(result.answer.summary, unified().answer);
});

test("one primary and optional fallback model replace planner and responder configuration", () => {
  assert.deepEqual(getAskModelConfiguration({ OPENAI_ASK_MODEL: "primary", OPENAI_ASK_FALLBACK_MODEL: "fallback" }), {
    primary: "primary", fallback: "fallback", primaryUsedDefault: false,
  });
});

test("compact context keeps no more than five updates, eight memories, and six turns", () => {
  const careEntries = Array.from({ length: 20 }, (_, index) => care({ id: `care-${index}`, occurred_at: `2026-07-${String(27 - index).padStart(2, "0")}T12:00:00Z` }));
  const memories = Array.from({ length: 12 }, (_, index) => ({ id: `memory-${index}`, user_id: "user-1", dog_profile_id: "pet-mani", type: "routine", text: `Routine ${index}`, confidence: "high", source: "owner", created_at: "2026-07-20T00:00:00Z" }));
  const conversationTurns = Array.from({ length: 10 }, (_, index) => ({ id: `turn-${index}`, role: index % 2 ? "furvise" : "user", text: `Turn ${index}`, createdAt: `2026-07-27T${String(index).padStart(2, "0")}:00:00Z` }));
  const context = buildAskContext(input({ careEntries, memories, conversationTurns }));
  assert.ok(context.records.filter((item) => item.sourceType === "care_update").length <= 5);
  assert.ok(context.records.filter((item) => item.sourceType === "remembered_detail").length <= 8);
  assert.ok(context.records.filter((item) => item.sourceType === "conversation_turn").length <= 6);
  assert.match(context.promptContext.olderUpdateSummary, /older update/);
});

test("irrelevant old history is excluded while latest relevant history remains", () => {
  const entries = [
    care({ id: "latest-food", category: "food", title: "Food changed", note: "Started salmon food", occurred_at: "2026-07-27T19:00:00Z" }),
    ...Array.from({ length: 10 }, (_, index) => care({ id: `old-nails-${index}`, category: "grooming", title: "Nail trim", note: "Nails trimmed", occurred_at: `2026-06-${String(index + 1).padStart(2, "0")}T12:00:00Z` })),
  ];
  const records = buildRankedAskContext(input({ careEntries: entries, question: "Should Mani eat the salmon food?" }));
  assert.ok(records.some((record) => record.id === "care:latest-food"));
  assert.ok(records.filter((record) => /old-nails/.test(record.id)).length < 10);
});

test("occurred_at determines the latest real-world update", () => {
  const entries = [
    care({ id: "real-latest", title: "Real latest", occurred_at: "2026-07-27T19:00:00Z", created_at: "2026-07-01T00:00:00Z" }),
    care({ id: "created-latest", title: "Created latest", occurred_at: "2026-07-20T00:00:00Z", created_at: "2026-07-27T19:30:00Z" }),
  ];
  const updates = buildRankedAskContext(input({ careEntries: entries })).filter((record) => record.sourceType === "care_update");
  assert.equal(updates[0].id, "care:real-latest");
});

test("active semantic state outranks old history while unrelated resolved episodes stay out of context", () => {
  const activeEpisodes = [{ id: "episode-active", pet_profile_id: "pet-mani", normalized_key: "safety_pet_missing", episode_type: "care_tracking", title: "Pet missing", severity: "urgent", status: "active", sequence_number: 1, recurrence_of: null, started_at: "2026-07-27T19:00:00Z", last_event_at: "2026-07-27T19:00:00Z", resolved_at: null }];
  const resolvedEpisodes = [{ ...activeEpisodes[0], id: "episode-resolved", normalized_key: "health_vomiting", title: "Vomiting", status: "resolved", severity: "routine", started_at: "2026-06-01T00:00:00Z", last_event_at: "2026-06-02T00:00:00Z", resolved_at: "2026-06-02T00:00:00Z" }];
  const records = buildRankedAskContext(input({ activeEpisodes, recentlyResolvedEpisodes: resolvedEpisodes, question: "Is Mani still missing?" }));
  assert.equal(records.some((record) => record.id === "episode:episode-active"), true);
  assert.equal(records.some((record) => record.id === "episode:episode-resolved"), false);
  assert.equal(records.find((record) => record.id === "episode:episode-active")?.status, "active");
});

test("a resolved missing-pet episode does not influence a future unrelated question", () => {
  const resolvedMissing = [{
    id: "episode-found", pet_profile_id: "pet-mani", normalized_key: "safety_missingpet", episode_type: "care_tracking",
    title: "Mani ran away", severity: "urgent", status: "resolved", sequence_number: 1, recurrence_of: null,
    started_at: "2026-07-27T18:00:00Z", last_event_at: "2026-07-27T19:00:00Z", resolved_at: "2026-07-27T19:00:00Z",
    summary: { semanticDomain: "safety", semanticTopic: "missingpet", latestStatus: "resolved" },
  }];
  const records = buildRankedAskContext(input({ recentlyResolvedEpisodes: resolvedMissing, question: "How often should I brush Mani's teeth?" }));
  assert.equal(records.some((record) => record.id === "episode:episode-found"), false);
});

test("deterministic urgent context forces urgent safety and shopping suppression", async () => {
  const entries = [care({ id: "breathing", category: "symptom", title: "Breathing trouble", note: "Open-mouth breathing and weakness", severity: "severe" })];
  const concerns = [{
    id: "concern-breathing", user_id: "user-1", pet_profile_id: "pet-mani", title: "Breathing trouble",
    normalized_key: "breathing", status: "active", severity: "urgent", source_care_entry_id: "breathing",
    opened_at: "2026-07-27T18:00:00Z", updated_at: "2026-07-27T18:00:00Z", resolved_at: null, resolution_note: null,
  }];
  const client = mockClient([unified({ answer: "Contact an emergency veterinarian now. Do not force food while Mani's breathing is abnormal.", relevantContextIds: ["care:breathing"] })]);
  const result = await generateContextAwareAskResponse({ ...input({ careEntries: entries, concerns, question: "Which food should I buy?" }), client });
  assert.equal(result.safetyLevel, "urgent");
  assert.equal(result.shoppingSuppressed, true);
  assert.equal(result.responseMode, "urgent_safety");
  assert.ok(result.relevantContextIds.includes("care:breathing"));
});

test("a resolved urgent update is marked resolved and does not force urgent mode", async () => {
  const entries = [
    care({ id: "symptom", category: "symptom", title: "Deep breathing", note: "Taking deep breaths", occurred_at: "2026-07-27T16:00:00Z" }),
    care({ id: "resolved", category: "symptom", title: "Back to normal", note: "Breathing returned to normal after resting", occurred_at: "2026-07-27T17:00:00Z" }),
  ];
  const records = buildRankedAskContext(input({ careEntries: entries, question: "Can Mani eat now?" }));
  assert.equal(records.find((record) => record.id === "care:symptom")?.status, "resolved");
  const result = await generateContextAwareAskResponse({ ...input({ careEntries: entries, question: "Can Mani eat now?" }), client: mockClient([unified()]) });
  assert.equal(result.safetyLevel, "normal");
});

test("reported improvement can offer a history update without auto-saving it", async () => {
  const proposed = { shouldOffer: true, category: "symptom", title: "Breathing returned to normal", details: "Mani's breathing returned to normal after resting.", severity: "mild", resolvesConcernId: "concern-1" };
  const result = await generateContextAwareAskResponse({ ...input({ question: "Mani is breathing normally now" }), client: mockClient([unified({ answer: "I'm glad Mani's breathing is back to normal. Keep an eye on it for now.", proposedHistoryUpdate: proposed })]) });
  assert.deepEqual(result.proposedHistoryUpdate, proposed);
});

test("casual greetings remain short while retaining the safe structured-output budget", async () => {
  const client = mockClient([unified({ answer: "Hi! How is Mani doing today?", responseMode: "conversational", userIntent: "casual" })]);
  const result = await generateContextAwareAskResponse({ ...input({ question: "yo" }), client });
  assert.equal(result.responseMode, "conversational");
  assert.ok(result.answer.summary.length < 120);
  assert.equal(client.requests[0].max_output_tokens, ASK_MAX_OUTPUT_TOKENS);
});

test("a token-based 429 retries once with a distinct fallback model and same request context", async () => {
  const previousPrimary = process.env.OPENAI_ASK_MODEL;
  const previousFallback = process.env.OPENAI_ASK_FALLBACK_MODEL;
  process.env.OPENAI_ASK_MODEL = "primary-model";
  process.env.OPENAI_ASK_FALLBACK_MODEL = "fallback-model";
  const limited = new Error("limited"); limited.status = 429; limited.code = "rate_limit_exceeded"; limited.type = "tokens"; limited.headers = { "retry-after": "0" };
  const client = mockClient([limited, unified()]);
  try {
    const result = await generateContextAwareAskResponse({ ...input(), client });
    assert.equal(client.requests.length, 2);
    assert.equal(client.requests[0].model, "primary-model");
    assert.equal(client.requests[1].model, "fallback-model");
    assert.equal(client.requests[1].max_output_tokens, client.requests[0].max_output_tokens);
    assert.equal(result.model, "fallback-model");
  } finally {
    if (previousPrimary === undefined) delete process.env.OPENAI_ASK_MODEL; else process.env.OPENAI_ASK_MODEL = previousPrimary;
    if (previousFallback === undefined) delete process.env.OPENAI_ASK_FALLBACK_MODEL; else process.env.OPENAI_ASK_FALLBACK_MODEL = previousFallback;
  }
});

test("a requests-based 429 never retries the same or fallback model immediately", async () => {
  clearAskProviderCooldownsForTests();
  const previousPrimary = process.env.OPENAI_ASK_PRIMARY_MODEL;
  const previousFallback = process.env.OPENAI_ASK_FALLBACK_MODEL;
  process.env.OPENAI_ASK_PRIMARY_MODEL = "rate-limited-model";
  process.env.OPENAI_ASK_FALLBACK_MODEL = "other-model";
  const limited = new Error("limited"); limited.status = 429; limited.code = "rate_limit_exceeded"; limited.type = "requests"; limited.headers = { "retry-after": "4" };
  const client = mockClient([limited, unified()]);
  try {
    await assert.rejects(generateContextAwareAskResponse({ ...input(), client }), (error) => error instanceof AskPipelineError && error.stage === "primary_provider_failed" && error.diagnostics.retryAfterMs === 4000);
    assert.equal(client.requests.length, 1);
    await assert.rejects(generateContextAwareAskResponse({ ...input(), client }), (error) => error instanceof AskPipelineError && error.diagnostics.providerErrorType === "requests");
    assert.equal(client.requests.length, 1);
  } finally {
    clearAskProviderCooldownsForTests();
    if (previousPrimary === undefined) delete process.env.OPENAI_ASK_PRIMARY_MODEL; else process.env.OPENAI_ASK_PRIMARY_MODEL = previousPrimary;
    if (previousFallback === undefined) delete process.env.OPENAI_ASK_FALLBACK_MODEL; else process.env.OPENAI_ASK_FALLBACK_MODEL = previousFallback;
  }
});

test("missing or same-model fallback is skipped safely", async () => {
  const previousPrimary = process.env.OPENAI_ASK_PRIMARY_MODEL;
  const previousFallback = process.env.OPENAI_ASK_FALLBACK_MODEL;
  process.env.OPENAI_ASK_PRIMARY_MODEL = "same-model";
  process.env.OPENAI_ASK_FALLBACK_MODEL = "same-model";
  const limited = new Error("limited"); limited.status = 429; limited.code = "rate_limit_exceeded"; limited.type = "tokens";
  const client = mockClient([limited, unified()]);
  try {
    await assert.rejects(generateContextAwareAskResponse({ ...input(), client }), AskPipelineError);
    assert.equal(client.requests.length, 1);
  } finally {
    if (previousPrimary === undefined) delete process.env.OPENAI_ASK_PRIMARY_MODEL; else process.env.OPENAI_ASK_PRIMARY_MODEL = previousPrimary;
    if (previousFallback === undefined) delete process.env.OPENAI_ASK_FALLBACK_MODEL; else process.env.OPENAI_ASK_FALLBACK_MODEL = previousFallback;
  }
});

test("invalid structured output alone triggers one repair call", async () => {
  const client = mockClient(["not-json", unified()]);
  const result = await generateContextAwareAskResponse({ ...input(), client });
  assert.equal(client.requests.length, 2);
  assert.equal(result.answer.summary, unified().answer);
});

test("a materially identical assistant answer is repaired before it can be persisted", async () => {
  const repeated = unified({ answer: "How is Mani breathing right now? Contact an emergency veterinarian if the breathing is still difficult." });
  const contextual = unified({ answer: "I’m glad Mani seems better. Keep an eye on breathing and energy after activity for a little while.", safetyLevel: "monitor" });
  const client = mockClient([repeated, contextual]);
  const result = await generateContextAwareAskResponse({
    ...input({
      question: "she is good",
      concernStateHint: "improved",
      conversationTurns: [{ id: "prior-assistant", role: "furvise", text: repeated.answer, createdAt: "2026-07-27T19:00:00Z" }],
    }),
    client,
  });
  assert.equal(client.requests.length, 2);
  assert.equal(result.answer.summary, contextual.answer);
  assert.equal(areAskResponsesMateriallyIdentical(result.answer.summary, repeated.answer), false);
});

test("unknown gender is neutralized while explicitly saved pronouns are preserved", async () => {
  const neutral = await generateContextAwareAskResponse({ ...input(), client: mockClient([unified({ answer: "She can start with short play sessions." })]) });
  assert.doesNotMatch(neutral.answer.summary, /\bshe\b/i);
  const explicit = await generateContextAwareAskResponse({ ...input({ profiles: [profile({ pronouns: "she/her" })] }), client: mockClient([unified({ answer: "She can start with short play sessions." })]) });
  assert.match(explicit.answer.summary, /\bShe\b/);
});

test("strict pet isolation excludes care rows for pets not supplied by ownership lookup", () => {
  const records = buildRankedAskContext(input({ careEntries: [care(), care({ id: "other", pet_profile_id: "pet-other", note: "Private other pet note" })] }));
  assert.equal(records.some((record) => record.value.includes("Private other pet note")), false);
});
