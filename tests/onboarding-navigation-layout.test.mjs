import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeAddPetName } from "../app/lib/add-pet-validation.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("step transitions alone trigger deferred focus and scroll reset", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /previousStepRef\.current === draft\.step/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /stepHeadingRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /stepContainerRef\.current\?\.scrollIntoView/);
  assert.match(source, /\}, \[draft\.step\]\)/);
  assert.doesNotMatch(source, /\[draft, draft\.step\]/);
});

test("draft hydration and field updates do not create an initial scroll", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /useRef<AddPetDraftV2\["step"\]>\(initialDraft\.step\)/);
  assert.match(source, /function update\(values: Partial<AddPetDraftV2>\)/);
  assert.doesNotMatch(source, /function update[\s\S]{0,240}scrollIntoView/);
});

test("reduced motion and sticky-header offset are respected", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /reduceMotion \? "auto" : "smooth"/);
  assert.match(source, /scroll-mt-24/);
});

test("every accessible heading announces its numbered step", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /tabIndex=\{-1\}/);
  assert.match(source, /aria-label="Step 1 of 4, Who are we setting up\?"/);
  assert.match(source, /aria-label=\{`Step \$\{step\} of 4, \$\{heading\}`\}/);
  for (const id of ["species-heading", "basic-heading", "care-heading", "review-heading"]) assert.match(source, new RegExp(id));
});

test("all steps share progress, card, and action shell", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /function OnboardingStepShell/);
  assert.match(source, /<Progress step=\{step\} \/>/);
  assert.match(source, /data-onboarding-step=\{step \+ 1\}/);
  assert.match(source, /max-w-\[840px\]/);
  assert.match(source, /min-h-\[20rem\]/);
});

test("step two uses a compact responsive details grid", async () => {
  const source = await read("app/onboarding/page.tsx");
  const step = source.slice(source.indexOf("function BasicDetailsStep"), source.indexOf("function OptionalContextStep"));
  assert.match(step, /sm:grid-cols-2/);
  assert.match(step, /Name/); assert.match(step, /Age/); assert.match(step, /Sex/); assert.match(step, /Breed/);
  assert.match(step, /mt-6 grid gap-4/);
});

test("step three keeps weight and one optional note", async () => {
  const source = await read("app/onboarding/page.tsx");
  const step = source.slice(source.indexOf("function OptionalContextStep"), source.indexOf("function ReviewStep"));
  assert.match(step, /Field label="Weight"/);
  assert.match(step, /Field label="Anything else\?"/);
  assert.match(step, /Optional\. You can always add more later\./);
  assert.doesNotMatch(step, /Current food|Main concern|Avoid ingredients/);
});

test("review uses populated simplified groups with one edit action each", async () => {
  const source = await read("app/onboarding/page.tsx");
  const review = source.slice(source.indexOf("function ReviewStep"), source.indexOf("function ReviewGroup"));
  assert.equal(review.match(/<ReviewGroup/g)?.length, 2);
  assert.match(review, /title="Basic details"/);
  assert.match(review, /title="Optional context"/);
  assert.doesNotMatch(review, /Current food|Main concern|Avoid ingredients|Preferences|Monthly care budget/);
  assert.doesNotMatch(review, /Not provided/);
});

test("one responsive footer keeps a dominant action and paired secondary actions", async () => {
  const source = await read("app/onboarding/page.tsx");
  const shell = source.slice(source.indexOf("function OnboardingStepShell"), source.indexOf("function SpeciesStep"));
  assert.match(shell, /sm:sticky sm:bottom-0/);
  assert.match(shell, /safe-area-inset-bottom/);
  assert.equal(shell.match(/<PrimaryButton/g)?.length, 2);
  assert.match(shell, /justify-between/);
  assert.match(shell, />Back<\/TextButton>/);
  assert.match(shell, />Cancel<\/TextButton>/);
});

test("species cartoons are absent across onboarding steps", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.doesNotMatch(source, /next\/image|\/images\/\$\{species\}|\/images\/\$\{pet\.species\}/);
});

test("post-create states use calm bounded layouts", async () => {
  const source = await read("app/onboarding/page.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, /max-w-\[500px\]/);
  assert.match(activation, /items-center justify-center/);
  assert.doesNotMatch(activation, /Image|confetti|Furvise home is ready/);
});

test("name normalization is stable between steps and safe at review and creation", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.equal(normalizeAddPetName("  Maple   Rose  "), "Maple Rose");
  assert.equal(normalizeAddPetName("MAPle"), "MAPle");
  assert.match(source, /update\(\{ step: 2 \}\)/);
  assert.doesNotMatch(source, /update\(\{ name, step: 2 \}\)/);
  assert.match(source, /name: normalizeAddPetName\(draft\.name\)/);
});

test("mobile shell remains width bounded without horizontal overflow", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /w-full overflow-x-hidden/);
  assert.match(source, /px-5/);
  assert.match(source, /min-w-0/);
  assert.match(source, /w-full/);
});
