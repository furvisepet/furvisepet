import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatPetDirectoryMetadata } from "../app/lib/pets-directory.ts";

const pets = readFileSync(new URL("../app/pets/page.tsx", import.meta.url), "utf8");

test("Pets V2 loads only owned profile rows", () => {
  assert.match(pets, /loadDogProfilesWithMemories\(user\)/);
  assert.doesNotMatch(pets, /listRecentCareEntries|CareEntryWithPetName|getCurrentAccessToken|ask\/conversations|AskConversationSummary/);
});

test("Pets V2 is a continuous linked directory with one action per pet", () => {
  assert.match(pets, /supportingText="The pets Furvise remembers with you\."/);
  assert.match(pets, /href=\{NEW_PET_ONBOARDING_PATH\}>[\s\S]*ADD PET[\s\S]*<\/Link>/);
  assert.match(pets, /data-ui="pet-directory-list"/);
  assert.match(pets, /<ul[^>]*divide-y[^>]*border-y/);
  assert.match(pets, /aria-label=\{`Open \$\{name\}`\}[\s\S]*href=\{`\/pets\/\$\{profile\.id\}`\}/);
  assert.match(pets, />OPEN<\/span>/);
  assert.doesNotMatch(pets, /rounded-2xl|shadow-|PetIdentity|PetOverflowMenu/);
});

test("Pets V2 omits duplicated workflows and profile management", () => {
  for (const copy of ["Care goal", "Most recent update", "Add update", "Ask about", "Vet brief", "Latest conversation", "care history"]) {
    assert.doesNotMatch(pets, new RegExp(copy, "i"));
  }
  assert.doesNotMatch(pets, /deleteDogProfileForUser|clearEditPetOnboardingDraft|buildPetDeletionReauthenticationHref/);
});

test("directory metadata uses available identity and safe lifecycle labels", () => {
  assert.equal(formatPetDirectoryMetadata({ age_unit: "years", age_value: 2, lifecycle_status: "active", sex: "male", species: "dog" }), "Dog · Male · 2 years");
  assert.equal(formatPetDirectoryMetadata({ age_unit: "years", age_value: 1, lifecycle_status: "deceased", sex: "not_sure", species: "cat" }), "Cat · 1 year · In memory");
  assert.equal(formatPetDirectoryMetadata({ lifecycle_status: "archived", species: null }), "Archived");
  assert.equal(formatPetDirectoryMetadata({ age_value: null, lifecycle_status: "active", sex: null, species: null }), "");
});

test("Pets V2 empty and responsive states keep forest actions and nav-safe geometry", () => {
  assert.match(pets, /No pets here yet\./);
  assert.match(pets, /Start with the pet you want Furvise to remember\./);
  assert.match(pets, /ADD YOUR PET/);
  assert.match(pets, /min-h-24 grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(pets, /bg-\[var\(--deep-forest\)\][\s\S]*text-\[color:var\(--warm-cream\)\]/);
  assert.match(pets, /focus-visible:ring-\[var\(--focus-ring\)\]/);
  assert.doesNotMatch(pets, /orange|warm-orange|pw-primary|action-primary/i);
});
