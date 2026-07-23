import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPetProfileOverviewModel,
  canOpenPetProfile,
} from "../app/lib/pet-profile.ts";
import { readStoredGuidanceSnapshot } from "../app/lib/stored-guidance.ts";

const now = new Date("2026-06-25T18:00:00Z");

function profile(overrides = {}) {
  return {
    id: "pet-1",
    user_id: "user-1",
    name: "rocky",
    species: "dog",
    breed: "Mixed / unknown",
    age_value: 4,
    age_unit: "years",
    weight_value: 42,
    weight_unit: "lb",
    current_food: "Salmon kibble",
    main_concern: "Itchy skin",
    avoid_ingredients: ["Chicken"],
    monthly_budget: 80,
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-20T10:00:00Z",
    dog_memories: [],
    dog_product_feedback: [],
    ...overrides,
  };
}

function entry(overrides = {}) {
  return {
    id: "entry-1",
    user_id: "user-1",
    pet_profile_id: "pet-1",
    category: "food",
    title: "Dinner change",
    note: "Ate half of dinner after switching proteins.",
    severity: null,
    occurred_at: "2026-06-24T17:00:00Z",
    created_at: "2026-06-24T17:00:00Z",
    updated_at: "2026-06-24T17:00:00Z",
    ...overrides,
  };
}

function guidance(overrides = {}) {
  return {
    confirmedFacts: ["Rocky eats salmon kibble."],
    ownerReportedObservations: ["Itching after chicken treats."],
    possibleFactors: ["Food sensitivity is possible."],
    missingInformation: [],
    recommendedConcernTags: ["itchy_skin"],
    temporaryAvoidIngredients: ["Chicken"],
    vetAttention: {
      needed: false,
      reason: "",
      urgency: "none",
    },
    confidence: "moderate",
    memorySuggestions: [],
    summary: "Keep tracking itching and food changes.",
    ...overrides,
  };
}

test("pet profile access accepts owned pets and rejects another user's pet", () => {
  assert.equal(canOpenPetProfile(profile(), "user-1"), true);
  assert.equal(canOpenPetProfile(profile({ user_id: "user-2" }), "user-1"), false);
  assert.equal(canOpenPetProfile(null, "user-1"), false);
});

test("pet profile overview marks complete and incomplete profiles", () => {
  const complete = buildPetProfileOverviewModel({
    entries: [],
    guidance: guidance({ confidence: "high" }),
    now,
    profile: profile(),
  });
  assert.equal(complete.completeness.status, "Ready for guidance");
  assert.deepEqual(complete.completeness.missingFields, []);

  const incomplete = buildPetProfileOverviewModel({
    entries: [],
    guidance: null,
    now,
    profile: profile({
      breed: null,
      main_concern: null,
      monthly_budget: null,
    }),
  });
  assert.equal(incomplete.completeness.status, "Missing required information");
  assert.deepEqual(incomplete.completeness.missingFields, [
    "breed or mixed/unknown",
    "main concern",
    "monthly care budget",
  ]);
  assert.equal(incomplete.nextStep.kind, "missing_profile_information");
});

test("incomplete unknown context does not display high confidence and prioritizes weight", () => {
  const rocky = buildPetProfileOverviewModel({
    entries: [],
    guidance: guidance({ confidence: "high" }),
    now,
    profile: profile({
      name: "rocky",
      age_value: null,
      age_unit: null,
      weight_value: null,
      weight_unit: null,
      current_food: null,
      main_concern: "Grooming",
    }),
  });

  assert.equal(rocky.completeness.status, "Limited context");
  assert.deepEqual(rocky.completeness.limitingUnknownFields, ["age", "weight", "current food"]);
  assert.equal(rocky.headerSummary, "Dog · Mixed / unknown · Age unknown · Weight unknown");
  assert.equal(rocky.nextStep.kind, "missing_profile_information");
  assert.equal(rocky.nextStep.title, "Add Rocky's weight when you can");
  assert.equal(rocky.nextStep.actionLabel, "Add weight");
  assert.equal(rocky.furviseSays.confidenceLabel, "Limited context");
  assert.equal(rocky.currentFocus.importantNote, "Weight or body condition has not been recorded yet.");
  assert.equal(rocky.productLinkLabel, "Explore product options");
  assert.doesNotMatch(rocky.headerSummary, /I'm not sure/);

  const known = buildPetProfileOverviewModel({
    entries: [],
    guidance: null,
    now,
    profile: profile({ breed: "German Shepherd", age_value: 4, weight_value: 70 }),
  });
  assert.equal(known.headerSummary, "Dog · German Shepherd · 4 years · 70 lb");
});

test("legacy null species remains accessible and requires species", () => {
  const model = buildPetProfileOverviewModel({
    entries: [],
    guidance: null,
    now,
    profile: profile({ species: null }),
  });

  assert.equal(model.completeness.status, "Missing required information");
  assert.equal(model.headerSummary, "Species not provided · Mixed / unknown · 4 years · 42 lb");
  assert.deepEqual(model.completeness.missingFields, ["species"]);
  assert.equal(model.nextStep.kind, "missing_profile_information");
});

test("pet profile overview handles no care history and several care updates", () => {
  const empty = buildPetProfileOverviewModel({
    entries: [],
    guidance: null,
    now,
    profile: profile(),
  });
  assert.equal(empty.recentEntries.length, 0);
  assert.equal(empty.nextStep.kind, "no_action_needed");

  const many = buildPetProfileOverviewModel({
    entries: Array.from({ length: 7 }).map((_, index) =>
      entry({
        id: `entry-${index}`,
        occurred_at: `2026-06-${String(24 - index).padStart(2, "0")}T17:00:00Z`,
      }),
    ),
    guidance: null,
    now,
    profile: profile(),
  });
  assert.equal(many.recentEntries.length, 5);
  assert.equal(many.recentEntries[0].id, "entry-0");
  assert.equal(many.nextStep.kind, "recent_care_follow_up");
});

test("routine walking does not outrank missing profile information", () => {
  const model = buildPetProfileOverviewModel({
    entries: [
      entry({
        category: "activity",
        note: "Just walked",
        occurred_at: "2026-06-25T12:00:00Z",
        title: "Walking",
      }),
    ],
    guidance: null,
    now,
    profile: profile({
      age_value: null,
      age_unit: null,
      weight_value: null,
      weight_unit: null,
      current_food: null,
    }),
  });

  assert.equal(model.nextStep.kind, "missing_profile_information");
  assert.equal(model.nextStep.title, "Add Rocky's weight when you can");
});

test("routine walking does not create a high-priority follow-up", () => {
  const model = buildPetProfileOverviewModel({
    entries: [
      entry({
        category: "activity",
        note: "Just walked",
        occurred_at: "2026-06-25T12:00:00Z",
        title: "Walking",
      }),
    ],
    guidance: null,
    now,
    profile: profile(),
  });

  assert.equal(model.nextStep.kind, "no_action_needed");
});

test("meaningful symptom follow-up outranks missing profile details unless severe", () => {
  const model = buildPetProfileOverviewModel({
    entries: [
      entry({
        category: "symptom",
        note: "Coughing lightly after walk.",
        occurred_at: "2026-06-25T12:00:00Z",
        severity: "mild",
        title: "Coughing",
      }),
    ],
    guidance: null,
    now,
    profile: profile({ current_food: null }),
  });

  assert.equal(model.nextStep.kind, "meaningful_symptom_follow_up");
});

test("severe symptom priority takes precedence and hides products", () => {
  const model = buildPetProfileOverviewModel({
    entries: [
      entry({
        category: "symptom",
        id: "severe-1",
        note: "Could not stand normally.",
        occurred_at: "2026-06-25T12:00:00Z",
        severity: "severe",
        title: "Sudden weakness",
      }),
      entry({ id: "food-1" }),
    ],
    guidance: guidance(),
    now,
    profile: profile(),
  });

  assert.equal(model.nextStep.kind, "unresolved_severe_symptom");
  assert.equal(model.recentSevereSymptom.id, "severe-1");
  assert.equal(model.showProductLink, false);
  assert.match(model.currentFocus.activeCaution, /Recent severe symptom/);
});

test("stored Furvise guidance is summarized without being required", () => {
  const withGuidance = buildPetProfileOverviewModel({
    entries: [],
    guidance: guidance({ confidence: "high" }),
    guidanceUpdatedAt: "2026-06-25T13:00:00Z",
    now,
    profile: profile(),
  });
  assert.equal(withGuidance.furviseSays.summary, "Keep tracking itching and food changes.");
  assert.equal(withGuidance.furviseSays.confidenceLabel, "High confidence");
  assert.match(withGuidance.furviseSays.updatedAtLabel, /Updated/);
  assert.equal(withGuidance.nextStep.kind, "review_latest_guidance");

  const withoutGuidance = buildPetProfileOverviewModel({
    entries: [],
    guidance: null,
    now,
    profile: profile(),
  });
  assert.equal(withoutGuidance.furviseSays, null);
});

test("stored guidance snapshot is shared by Today and pet profile readers", () => {
  const storage = new Map([
    ["petwise:dog-profile-id", "pet-1"],
    ["petwise:ai-analysis", JSON.stringify({ status: "available", analysis: guidance(), updatedAt: "2026-06-25T13:00:00Z" })],
  ]);
  const snapshot = readStoredGuidanceSnapshot({
    getItem: (key) => storage.get(key) || null,
  });

  assert.equal(snapshot.profileId, "pet-1");
  assert.equal(snapshot.result.status, "available");
  assert.equal(snapshot.result.analysis.summary, "Keep tracking itching and food changes.");
  assert.equal(snapshot.result.updatedAt, "2026-06-25T13:00:00Z");
});

test("urgent stored guidance has highest next-step priority", () => {
  const model = buildPetProfileOverviewModel({
    entries: [],
    guidance: guidance({
      vetAttention: {
        needed: true,
        reason: "Emergency warning signs were stored.",
        urgency: "urgent",
      },
    }),
    now,
    profile: profile(),
  });
  assert.equal(model.nextStep.kind, "urgent_veterinary_caution");
  assert.equal(model.showProductLink, false);
});

test("saved details are limited to three user-facing memory texts", () => {
  const model = buildPetProfileOverviewModel({
    entries: [],
    guidance: null,
    now,
    profile: profile({
      dog_memories: ["Sensitive to chicken", "Prefers wet food", "Dislikes nail trimming", "Sleeps upstairs"].map(
        (text, index) => ({
          id: `memory-${index}`,
          user_id: "user-1",
          dog_profile_id: "pet-1",
          type: "profile_fact",
          text,
          confidence: "owner_reported",
          source: "ai_suggestion",
          created_at: `2026-06-2${index}T10:00:00Z`,
        }),
      ),
    }),
  });

  assert.deepEqual(
    model.savedDetails.map((memory) => memory.text),
    ["Sensitive to chicken", "Prefers wet food", "Dislikes nail trimming"],
  );
});

test("profile overview route keeps mobile layout from overflowing", () => {
  const source = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /overflow-x-hidden/);
  assert.match(source, /min-w-0/);
  assert.doesNotMatch(source, /overflow-x-auto/);
});

test("profile overview source removes duplicate log actions and keeps quiet empty states", () => {
  const source = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, />\s*Log update\s*</);
  assert.match(source, /View full care history/);
  assert.doesNotMatch(source, /href=\{`\/care-log\?pet=\$\{petId\}&new=1`\}/);
  assert.match(source, /Nothing saved for \{name\} yet\./);
  assert.match(source, /Products for \{name\}/);
  assert.match(source, /\/shop\?petId=/);
  assert.match(source, /Ask Furvise about this pet/);
  assert.match(source, /Furvise has only a few saved details for \{petName\}/);
  assert.match(source, /Logging food, symptoms, behavior, or weight helps make guidance more specific\./);
});
