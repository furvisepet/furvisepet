import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const primitives = read("app/components/product-primitives.tsx");
const appPage = read("app/components/app-page.tsx");
const today = read("app/today/page.tsx");
const pets = read("app/pets/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const header = read("app/components/app-header.tsx");
const onboarding = read("app/onboarding/page.tsx");
const onboardingSurface = read("app/onboarding/onboarding-surface.tsx");
const petProfile = read("app/pets/[id]/page.tsx");
const editProfile = read("app/dogs/[id]/edit/page.tsx");
const vetBrief = read("app/vet-brief/page.tsx");
const account = read("app/account/page.tsx");
const accountShell = read("app/components/account-settings-shell.tsx");

test("primary app routes share one outer page-container contract", () => {
  assert.match(primitives, /appPageContainer = "box-border mx-auto w-\[calc\(100%_-_2\.5rem\)\] max-w-\[1180px\] sm:w-\[calc\(100%_-_4rem\)\] lg:w-\[calc\(100%_-_6rem\)\]"/);
  assert.match(appPage, /<PageShell preset="app">/);
  assert.match(appPage, /appPageContentClasses\[shell\]/);
  assert.match(header, /className="homepage-wide-shell homepage-header-grid" data-ui="header-optical-row"/);

  for (const source of [today, pets, history, ask, products, petProfile, editProfile, vetBrief, accountShell]) {
    assert.match(source, /<AppPage/);
  }
  assert.match(account, /<AccountSettingsShell/);
});

test("authenticated shell aliases no longer create separate standard and wide widths", () => {
  for (const preset of ["reading", "standard", "today", "wide"]) {
    assert.match(primitives, new RegExp(`${preset}: "w-full"`));
  }
  assert.match(primitives, /todayPrimaryLayout = "w-full"/);
  assert.doesNotMatch(primitives, /todayPrimaryLayout = "[^"]*mx-auto/);
  assert.match(primitives, /focusedFormLayout = "w-full max-w-\[640px\]"/);
  assert.doesNotMatch(primitives, /focusedFormLayout = "[^"]*mx-auto/);
});

test("mobile navigation clearance remains owned by the shared app page", () => {
  assert.match(appPage, /<main className="app-mobile-nav-clearance/);
  for (const source of [today, pets, history, ask]) {
    assert.doesNotMatch(source, /mobile-nav-clearance|mobile-nav-height|mobile-nav-safe-area/);
  }
  assert.match(
  products,
  /fixed inset-x-0 bottom-0 top-\[4\.25rem\][\s\S]*lg:top-\[4\.25rem\]/
);
  assert.doesNotMatch(products, /--mobile-nav-(?:clearance|height|safe-area)\s*:/);
});

test("Ask keyboard helper uses the intended middle dot without an encoding artifact", () => {
  assert.match(ask, /Enter to send · Shift \+ Enter for a new line/);
  assert.doesNotMatch(ask, /Enter to send Â·/);
});

test("onboarding uses a centered readable form while keeping fields left aligned", () => {
  assert.match(onboardingSurface, /max-w-\[780px\]/);
  assert.match(onboardingSurface, /place-items-center/);
  assert.match(onboarding, /function OnboardingStepShell/);
  assert.doesNotMatch(onboarding, /text-center[^\n]*BasicDetailsStep/);
});
