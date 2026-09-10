import assert from "node:assert/strict";
import test from "node:test";
import { buildDogProfilePayload } from "../app/lib/supabase.ts";
import { initialProfile } from "../app/lib/petwise.ts";

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

test("stale numeric values are not saved when unknown is selected", () => {
  const payload = buildDogProfilePayload(
    profile({
      age: "999",
      ageUnknown: true,
      weight: "555",
      weightUnknown: true,
    }),
    "user-1",
  );

  assert.equal(payload.age_value, null);
  assert.equal(payload.age_unit, null);
  assert.equal(payload.weight_value, null);
  assert.equal(payload.weight_unit, null);
});
