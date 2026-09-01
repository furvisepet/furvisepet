import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTodayEntryDraft,
  buildTodayRecentEntries,
  formatTodayPetContext,
  formatTodayTimelineDate,
} from "../app/lib/today.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Today pet context is quiet, real, and omits unknown fields", () => {
  assert.equal(formatTodayPetContext({ age_unit: "years", age_value: 2, name: "mani", species: "cat" }), "Mani · Cat · 2 years");
  assert.equal(formatTodayPetContext({ age_unit: null, age_value: null, name: "Luna", species: null }), "Luna");
  assert.equal(formatTodayPetContext({ age_unit: "months", age_value: 1, name: "Milo", species: "dog" }), "Milo · Dog · 1 month");
});

test("Today timeline dates use present-tense labels", () => {
  const now = new Date("2026-08-31T12:00:00");
  assert.equal(formatTodayTimelineDate("2026-08-31T08:00:00", now), "Today");
  assert.equal(formatTodayTimelineDate("2026-08-30T08:00:00", now), "Yesterday");
  assert.notEqual(formatTodayTimelineDate("2026-08-28T08:00:00", now), "Recently");
  assert.equal(formatTodayTimelineDate("not-a-date", now), "Recently");
});

test("Today recent entries are real, newest-first, pet-scoped, and capped at three", () => {
  const rows = buildTodayRecentEntries([
    { id: "old", pet_profile_id: "pet", occurred_at: "2026-07-17T12:00:00Z" },
    { id: "other", pet_profile_id: "other", occurred_at: "2026-07-21T12:00:00Z" },
    { id: "new", pet_profile_id: "pet", occurred_at: "2026-07-20T12:00:00Z" },
    { id: "third", pet_profile_id: "pet", occurred_at: "2026-07-18T12:00:00Z" },
    { id: "second", pet_profile_id: "pet", occurred_at: "2026-07-19T12:00:00Z" },
  ], "pet");
  assert.deepEqual(rows.map((row) => row.id), ["new", "second", "third"]);
});

test("Remember keeps the existing general care-entry draft contract", () => {
  assert.deepEqual(buildTodayEntryDraft(null, "  Ate normally after dinner  "), { category: "general", note: "Ate normally after dinner", title: "Note" });
  assert.equal(buildTodayEntryDraft(null, "   "), null);
  const today = read("app/dashboard/page.tsx");
  assert.match(today, /listRecentCareEntries\(50\)/);
  assert.match(today, /buildTodayRecentEntries\(entries, selectedProfile\.id\)/);
  assert.match(today, /createCareEntry\(/);
});
