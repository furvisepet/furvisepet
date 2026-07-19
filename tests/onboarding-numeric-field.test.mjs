import assert from "node:assert/strict";
import test from "node:test";
import { buildSummaryItems, summaryRows } from "../app/onboarding/summary.ts";
import {
  beginNumericFieldEntry,
  markNumericFieldUnknown,
  updateNumericFieldUnit,
  updateNumericFieldValue,
} from "../app/onboarding/numeric-field.ts";
import { buildDogProfilePayload } from "../app/lib/supabase.ts";
import { initialProfile, parsePositiveNumber } from "../app/lib/petwise.ts";

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

test("selecting age unknown clears the saved numeric value", () => {
  const updated = markNumericFieldUnknown("age");
  assert.deepEqual(updated, { age: "", ageUnknown: true });
});

test("clicking age input clears unknown without changing the unit", () => {
  const updated = beginNumericFieldEntry("age");
  assert.deepEqual(updated, { ageUnknown: false });
});

test("typing age clears unknown and keeps the entered value", () => {
  const updated = updateNumericFieldValue("age", "6");
  assert.deepEqual(updated, { age: "6", ageUnknown: false });
});

test("age validation accepts only non-negative numbers or unknown", () => {
  assert.equal(parsePositiveNumber("fg"), Number.NaN);
  assert.equal(parsePositiveNumber("1fg"), Number.NaN);
  assert.equal(parsePositiveNumber("-1"), Number.NaN);
  assert.equal(parsePositiveNumber("0"), 0);
  assert.equal(parsePositiveNumber("4.5"), 4.5);
  assert.deepEqual(markNumericFieldUnknown("age"), { age: "", ageUnknown: true });
});

test("changing age unit clears unknown and preserves the new unit", () => {
  const updated = updateNumericFieldUnit("age", "months");
  assert.deepEqual(updated, { ageUnit: "months", ageUnknown: false });
});

test("selecting weight unknown clears the saved numeric value", () => {
  const updated = markNumericFieldUnknown("weight");
  assert.deepEqual(updated, { weight: "", weightUnknown: true });
});

test("clicking weight input clears unknown without changing the unit", () => {
  const updated = beginNumericFieldEntry("weight");
  assert.deepEqual(updated, { weightUnknown: false });
});

test("typing weight clears unknown and keeps the entered value", () => {
  const updated = updateNumericFieldValue("weight", "18");
  assert.deepEqual(updated, { weight: "18", weightUnknown: false });
});

test("changing weight unit clears unknown and preserves the new unit", () => {
  const updated = updateNumericFieldUnit("weight", "kg");
  assert.deepEqual(updated, { weightUnit: "kg", weightUnknown: false });
});

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

test("review shows known and unknown values", () => {
  const unknownProfile = profile({
    age: "",
    ageUnknown: true,
    weight: "",
    weightUnknown: true,
  });
  const knownProfile = profile({
    age: "4",
    ageUnit: "years",
    weight: "70",
    weightUnit: "lb",
  });

  const ageRow = summaryRows.find((row) => row.key === "age");
  const weightRow = summaryRows.find((row) => row.key === "weight");

  assert.equal(ageRow?.getValue(unknownProfile), "I'm not sure");
  assert.equal(weightRow?.getValue(unknownProfile), "I'm not sure");
  assert.equal(ageRow?.getValue(knownProfile), "4 years");
  assert.equal(weightRow?.getValue(knownProfile), "70 lb");

  const items = buildSummaryItems(knownProfile, summaryRows);
  assert.equal(items.find((item) => item.key === "age")?.valueText, "4 years");
  assert.equal(items.find((item) => item.key === "weight")?.valueText, "70 lb");
});
