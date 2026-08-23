import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Today categories wrap responsively and expose pressed state", () => {
  const today = read("app/dashboard/page.tsx");
  const primitives = read("app/components/product-primitives.tsx");
  assert.match(today, /grid-cols-1 gap-2 min-\[360px\]:grid-cols-2 sm:flex sm:flex-wrap/);
  assert.match(today, /pressed=\{selected\}/);
  assert.match(primitives, /aria-pressed=\{pressed\}/);
  assert.match(primitives, /pressed \? <span aria-hidden="true"/);
});

test("Today completion card renders only genuinely missing checklist items", () => {
  const today = read("app/dashboard/page.tsx");
  assert.match(today, /PROFILE_CHECKLIST_FIELDS\.filter\(\(item\) => missingItems\.some/);
  assert.match(today, /profileNeedsCompletion = profileChecklist\.length > 0/);
  assert.match(today, /Make \{petName\}&apos;s guidance more specific/);
  const completionCard = today.match(/<section aria-labelledby="today-focus-heading"[\s\S]*?<\/section>/)?.[0];
  assert.ok(completionCard);
  assert.doesNotMatch(completionCard, /Getting to know|item\.complete|Profile incomplete|Limited context|percentage/i);
});

test("shared Add update action remains readable and bottom-nav clearance stays shared", () => {
  const today = read("app/dashboard/page.tsx");
  const primitives = read("app/components/product-primitives.tsx");
  assert.match(today, /<PrimaryButton[\s\S]*disabled=\{!quickEntryDraft \|\| quickSaving\}[\s\S]*>Add update<\/PrimaryButton>/);
  assert.match(primitives, /export function PrimaryButton/);
  assert.match(primitives, /disabled:cursor-not-allowed[\s\S]*disabled:bg-\[var\(--disabled-surface\)\]/);
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
});
