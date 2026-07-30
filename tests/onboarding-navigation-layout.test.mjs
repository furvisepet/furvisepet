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
  assert.match(source, /min-h-\[24rem\]/);
});

test("step two uses a compact responsive details grid", async () => {
  const source = await read("app/onboarding/page.tsx");
  const step = source.slice(source.indexOf("function BasicDetailsStep"), source.indexOf("function CareDetailsStep"));
  assert.match(step, /sm:grid-cols-2/);
  assert.match(step, /Name/); assert.match(step, /Age/); assert.match(step, /Sex/); assert.match(step, /Breed/);
  assert.match(step, /mt-6 grid gap-4/);
});

test("step three groups physical details, care focus, and ingredients", async () => {
  const source = await read("app/onboarding/page.tsx");
  const step = source.slice(source.indexOf("function CareDetailsStep"), source.indexOf("function ReviewStep"));
  assert.match(step, /title="Physical details"/);
  assert.match(step, /title="Care focus"/);
  assert.match(step, /title="Avoid ingredients"/);
  assert.match(step, /min-\[380px\]:grid-cols-2/);
});

test("review uses three compact groups with one edit action each", async () => {
  const source = await read("app/onboarding/page.tsx");
  const review = source.slice(source.indexOf("function ReviewStep"), source.indexOf("function ReviewGroup"));
  assert.equal(review.match(/<ReviewGroup/g)?.length, 3);
  assert.match(review, /title="Basic details"/);
  assert.match(review, /title="Care details"/);
  assert.match(review, /title="Preferences"/);
  assert.doesNotMatch(review, /Not provided/);
});

test("one sticky footer keeps a dominant action and paired secondary actions", async () => {
  const source = await read("app/onboarding/page.tsx");
  const shell = source.slice(source.indexOf("function OnboardingStepShell"), source.indexOf("function SpeciesStep"));
  assert.match(shell, /sticky bottom-0/);
  assert.match(shell, /safe-area-inset-bottom/);
  assert.equal(shell.match(/<PrimaryButton/g)?.length, 2);
  assert.match(shell, /justify-between/);
  assert.match(shell, />Back<\/TextButton>/);
  assert.match(shell, />Cancel<\/TextButton>/);
});

test("species illustrations are consistently bounded across detail steps", async () => {
  const source = await read("app/onboarding/page.tsx");
  assert.match(source, /className="h-20 w-20 shrink-0 object-contain"/);
  assert.match(source, /height=\{80\}/);
  assert.doesNotMatch(source, /absolute[^"]*h-20 w-20/);
});

test("success state uses a larger centered illustration and action width", async () => {
  const source = await read("app/onboarding/page.tsx");
  const success = source.slice(source.indexOf("function SuccessStep"), source.indexOf("function ResumeChoice"));
  assert.match(success, /h-36 w-36/);
  assert.match(success, /sm:h-44 sm:w-44/);
  assert.match(success, /max-w-\[680px\]/);
  assert.match(success, /max-w-\[500px\]/);
  assert.match(success, /items-center justify-center/);
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
  assert.match(source, /className="w-full"/);
});
