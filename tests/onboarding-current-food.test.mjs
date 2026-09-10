import assert from "node:assert/strict";
import test from "node:test";
import { buildDogProfilePayload } from "../app/lib/supabase.ts";
import { initialProfile, normalizeProfile } from "../app/lib/petwise.ts";

function profile(overrides = {}) {
  return {
    ...initialProfile,
    name: "Milo",
    species: "dog",
    breed: "Mixed / unknown",
    age: "4",
    ageUnit: "years",
    weight: "70",
    weightUnit: "lb",
    currentFood: "Kibble",
    mainConcern: "General wellness",
    monthlyBudget: "50",
    ...overrides,
  };
}

test("stale current food is not saved when unknown is selected", () => {
  const payload = buildDogProfilePayload(
    profile({
      currentFood: "Old kibble",
      currentFoodUnknown: true,
    }),
    "user-1",
  );

  assert.equal(payload.current_food, null);
});

test("normalized profile preserves the hidden current-food draft when unknown is set", () => {
  const profileState = normalizeProfile({
    ...profile(),
    currentFood: "Old kibble",
    currentFoodUnknown: true,
  });

  assert.equal(profileState.currentFoodUnknown, true);
  assert.equal(profileState.currentFood, "Old kibble");
});
