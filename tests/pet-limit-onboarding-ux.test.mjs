import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluatePetLimit } from "../app/lib/billing/plan-limits.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("pet creation access stops free users before onboarding and allows eligible plans", () => {
  assert.equal(evaluatePetLimit({ earlyAccessUnlocked: false, isEditingExistingPet: false, petCount: 0, planId: "free" }).allowed, true);
  assert.equal(evaluatePetLimit({ earlyAccessUnlocked: false, isEditingExistingPet: false, petCount: 1, planId: "free" }).allowed, false);
  assert.equal(evaluatePetLimit({ earlyAccessUnlocked: false, isEditingExistingPet: false, petCount: 1, planId: "plus" }).allowed, true);
});

test("Quick Start mounts only after the shared entitlement gate allows access", () => {
  const page = read("app/onboarding/page.tsx");
  assert.match(page, /resolvePetCreationAccessForUser\(user\)/);
  assert.match(page, /if \(access && !access\.allowed\) return <PetLimitScreen/);
  assert.match(page, /if \(!draftState \|\| !user\)[\s\S]*return <AddPetFlow/);
  assert.ok(page.indexOf("function OnboardingGate") < page.indexOf("function AddPetFlow"));
  assert.doesNotMatch(page, /softNotice|Upgrade will unlock additional pets/);
});

test("all Add Pet entry points use the guarded onboarding constant", () => {
  for (const path of ["app/pets/page.tsx", "app/dashboard/page.tsx", "app/components/care-log-workspace.tsx", "app/components/homepage-client.tsx", "app/components/app-header.tsx"]) assert.match(read(path), /NEW_PET_(?:ONBOARDING|LOGIN)_PATH/, path);
  assert.match(read("app/lib/auth-routing.ts"), /NEW_PET_ONBOARDING_PATH = "\/onboarding\?mode=new"/);
});

test("final insert retains transaction-locked server-side plan enforcement", () => {
  const migration = read("supabase/migrations/20260726010000_enforce_pet_plan_limit.sql");
  assert.match(migration, /before insert on public\.dog_profiles/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /PET_LIMIT_REACHED/);
});

test("pet-limit screen is calm and never restarts onboarding", () => {
  const screen = read("app/components/pet-limit-screen.tsx");
  assert.match(screen, /Your plan includes \{access\.maxPets\}/);
  assert.match(screen, /Open \{petName\}/);
  assert.match(screen, /Back to pets/);
  assert.match(screen, /See plan options/);
  assert.doesNotMatch(screen, /\/onboarding|checkout/i);
});

test("Quick Start has four focused steps with a detailed care review", () => {
  const page = read("app/onboarding/page.tsx");
  assert.match(page, /Step \{step \+ 1\} of 4/);
  for (const copy of ["Who are we setting up?", "Tell us about your pet", "What should Furvise know?", "Finish setting up"]) assert.match(page, new RegExp(copy.replace(/[?]/g, "\\?")));
  assert.match(page, /Monthly care budget/);
  assert.match(page, /Avoid ingredients/);
  assert.doesNotMatch(page, /PhotoStep|Choose photo/);
});

test("Today, history metadata, snapshot, and shared mobile clearance remain", () => {
  const today = read("app/dashboard/page.tsx");
  assert.match(today, /Choose a category/);
  for (const path of ["app/components/care-timeline.tsx", "app/dashboard/page.tsx", "app/pets/[id]/page.tsx"]) assert.match(read(path), /CareEntryMetadata/);
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
});

test("protected brand assets remain unchanged", () => {
  const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00");
  assert.equal(hash("app/favicon.ico"), "617e8f6a24067e937ecafd8c8a8de735bf4bac546b0378f0220c884f88c952db");
});
