import assert from "node:assert/strict";
import test from "node:test";
import {
  answerPetMemoryQuestion,
  buildDashboardNextStep,
  buildPetMemoryContext,
  buildResultsUnderstanding,
  buildVetPrepSummary,
  getEntriesInDateRange,
  shouldUseGroundedAskFallback,
  summarizeFoodNotes,
  summarizeRecentChanges,
} from "../app/lib/pet-memory.ts";

const now = new Date("2026-07-13T12:00:00Z");

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
      id: "care-last-week",
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
      id: "care-this-week",
      user_id: "user-1",
      pet_profile_id: "pet-rocky",
      category: "symptom",
      title: "Scratching after dinner",
      note: "Licked paws more than usual in the evening.",
      severity: "mild",
      occurred_at: "2026-07-12T19:00:00Z",
      created_at: "2026-07-12T19:00:00Z",
      updated_at: "2026-07-12T19:00:00Z",
    },
    {
      id: "care-today",
      user_id: "user-1",
      pet_profile_id: "pet-rocky",
      category: "food",
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

function rockyCareEntry(overrides = {}) {
  return {
    id: "care-extra",
    user_id: "user-1",
    pet_profile_id: "pet-rocky",
    category: "general",
    title: "Extra update",
    note: "Extra detail.",
    severity: null,
    occurred_at: "2026-07-13T02:00:00Z",
    created_at: "2026-07-13T02:00:00Z",
    updated_at: "2026-07-13T02:00:00Z",
    ...overrides,
  };
}

test("pet memory builder creates one structured context from saved profile rows", () => {
  const memory = buildPetMemoryContext({
    careEntries: rockyCareEntries(),
    now,
    productFeedback: [
      {
        id: "feedback-1",
        user_id: "user-1",
        dog_profile_id: "pet-rocky",
        product_id: "salmon-food",
        product_name: "Salmon Food",
        feedback_type: "worked",
        note: "Liked it",
        created_at: "2026-07-11T10:00:00Z",
      },
    ],
    profile: rockyProfile(),
    savedMemories: [
      {
        id: "memory-owner",
        user_id: "user-1",
        dog_profile_id: "pet-rocky",
        type: "owner_observation",
        text: "Rocky gets itchy after some dinners.",
        confidence: "owner_reported",
        source: "owner",
        created_at: "2026-07-10T10:00:00Z",
      },
      {
        id: "memory-furvise",
        user_id: "user-1",
        dog_profile_id: "pet-rocky",
        type: "summary",
        text: "Furvise summary: compare skin notes with food changes.",
        confidence: "inferred",
        source: "ai_suggestion",
        created_at: "2026-07-11T10:00:00Z",
      },
    ],
  });

  assert.equal(memory.pet.name, "Rocky");
  assert.equal(memory.pet.species, "dog");
  assert.equal(memory.pet.ageLabel, "5 years");
  assert.equal(memory.timeline.recentEntries.length, 3);
  assert.equal(memory.savedDetails[0].source, "owner");
  assert.equal(memory.savedDetails[1].source, "furvise");
  assert.deepEqual(memory.productFeedback.map((item) => item.productId), ["salmon-food"]);
  assert.deepEqual(memory.derived.knownAvoids, ["chicken"]);
  assert.ok(memory.derived.missingContext.length === 0);
  assert.ok(memory.derived.recentChanges.some((item) => /Ate normally/.test(item)));
  assert.ok(memory.derived.recurringConcerns.some((item) => /Food or appetite/i.test(item)));
});

test("pet memory and Ask vet prep preserve a selected cat species", () => {
  const memory = buildPetMemoryContext({
    careEntries: [],
    now,
    productFeedback: [],
    profile: rockyProfile({
      id: "pet-luna",
      name: "Luna",
      species: "cat",
      breed: "Domestic shorthair",
    }),
    savedMemories: [],
  });
  const vetPrep = buildVetPrepSummary(memory);

  assert.equal(memory.pet.species, "cat");
  assert.ok(vetPrep.sections[0].items.includes("Species: cat."));
  assert.doesNotMatch(JSON.stringify(vetPrep), /your dog|dog owner/i);
});

test("pet memory builder derives missing context and urgent safety flags", () => {
  const memory = buildPetMemoryContext({
    careEntries: rockyCareEntries([
      {
        id: "urgent-1",
        user_id: "user-1",
        pet_profile_id: "pet-rocky",
        category: "symptom",
        title: "Repeated vomiting",
        note: "Repeated vomiting and extreme lethargy.",
        severity: "severe",
        occurred_at: "2026-07-13T04:00:00Z",
        created_at: "2026-07-13T04:00:00Z",
        updated_at: "2026-07-13T04:00:00Z",
      },
    ]),
    now,
    profile: rockyProfile({
      age_value: null,
      age_unit: null,
      current_food: null,
      monthly_budget: null,
      weight_value: null,
      weight_unit: null,
    }),
  });

  assert.ok(memory.derived.missingContext.includes("age"));
  assert.ok(memory.derived.missingContext.includes("current food"));
  assert.ok(memory.derived.safetyFlags.includes("repeated vomiting"));
  assert.ok(memory.derived.safetyFlags.includes("extreme lethargy"));
});

test("dashboard helper uses memory entries and honest empty state", () => {
  const memory = buildPetMemoryContext({ careEntries: rockyCareEntries(), now, profile: rockyProfile() });
  const step = buildDashboardNextStep(memory);
  assert.equal(step.title, "Rocky's memory is current");
  assert.match(step.description, /^Latest update: Ate normally\./);
  assert.equal((step.description.match(/Ate normally/g) || []).length, 1);
  assert.doesNotMatch(step.description, /Rocky had 3 care updates this week|Recent:|Missing:|Next:/);
  assert.deepEqual(step.missingContext, []);

  const emptyMemory = buildPetMemoryContext({ careEntries: [], now, profile: rockyProfile() });
  const empty = buildDashboardNextStep(emptyMemory);
  assert.equal(empty.title, "Keep logging Rocky's changes");
  assert.match(empty.description, /Start with one quick note/);
});

test("dashboard helper separates missing context and urgent saved context", () => {
  const thinMemory = buildPetMemoryContext({
    careEntries: rockyCareEntries(),
    now,
    profile: rockyProfile({ current_food: null, weight_value: null, weight_unit: null }),
  });
  const thinStep = buildDashboardNextStep(thinMemory);
  assert.ok(thinStep.missingContext.includes("weight"));
  assert.ok(thinStep.missingContext.includes("current food"));
  assert.doesNotMatch(thinStep.description, /Missing:/);

  const urgentMemory = buildPetMemoryContext({
    careEntries: [rockyCareEntry({ title: "Trouble breathing", note: "Trouble breathing after activity." })],
    now,
    profile: rockyProfile(),
  });
  const urgentStep = buildDashboardNextStep(urgentMemory);
  assert.equal(urgentStep.title, "Contact a veterinarian for Rocky");
  assert.match(urgentStep.description, /Saved context mentions trouble breathing/);

  const routineMemory = buildPetMemoryContext({
    careEntries: [rockyCareEntry({ title: "Morning walk", note: "Walked normally." })],
    now,
    profile: rockyProfile(),
  });
  assert.notEqual(buildDashboardNextStep(routineMemory).title, "Contact a veterinarian for Rocky");
});

test("results helper is built from memory and suppresses products on urgent flags", () => {
  const memory = buildPetMemoryContext({
    careEntries: rockyCareEntries([
      {
        id: "urgent-2",
        user_id: "user-1",
        pet_profile_id: "pet-rocky",
        category: "symptom",
        title: "Trouble breathing",
        note: "Trouble breathing after activity.",
        severity: "severe",
        occurred_at: "2026-07-13T06:00:00Z",
        created_at: "2026-07-13T06:00:00Z",
        updated_at: "2026-07-13T06:00:00Z",
      },
    ]),
    now,
    profile: rockyProfile(),
  });
  const understanding = buildResultsUnderstanding(memory);
  assert.ok(understanding.profileFacts.some((item) => /dog/.test(item)));
  assert.ok(understanding.careHistory.some((item) => /Trouble breathing/.test(item)));
  assert.equal(understanding.productGuidanceAllowed, false);
  assert.ok(understanding.safetyFlags.includes("trouble breathing"));

  const noHistory = buildResultsUnderstanding(buildPetMemoryContext({ careEntries: [], now, profile: rockyProfile() }));
  assert.deepEqual(noHistory.careHistory, ["Furvise does not have care updates for Rocky yet."]);
});

test("Ask Furvise last-week recall returns actual saved entries and honest empty answer", () => {
  const memory = buildPetMemoryContext({ careEntries: rockyCareEntries(), now, profile: rockyProfile() });
  const answer = answerPetMemoryQuestion(memory, "What did I log for Rocky last week?", now);
  assert.equal(answer.intent, "last_week_logs");
  assert.equal(answer.urgent, false);
  assert.match(answer.response.summary, /2 saved updates/);
  assert.ok(answer.response.sections[0].items.some((item) => /Switched from chicken food/.test(item)));
  assert.ok(answer.response.sections[0].items.some((item) => /Scratching after dinner/.test(item)));

  const emptyMemory = buildPetMemoryContext({ careEntries: [], now, profile: rockyProfile() });
  const empty = answerPetMemoryQuestion(emptyMemory, "What did I log for Rocky last week?", now);
  assert.match(empty.response.summary, /do not see any saved care updates/);
});

test("Ask Furvise last-week recall does not depend on the recentEntries cap", () => {
  const newerEntries = Array.from({ length: 12 }, (_, index) =>
    rockyCareEntry({
      id: `newer-${index}`,
      title: `Newer update ${index + 1}`,
      note: `Newer detail ${index + 1}.`,
      occurred_at: new Date(Date.UTC(2026, 6, 13, 10, index)).toISOString(),
      created_at: new Date(Date.UTC(2026, 6, 13, 10, index)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 6, 13, 10, index)).toISOString(),
    }),
  );
  const lastWeekEntry = rockyCareEntry({
    id: "older-last-week-food",
    category: "food",
    title: "Switched from chicken food",
    note: "Scratching seemed worse after chicken-based food.",
    occurred_at: "2026-07-08T18:00:00Z",
    created_at: "2026-07-08T18:00:00Z",
    updated_at: "2026-07-08T18:00:00Z",
  });
  const memory = buildPetMemoryContext({
    careEntries: [...newerEntries, lastWeekEntry],
    now,
    profile: rockyProfile(),
  });

  assert.equal(memory.timeline.recentEntries.length, 10);
  assert.equal(memory.timeline.recentEntries.some((entry) => entry.id === lastWeekEntry.id), false);

  const answer = answerPetMemoryQuestion(memory, "What did I log for Rocky last week?", now);
  const items = answer.response.sections.flatMap((section) => section.items);
  assert.match(answer.response.summary, /1 saved update/);
  assert.ok(items.some((item) => /Switched from chicken food/.test(item)));
  assert.ok(items.some((item) => /Scratching seemed worse after chicken-based food/.test(item)));

  const recent = summarizeRecentChanges(memory);
  assert.match(recent.summary, /10 recent saved updates/);
  assert.ok(recent.sections.flatMap((section) => section.items).some((item) => /Newer update/.test(item)));
});

test("Ask Furvise summaries use saved entries and do not hallucinate symptoms", () => {
  const memory = buildPetMemoryContext({ careEntries: rockyCareEntries(), now, profile: rockyProfile() });
  const recent = summarizeRecentChanges(memory);
  assert.match(recent.summary, /3 recent saved updates/);
  assert.ok(recent.sections.flatMap((section) => section.items).some((item) => /paw/.test(item)));

  const food = summarizeFoodNotes(memory);
  assert.ok(food.sections.flatMap((section) => section.items).some((item) => /Chicken kibble/.test(item)));
  assert.ok(food.sections.flatMap((section) => section.items).some((item) => /Switched from chicken food/.test(item)));

  const vomit = answerPetMemoryQuestion(memory, "Did Rocky vomit?", now);
  assert.match(vomit.response.summary, /do not see saved vomiting logs/);
  assert.doesNotMatch(vomit.response.summary, /Rocky vomited/);
});

test("Ask Furvise food notes separate food updates from related meal-time updates", () => {
  const memory = buildPetMemoryContext({
    careEntries: [
      rockyCareEntry({
        id: "food-primary",
        category: "food",
        title: "Switched to salmon kibble",
        note: "Trying a new salmon protein kibble this week.",
        occurred_at: "2026-07-13T08:00:00Z",
        created_at: "2026-07-13T08:00:00Z",
        updated_at: "2026-07-13T08:00:00Z",
      }),
      rockyCareEntry({
        id: "symptom-dinner",
        category: "symptom",
        title: "Scratching after dinner",
        note: "Licked paws more than usual in the evening.",
        occurred_at: "2026-07-12T19:00:00Z",
        created_at: "2026-07-12T19:00:00Z",
        updated_at: "2026-07-12T19:00:00Z",
      }),
      rockyCareEntry({
        id: "general-appetite",
        category: "general",
        title: "Appetite normal",
        note: "Ate breakfast and drank water normally.",
        occurred_at: "2026-07-12T08:00:00Z",
        created_at: "2026-07-12T08:00:00Z",
        updated_at: "2026-07-12T08:00:00Z",
      }),
    ],
    now,
    profile: rockyProfile(),
  });

  const answer = answerPetMemoryQuestion(memory, "What food notes do we have?", now);
  const primary = answer.response.sections.find((section) => section.heading === "Saved food updates");
  const related = answer.response.sections.find((section) => section.heading === "Related appetite or meal-time updates");

  assert.equal(answer.intent, "food_notes");
  assert.ok(primary);
  assert.ok(related);
  assert.equal(primary.items.length, 1);
  assert.match(primary.items[0], /Switched to salmon kibble/);
  assert.equal(related.items.length, 2);
  assert.ok(related.items.some((item) => /Scratching after dinner/.test(item)));
  assert.ok(related.items.some((item) => /Appetite normal/.test(item)));
});

test("Ask Furvise handles thin first-result profiles honestly", () => {
  const memory = buildPetMemoryContext({
    careEntries: [],
    now,
    profile: rockyProfile({
      breed: null,
      avoid_ingredients: [],
      current_food: null,
      main_concern: "itching",
      monthly_budget: null,
      weight_value: null,
      weight_unit: null,
    }),
  });
  const food = answerPetMemoryQuestion(memory, "What food notes do we have for Rocky?", now);
  const summary = answerPetMemoryQuestion(memory, "Summarize recent changes.", now);

  assert.match(food.response.summary, /do not see saved food notes/i);
  const foodItems = food.response.sections.flatMap((section) => section.items);
  assert.ok(foodItems.includes("current food"));
  assert.ok(!food.response.sections.some((section) => section.heading === "Profile food context"));
  assert.match(summary.response.summary, /no recent care updates yet/i);
  assert.doesNotMatch(food.response.summary, /Chicken kibble/);
  assert.ok(foodItems.every((item) => !/Current food in profile/.test(item)));
});

test("Ask Furvise cause-style questions return tracking and vet framing", () => {
  const memory = buildPetMemoryContext({ careEntries: rockyCareEntries(), now, profile: rockyProfile() });
  const answer = answerPetMemoryQuestion(memory, "What could be causing Rocky's scratching?", now);
  const headings = answer.response.sections.map((section) => section.heading);
  const items = answer.response.sections.flatMap((section) => section.items);

  assert.equal(answer.urgent, false);
  assert.match(answer.response.summary, /does not diagnose/);
  assert.deepEqual(headings, ["What to track", "What to ask the vet"]);
  assert.ok(items.some((item) => /latest logged issue|Food eaten/i.test(item)));
  assert.ok(items.some((item) => /What symptoms would make this urgent/i.test(item)));
  assert.doesNotMatch(answer.response.summary, /Food sensitivity is possible/);
});

test("Ask Furvise grounded fallback routing is only for safe general questions", () => {
  const memory = buildPetMemoryContext({ careEntries: rockyCareEntries(), now, profile: rockyProfile() });

  assert.equal(shouldUseGroundedAskFallback(memory, "Do we have any notes about paws?"), true);
  assert.equal(shouldUseGroundedAskFallback(memory, "Is there anything in Rocky's history about water intake?"), true);
  assert.equal(shouldUseGroundedAskFallback(memory, "What did I log for Rocky last week?"), false);
  assert.equal(shouldUseGroundedAskFallback(memory, "Prepare for a vet visit"), false);
  assert.equal(shouldUseGroundedAskFallback(memory, "What changed since the chicken food?"), false);
  assert.equal(shouldUseGroundedAskFallback(memory, "Summarize recent changes"), false);
  assert.equal(shouldUseGroundedAskFallback(memory, "What could be causing Rocky's scratching?"), false);
  assert.equal(shouldUseGroundedAskFallback(memory, "Rocky collapsed. What should I do?"), false);
});

test("Ask Furvise vet prep uses polished grounded sections", () => {
  const memory = buildPetMemoryContext({ careEntries: rockyCareEntries(), now, profile: rockyProfile() });
  const answer = answerPetMemoryQuestion(memory, "Prepare for a vet visit", now);
  const headings = answer.response.sections.map((section) => section.heading);
  const items = answer.response.sections.flatMap((section) => section.items);
  const profileFacts = answer.response.sections.find((section) => section.heading === "Saved profile facts");
  const updates = answer.response.sections.find((section) => section.heading === "Recent saved updates");
  const questions = answer.response.sections.find((section) => section.heading === "What to ask the vet");

  assert.equal(answer.intent, "vet_prep");
  assert.equal(answer.response.title, "Vet prep for Rocky");
  assert.equal(
    answer.response.summary,
    "Use these saved facts and recent logs to prepare a clear vet summary for Rocky.",
  );
  assert.deepEqual(headings, ["Saved profile facts", "Recent saved updates", "What to ask the vet"]);
  assert.ok(profileFacts.items.includes("Species: dog."));
  assert.ok(profileFacts.items.includes("Age: 5 years."));
  assert.ok(profileFacts.items.includes("Main concern: scratching after chicken-based food."));
  assert.ok(profileFacts.items.includes("Breed: German Shepherd."));
  assert.ok(profileFacts.items.includes("Weight: 70 lb."));
  assert.ok(profileFacts.items.includes("Current food: Chicken kibble."));
  assert.ok(profileFacts.items.includes("Avoid ingredients: chicken."));
  assert.equal(updates.items.length, 3);
  assert.ok(updates.items.some((item) => /Ate normally/.test(item)));
  assert.ok(updates.items.some((item) => /Scratching after dinner/.test(item)));
  assert.ok(updates.items.some((item) => /Switched from chicken food/.test(item)));
  assert.ok(questions.items.some((item) => /What symptoms would make scratching or paw licking urgent\?/.test(item)));
  assert.ok(questions.items.some((item) => /track food changes, skin redness, paw licking, ears, stool, or appetite/.test(item)));
  assert.ok(questions.items.some((item) => /tracking reactions after chicken-based food or diet changes/.test(item)));
  assert.ok(questions.items.some((item) => /details are most useful to log next/.test(item)));
  assert.match(answer.response.safetyNote, /Furvise organizes care context\. It does not diagnose or replace a veterinarian\./);
  assert.ok(!answer.response.sections.some((section) => section.heading === "Questions or gaps to mention"));
  assert.ok(!answer.response.sections.some((section) => section.heading === "Helpful context still missing"));
  assert.ok(items.every((item) => !/Owner question|Prepare for a vet visit|monthly care budget|current_food|avoid_ingredients/.test(item)));
});

test("Ask Furvise vet prep uses behavior questions for behavior-only context", () => {
  const memory = buildPetMemoryContext({
    careEntries: [
      rockyCareEntry({
        category: "behavior",
        title: "Too sad today",
        note: "Too sad, been sitting whole day.",
      }),
    ],
    now,
    profile: rockyProfile({
      avoid_ingredients: [],
      current_food: null,
      main_concern: "too sad, been sitting whole day",
      wellness_goal: null,
    }),
  });
  const answer = answerPetMemoryQuestion(memory, "What should I ask the vet?", now);
  const questions = answer.response.sections.find((section) => section.heading === "What to ask the vet");
  const questionText = questions.items.join("\n");

  assert.match(questionText, /change in activity or mood/i);
  assert.match(questionText, /What signs would make this urgent\?/);
  assert.match(questionText, /track over the next 24-48 hours/i);
  assert.doesNotMatch(questionText, /scratching|paw licking|skin redness|ears/i);
  assert.doesNotMatch(questionText, /diagnos/i);
  assert.match(answer.response.safetyNote, /does not diagnose or replace a veterinarian/);
});

test("Ask Furvise vet prep uses skin and paw questions only for skin or paw context", () => {
  const memory = buildPetMemoryContext({
    careEntries: [
      rockyCareEntry({
        category: "symptom",
        title: "Paw licking after walk",
        note: "Licking paws and scratching at ears after evening walk.",
      }),
    ],
    now,
    profile: rockyProfile({
      main_concern: "paw licking",
    }),
  });
  const answer = answerPetMemoryQuestion(memory, "Vet prep", now);
  const questions = answer.response.sections.find((section) => section.heading === "What to ask the vet");
  const questionText = questions.items.join("\n");

  assert.match(questionText, /skin redness, paw licking, ears/i);
  assert.match(questionText, /scratching or paw licking urgent/i);
  assert.doesNotMatch(questionText, /change in activity or mood/i);
});

test("Ask Furvise vet prep uses food and appetite questions for food context", () => {
  const memory = buildPetMemoryContext({
    careEntries: [
      rockyCareEntry({
        category: "food",
        title: "Lower appetite",
        note: "Skipped breakfast, ate a little dinner, and had soft stool.",
      }),
    ],
    now,
    profile: rockyProfile({
      main_concern: "lower appetite",
    }),
  });
  const answer = answerPetMemoryQuestion(memory, "Vet prep", now);
  const questions = answer.response.sections.find((section) => section.heading === "What to ask the vet");
  const questionText = questions.items.join("\n");

  assert.match(questionText, /appetite, water intake, stool, or vomiting/i);
  assert.match(questionText, /food, treat, or diet changes/i);
  assert.doesNotMatch(questionText, /paw licking|skin redness|ears/i);
});

test("Ask Furvise vet prep lists only useful missing context with friendly labels", () => {
  const memory = buildPetMemoryContext({
    careEntries: rockyCareEntries(),
    now,
    profile: rockyProfile({
      avoid_ingredients: [],
      breed: null,
      current_food: null,
      monthly_budget: null,
      weight_value: null,
      weight_unit: null,
    }),
  });
  const answer = answerPetMemoryQuestion(memory, "What should I tell the vet?", now);
  const profileFacts = answer.response.sections.find((section) => section.heading === "Saved profile facts");
  const missing = answer.response.sections.find((section) => section.heading === "Helpful context still missing");
  const items = answer.response.sections.flatMap((section) => section.items);

  assert.deepEqual(missing.items, ["Breed", "Weight", "Current food", "Avoid ingredients"]);
  assert.ok(profileFacts.items.includes("Species: dog."));
  assert.ok(profileFacts.items.includes("Age: 5 years."));
  assert.ok(profileFacts.items.includes("Main concern: scratching after chicken-based food."));
  assert.ok(profileFacts.items.every((item) => !/Breed:|Weight:|Current food:|Avoid ingredients:/.test(item)));
  assert.ok(items.every((item) => !/monthly care budget|current_food|avoid_ingredients/.test(item)));
  assert.doesNotMatch(items.join("\n"), /German Shepherd|Chicken kibble|70 lb/);
});

test("urgent Ask question triggers safety response before normal guidance", () => {
  const memory = buildPetMemoryContext({ careEntries: rockyCareEntries(), now, profile: rockyProfile() });
  const answer = answerPetMemoryQuestion(memory, "Rocky ate chocolate and collapsed", now);
  assert.equal(answer.urgent, true);
  assert.match(answer.response.title, /veterinarian now/i);
  assert.match(answer.response.safetyNote, /does not diagnose/i);
});

test("persistence-style rebuild uses the same saved care row after reload", () => {
  const savedRows = rockyCareEntries();
  const first = buildPetMemoryContext({ careEntries: savedRows, now, profile: rockyProfile() });
  const reloaded = buildPetMemoryContext({ careEntries: savedRows.map((row) => ({ ...row })), now, profile: rockyProfile() });
  const firstSummary = answerPetMemoryQuestion(first, "Summarize recent changes.", now);
  const reloadedSummary = answerPetMemoryQuestion(reloaded, "Summarize recent changes.", now);
  assert.deepEqual(reloadedSummary.response.sections, firstSummary.response.sections);

  const range = getEntriesInDateRange(reloaded, "2026-07-08T00:00:00Z", "2026-07-08T23:59:59Z");
  assert.equal(range[0].id, "care-last-week");
});
