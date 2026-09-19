import test from "node:test";
import assert from "node:assert/strict";
import { MAIN_CONCERN_OPTIONS, initialProfile, normalizeAvoidIngredientValues } from "../app/lib/petwise.ts";
import { buildDogProfilePayload, dogProfileRowToDraft } from "../app/lib/supabase.ts";

test("main concern options are a non-empty runtime array", () => {
  assert.ok(Array.isArray(MAIN_CONCERN_OPTIONS));
  assert.ok(MAIN_CONCERN_OPTIONS.length > 0);
  assert.deepEqual(
    MAIN_CONCERN_OPTIONS,
    [
      "Itchy skin",
      "Sensitive stomach",
      "Picky eating",
      "Weight management",
      "General wellness",
      "Grooming",
      "Other",
    ],
  );
});

test("avoid ingredient normalization treats typed none values like None known", () => {
  assert.deepEqual(normalizeAvoidIngredientValues(["none"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["None"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["none known"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["None known"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["no known"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["no known allergies"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["no allergies"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["n/a"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["na"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["not sure"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["chicken", "none"]), ["chicken"]);
  assert.deepEqual(normalizeAvoidIngredientValues(["no chicken"]), ["chicken"]);
});

test("saved profile rows round-trip into the draft with the returned profile id preserved", () => {
  const row = {
    id: "pet-123",
    user_id: "user-1",
    name: "Mani",
    species: "cat",
    breed: "Siamese",
    age_value: 3,
    age_unit: "years",
    weight_value: 10,
    weight_unit: "lb",
    current_food: "Wet food",
    main_concern: "General wellness",
    wellness_goal: "nutrition",
    avoid_ingredients: ["Chicken"],
    monthly_budget: 45,
    created_at: "2026-06-25T12:00:00Z",
    updated_at: "2026-06-25T12:00:00Z",
  };

  const draft = dogProfileRowToDraft(row);
  assert.equal(draft.name, "Mani");
  assert.equal(draft.species, "cat");
  assert.equal(draft.currentFood, "Wet food");
  assert.equal(draft.currentFoodUnknown, false);
  assert.equal(draft.age, "3");
  assert.equal(draft.weight, "10");
  assert.equal(draft.wellnessGoal, "nutrition");
  const payload = buildDogProfilePayload(draft, "user-1");
  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.current_food, "Wet food");
  assert.equal(payload.wellness_goal, "nutrition");
});

test("payload builder only includes database columns and persists wellness goal when present", () => {
  const payload = buildDogProfilePayload(
    {
      ...initialProfile,
      name: "Mani",
      species: "dog",
      breed: "Mixed / unknown",
      age: "4",
      ageUnit: "years",
      weight: "42",
      weightUnit: "lb",
      currentFood: "Kibble",
      mainConcern: "General wellness",
      avoidIngredients: ["Chicken"],
      monthlyBudget: "50",
      wellnessGoal: "preventive_care",
    },
    "user-1",
  );

  assert.deepEqual(Object.keys(payload).sort(), [
    "age_unit",
    "age_value",
    "avoid_ingredients",
    "breed",
    "current_food",
    "main_concern",
    "monthly_budget",
    "name",
    "routine_note",
    "sex",
    "species",
    "updated_at",
    "user_id",
    "weight_unit",
    "weight_value",
    "wellness_goal",
  ]);
  assert.equal(payload.wellness_goal, "preventive_care");
  assert.equal(payload.species, "dog");
});

test("profile payload drops typed none avoid values before saving", () => {
  const payload = buildDogProfilePayload(
    {
      ...initialProfile,
      name: "Rocky",
      species: "dog",
      age: "4",
      mainConcern: "General wellness",
      avoidIngredients: ["Chicken", "none", "no known allergies"],
    },
    "user-1",
  );

  assert.deepEqual(payload.avoid_ingredients, ["Chicken"]);
});

test("thin first-result profiles save optional fields as database-safe empty values", () => {
  const payload = buildDogProfilePayload(
    {
      ...initialProfile,
      name: "Rocky",
      species: "dog",
      age: "4",
      ageUnit: "years",
      mainConcern: "Itching",
    },
    "user-1",
  );

  assert.equal(payload.name, "Rocky");
  assert.equal(payload.species, "dog");
  assert.equal(payload.age_value, 4);
  assert.equal(payload.main_concern, "Itching");
  assert.equal(payload.breed, null);
  assert.equal(payload.weight_value, null);
  assert.equal(payload.current_food, null);
  assert.equal(payload.avoid_ingredients, null);
  assert.equal(payload.monthly_budget, null);
});

test("legacy dog profile rows with null species remain loadable", () => {
  const draft = dogProfileRowToDraft({
    id: "legacy-pet",
    user_id: "user-1",
    name: "Legacy",
    species: null,
    breed: null,
    age_value: null,
    age_unit: null,
    weight_value: null,
    weight_unit: null,
    current_food: null,
    main_concern: null,
    wellness_goal: null,
    avoid_ingredients: null,
    monthly_budget: null,
    created_at: "2026-06-25T12:00:00Z",
    updated_at: "2026-06-25T12:00:00Z",
  });

  assert.equal(draft.species, "");
  assert.equal(draft.name, "Legacy");
});
