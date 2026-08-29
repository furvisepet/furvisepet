import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADD_PET_DRAFT_POINTER_KEY,
  ADD_PET_DRAFT_PREFIX,
  beginAddPetDraft,
  clearCompletedOnboardingState,
  createBlankAddPetDraft,
  readAddPetDraft,
  saveAddPetDraft,
} from "../app/lib/onboarding-drafts.ts";
import {
  isValidAddPetName,
  normalizeAddPetName,
  validateApproximatePetAge,
} from "../app/lib/add-pet-validation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }
}

test("a new versioned draft is blank and does not inherit deleted-pet values", () => {
  const storage = new MemoryStorage();
  storage.setItem("petwise:onboarding-draft", JSON.stringify({ name: "Rocky", species: "dog" }));

  const { draft } = beginAddPetDraft(storage);

  assert.deepEqual(draft, createBlankAddPetDraft());
  assert.equal(draft.name, "");
  assert.equal(draft.species, null);
  assert.equal(draft.ageValue, "");
  assert.equal(draft.ageUnknown, false);
  assert.equal(draft.localPhotoPreview, null);
});

test("refresh restores only the exact active valid V2 draft", () => {
  const storage = new MemoryStorage();
  const { draft, id } = beginAddPetDraft(storage);
  const changed = { ...draft, ageUnit: "months", ageValue: "8", name: " Luna ", species: "cat", step: 3 };

  assert.equal(saveAddPetDraft(storage, id, changed), true);
  assert.deepEqual(readAddPetDraft(storage, id), changed);

  storage.setItem(ADD_PET_DRAFT_POINTER_KEY, "stale");
  storage.setItem(`${ADD_PET_DRAFT_PREFIX}stale`, JSON.stringify({ ...changed, version: 1 }));
  assert.equal(readAddPetDraft(storage, "stale"), null);
  storage.setItem(`${ADD_PET_DRAFT_PREFIX}stale`, "not-json");
  assert.equal(readAddPetDraft(storage, "stale"), null);
});

test("successful creation clears the active onboarding draft", () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const { id } = beginAddPetDraft(localStorage);

  clearCompletedOnboardingState({ localStorage, sessionStorage });

  assert.equal(localStorage.getItem(ADD_PET_DRAFT_POINTER_KEY), null);
  assert.equal(readAddPetDraft(localStorage, id), null);
});

test("Quick Start name and age validation supports the intended paths", () => {
  assert.equal(isValidAddPetName("   "), false);
  assert.equal(isValidAddPetName("  Luna  "), true);
  assert.equal(normalizeAddPetName("  Luna  "), "Luna");
  assert.equal(validateApproximatePetAge("", "years", true), "");
  assert.equal(validateApproximatePetAge("8", "months", false), "");
  assert.notEqual(validateApproximatePetAge("0", "years", false), "");
});

test("onboarding stays focused, suppresses app navigation, and removes photo upload", () => {
  const page = read("app/onboarding/page.tsx");
  assert.doesNotMatch(page, /<AppPage|<SignedInHeader|MobileBottomNavigation/);
  assert.doesNotMatch(page, /Choose photo|PhotoStep|readPhotoFile|saveLocalPhoto/);
  assert.match(page, /Create \{name\}&apos;s profile/);
  assert.match(page, /See what Furvise knows about \{pet\.name\}/);
  assert.match(page, /Ask Furvise/);
  assert.match(page, /Go to Today/);
  assert.doesNotMatch(page, /View \{pet\.name\}&apos;s profile/);
  for (const forbidden of ["Start free trial", "Enable notifications", "Get recommendations", "Analyze profile"]) {
    assert.doesNotMatch(page, new RegExp(forbidden, "i"));
  }
});

test("success uses no animated confetti or cartoon artwork", () => {
  const [page, css] = [read("app/onboarding/page.tsx"), read("app/globals.css")];
  assert.doesNotMatch(page + css, /onboarding-confetti|onboarding-success-pop/);
  assert.doesNotMatch(page, /\/images\/\$\{pet\.species\}/);
});
