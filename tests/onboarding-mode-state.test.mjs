import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getOnboardingSaveProfileId,
  resolveOnboardingModeDecision,
} from "../app/onboarding/mode-state.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("explicit new mode ignores stale edit profile state and inserts a fresh profile", () => {
  const decision = resolveOnboardingModeDecision({
    requestedMode: "new",
    storedMode: "edit",
    storedProfileId: "pet-123",
  });

  assert.equal(decision.finalMode, "new");
  assert.equal(decision.editingProfileId, "");
  assert.equal(decision.shouldLoadExistingProfile, false);
  assert.equal(decision.shouldClearDraftStorage, true);
  assert.equal(decision.shouldClearProfileIdStorage, true);
  assert.equal(decision.shouldClearMemoriesStorage, true);
  assert.equal(decision.shouldClearAnalysisStorage, true);
  assert.equal(decision.shouldKeepStoredDraft, false);
  assert.equal(getOnboardingSaveProfileId(decision.finalMode, decision.editingProfileId), "");
});

test("explicit new mode with no stale profile keeps the current new draft", () => {
  const decision = resolveOnboardingModeDecision({
    requestedMode: "new",
    storedMode: "new",
    storedProfileId: "",
  });

  assert.equal(decision.finalMode, "new");
  assert.equal(decision.shouldClearDraftStorage, false);
  assert.equal(decision.shouldKeepStoredDraft, true);
  assert.equal(decision.shouldLoadExistingProfile, false);
});

test("edit mode loads a valid stored profile and falls back when the id is missing", () => {
  const editDecision = resolveOnboardingModeDecision({
    requestedMode: null,
    storedMode: "edit",
    storedProfileId: "pet-456",
  });

  assert.equal(editDecision.finalMode, "edit");
  assert.equal(editDecision.shouldLoadExistingProfile, true);
  assert.equal(editDecision.loadExistingProfileId, "pet-456");
  assert.equal(getOnboardingSaveProfileId(editDecision.finalMode, editDecision.editingProfileId), "pet-456");

  const missingDecision = resolveOnboardingModeDecision({
    requestedMode: "edit",
    storedMode: "edit",
    storedProfileId: "",
  });

  assert.equal(missingDecision.finalMode, "new");
  assert.equal(missingDecision.shouldLoadExistingProfile, false);
  assert.equal(missingDecision.shouldRedirectToNewMode, true);
  assert.equal(missingDecision.shouldClearDraftStorage, true);
  assert.equal(getOnboardingSaveProfileId(missingDecision.finalMode, missingDecision.editingProfileId), "");
});

test("switching from edit to new clears the stale load path before review", () => {
  const editDecision = resolveOnboardingModeDecision({
    requestedMode: null,
    storedMode: "edit",
    storedProfileId: "pet-789",
  });

  const newDecision = resolveOnboardingModeDecision({
    requestedMode: "new",
    storedMode: "edit",
    storedProfileId: "pet-789",
  });

  assert.equal(editDecision.finalMode, "edit");
  assert.equal(editDecision.shouldLoadExistingProfile, true);
  assert.equal(newDecision.finalMode, "new");
  assert.equal(newDecision.editingProfileId, "");
  assert.equal(newDecision.shouldLoadExistingProfile, false);
  assert.equal(newDecision.shouldClearDraftStorage, true);
  assert.equal(newDecision.shouldKeepStoredDraft, false);
});

test("save failures stay on the save error path and never reuse the load error branch", () => {
  const source = read("app/onboarding/page.tsx");
  const saveCatchStart = source.indexOf("} catch (saveError) {");
  const analysisCatchStart = source.indexOf("try {", saveCatchStart);
  const saveCatchBlock = source.slice(saveCatchStart, analysisCatchStart);

  assert.match(saveCatchBlock, /setSaveProfileError\(saveProfileErrorMessage\);/);
  assert.match(saveCatchBlock, /return;/);
  assert.doesNotMatch(saveCatchBlock, /setLoadExistingProfileError/);
  assert.doesNotMatch(saveCatchBlock, /router\.push/);
});

test("new pet onboarding uses a four-step first result flow while edit keeps full profile", () => {
  const source = read("app/onboarding/page.tsx");

  assert.match(source, /const newPetStepKeys = new Set<StepKey>\(\["name", "species", "age", "mainConcern"\]\);/);
  assert.match(source, /mode === "new" \? steps\.filter\(\(step\) => newPetStepKeys\.has\(step\.key\)\) : steps/);
  assert.match(source, /const activeSteps = useMemo\(\(\) => getActiveOnboardingSteps\(onboardingMode\), \[onboardingMode\]\);/);
  assert.match(source, /const invalidStep = activeSteps\.find\(\(step\) => getStepError\(profile, step\.key\)\);/);
  assert.match(source, /saveDogProfileForUser\(profile, user, profileIdForUpdate\)/);
  assert.match(source, /router\.push\(`\/results\?profileId=\$\{encodeURIComponent\(savedProfileId\)\}`\);/);
  assert.match(source, /isSummary \? "Profile ready" : `Step \$\{activeStepIndex \+ 1\} of \$\{activeSteps\.length\}`/);
  assert.doesNotMatch(source, /setOnboardingMode\("recommend_existing"\)/);
  assert.ok(source.indexOf('"mainConcern"') < source.indexOf('Review {profile.name.trim() || "your pet"}&apos;s profile'));
  assert.ok(source.indexOf('router.push(`/results?profileId=${encodeURIComponent(savedProfileId)}`);') > source.indexOf("const savedProfile = await saveDogProfileForUser"));
  assert.ok(source.indexOf('router.push(`/results?profileId=${encodeURIComponent(savedProfileId)}`);') > source.indexOf("if (!savedProfileId)"));
});

test("new pet first result flow excludes full profile-only fields before results", () => {
  const source = read("app/onboarding/page.tsx");
  const newPetStepKeysStart = source.indexOf("const newPetStepKeys");
  const newPetStepKeysEnd = source.indexOf("function getActiveOnboardingSteps");
  const newPetStepKeysBlock = source.slice(newPetStepKeysStart, newPetStepKeysEnd);
  const saveFlow = source.slice(source.indexOf("const getRecommendations"), source.indexOf("useEffect", source.indexOf("const getRecommendations")));

  assert.match(newPetStepKeysBlock, /"name"/);
  assert.match(newPetStepKeysBlock, /"species"/);
  assert.match(newPetStepKeysBlock, /"age"/);
  assert.match(newPetStepKeysBlock, /"mainConcern"/);
  assert.doesNotMatch(newPetStepKeysBlock, /"weight"|"currentFood"|"avoidIngredients"|"monthlyBudget"/);
  assert.match(saveFlow, /const invalidStep = activeSteps\.find/);
  assert.match(saveFlow, /setSaveProfileError\(saveProfileErrorMessage\);/);
  assert.doesNotMatch(saveFlow, /continueForward\(\)|nextStep\(\)|setStepIndex\(\(current\) => Math\.min\(activeSteps\.length, current \+ 1\)\)/);
});
