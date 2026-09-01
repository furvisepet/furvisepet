import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initialProfile } from "../app/lib/petwise.ts";
import { resolveOnboardingModeDecision } from "../app/onboarding/mode-state.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("mode=new always chooses a blank draft even when pet or draft state exists", () => {
  for (const snapshot of [
    { requestedMode: "new", storedMode: "edit", storedProfileId: "existing-pet" },
    { requestedMode: "new", storedMode: "new", storedProfileId: null },
    { requestedMode: "new", storedMode: "new", storedProfileId: "deleted-pet" },
  ]) {
    const decision = resolveOnboardingModeDecision(snapshot);
    assert.equal(decision.finalMode, "new");
    assert.equal(decision.shouldKeepStoredDraft, false);
    assert.equal(decision.shouldClearDraftStorage, true);
  }
});

test("fresh defaults contain no pet identity or uncertainty selections", () => {
  assert.equal(initialProfile.name, "");
  assert.equal(initialProfile.species, "");
  assert.equal(initialProfile.breed, "");
  assert.equal(initialProfile.age, "");
  assert.equal(initialProfile.ageUnknown, false);
  assert.equal(initialProfile.weightUnknown, false);
  assert.equal(initialProfile.currentFoodUnknown, false);
  assert.deepEqual(initialProfile.avoidIngredients, []);
});

test("new, edit, and resume paths are isolated before Quick Start renders", () => {
  const page = read("app/onboarding/page.tsx");
  const drafts = read("app/lib/onboarding-drafts.ts");
  assert.match(page, /mode === "edit"[\s\S]*`\/pets\/\$\{encodeURIComponent\(petId\)\}\/edit`/);
  assert.match(page, /mode === "resume"[\s\S]*getActiveAddPetDraftId[\s\S]*readAddPetDraft/);
  assert.match(page, /mode === "quick-start"[\s\S]*readAddPetDraft\(window\.localStorage, draftId, user\.id\)/);
  assert.match(page, /Resume setup/);
  assert.match(page, /if \(!draftState \|\| !user\)[\s\S]*Preparing pet setup/);
  assert.match(drafts, /ADD_PET_DRAFT_VERSION = 2/);
  assert.match(drafts, /ADD_PET_DRAFT_PREFIX/);
  assert.match(drafts, /EDIT_PET_ONBOARDING_DRAFT_PREFIX/);
  assert.match(drafts, /getAddPetDraftPointerKey\(userId\)/);
});

test("stale legacy state is cleared before a new versioned draft begins", () => {
  const page = read("app/onboarding/page.tsx");
  assert.match(page, /clearNewPetOnboardingState[\s\S]*beginAddPetDraft/);
  const drafts = read("app/lib/onboarding-drafts.ts");
  assert.match(drafts, /LEGACY_ONBOARDING_DRAFT_KEY/);
  assert.match(drafts, /value\.version !== ADD_PET_DRAFT_VERSION/);
  assert.match(drafts, /catch \{[\s\S]*return null/);
});

test("successful save, cancellation, and sign-out clear drafts while edit-draft cleanup remains available", () => {
  const page = read("app/onboarding/page.tsx");
  const drafts = read("app/lib/onboarding-drafts.ts");
  assert.match(page, /clearCompletedOnboardingState\([\s\S]*saved\.id/);
  assert.match(page, /function cancel\(\)[\s\S]*clearNewPetOnboardingState/);
  assert.match(read("app/components/signed-in-header.tsx"), /clearNewPetOnboardingState/);
  assert.match(drafts, /clearCompletedOnboardingState[\s\S]*clearEditPetOnboardingDraft\(storage\.localStorage, profileId\)/);
});

test("edit mode delegates to the requested pet profile editor", () => {
  assert.match(read("app/onboarding/page.tsx"), /requestedPetId \|\| window\.localStorage\.getItem\(PROFILE_ID_STORAGE_KEY\)/);
  assert.match(read("app/pets/[id]/edit/page.tsx"), /dogs\/\[id\]\/edit\/page/);
  assert.match(read("app/dogs/[id]/edit/page.tsx"), /loadDogProfileForUser/);
});
