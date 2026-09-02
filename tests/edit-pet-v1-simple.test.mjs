import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSimplePetProfileUpdate, validateSimplePetProfile } from "../app/lib/edit-pet-profile.ts";
import { initialProfile } from "../app/lib/petwise.ts";

const route = readFileSync(new URL("../app/dogs/[id]/edit/page.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("../app/components/simple-pet-profile-form.tsx", import.meta.url), "utf8");
const page = `${route}\n${form}`;

function profile(overrides = {}) {
  return {
    ...initialProfile,
    avoidIngredients: [],
    name: "Tommy",
    species: "dog",
    ...overrides,
  };
}

test("the edit page exposes only durable V1 facts", () => {
  for (const label of [
    "Name",
    "Species",
    "Sex",
    "Age",
    "Breed",
    "Weight",
    "Current food",
    "Anything else Furvise should know?",
  ]) assert.match(page, new RegExp(label.replace(/[?]/g, "\\?")));

  for (const removed of [
    "Edit profile",
    "Main concern",
    "Itchy skin",
    "Sensitive stomach",
    "Picky eating",
    "Weight management",
    "General wellness",
    "Grooming",
    "Avoid ingredients",
    "Add another ingredient",
    "Monthly care budget",
    "I'm not sure",
  ]) assert.doesNotMatch(page, new RegExp(removed, "i"));
});

test("optional facts can remain blank while name and species stay required", () => {
  assert.equal(validateSimplePetProfile(profile()), "");
  assert.equal(validateSimplePetProfile(profile({ name: "" })), "Please add your pet's name.");
  assert.equal(validateSimplePetProfile(profile({ species: "" })), "Choose dog or cat before saving.");
  assert.equal(validateSimplePetProfile(profile({ age: "nope" })), "Enter a valid age, or leave it blank.");
  assert.equal(validateSimplePetProfile(profile({ weight: "0" })), "Enter a valid weight, or leave it blank.");
});

test("durable edits preserve every hidden legacy value", () => {
  const original = profile({
    avoidIngredients: ["Chicken", "Dairy"],
    avoidIngredientsNoneKnown: false,
    customAvoidIngredient: "Dairy",
    mainConcern: "Other",
    monthlyBudget: "125",
    otherConcern: "Seasonal itching",
    wellnessGoal: "maintain",
  });
  const edited = {
    ...original,
    age: "3",
    ageUnit: "years",
    breed: "Golden Retriever",
    currentFood: "Chicken and rice kibble",
    name: "Tommy James",
    routineNote: "Usually eats around 7 AM.",
    sex: "male",
    species: "dog",
    weight: "42",
    weightUnit: "lb",
  };
  const saved = buildSimplePetProfileUpdate(original, edited);

  assert.equal(saved.name, "Tommy James");
  assert.equal(saved.routineNote, "Usually eats around 7 AM.");
  assert.equal(saved.sex, "male");
  assert.equal(saved.ageUnknown, false);
  assert.equal(saved.weightUnknown, false);
  assert.equal(saved.currentFoodUnknown, false);
  assert.equal(saved.mainConcern, "Other");
  assert.equal(saved.otherConcern, "Seasonal itching");
  assert.deepEqual(saved.avoidIngredients, ["Chicken", "Dairy"]);
  assert.notEqual(saved.avoidIngredients, original.avoidIngredients);
  assert.equal(saved.monthlyBudget, "125");
  assert.equal(saved.wellnessGoal, "maintain");
});

test("blank durable values normalize to existing unknown flags without placeholder data", () => {
  const saved = buildSimplePetProfileUpdate(profile(), profile({ age: "", currentFood: "", weight: "" }));
  assert.equal(saved.ageUnknown, true);
  assert.equal(saved.weightUnknown, true);
  assert.equal(saved.currentFoodUnknown, true);
});

test("save and cancel return to the canonical pet profile", () => {
  assert.match(route, /const profileHref = `\/pets\/\$\{encodeURIComponent\(petId\)\}`/);
  assert.match(route, /buildSimplePetProfileUpdate\(savedProfile, profile\)/);
  assert.match(route, /saveDogProfileForUser\(nextProfile, user, petId\)/);
  assert.match(route, /router\.push\(profileHref\)/);
  assert.match(form, /href=\{cancelHref\}/);
});

test("the form uses a full-canvas product rail with forest actions and mobile-safe controls", () => {
  assert.match(route, /max-w-\[1180px\]/);
  assert.match(route, /Change the details Furvise uses for \$\{petName\}\./);
  assert.match(form, /label="Basic details"/);
  assert.match(form, /label="Care context"/);
  assert.match(form, /md:grid-cols-2/);
  assert.match(form, /gap-x-10/);
  assert.match(page, /grid-cols-\[minmax\(0,1fr\)_minmax\(7\.5rem,0\.48fr\)\]/);
  assert.match(page, /bg-\[var\(--deep-forest\)\][\s\S]*text-\[color:var\(--warm-cream\)\][\s\S]*SAVE CHANGES/);
  assert.match(page, /min-h-12/);
  assert.match(form, /flex-col[\s\S]*sm:flex-row-reverse[\s\S]*sm:justify-between/);
  assert.equal((form.match(/<FormSection/g) || []).length, 2);
  assert.doesNotMatch(page, /rounded-\[1\.5rem\]|shadow-\[0_18px|orange|#C9560C|#F47A22|#FA8A36|#EF6E17/i);
});
