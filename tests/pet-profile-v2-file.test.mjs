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

test("pet profile loads the owned profile, canonical memories, and only three recent updates", () => {
  assert.match(page, /Promise\.all\(\[[\s\S]*loadDogProfileForUser\(params\.id, user\)[\s\S]*loadCanonicalRememberedDetailsForUser\(params\.id, user\)[\s\S]*listRecentCareEntriesForPet\(params\.id, 3/);
  for (const retiredLoad of [
    "listCareEntriesForPet",
    "loadDogProductFeedbackForUser",
    "listActiveConcernsForPet",
    "readStoredGuidanceSnapshot",
    "buildPetProfileOverviewModel",
  ]) assert.doesNotMatch(page, new RegExp(retiredLoad));
});

test("pet profile exposes one primary Edit action, one Vet Brief action, and no administration section", () => {
  assert.equal((page.match(/EDIT PET/g) || []).length, 1);
  assert.match(page, /\/vet-brief\?pet=/);
  assert.doesNotMatch(page, /MANAGE PET|Delete pet|deleteDogProfileForUser|buildPetDeletionReauthenticationHref/);
  for (const duplicate of [
    "Today's snapshot",
    "Today’s snapshot",
    "Furvise guidance",
    "Add update",
    "View full history",
    "Active concerns",
    "Products for",
    "More actions",
    "LocalPetAvatar",
  ]) assert.doesNotMatch(page, new RegExp(duplicate));
});

test("Details renders only known durable fields and never exposes monthly budget", () => {
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
  assert.match(page, /title="Details"/);
  assert.match(page, /Not much saved yet\./);
  assert.match(page, /Add the basics when you know them\./);
});

test("remembered details stay pet-scoped, bounded, honest, and editorial", () => {
  assert.match(page, /rememberedDetails\.pet\.map/);
  assert.doesNotMatch(page, /rememberedDetails\.owner\.map/);
  assert.match(page, /rememberedFacts\.slice\(0, 5\)/);
  assert.match(page, /Nothing remembered yet\./);
  assert.match(page, /When you tell Furvise something useful, like routines, food preferences, sensitivities, or other important context, it can show up here\./);
  assert.match(page, /divide-y divide-\[var\(--line\)\]/);
  assert.match(page, /function EditorialSection/);
  assert.doesNotMatch(page, /lg:grid-cols-2|pet-profile-cards|function ProfileCard/);
  assert.doesNotMatch(page, /confidence|provenance|memory type/i);
});

test("Recent updates is bounded, newest-first through shared authority, and honest when empty", () => {
  assert.match(page, /listRecentCareEntriesForPet\(params\.id, 3/);
  assert.match(page, /recentEntries\.map/);
  assert.match(page, /formatTodayTimelineDate\(entry\.occurred_at\)/);
  assert.match(page, /\$\{name\} doesn’t have any updates yet\./);
  assert.match(page, /What you save in Today will show up here\./);
});

test("the genuine empty file is rewarding, single-column, and safely actionable", () => {
  assert.match(page, /const isEmptyFile = about\.length === 0 && rememberedFacts\.length === 0 && recentEntries\.length === 0/);
  assert.match(page, /\{name\}’s file is just getting started\./);
  assert.match(page, /Details[\s\S]*Add the basics when you know them[\s\S]*What Furvise remembers[\s\S]*Recent updates/);
  assert.match(page, /href=\{`\/today\?pet=\$\{encodedPetId\}`\}/);
  assert.match(page, /href=\{`\/ask\?pet=\$\{encodedPetId\}`\}/);
  assert.doesNotMatch(page, /lg:grid-cols-2/);
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
