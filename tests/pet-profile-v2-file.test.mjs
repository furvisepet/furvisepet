import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPetProfileFactRows } from "../app/lib/pet-profile-file.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/pets/[id]/page.tsx");

function profile(overrides = {}) {
  return {
    age_unit: "years",
    age_value: 2,
    breed: null,
    current_food: null,
    name: "tommy",
    routine_note: null,
    sex: "male",
    species: "dog",
    weight_unit: "lb",
    weight_value: null,
    ...overrides,
  };
}

test("pet profile loads exactly one owner-scoped profile source", () => {
  assert.match(page, /const profileRow = await loadDogProfileForUser\(params\.id, user\)/);
  assert.doesNotMatch(page, /Promise\.all|loadDogProfileWithMemoriesForUser|loadCanonicalRememberedDetailsForUser|listRecentCareEntriesForPet/);
  for (const unnecessaryLoad of [
    "listCareEntriesForPet",
    "loadDogProductFeedbackForUser",
    "listActiveConcernsForPet",
    "readStoredGuidanceSnapshot",
    "loadAskConversations",
  ]) assert.doesNotMatch(page, new RegExp(unnecessaryLoad));
});

test("fact rows render durable values in the requested order", () => {
  assert.deepEqual(buildPetProfileFactRows(profile({
    breed: "Golden Retriever",
    current_food: "Purina Pro Plan",
    routine_note: "Eats around 7 AM",
    weight_value: 24,
  })), [
    { label: "Name", value: "Tommy" },
    { label: "Species", value: "Dog" },
    { label: "Sex", value: "Male" },
    { label: "Age", value: "2 years" },
    { label: "Breed", value: "Golden Retriever" },
    { label: "Weight", value: "24 lb" },
    { label: "Current food", value: "Purina Pro Plan" },
    { label: "Routine", value: "Eats around 7 AM" },
  ]);
});

test("unknown and missing facts are omitted without filler", () => {
  assert.deepEqual(buildPetProfileFactRows(profile({
    age_value: null,
    breed: "Unknown",
    current_food: "Not provided",
    routine_note: "Not sure",
    sex: "not_sure",
    species: null,
    weight_value: null,
  })), [{ label: "Name", value: "Tommy" }]);
  assert.doesNotMatch(page, /Unknown|Not recorded|N\/A|Not much saved yet|Add the basics/);
});

test("the profile has one Edit action and no duplicated feature workflows", () => {
  assert.equal((page.match(/EDIT PET/g) || []).length, 1);
  assert.match(page, /href=\{`\/pets\/\$\{encodeURIComponent\(profile\.id\)\}\/edit`\}/);
  for (const removedSurface of [
    "VET BRIEF",
    "Ask Furvise",
    "Add update",
    "Recent updates",
    "Today's snapshot",
    "Today’s snapshot",
    "Furvise guidance",
    "Start here",
    "What Furvise remembers",
    "Active concerns",
    "Products for",
    "Manage pet",
    "Delete pet",
    "LocalPetAvatar",
  ]) assert.doesNotMatch(page, new RegExp(removedSurface, "i"));
});

test("details use one responsive spec list with no cards or orange", () => {
  assert.match(page, /<dl className="mt-5 divide-y/);
  assert.match(page, /sm:grid-cols-\[14rem_minmax\(0,1fr\)\]/);
  assert.match(page, /w-full min-w-0 overflow-x-hidden/);
  assert.doesNotMatch(page, /max-w-\[860px\]/);
  assert.match(page, /min-w-0/);
  assert.match(page, /overflow-x-hidden/);
  assert.doesNotMatch(page, /lg:grid-cols|rounded-\[1\.5rem\]|shadow-|orange|#C9560C|#F47A22|#FA8A36|#EF6E17/i);
  assert.doesNotMatch(page, /monthly budget|monthly_budget/i);
});

test("lifecycle metadata remains delegated to the shared authority", () => {
  assert.match(page, /formatPetDirectoryMetadata\(profile\)/);
  assert.match(page, /formatPetDisplayName\(profile\.name\)/);
});
