import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDurableFileCloser,
  buildPetKnowledgeRows,
  getPetObjectPronoun,
} from "../app/onboarding/post-create-knowledge.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pet = (overrides = {}) => ({
  ageExplicitlyUnknown: false,
  age_unit: null,
  age_value: null,
  breed: null,
  breedExplicitlyUnknown: false,
  id: "pet-1",
  name: "Mani",
  routine_note: null,
  sex: null,
  species: "cat",
  weightExplicitlyUnknown: false,
  weight_unit: null,
  weight_value: null,
  ...overrides,
});

test("onboarding remains four steps with a restrained heron-only header", () => {
  const source = read("app/onboarding/page.tsx");
  assert.match(source, /Step \{step \+ 1\} of 4/);
  assert.doesNotMatch(source, /Step 5|of 5|grid-cols-5/);
  const shell = source.slice(source.indexOf("function OnboardingShell"));
  assert.match(shell, /<BrandMark[^>]*showName=\{false\}[^>]*size=\{30\}/);
  assert.match(shell, /items-center justify-center/);
  assert.doesNotMatch(shell, /border-b/);
  assert.doesNotMatch(shell, /furvise-wordmark|furvise-logo/);
});

test("post-create invitation replaces the celebration screen and has one dominant action", () => {
  const source = read("app/onboarding/page.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, /"invitation" \| "knowledge"/);
  assert.match(activation, /See what Furvise knows about \{pet\.name\}/);
  assert.match(activation, />Show me<\/PrimaryButton>/);
  assert.match(activation, />Skip for now<\/TextButton>/);
  assert.doesNotMatch(activation, /Furvise home is ready|✓|confetti|celebration/);
  assert.ok(activation.indexOf("Show me") < activation.indexOf("Skip for now"));
});

test("knowledge rows use only authoritative saved values and explicit unknown selections", () => {
  assert.deepEqual(buildPetKnowledgeRows(pet()), [["Species", "Cat"]]);
  assert.deepEqual(buildPetKnowledgeRows(pet({
    age_unit: "years",
    age_value: 2,
    breed: "Siamese",
    routine_note: "Sometimes throws up after eating",
    sex: "female",
    weight_unit: "lb",
    weight_value: 8,
  })), [
    ["Species", "Cat"],
    ["Age", "2 years"],
    ["Sex", "Female"],
    ["Breed", "Siamese"],
    ["Weight", "8 lb"],
    ["Note", "Sometimes throws up after eating"],
  ]);
  assert.deepEqual(buildPetKnowledgeRows(pet({
    ageExplicitlyUnknown: true,
    breedExplicitlyUnknown: true,
    sex: "not_sure",
    weightExplicitlyUnknown: true,
  })).slice(1), [["Age", "Not sure"], ["Sex", "Not sure"], ["Breed", "Not sure"], ["Weight", "Not sure"]]);
  assert.equal(buildPetKnowledgeRows(pet()).some(([label]) => label === "Name"), false);
});

test("the durable-file closer uses only the approved simple pronouns", () => {
  assert.equal(getPetObjectPronoun("female"), "her");
  assert.equal(getPetObjectPronoun("male"), "him");
  assert.equal(getPetObjectPronoun("not_sure"), "them");
  assert.equal(getPetObjectPronoun(null), "them");
  assert.equal(buildDurableFileCloser(pet({ sex: "female" })), "This is Mani's file. When something changes, add it or ask. Furvise keeps it with her, not as a one-off chat.");
});

test("Show me is deterministic and cannot spend Ask quota or create a conversation", () => {
  const source = read("app/onboarding/page.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, /onClick=\{\(\) => setView\("knowledge"\)\}/);
  assert.doesNotMatch(activation, /fetch\(|idempotentClientFetch|\/api\/ask|conversation|quota|credit|OpenAI|memory/i);
  assert.doesNotMatch(source, /\/api\/analyze|\/api\/ask/);
});

test("knowledge state has one primary Ask action with explicit pet selection", () => {
  const source = read("app/onboarding/page.tsx");
  const knowledge = source.slice(source.indexOf("const rows = buildPetKnowledgeRows"), source.indexOf("function ResumeChoice"));
  assert.equal(knowledge.match(/<PrimaryButton/g)?.length, 1);
  assert.match(knowledge, /href=\{`\/ask\?pet=\$\{encodeURIComponent\(pet\.id\)\}`\}>Ask Furvise/);
  assert.match(knowledge, />Go to Today<\/TextButton>/);
  const ask = read("app/ask/page.tsx");
  assert.match(ask, /const requestedPet = searchParams\.get\("pet"\)/);
  assert.match(ask, /resolveAskPetSelection\(\{ explicitPetId: requestedPet, pets: rows, storedPetId: storedPet \}\)/);
  assert.doesNotMatch(knowledge, /suggested question|prefill|submit/i);
});

test("saved profile response is the factual source and note remains conditional", () => {
  const source = read("app/onboarding/page.tsx");
  const mapping = source.slice(source.indexOf("const saved = await savePetProfileForUser"), source.indexOf("} catch (saveFailure)"));
  for (const field of ["saved.age_unit", "saved.age_value", "saved.breed", "saved.routine_note", "saved.sex", "saved.species", "saved.weight_unit", "saved.weight_value"]) assert.match(mapping, new RegExp(field.replace(".", "\\.")));
  assert.match(read("app/onboarding/post-create-knowledge.ts"), /if \(pet\.routine_note\?\.trim\(\)\) rows\.push\(\["Note"/);
});

test("knowledge view contains factual structure without marketing copy", () => {
  const [source, helper] = [read("app/onboarding/page.tsx"), read("app/onboarding/post-create-knowledge.ts")];
  for (const forbidden of ["What this means for Furvise", "I can compare future changes", "prepare vet visits", "recommend", "Track changes", "starter question"]) assert.doesNotMatch(source + helper, new RegExp(forbidden, "i"));
  assert.match(source, /<dl[^>]*overflow-hidden/);
  assert.match(source, /break-words/);
  assert.match(source, /w-full max-w-\[620px\]/);
});

test("post-create focus is predictable and initial success scroll remains at the top", () => {
  const source = read("app/onboarding/page.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, /headingRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(activation, /window\.scrollTo\(\{ behavior: "auto", left: 0, top: 0 \}\)/);
  assert.match(activation, /\}, \[view\]\)/);
  assert.doesNotMatch(activation, /behavior: "smooth"/);
});

test("onboarding focus tokens are forest-scoped and never orange", () => {
  const css = read("app/globals.css");
  const scoped = css.slice(css.indexOf(".onboarding-shell"), css.indexOf(".onboarding-primary-action"));
  assert.match(scoped, /--focus-ring: var\(--deep-forest\)/);
  assert.match(scoped, /--focus: color-mix\(in srgb, var\(--deep-forest\)/);
  assert.doesNotMatch(scoped, /orange|focus-orange/i);
  const source = read("app/onboarding/page.tsx");
  for (const label of ["Name", "Age", "Age unit", "Breed", "Weight", "Weight unit", "Anything else?"]) assert.match(source, new RegExp(`aria-label="${label.replace("?", "\\?")}"`));
});
