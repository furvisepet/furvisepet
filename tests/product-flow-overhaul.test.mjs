import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDraftProfileFieldStates } from "../app/lib/profile-completeness.ts";
import { initialProfile } from "../app/lib/petwise.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Add Pet is a focused Quick Start with a direct Ask handoff", () => {
  const source = read("app/onboarding/page.tsx");
  for (const stage of ["Who are we setting up?", "Tell us about your pet", "Anything Furvise should know?", "Finish setting up"]) assert.match(source, new RegExp(stage.replace(/[?]/g, "\\?")));
  assert.match(source, /function OnboardingStepShell/);
  assert.match(source, />Back<\/TextButton>/);
  assert.match(source, />Cancel<\/TextButton>/);
  assert.match(source, /Continue/);
  assert.match(source, />\{pet\.name\} is ready<\/h1>/);
  assert.match(source, />Ask Furvise about \{pet\.name\}<\/PrimaryButton>/);
  assert.match(source, /Go to Today/);
  assert.doesNotMatch(source, /View \{pet\.name\}&apos;s profile/);
  assert.doesNotMatch(source, /Get recommendations|Analyze profile|Generate care plan|Profile ready|100%|\/api\/analyze/);
});

test("intentional none-known and unknown answers count as answered", () => {
  const states = buildDraftProfileFieldStates({
    ...initialProfile,
    ageUnknown: true,
    avoidIngredientsNoneKnown: true,
    currentFoodUnknown: true,
    name: "Luna",
    species: "dog",
    weightUnknown: true,
  });
  assert.equal(states.avoidIngredients, "complete-none");
  assert.equal(states.age, "complete-unknown");
  assert.equal(states.currentFood, "complete-unknown");
  assert.equal(states.weight, "complete-unknown");
});

test("profile header has no readiness badge and keeps useful identity metadata", () => {
  const page = read("app/pets/[id]/page.tsx");
  assert.match(page, /Updated \$\{formatShortDate\(model\.latestUpdateAt\)\}/);
  assert.match(page, /model\.headerSummary/);
  assert.doesNotMatch(page, /Getting to know|formatProfileStatusDisplay|Profile ready|StatusPill label=\{model\.completeness|>100%</);
});

test("Today remembers one note with progressively revealed optional metadata", () => {
  const page = read("app/today/page.tsx");
  assert.match(page, /Anything you want Furvise to remember\?/);
  assert.match(page, /<span>Category<\/span>[\s\S]*<span>When<\/span>/);
  assert.match(page, /\{detailsOpen \? \([\s\S]*metadataFields/);
  assert.doesNotMatch(page, /Everything seems normal|TODAY_EVENT_ACTIONS\.map/);
  const submitStart = page.indexOf("async function saveRememberedNote");
  const submit = page.slice(submitStart, page.indexOf("\n  return (\n", submitStart));
  assert.equal((submit.match(/createCareEntry\(/g) || []).length, 1);
});

test("History is grouped, bounded, and exposes accessible edit/delete menus", () => {
  const workspace = read("app/components/care-log-workspace.tsx");
  const timeline = read("app/components/care-timeline.tsx");
  const menu = read("app/components/overflow-menu.tsx");
  assert.match(workspace, /useState\(25\)/);
  assert.match(workspace, /visibleEntries\.slice\(0, visibleLimit\)/);
  assert.match(workspace, /Load older updates/);
  assert.match(timeline, /groupCareEntriesByDate/);
  assert.match(timeline, /ariaLabel=\{`More actions for \$\{title\}`\}/);
  assert.match(timeline, /label: "Edit"[\s\S]*label: "Delete"/);
  assert.match(menu, /ArrowDown[\s\S]*ArrowUp/);
  assert.match(menu, /event\.key !== "Escape"/);
  assert.match(menu, /pointerdown/);
  assert.match(menu, /createPortal\(menu, document\.body\)/);
});

test("photos stay owner-device local without a schema migration", () => {
  const media = read("app/lib/local-pet-media.ts");
  assert.match(media, /furvise:\$\{kind\}-photo:\$\{id\}/);
  assert.match(media, /image\//);
  assert.match(media, /2 \* 1024 \* 1024/);
  assert.doesNotMatch(read("supabase/schema.sql"), /photo_url|photo_path/);
});

test("mobile clearance and protected brand assets remain unchanged", () => {
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
  assert.match(read("app/globals.css"), /--mobile-nav-clearance: calc\([\s\S]*24px/);
  const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00");
  assert.equal(hash("app/favicon.ico"), "617e8f6a24067e937ecafd8c8a8de735bf4bac546b0378f0220c884f88c952db");
});
