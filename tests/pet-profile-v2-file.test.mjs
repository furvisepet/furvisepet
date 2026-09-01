import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPetProfileAboutDetails } from "../app/lib/pet-profile-file.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/pets/[id]/page.tsx");

function profile(overrides = {}) {
  return {
    breed: null,
    current_food: null,
    routine_note: null,
    weight_unit: "lb",
    weight_value: null,
    ...overrides,
  };
}

test("pet profile loads only the owned profile and canonical remembered-details authorities", () => {
  assert.match(page, /Promise\.all\(\[[\s\S]*loadDogProfileForUser\(params\.id, user\)[\s\S]*loadCanonicalRememberedDetailsForUser\(params\.id, user\)/);
  for (const retiredLoad of [
    "listCareEntriesForPet",
    "loadDogProductFeedbackForUser",
    "listActiveConcernsForPet",
    "readStoredGuidanceSnapshot",
    "buildPetProfileOverviewModel",
  ]) assert.doesNotMatch(page, new RegExp(retiredLoad));
});

test("pet profile exposes only durable profile actions and preserves secured deletion", () => {
  assert.match(page, /EDIT PET/);
  assert.match(page, /\/vet-brief\?pet=/);
  assert.match(page, /buildPetDeletionReauthenticationHref\(profile\.id\)/);
  assert.match(page, /deleteDogProfileForUser\(profile\.id, user\)/);
  for (const duplicate of [
    "Today's snapshot",
    "Today’s snapshot",
    "Furvise guidance",
    "Add update",
    "Ask Furvise",
    "View full history",
    "Active concerns",
    "Recent updates",
    "Products for",
    "More actions",
    "LocalPetAvatar",
  ]) assert.doesNotMatch(page, new RegExp(duplicate));
});

test("About renders only known durable fields and never exposes monthly budget", () => {
  assert.deepEqual(buildPetProfileAboutDetails(profile()), []);
  assert.deepEqual(buildPetProfileAboutDetails(profile({
    breed: "Golden Retriever",
    current_food: "Salmon kibble",
    routine_note: "Usually eats around 7 AM",
    weight_value: 24,
  })), [
    { label: "Breed", value: "Golden Retriever" },
    { label: "Weight", value: "24 lb" },
    { label: "Routine", value: "Usually eats around 7 AM" },
    { label: "Current food", value: "Salmon kibble" },
  ]);
  assert.deepEqual(buildPetProfileAboutDetails(profile({ breed: "Unknown", current_food: "Not provided", routine_note: "Not sure" })), []);
  assert.doesNotMatch(page, /monthly budget|monthly_budget/i);
  assert.match(page, /There isn&apos;t much here yet\./);
  assert.match(page, /Add details when you know them\./);
});

test("remembered details stay pet-scoped, bounded, honest, and line-based", () => {
  assert.match(page, /rememberedDetails\.pet\.map/);
  assert.match(page, /rememberedFacts\.slice\(0, 5\)/);
  assert.match(page, /rememberedFacts\.length > 5 \? "VIEW ALL" : "MANAGE REMEMBERED DETAILS"/);
  assert.match(page, /Nothing remembered yet\./);
  assert.match(page, /Things you tell Furvise over time can appear here\./);
  assert.match(page, /divide-y divide-\[var\(--line\)\]/);
  assert.doesNotMatch(page, /confidence|provenance|memory type/i);
});

test("lifecycle, focus, and responsive file geometry stay deliberate", () => {
  assert.match(page, /formatPetDirectoryMetadata\(profile\)/);
  assert.match(page, /lifecycleStatus === "active" \? <Link[\s\S]*VET BRIEF/);
  assert.match(page, /max-w-\[860px\]/);
  assert.match(page, /min-w-0/);
  assert.match(page, /overflow-x-hidden/);
  assert.match(page, /focus-visible:ring-\[var\(--focus-ring\)\]/);
  assert.doesNotMatch(page, /orange|#C9560C|#F47A22|#FA8A36|#EF6E17/i);
});
