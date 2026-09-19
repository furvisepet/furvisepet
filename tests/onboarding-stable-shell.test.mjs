import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/onboarding/page.tsx");
const surface = read("app/onboarding/onboarding-surface.tsx");

test("one stable surface owns all four steps and post-create success", () => {
  for (const step of ["SpeciesStep", "BasicDetailsStep", "OptionalContextStep", "ReviewStep"]) {
    assert.match(page, new RegExp(`function ${step}`));
  }
  assert.doesNotMatch(page + surface, /Step 5|of 5|grid-cols-5/);
  assert.match(page, /function OnboardingStepShell[\s\S]*<OnboardingSurface/);
  assert.match(page, /function PostCreateActivation[\s\S]*<OnboardingViewport><OnboardingSurface/);
  assert.equal(page.match(/<OnboardingSurface/g)?.length, 2);
  assert.doesNotMatch(page + surface, /max-w-\[500px\]|post-create-success-card|onboarding-success-shell/);
});

test("desktop and mobile geometry is canonical and viewport safe", () => {
  assert.match(surface, /max-w-\[780px\]/);
  assert.match(surface, /sm:h-\[min\(640px,calc\(100svh_-_120px\)\)\]/);
  assert.match(surface, /h-\[calc\(100svh_-_1\.5rem_-_env\(safe-area-inset-top,0px\)_-_env\(safe-area-inset-bottom,0px\)\)\]/);
  assert.match(surface, /max\(0\.75rem,env\(safe-area-inset-(?:left|right),0px\)\)/);
  assert.match(surface, /grid-rows-\[auto_auto_minmax\(0,1fr\)_auto\]/);
  assert.match(surface, /min-h-0 min-w-0 overflow-y-auto/);
  assert.match(surface, /place-items-center overflow-x-hidden/);
});

test("brand, progress, content, and footer remain fixed shell zones", () => {
  for (const zone of ["onboarding-brand-zone", "onboarding-progress-zone", "onboarding-content-zone", "onboarding-footer-zone"]) {
    assert.match(surface, new RegExp(`data-ui="${zone}"`));
  }
  assert.match(surface, /<BrandMark[^>]*showName=\{false\}[^>]*size=\{30\}/);
  assert.match(surface, /\[--brand-mark-size:1\.875rem\] sm:\[--brand-mark-size:2rem\]/);
  assert.match(surface, /min-h-11 min-w-11/);
  assert.doesNotMatch(page, /<BrandMark|onboarding-brand-zone|<header/);
  assert.match(surface, /complete \? "Setup complete" : `Step \$\{step \+ 1\} of 4`/);
  assert.match(surface, /aria-valuenow=\{complete \? 4 : step \+ 1\}/);
  assert.match(page, /footer=\{<OnboardingFooter/);
  assert.equal(page.match(/<OnboardingFooter/g)?.length, 2);
});

test("step content and activation behavior remain unchanged", () => {
  for (const label of ["Who are we setting up?", "Choose your pet to get started.", "Name", "Age", "Sex", "Breed", "Weight", "Anything else?"]) {
    assert.match(page, new RegExp(label.replace(/[.?]/g, "\\$&")));
  }
  assert.match(page, /Finish setting up \$\{normalizeAddPetName\(draft\.name\)\}/);
  assert.match(page, />Ask Furvise about \{pet\.name\}<\/PrimaryButton>/);
  assert.match(page, />Go to Today<\/TextButton>/);
  assert.match(page, /`\/ask\?pet=\$\{encodeURIComponent\(pet\.id\)\}&from=onboarding`/);
  assert.match(page, /stepHeadingRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /stepContentRef\.current\?\.scrollTo\(\{ behavior: "auto", top: 0 \}\)/);
  assert.doesNotMatch(page, /behavior: "smooth"/);
});
