import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBlankAddPetDraft } from "../app/lib/onboarding-drafts.ts";
import { validatePetProfileSaveInput } from "../app/lib/pet-profile-save-validation.ts";
import { initialProfile } from "../app/lib/petwise.ts";
import { buildOnboardingInitializationKey } from "../app/onboarding/initialization-key.ts";
import { getWeightPlausibilityWarning } from "../app/onboarding/weight-warning.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("onboarding keeps exactly four focused steps", () => {
  const source = read("app/onboarding/page.tsx");
  const surface = read("app/onboarding/onboarding-surface.tsx");
  assert.match(surface, /`Step \$\{step \+ 1\} of 4`/);
  assert.match(surface, /grid-cols-4/);
  assert.deepEqual(["SpeciesStep", "BasicDetailsStep", "OptionalContextStep", "ReviewStep"].map((name) => source.includes(`function ${name}`)), [true, true, true, true]);
  assert.doesNotMatch(source, /Step 5|of 5|grid-cols-5/);
});

test("species and name are the only server-required profile details", () => {
  const minimal = validatePetProfileSaveInput({ ...initialProfile, name: "Mani", species: "cat" });
  assert.equal(minimal.ok, true);
  assert.equal(validatePetProfileSaveInput({ ...initialProfile, name: "", species: "cat" }).ok, false);
  assert.equal(validatePetProfileSaveInput({ ...initialProfile, name: "Mani", species: "" }).ok, false);
  const source = read("app/onboarding/page.tsx");
  assert.match(source, /draft\.step === 1 \? isValidAddPetName\(draft\.name\) && ageIsValid : true/);
  assert.match(source, /if \(draft\.step === 2\) update\(\{ step: 3 \}\)/);
});

test("first-run UI collects only simplified optional context", () => {
  const source = read("app/onboarding/page.tsx");
  const context = source.slice(source.indexOf("function OptionalContextStep"), source.indexOf("function ReviewStep"));
  assert.match(context, /Field label="Weight"/);
  assert.match(context, /Field label="Anything else\?"/);
  assert.match(context, /maxLength=\{500\}/);
  assert.match(context, /routineNote/);
  for (const removed of ["Current food", "Main concern", "Avoid ingredients", "Monthly care budget"]) assert.doesNotMatch(context, new RegExp(removed));
  for (const legacyField of ["currentFood", "mainConcern", "avoidIngredients", "monthlyBudget"]) assert.match(read("app/lib/onboarding-drafts.ts"), new RegExp(legacyField));
});

test("obviously unusual weight warning is soft and clears for unknown", () => {
  assert.match(getWeightPlausibilityWarning({ species: "cat", unit: "lb", unknown: false, value: "60" }), /unusual for a cat/);
  assert.equal(getWeightPlausibilityWarning({ species: "cat", unit: "lb", unknown: false, value: "40" }), "");
  assert.equal(getWeightPlausibilityWarning({ species: "cat", unit: "lb", unknown: true, value: "60" }), "");
  assert.equal(getWeightPlausibilityWarning({ species: "dog", unit: "lb", unknown: false, value: "60" }), "");
  assert.match(read("app/onboarding/page.tsx"), /draft\.step === 1[^\n]+: true/);
});

test("same account and route produce a stable initialization identity", () => {
  const route = { draftId: "draft-1", mode: "quick-start", requestedPetId: "", userId: "user-1" };
  assert.equal(buildOnboardingInitializationKey(route), buildOnboardingInitializationKey({ ...route }));
  assert.notEqual(buildOnboardingInitializationKey(route), buildOnboardingInitializationKey({ ...route, userId: "user-2" }));
  assert.notEqual(buildOnboardingInitializationKey(route), buildOnboardingInitializationKey({ ...route, draftId: "draft-2" }));
  const source = read("app/onboarding/page.tsx");
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*initializeOnboarding[\s\S]*\}, \[initializationKey\]\)/);
  assert.doesNotMatch(source, /\}, \[draftId, mode, requestedPetId, router, status, user\]\)/);
});

test("cartoon art and legacy questionnaire stay out of onboarding rendering", () => {
  const source = read("app/onboarding/page.tsx");
  assert.doesNotMatch(source, /next\/image|\/images\/(?:dog|cat)|\/images\/\$\{(?:species|pet\.species)\}/);
  assert.doesNotMatch(source, /onboarding-confetti|Set up a home for your/);
  assert.match(source, /currentFood: draft\.currentFood/);
  assert.match(source, /monthlyBudget: draft\.monthlyBudget/);
});

test("review and post-create activation expose the simplified hierarchy", () => {
  const source = read("app/onboarding/page.tsx");
  const review = source.slice(source.indexOf("function ReviewStep"), source.indexOf("function ReviewGroup"));
  assert.match(review, /title="Basic details"/);
  assert.match(review, /title="Optional context"/);
  for (const removed of ["Current food", "Main concern", "Avoid ingredients", "Preferences", "Monthly care budget"]) assert.doesNotMatch(review, new RegExp(removed));
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, />\{pet\.name\} is ready<\/h1>/);
  assert.match(activation, />Ask Furvise about \{pet\.name\}<\/PrimaryButton>/);
  assert.match(activation, /Go to Today/);
});

test("post-create activation resets initial scroll and focuses each state predictably", () => {
  const source = read("app/onboarding/page.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, /window\.scrollTo\(\{ behavior: "auto", left: 0, top: 0 \}\)/);
  assert.match(activation, /focus\(\{ preventScroll: true \}\)/);
  assert.match(activation, /\}, \[\]\)/);
  assert.doesNotMatch(activation, /behavior: "smooth"/);
});

test("discard clears the active draft and replaces the route", () => {
  const source = read("app/onboarding/page.tsx");
  const cancel = source.slice(source.indexOf("function cancel()"), source.indexOf("function continueFromCurrent"));
  assert.match(cancel, /clearNewPetOnboardingState/);
  assert.match(cancel, /router\.replace\("\/pets"\)/);
  assert.deepEqual(Object.keys(createBlankAddPetDraft()).includes("monthlyBudget"), true);
});

test("onboarding actions use the scoped forest treatment", () => {
  const [source, css] = [read("app/onboarding/page.tsx"), read("app/globals.css")];
  assert.match(source, /onboarding-primary-action/);
  assert.match(css, /\.onboarding-primary-action \{[\s\S]*background: var\(--deep-forest\)[\s\S]*color: var\(--warm-cream\)/);
  assert.match(css, /\.onboarding-primary-action:disabled[\s\S]*background: var\(--soft-sage\)[\s\S]*color: var\(--deep-forest\)/);
});
