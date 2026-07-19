import assert from "node:assert/strict";
import test from "node:test";
import { summaryRows } from "../app/onboarding/summary.ts";
import {
  beginTextFieldEntry,
  markTextFieldUnknown,
  updateTextFieldValue,
} from "../app/onboarding/text-field.ts";
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

test("selecting current food unknown clears the saved text", () => {
  const updated = markTextFieldUnknown("currentFood");
  assert.deepEqual(updated, { currentFood: "", currentFoodUnknown: true });
});

test("clicking current food input clears unknown without changing the value", () => {
  const updated = beginTextFieldEntry("currentFood");
  assert.deepEqual(updated, { currentFoodUnknown: false });
});

test("typing current food clears unknown and keeps the entered value", () => {
  const updated = updateTextFieldValue("currentFood", "Turkey pate");
  assert.deepEqual(updated, { currentFood: "Turkey pate", currentFoodUnknown: false });
});

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

test("review shows known and unknown current food values", () => {
  const unknownProfile = profile({
    currentFood: "",
    currentFoodUnknown: true,
  });
  const knownProfile = profile({
    currentFood: "Chicken and rice kibble",
    currentFoodUnknown: false,
  });

  const row = summaryRows.find((item) => item.key === "currentFood");

  assert.equal(row?.getValue(unknownProfile), "I'm not sure");
  assert.equal(row?.getValue(knownProfile), "Chicken and rice kibble");
});

test("normalized profile clears stale current food when unknown is set", () => {
  const profileState = normalizeProfile({
    ...profile(),
    currentFood: "Old kibble",
    currentFoodUnknown: true,
  });

  assert.equal(profileState.currentFoodUnknown, true);
  assert.equal(profileState.currentFood, "");
});
