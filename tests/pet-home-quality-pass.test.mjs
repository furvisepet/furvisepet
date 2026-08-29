import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildDraftProfileFieldStates, buildProfileFieldStates } from "../app/lib/profile-completeness.ts";
import { buildTodayRecentEntries, getLocalGreeting, SERVER_SAFE_GREETING } from "../app/lib/today.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Quick Start keeps exactly four focused steps and requires species", () => {
  const source = read("app/onboarding/page.tsx");
  const surface = read("app/onboarding/onboarding-surface.tsx");
  assert.match(surface, /`Step \$\{step \+ 1\} of 4`/);
  assert.match(surface, /\{\[0, 1, 2, 3\]\.map/);
  assert.doesNotMatch(source, /Step .* of 5/);
  assert.match(source, /draft\.step === 0 \? Boolean\(draft\.species\)/);
  assert.match(source, /disabled=\{!canContinue\}/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(source, /Set up a home for your|\/images\/\$\{species\}/);
  assert.match(source, /min-h-24/);
  assert.doesNotMatch(source, /◖ᴥ◗|⌃•ᴥ•⌃/);
});

test("shared focused widths constrain onboarding and Today without touching wide profiles", () => {
  const primitives = read("app/components/product-primitives.tsx");
  const onboardingSurface = read("app/onboarding/onboarding-surface.tsx");
  const today = read("app/dashboard/page.tsx");
  assert.match(primitives, /focusedFormLayout = "w-full max-w-\[640px\]"/);
  assert.match(primitives, /todayPrimaryLayout = "w-full"/);
  assert.match(primitives, /today: "w-full"/);
  assert.match(onboardingSurface, /max-w-\[780px\]/);
  assert.match(today, /data-ui="today-primary-content"/);
  assert.doesNotMatch(read("app/pets/[id]/page.tsx"), /todayPrimaryLayout|focusedFormLayout/);
});

test("intentional unknown and none-known answers are complete", () => {
  const draftStates = buildDraftProfileFieldStates({
    age: "",
    ageUnit: "years",
    ageUnknown: true,
    avoidIngredients: [],
    avoidIngredientsNoneKnown: true,
    breed: "Mixed / unknown",
    currentFood: "",
    currentFoodUnknown: true,
    customAvoidIngredient: "",
    mainConcern: "General wellness",
    monthlyBudget: "50",
    name: "Sam",
    otherConcern: "",
    species: "dog",
    weight: "",
    weightUnit: "lb",
    weightUnknown: true,
  });
  assert.equal(draftStates.breed, "complete-unknown");
  assert.equal(draftStates.age, "complete-unknown");
  assert.equal(draftStates.weight, "complete-unknown");
  assert.equal(draftStates.currentFood, "complete-unknown");
  assert.equal(draftStates.avoidIngredients, "complete-none");

  const rowStates = buildProfileFieldStates({
    age_value: null,
    avoid_ingredients: [],
    breed: "I'm not sure",
    current_food: null,
    main_concern: "General wellness",
    monthly_budget: 50,
    name: "Sam",
    species: "dog",
    weight_value: null,
  });
  for (const key of ["age", "avoidIngredients", "breed", "currentFood", "weight"]) assert.notEqual(rowStates[key], "missing");
});

test("Today greeting is local-time aware and hydration safe", () => {
  assert.equal(getLocalGreeting(5), "Good morning");
  assert.equal(getLocalGreeting(12), "Good afternoon");
  assert.equal(getLocalGreeting(17), "Good evening");
  assert.equal(SERVER_SAFE_GREETING, "Welcome back");
  assert.match(read("app/components/today-greeting.tsx"), /useSyncExternalStore\(subscribe, getBrowserGreeting, getServerGreeting\)/);
});

test("Today remains optional, personal, and capped to three recent notes", () => {
  const source = read("app/dashboard/page.tsx");
  const rows = [0, 1, 2, 3].map((index) => ({ id: String(index), occurred_at: `2026-07-2${index}T12:00:00Z`, pet_profile_id: "pet" }));
  assert.equal(buildTodayRecentEntries(rows, "pet").length, 3);
  assert.match(source, /Anything worth remembering\?/);
  assert.match(source, /Everything seems normal/);
  assert.match(source, /View full history/);
  assert.match(source, /story starts with the first note/);
  for (const pressured of ["check in today", "daily log", "streak"]) assert.doesNotMatch(source, new RegExp(pressured, "i"));
});

test("saved pet photos remain supported while onboarding omits the species mascot", () => {
  const localPhoto = read("app/components/local-photo.tsx");
  assert.match(localPhoto, /function LocalPetAvatar/);
  assert.match(localPhoto, /<PetAvatar[^>]*photoUrl=\{source\}/);
  assert.doesNotMatch(read("app/onboarding/page.tsx"), /src=\{`\/images\/\$\{pet\.species\}\.png`\}/);
  assert.match(read("app/dashboard/page.tsx"), /<LocalPetIdentity/);
  assert.match(read("app/pets/[id]/page.tsx"), /<LocalPetAvatar/);
});

test("completion copy, mobile clearance, and established routes remain intact", () => {
  const onboarding = read("app/onboarding/page.tsx");
  const surface = read("app/onboarding/onboarding-surface.tsx");
  assert.match(onboarding, />\{pet\.name\} is ready<\/h1>/);
  assert.match(onboarding, /Ask Furvise about \{pet\.name\}/);
  assert.match(onboarding, /Go to Today/);
  assert.match(onboarding, /const todayHref = `\/dashboard\?pet=/);
  assert.match(onboarding, /`\/ask\?pet=.*&from=onboarding`/);
  assert.match(surface, /safe-area-inset-bottom/);
  assert.doesNotMatch(onboarding, /MobileBottomNavigation|SignedInHeader/);
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
});
