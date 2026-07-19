import test from "node:test";
import assert from "node:assert/strict";
import { initialProfile } from "../app/lib/petwise.ts";
import { buildSummaryItems, buildSummaryProfileStatus, summaryRows } from "../app/onboarding/summary.ts";

const stepKeys = summaryRows.map((row) => ({ key: row.key }));

function createBlankProfile() {
  return { ...initialProfile };
}

function createUnknownProfile() {
  return {
    ...initialProfile,
    ageUnknown: true,
    weightUnknown: true,
    currentFoodUnknown: true,
  };
}

function createFilledProfile() {
  return {
    ...initialProfile,
    name: "  Maple  ",
    species: "dog",
    breed: "  Golden retriever mix  ",
    age: " 4 ",
    ageUnit: "years",
    weight: " 42 ",
    weightUnit: "lb",
    currentFood: "  Chicken and rice kibble  ",
    mainConcern: "Sensitive stomach",
    avoidIngredients: ["Chicken", "Dairy"],
    customAvoidIngredient: " pumpkin ",
    monthlyBudget: " 80 ",
  };
}

test("onboarding summary rows always return display-safe strings", () => {
  const profiles = [createBlankProfile(), createUnknownProfile(), createFilledProfile()];

  for (const profile of profiles) {
    for (const row of summaryRows) {
      const value = row.getValue(profile);
      assert.equal(typeof value, "string");
    }

    const items = buildSummaryItems(profile, stepKeys);
    assert.equal(items.length, summaryRows.length);

    items.forEach((item, index) => {
      assert.equal(typeof item.valueText, "string");
      assert.equal(item.stepIndex, index);
    });
  }
});

test("onboarding summary rows keep the callback shape", () => {
  for (const row of summaryRows) {
    assert.equal(typeof row.getValue, "function");
    assert.equal("value" in row, false);
  }
});

test("onboarding review uses canonical profile completeness status", () => {
  assert.equal(buildSummaryProfileStatus(createFilledProfile()), "Ready for guidance");
  assert.equal(buildSummaryProfileStatus(createUnknownProfile()), "Missing required information");
});

test("onboarding summary labels the budget as care budget", () => {
  const budgetRow = summaryRows.find((row) => row.key === "monthlyBudget");
  assert.equal(budgetRow?.label, "Monthly care budget");
});

test("species is required and displayed in onboarding review", () => {
  const filled = createFilledProfile();
  const items = buildSummaryItems(filled, stepKeys);
  assert.equal(items.find((item) => item.key === "species")?.valueText, "Dog");
  assert.equal(buildSummaryProfileStatus({ ...filled, species: "" }), "Missing required information");
});

test("short onboarding review only shows first-result fields", () => {
  const filled = createFilledProfile();
  const shortSteps = ["name", "species", "age", "mainConcern"].map((key) => ({ key }));
  const items = buildSummaryItems(filled, shortSteps);

  assert.deepEqual(items.map((item) => item.key), ["name", "species", "age", "mainConcern"]);
  assert.equal(items.find((item) => item.key === "currentFood"), undefined);
  assert.equal(items.find((item) => item.key === "avoidIngredients"), undefined);
  assert.equal(items.find((item) => item.key === "monthlyBudget"), undefined);
});
