import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTodayEntryDraft, buildTodayRecentEntries, formatTodayPetContext, formatTodayTimelineDate, TODAY_REMEMBER_EXAMPLES } from "../app/lib/today.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Today pet context includes known sex and omits unknown fields", () => {
  assert.equal(formatTodayPetContext({ age_unit: "years", age_value: 2, name: "mani", sex: "female", species: "cat" }), "Mani · Cat · Female · 2 years");
  assert.equal(formatTodayPetContext({ age_unit: null, age_value: null, name: "Luna", sex: "not_sure", species: null }), "Luna");
  assert.equal(formatTodayPetContext({ age_unit: "months", age_value: 1, name: "Milo", sex: "male", species: "dog" }), "Milo · Dog · Male · 1 month");
});

test("Today timeline dates include human-readable local time", () => {
  const now = new Date("2026-08-31T12:00:00");
  assert.match(formatTodayTimelineDate("2026-08-31T08:00:00", now), /^Today, /);
  assert.match(formatTodayTimelineDate("2026-08-30T08:00:00", now), /^Yesterday, /);
  assert.match(formatTodayTimelineDate("2026-08-28T08:00:00", now), /^Aug 28, /);
  assert.equal(formatTodayTimelineDate("not-a-date", now), "Recently");
});

test("Today recent entries are real, newest-first, pet-scoped, and capped at ten", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ id: `pet-${index}`, pet_profile_id: "pet", occurred_at: `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00Z` }));
  rows.push({ id: "other", pet_profile_id: "other", occurred_at: "2026-08-31T12:00:00Z" });
  const recent = buildTodayRecentEntries(rows, "pet");
  assert.equal(recent.length, 10);
  assert.deepEqual(recent.map((row) => row.id), ["pet-11", "pet-10", "pet-9", "pet-8", "pet-7", "pet-6", "pet-5", "pet-4", "pet-3", "pet-2"]);
});

test("Remember examples are exact, calm, and never use the repeated old placeholder", () => {
  assert.equal(TODAY_REMEMBER_EXAMPLES.length, 10);
  assert.equal(TODAY_REMEMBER_EXAMPLES[0], "Skipped breakfast but ate dinner normally.");
  assert.equal(TODAY_REMEMBER_EXAMPLES[9], "Seemed nervous during the car ride.");
  assert.ok(TODAY_REMEMBER_EXAMPLES.every((example) => !/\b(?:he|her|hers|him|his|she)\b/i.test(example)));
  assert.ok(!TODAY_REMEMBER_EXAMPLES.includes("What happened?"));
});

test("Remember keeps the existing pet-scoped care-entry authority", () => {
  assert.deepEqual(buildTodayEntryDraft(null, "  Ate normally after dinner  "), { category: "general", note: "Ate normally after dinner", title: "Note" });
  assert.equal(buildTodayEntryDraft(null, "   "), null);
  const today = read("app/today/page.tsx");
  assert.match(today, /listRecentCareEntriesForPet\(selectedPetId, 10\)/);
  assert.match(today, /createCareEntry\([\s\S]*petProfileId: selectedProfile\.id/);
  assert.match(today, /getActivePetId\([\s\S]*setActivePetId\(/);
});
