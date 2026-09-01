import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createTodayRecentState,
  getTodayVisibleRecentEntries,
  prependConfirmedTodayEntry,
  resolveTodayRecentRequest,
  selectTodayRecentPet,
  startTodayRecentRequest,
} from "../app/lib/today.ts";

const todayPage = readFileSync(new URL("../app/today/page.tsx", import.meta.url), "utf8");

function entry(id, petId, note, occurredAt) {
  return {
    category: "general",
    id,
    intelligence_source_message_id: null,
    note,
    occurred_at: occurredAt,
    pet_profile_id: petId,
    title: "Note",
  };
}

test("Recent survives the profile and app-freshness lifecycle for an unchanged selected pet", () => {
  const row = entry("row-1", "pet-a", "A persisted note", "2026-08-31T18:00:00.000Z");
  let state = selectTodayRecentPet(createTodayRecentState(), "pet-a");
  state = startTodayRecentRequest(state, "pet-a", 1);
  state = resolveTodayRecentRequest(state, "pet-a", 1, [row]);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-a").map(({ id }) => id), ["row-1"]);

  // Profiles and selected-pet authority resolve again after an app freshness event.
  state = selectTodayRecentPet(state, "pet-a");
  state = startTodayRecentRequest(state, "pet-a", 2);
  assert.equal(state.status, "refreshing");
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-a").map(({ id }) => id), ["row-1"]);

  state = resolveTodayRecentRequest(state, "pet-a", 2, [row]);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-a").map(({ id }) => id), ["row-1"]);
});

test("Today revalidates Recent on app freshness without a destructive same-pet clear or loading gate", () => {
  assert.match(todayPage, /\[appDataVersion, authStatus, selectedPetId\]/);
  assert.match(todayPage, /setRecentState\(\(current\) => selectTodayRecentPet\(current, nextPetId\)\)/);
  assert.doesNotMatch(todayPage, /setEntries\(\[\]\)|setRecentLoading/);
  assert.match(todayPage, /\{recentEntries\.length \? \(/);
});

test("changing pets intentionally replaces Recent and stale responses cannot cross pet authority", () => {
  const petARow = entry("a-1", "pet-a", "Pet A note", "2026-08-31T18:00:00.000Z");
  const petBRow = entry("b-1", "pet-b", "Pet B note", "2026-08-31T19:00:00.000Z");
  let state = selectTodayRecentPet(createTodayRecentState(), "pet-a");
  state = startTodayRecentRequest(state, "pet-a", 1);
  state = resolveTodayRecentRequest(state, "pet-a", 1, [petARow]);

  state = selectTodayRecentPet(state, "pet-b");
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-b"), []);
  state = startTodayRecentRequest(state, "pet-b", 2);
  state = resolveTodayRecentRequest(state, "pet-a", 1, [petARow]);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-b"), []);
  state = resolveTodayRecentRequest(state, "pet-b", 2, [petBRow]);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-b").map(({ id }) => id), ["b-1"]);
});

test("an honestly empty pet omits Recent", () => {
  let state = selectTodayRecentPet(createTodayRecentState(), "pet-empty");
  state = startTodayRecentRequest(state, "pet-empty", 1);
  state = resolveTodayRecentRequest(state, "pet-empty", 1, []);
  assert.equal(state.hasResolved, true);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-empty"), []);
});

test("a confirmed Remember row remains visible through subsequent revalidation", () => {
  const oldRow = entry("old", "pet-a", "Earlier note", "2026-08-31T17:00:00.000Z");
  const savedRow = entry("saved", "pet-a", "New confirmed note", "2026-08-31T20:00:00.000Z");
  let state = selectTodayRecentPet(createTodayRecentState(), "pet-a");
  state = startTodayRecentRequest(state, "pet-a", 1);
  state = resolveTodayRecentRequest(state, "pet-a", 1, [oldRow]);
  state = prependConfirmedTodayEntry(state, "pet-a", savedRow);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-a").map(({ id }) => id), ["saved", "old"]);

  state = startTodayRecentRequest(state, "pet-a", 2);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-a").map(({ id }) => id), ["saved", "old"]);
  state = resolveTodayRecentRequest(state, "pet-a", 2, [savedRow, oldRow]);
  assert.deepEqual(getTodayVisibleRecentEntries(state, "pet-a").map(({ id }) => id), ["saved", "old"]);
});
