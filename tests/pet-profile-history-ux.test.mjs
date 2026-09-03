import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatPetProfileSubtitle } from "../app/lib/pet-profile.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function profile(overrides = {}) {
  return {
    age_unit: "years",
    age_value: 4,
    breed: null,
    species: "dog",
    weight_unit: "lb",
    weight_value: null,
    ...overrides,
  };
}

test("pet header removes readiness and updated-date status while keeping durable identity", () => {
  const page = read("app/pets/[id]/page.tsx");
  assert.match(page, /formatPetDirectoryMetadata\(profile\)/);
  assert.doesNotMatch(page, /Updated \$\{|formatShortDate|formatProfileStatusDisplay|Getting to know|Profile ready|StatusPill label=\{model\.completeness/);
});

test("pet subtitle omits unknown values and keeps separators correct", () => {
  assert.equal(formatPetProfileSubtitle(profile()), "Dog · 4 years");
  assert.equal(formatPetProfileSubtitle(profile({ breed: "German Shepherd" })), "Dog · German Shepherd · 4 years");
  assert.equal(formatPetProfileSubtitle(profile({ breed: "German Shepherd", weight_value: 70 })), "Dog · German Shepherd · 4 years · 70 lb");
  assert.equal(formatPetProfileSubtitle(profile({ breed: "Mixed / unknown", weight_value: null })), "Dog · 4 years");
  assert.equal(formatPetProfileSubtitle(profile({ age_value: null, breed: null, species: null, weight_value: 70 })), "70 lb");
  assert.equal(formatPetProfileSubtitle(profile({ age_value: null, breed: null, species: null, weight_value: null })), "");
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
