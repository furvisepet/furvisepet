import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { initialProfile } from "../app/lib/petwise.ts";
import { petProfileDraftsEqual, reducePetProfileDraft, setUnknownWithoutDiscarding } from "../app/lib/pet-profile-draft.ts";
import { beginAddPetDraft, createBlankAddPetDraft, readAddPetDraft, saveAddPetDraft } from "../app/lib/onboarding-drafts.ts";

class Storage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  removeItem(key) { this.values.delete(key); }
  setItem(key, value) { this.values.set(key, String(value)); }
}
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const filled = () => ({ ...initialProfile, name: "Luna", species: "dog", breed: "Beagle", age: "4", weight: "28", currentFood: "Salmon food", mainConcern: "Grooming", avoidIngredients: ["Chicken"], monthlyBudget: "80" });

test("profile values survive species and unit control rerenders", () => {
  let draft = reducePetProfileDraft(filled(), { type: "patch", values: { species: "cat" } });
  draft = reducePetProfileDraft(draft, { type: "patch", values: { ageUnit: "months", weightUnit: "kg" } });
  assert.equal(draft.breed, "Beagle"); assert.equal(draft.age, "4"); assert.equal(draft.weight, "28");
  assert.equal(draft.currentFood, "Salmon food"); assert.deepEqual(draft.avoidIngredients, ["Chicken"]); assert.equal(draft.monthlyBudget, "80");
});

test("unknown toggles preserve and restore age, weight, and food drafts", () => {
  let draft = filled();
  for (const field of ["ageUnknown", "weightUnknown", "currentFoodUnknown"]) draft = setUnknownWithoutDiscarding(draft, field, true);
  assert.equal(draft.age, "4"); assert.equal(draft.weight, "28"); assert.equal(draft.currentFood, "Salmon food");
  for (const field of ["ageUnknown", "weightUnknown", "currentFoodUnknown"]) draft = setUnknownWithoutDiscarding(draft, field, false);
  assert.equal(draft.age, "4"); assert.equal(draft.weight, "28"); assert.equal(draft.currentFood, "Salmon food");
});

test("main concern and ingredient changes preserve unrelated profile fields", () => {
  const concern = reducePetProfileDraft(filled(), { type: "patch", values: { mainConcern: "Itchy skin" } });
  const ingredients = reducePetProfileDraft(concern, { type: "patch", values: { avoidIngredients: ["Chicken", "Dairy"] } });
  assert.equal(ingredients.currentFood, "Salmon food"); assert.equal(ingredients.weight, "28"); assert.equal(ingredients.monthlyBudget, "80");
  assert.deepEqual(ingredients.avoidIngredients, ["Chicken", "Dairy"]);
});

test("dirty comparison changes only after a draft edit", () => {
  const baseline = filled();
  assert.equal(petProfileDraftsEqual(baseline, { ...baseline }), true);
  assert.equal(petProfileDraftsEqual(baseline, reducePetProfileDraft(baseline, { type: "patch", values: { breed: "Collie" } })), false);
});

test("profile editor loads once per pet identity and guards unsaved navigation", async () => {
  const source = await read("app/dogs/[id]/edit/page.tsx");
  assert.match(source, /loadedIdentityRef\.current === identity/);
  assert.match(source, /beforeunload/);
  assert.match(source, /You have unsaved changes\. Leave without saving\?/);
  assert.match(source, /catch \{[\s\S]*could not save[\s\S]*finally/);
  assert.doesNotMatch(source.slice(source.indexOf("catch {"), source.indexOf("finally", source.indexOf("catch {"))), /dispatchProfile/);
});

test("onboarding drafts retain every step value and are isolated by user", () => {
  const storage = new Storage();
  const a = beginAddPetDraft(storage, "user-a");
  const entered = { ...a.draft, species: "cat", name: "Luna", ageValue: "8", sex: "female", breed: "Siamese", weightValue: "9", currentFood: "Salmon", mainConcern: "Grooming", avoidIngredients: ["Chicken"], monthlyBudget: "40", routineNote: "Brush weekly", step: 3 };
  assert.equal(saveAddPetDraft(storage, a.id, entered, "user-a"), true);
  assert.deepEqual(readAddPetDraft(storage, a.id, "user-a"), entered);
  assert.equal(readAddPetDraft(storage, a.id, "user-b"), null);
});

test("blank onboarding optional fields remain nullable-compatible", () => {
  const draft = createBlankAddPetDraft();
  assert.equal(draft.sex, ""); assert.equal(draft.breed, ""); assert.equal(draft.weightValue, "");
  assert.equal(draft.currentFood, ""); assert.equal(draft.mainConcern, ""); assert.equal(draft.monthlyBudget, "");
});

test("onboarding has exactly four requested content steps and no photo upload", async () => {
  const source = await read("app/onboarding/page.tsx");
  for (const component of ["SpeciesStep", "BasicDetailsStep", "OptionalContextStep", "ReviewStep"]) assert.match(source, new RegExp(`function ${component}`));
  assert.doesNotMatch(source, /PhotoStep|Choose photo|type="file"|saveLocalPhoto/);
  assert.match(source, /Step \{step \+ 1\} of 4/);
});

test("dog and cat onboarding no longer renders standalone cartoon PNGs", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.doesNotMatch(source, /src=\{`\/images\/\$\{species\}\.png`\}/);
  assert.doesNotMatch(source, /src=\{`\/images\/\$\{pet\.species\}\.png`\}/);
  assert.doesNotMatch(source, /LocalPetAvatar/);
});

test("review contains simplified populated fields and edit links retain the draft", async () => {
  const source = await read("app/onboarding/page.tsx");
  const review = source.slice(source.indexOf("function ReviewStep"), source.indexOf("function ReviewGroup"));
  for (const label of ["Species", "Name", "Age", "Sex", "Breed", "Weight", "Note"]) assert.match(review, new RegExp(label));
  for (const removed of ["Current food", "Main concern", "Avoid ingredients", "Monthly care budget"]) assert.doesNotMatch(review, new RegExp(removed));
  assert.match(source, /edit=\{\(\) => edit\(1\)\}/); assert.match(source, /edit=\{\(\) => edit\(2\)\}/);
  assert.match(source, /setDraft\(\(current\) => \(\{ \.\.\.current, \.\.\.values/);
});

test("pet creation performs one canonical profile write and keeps failed draft state", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.equal(source.match(/savePetProfileForUser\(profile, user, null\)/g)?.length, 1);
  assert.match(source, /catch \(saveFailure\)/);
  assert.doesNotMatch(source.slice(source.indexOf("catch (saveFailure)"), source.indexOf("finally", source.indexOf("catch (saveFailure)"))), /clearCompletedOnboardingState/);
});

test("onboarding is centered, overflow-safe, and uses the restrained heron mark", async () => {
  const [source, css] = await Promise.all([read("app/onboarding/page.tsx"), read("app/globals.css")]);
  assert.match(source, /max-w-\[840px\]/); assert.match(source, /mx-auto/); assert.match(source, /overflow-x-hidden/);
  assert.match(source, /onboarding-brand/); assert.match(source, /showName=\{false\}/); assert.match(css, /--brand-mark-size: 30px/);
  assert.doesNotMatch(source.slice(source.indexOf("function OnboardingShell")), /border-b/);
});

test("post-create activation is centered and uses consistent bounded actions", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /max-w-\[560px\]/); assert.match(source, /flex-col items-center/); assert.match(source, /max-w-\[500px\]/);
  assert.match(source, /See what Furvise knows about \{pet\.name\}/);
  assert.match(source, />Ask Furvise<\/PrimaryButton>/);
});

test("Terms and Privacy share a full-viewport mobile legal header with Back", async () => {
  const [shell, terms, privacy] = await Promise.all([read("app/components/legal-page-shell.tsx"), read("app/terms/page.tsx"), read("app/privacy/page.tsx")]);
  assert.match(shell, /← Back/); assert.match(shell, /router\.back\(\)/); assert.match(shell, /router\.push\("\/"\)/);
  assert.match(shell, /min-h-dvh/); assert.match(shell, /w-full/); assert.match(shell, /overflow-x-hidden/); assert.match(shell, /safe-area-inset-top/); assert.match(shell, /min-h-11/);
  assert.match(terms, /LegalPageShell/); assert.match(privacy, /LegalPageShell/);
});

test("nullable onboarding schema fields preserve existing profiles and ownership RLS", async () => {
  const [migration, supabase] = await Promise.all([read("supabase/migrations/20260728125000_add_pet_onboarding_optional_details.sql"), read("app/lib/supabase.ts")]);
  assert.match(migration, /add column if not exists sex text/); assert.match(migration, /add column if not exists routine_note text/);
  assert.match(migration, /sex is null/); assert.doesNotMatch(migration, /not null/i);
  assert.match(supabase, /sex: profile\.sex \|\| null/); assert.match(supabase, /routine_note: profile\.routineNote\?\.trim\(\) \|\| null/);
});
