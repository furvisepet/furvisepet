import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDraftProfileFieldStates,
  buildProfileCompleteness,
  buildProfileFieldStates,
} from "../app/lib/profile-completeness.ts";
import { formatCareEntryTitle, groupCareEntriesByDate } from "../app/lib/care-log.mjs";
import { initialProfile } from "../app/lib/petwise.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function row(overrides = {}) {
  return {
    age_value: 4,
    avoid_ingredients: ["Chicken"],
    breed: "Mixed",
    current_food: "Salmon kibble",
    main_concern: "General wellness",
    monthly_budget: 80,
    name: "Luna",
    species: "dog",
    weight_value: 22,
    ...overrides,
  };
}

test("new pet creation bypasses analysis and opens the pet's live file", () => {
  const source = read("app/onboarding/page.tsx");
  assert.ok(source.indexOf("setSavedPet") > source.indexOf("savePetProfileForUser"));
  assert.match(source, /`\/today\?pet=\$\{encodeURIComponent\(pet\.id\)\}`/);
  assert.doesNotMatch(source, /\/api\/analyze|Get recommendations|Analyze profile/);
  assert.doesNotMatch(read("app/pets/[id]/page.tsx"), /was added\.|marketing|recommendations/i);
});

test("duplicate summary redirects and remembered details preserve pet identity", () => {
  const results = read("app/results/page.tsx");
  assert.match(results, /router\.replace\(profileId \? `\/pets\/\$\{encodeURIComponent\(profileId\)\}` : "\/pets"\)/);

  const remembered = read("app/dogs/[id]/memories/page.tsx");
  assert.match(remembered, /useParams<\{ id: string \}>\(\)/);
  assert.match(remembered, /href=\{`\/pets\/\$\{params\.id\}`\}/);
  assert.match(read("app/pets/[id]/memories/page.tsx"), /dogs\/\[id\]\/memories\/page/);
});

test("profile field states distinguish known, none-known, unknown, and missing", () => {
  assert.equal(buildProfileFieldStates(row({ avoid_ingredients: [] })).avoidIngredients, "complete-none");
  assert.equal(buildProfileFieldStates(row({ avoid_ingredients: null })).avoidIngredients, "missing");
  assert.equal(buildProfileFieldStates(row({ avoid_ingredients: ["Chicken"] })).avoidIngredients, "complete-known");
  assert.equal(buildProfileFieldStates(row({ weight_value: null })).weight, "complete-unknown");

  const draft = { ...initialProfile, name: "Luna", species: "dog", avoidIngredientsNoneKnown: true };
  assert.equal(buildDraftProfileFieldStates(draft).avoidIngredients, "complete-none");
  assert.equal(buildProfileCompleteness(row({ avoid_ingredients: [] })).missingFields.includes("avoid ingredients"), false);
});

test("pet profile is a compact fact file without duplicated product surfaces", () => {
  const page = read("app/pets/[id]/page.tsx");
  assert.match(page, /buildPetProfileFactRows\(profile\)/);
  assert.match(page, /pet-details-heading/);
  assert.match(page, /<dl className="mt-5 divide-y/);
  assert.doesNotMatch(page, /What Furvise remembers|Recent updates|Today.?s snapshot|Furvise guidance|listCareEntriesForPet|\/results\?|\/ask\?|\/vet-brief\?/);
});

test("History titles are deterministic and date groups are chronological", () => {
  const base = { category: "food", note: "Changed kibble at dinner", title: null };
  assert.equal(formatCareEntryTitle(base), "Food update");
  assert.equal(formatCareEntryTitle({ ...base, note: "Appetite was lower" }), "Appetite");
  assert.notEqual(formatCareEntryTitle({ category: "general", note: "Short note", title: "Update" }), "Update");

  const groups = groupCareEntriesByDate([
    { ...base, id: "today", occurred_at: "2026-07-26T10:00:00-07:00" },
    { ...base, id: "yesterday", occurred_at: "2026-07-25T10:00:00-07:00" },
    { ...base, id: "week", occurred_at: "2026-07-22T10:00:00-07:00" },
  ], new Date("2026-07-26T12:00:00-07:00"));
  assert.deepEqual(groups.map((group) => group.label), ["Today", "Yesterday", "This week"]);
});

test("History is bounded, supports load more, and labels pets in all-pets mode", () => {
  const workspace = read("app/components/care-log-workspace.tsx");
  const timeline = read("app/components/care-timeline.tsx");
  assert.match(workspace, /useState\(25\)/);
  assert.match(workspace, /visibleEntries\.slice\(0, visibleLimit\)/);
  assert.match(workspace, />Load older updates</);
  assert.match(timeline, /CareEntryMetadata[\s\S]*petNameById\?\.get\(entry\.pet_profile_id\)/);
  assert.match(timeline, /petNameById\?\.get\(entry\.pet_profile_id\)/);
  assert.doesNotMatch(timeline, />More</);
});

test("primary navigation omits retired duplicate destinations and core destinations remain", () => {
  const header = read("app/components/app-header.tsx");
  const navBlock = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.doesNotMatch(navBlock, /results|memories|summary/i);
  for (const route of ["app/today/page.tsx", "app/ask/page.tsx", "app/shop/page.tsx", "app/vet-brief/page.tsx"]) {
    assert.equal(existsSync(new URL(`../${route}`, import.meta.url)), true, route);
  }
});

test("shared mobile-navigation clearance remains on pet and History pages", () => {
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
  const css = read("app/globals.css");
  assert.match(css, /--mobile-nav-clearance:\s*calc\([\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*24px/);
  assert.match(read("app/pets/[id]/page.tsx"), /<AppPage>/);
  assert.match(read("app/components/care-log-workspace.tsx"), /<AppPage/);
});

test("protected brand assets retain their approved hashes", () => {
  const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00");
  assert.equal(hash("app/favicon.ico"), "617e8f6a24067e937ecafd8c8a8de735bf4bac546b0378f0220c884f88c952db");
});
