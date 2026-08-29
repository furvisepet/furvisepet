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

test("explicit new mode clears even a current new draft", () => {
  const decision = resolveOnboardingModeDecision({
    requestedMode: "new",
    storedMode: "new",
    storedProfileId: "",
  });

  assert.equal(decision.finalMode, "new");
  assert.equal(decision.shouldClearDraftStorage, true);
  assert.equal(decision.shouldKeepStoredDraft, false);
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
  const saveCatchStart = source.indexOf("} catch (saveFailure) {");
  const saveCatchBlock = source.slice(saveCatchStart, source.indexOf("} finally", saveCatchStart));

  assert.match(saveCatchBlock, /setError\(saveFailure instanceof Error/);
  assert.doesNotMatch(saveCatchBlock, /setProfile|router\.replace/);
});

test("new pet onboarding uses four complete setup steps before direct save", () => {
  const source = read("app/onboarding/page.tsx");
  for (const question of ["Who are we setting up?", "Tell us about your pet", "Anything Furvise should know?", "Finish setting up"]) assert.match(source, new RegExp(question.replace(/[?]/g, "\\?")));
  assert.match(source, /savePetProfileForUser\(profile, user, null\)/);
  assert.match(source, />\{pet\.name\} is ready<\/h1>/);
  assert.match(source, />Ask Furvise about \{pet\.name\}<\/PrimaryButton>/);
  assert.match(source, /Go to Today/);
  assert.doesNotMatch(source, /\/results\?|Profile ready|Get recommendations|Analyze profile/);
});

test("new pet flow keeps only lightweight optional context before creating the pet", () => {
  const source = read("app/onboarding/page.tsx");
  for (const field of ["Weight", "Anything else?"]) assert.match(source, new RegExp(field.replace(/[?]/g, "\\?")));
  for (const removed of ["Current food", "Avoid ingredients", "Monthly care budget", "Main concern"]) assert.doesNotMatch(source, new RegExp(`Field label="${removed}"`));
  assert.match(source, /species[\s\S]*name[\s\S]*ageValue[\s\S]*weightValue/);
  assert.doesNotMatch(source, /PhotoStep|Choose photo/);
});
