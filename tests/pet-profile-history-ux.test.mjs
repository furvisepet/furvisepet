import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("pet header removes readiness and updated-date status while keeping durable identity", () => {
  const page = read("app/pets/[id]/page.tsx");
  assert.match(page, /formatPetDirectoryMetadata\(profile\)/);
  assert.doesNotMatch(page, /Updated \$\{|formatShortDate|formatProfileStatusDisplay|Getting to know|Profile ready|StatusPill label=\{model\.completeness/);
});

test("pet profile uses the canonical Pets page orientation and shared accessible actions", () => {
  const page = read("app/pets/[id]/page.tsx");
  const primitives = read("app/components/product-primitives.tsx");
  assert.match(page, /<PageHeader[\s\S]*eyebrow="PETS"/);
  assert.match(page, /<SecondaryButton[\s\S]*EDIT PET<\/SecondaryButton>/);
  assert.match(page, /<PrimaryButton[\s\S]*VET BRIEF<\/PrimaryButton>/);
  assert.match(primitives, /buttonBaseClasses[\s\S]*min-h-12[\s\S]*focus-visible:outline-none/);
  assert.doesNotMatch(page, /Back to pets|Breed unknown|Weight unknown|Not provided|Limited context/);
});

test("History actions use the shared compact overflow menu with exact labels", () => {
  const timeline = read("app/components/care-timeline.tsx");
  assert.match(timeline, /<OverflowMenu/);
  assert.match(timeline, /label: "Edit"/);
  assert.match(timeline, /\{ type: "separator" \}/);
  assert.match(timeline, /label: "Delete"[\s\S]*tone: "danger"/);
  assert.match(timeline, /ariaLabel=\{`More actions for \$\{title\}`\}/);
  assert.doesNotMatch(timeline, /<details|<summary|absolute right-0/);
});

test("shared overflow menu supports keyboard navigation and complete dismissal", () => {
  const menu = read("app/components/overflow-menu.tsx");
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /event\.key === "ArrowDown"/);
  assert.match(menu, /event\.key === "ArrowUp"/);
  assert.match(menu, /event\.key !== "Escape"/);
  assert.match(menu, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(menu, /triggerRef\.current\?\.focus\(\)/);
  assert.match(menu, /createPortal\(menu, document\.body\)/);
  assert.match(menu, /className="fixed z-\[var\(--z-popover\)\]/);
  assert.match(menu, /requestAnimationFrame\(\(\) => focusItem\(0\)\)/);
});
