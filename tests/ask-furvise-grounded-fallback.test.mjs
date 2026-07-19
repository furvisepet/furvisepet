import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroundedAskPromptPayload,
  generateGroundedAskAnswer,
  isGroundedAskFallbackConfigured,
  mapGroundedAskOutputToAskResponse,
  parseGroundedAskOutput,
} from "../app/lib/ai/ask-furvise.ts";
import { buildPetMemoryContext } from "../app/lib/pet-memory.ts";

function rockyProfile(overrides = {}) {
  return {
    id: "pet-rocky",
    user_id: "user-1",
    name: "Rocky",
    species: "dog",
    breed: "German Shepherd",
    age_value: 5,
    age_unit: "years",
    weight_value: 70,
    weight_unit: "lb",
    current_food: "Chicken kibble",
    main_concern: "scratching after chicken-based food",
    wellness_goal: "nutrition",
    avoid_ingredients: ["chicken"],
    monthly_budget: 80,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-10T10:00:00Z",
    ...overrides,
  };
}

function rockyCareEntries(extra = []) {
  return [
    {
      id: "care-food",
      user_id: "user-1",
      pet_profile_id: "pet-rocky",
      category: "food",
      title: "Switched from chicken food",
      note: "Scratching seemed worse after chicken-based food.",
      severity: null,
      occurred_at: "2026-07-08T18:00:00Z",
      created_at: "2026-07-08T18:00:00Z",
      updated_at: "2026-07-08T18:00:00Z",
    },
    {
      id: "care-paws",
      user_id: "user-1",
      pet_profile_id: "pet-rocky",
      category: "symptom",
      title: "Licked paws after dinner",
      note: "Paw licking was mild and happened after dinner.",
      severity: "mild",
      occurred_at: "2026-07-12T19:00:00Z",
      created_at: "2026-07-12T19:00:00Z",
      updated_at: "2026-07-12T19:00:00Z",
    },
    {
      id: "care-normal",
      user_id: "user-1",
      pet_profile_id: "pet-rocky",
      category: "general",
      title: "Ate normally",
      note: "Finished dinner and drank water normally.",
      severity: null,
      occurred_at: "2026-07-13T02:00:00Z",
      created_at: "2026-07-13T02:00:00Z",
      updated_at: "2026-07-13T02:00:00Z",
    },
    ...extra,
  ];
}

function rockyMemory(extraEntries = []) {
  return buildPetMemoryContext({
    careEntries: rockyCareEntries(extraEntries),
    now: new Date("2026-07-13T12:00:00Z"),
    profile: rockyProfile(),
  });
}

function fakeClientForAnswer(buildAnswer) {
  const calls = [];
  return {
    calls,
    client: {
      responses: {
        async create(request) {
          calls.push(request);
          const payload = JSON.parse(request.input);
          return { output_text: JSON.stringify(buildAnswer(payload, request)) };
        },
      },
    },
  };
}

test("grounded Ask fallback is disabled without OpenAI configuration", async () => {
  assert.equal(isGroundedAskFallbackConfigured(""), false);
  assert.equal(isGroundedAskFallbackConfigured("sk-test"), true);
  assert.equal(
    await generateGroundedAskAnswer({
      apiKey: "",
      memory: rockyMemory(),
      question: "Do we have any notes about paws?",
    }),
    null,
  );
});

test("grounded Ask fallback uses configured OpenAI client and current model schema", async () => {
  const { calls, client } = fakeClientForAnswer((payload) => {
    const fact = payload.allowedFacts.find((item) => /paw licking/i.test(item));
    return {
      title: "Rocky's paw notes",
      answer: "The saved history includes a mild paw licking note after dinner.",
      usedSavedFacts: [fact],
      missingContext: [],
      suggestedNextLogs: ["Log whether paw licking repeats, improves, or worsens."],
      vetQuestions: ["What paw symptoms would make this urgent?"],
      safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
      cannotAnswerFromSavedData: false,
    };
  });

  const answer = await generateGroundedAskAnswer({
    client,
    memory: rockyMemory(),
    question: "Do we have any notes about paws?",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gpt-5.4-mini");
  assert.equal(calls[0].text.format.name, "furvise_grounded_ask");
  assert.equal(calls[0].text.format.strict, true);
  assert.match(answer.summary, /paw licking note/i);
  assert.ok(answer.sections.some((section) => section.heading === "Saved facts used"));
  assert.match(answer.safetyNote, /does not diagnose/);
});

test("grounded Ask payload includes water, paw, and eating facts from saved memory only", () => {
  const payload = buildGroundedAskPromptPayload(rockyMemory(), "Is there anything about water intake?");

  assert.ok(payload.allowedFacts.some((fact) => /drank water normally/i.test(fact)));
  assert.ok(payload.allowedFacts.some((fact) => /Licked paws after dinner/i.test(fact)));
  assert.ok(payload.allowedFacts.some((fact) => /Ate normally/i.test(fact)));
  assert.equal(payload.allowedFacts.some((fact) => /user-1|pet-rocky|care-/i.test(fact)), false);
});

test("grounded Ask output rejects unsupported saved facts and unsafe product or diagnosis claims", () => {
  const payload = buildGroundedAskPromptPayload(rockyMemory(), "Has Rocky been eating normally lately?");
  const fact = payload.allowedFacts.find((item) => /Ate normally/i.test(item));
  const base = {
    title: "Rocky's eating notes",
    answer: "Rocky's saved history says he ate normally.",
    usedSavedFacts: [fact],
    missingContext: [],
    suggestedNextLogs: ["Keep logging appetite and water intake."],
    vetQuestions: ["What appetite changes would be concerning?"],
    safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
    cannotAnswerFromSavedData: false,
  };

  assert.ok(parseGroundedAskOutput(base, payload.allowedFacts));
  assert.equal(parseGroundedAskOutput({ ...base, usedSavedFacts: ["Rocky runs five miles daily."] }, payload.allowedFacts), null);
  assert.equal(parseGroundedAskOutput({ ...base, answer: "Rocky has an allergy." }, payload.allowedFacts), null);
  assert.equal(parseGroundedAskOutput({ ...base, answer: "You should buy this product for Rocky." }, payload.allowedFacts), null);
});

test("grounded Ask fallback can answer supported water and eating questions", async () => {
  const cases = [
    ["Is there anything in Rocky's history about water intake?", /drank water normally/i],
    ["Has Rocky been eating normally lately?", /ate normally/i],
  ];

  for (const [question, pattern] of cases) {
    const { client } = fakeClientForAnswer((payload) => {
      const fact = payload.allowedFacts.find((item) => pattern.test(item));
      return {
        title: "Rocky's saved notes",
        answer: `The saved history includes this note: ${fact}`,
        usedSavedFacts: [fact],
        missingContext: [],
        suggestedNextLogs: ["Keep logging appetite, water intake, and timing."],
        vetQuestions: ["What changes would make this urgent?"],
        safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
        cannotAnswerFromSavedData: false,
      };
    });
    const answer = await generateGroundedAskAnswer({ client, memory: rockyMemory(), question });
    assert.match(answer.summary, pattern);
  }
});

test("grounded Ask fallback says when saved data does not support the question", () => {
  const response = mapGroundedAskOutputToAskResponse({
    title: "Rocky's diarrhea history",
    answer: "I do not see diarrhea logs in Rocky's saved history.",
    usedSavedFacts: [],
    missingContext: [],
    suggestedNextLogs: ["Log stool changes if they happen, including timing and severity."],
    vetQuestions: ["What stool changes should prompt a vet call?"],
    safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
    cannotAnswerFromSavedData: true,
  });

  assert.match(response.summary, /do not see diarrhea logs/i);
  assert.ok(response.sections.some((section) =>
    section.heading === "Missing context" &&
    section.items.some((item) => /does not contain enough detail/i.test(item))
  ));
  assert.match(response.safetyNote, /does not diagnose/);
});
