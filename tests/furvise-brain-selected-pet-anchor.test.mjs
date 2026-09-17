import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecentSubjectState,
  resolveRecentPronoun,
} from "../app/lib/intelligence/entities/recent-subject-state.ts";

const pets = [
  { id: "pebble", name: "Pebble", species: "cat", sex: "female" },
  { id: "atlas", name: "Atlas", species: "dog", sex: "male" },
  { id: "pixel", name: "Pixel", species: "cat", sex: "male" },
];

function state(turns = []) {
  return buildRecentSubjectState({ pets, selectedPetId: "pebble", recentConversation: turns });
}

test("bare pronoun falls back to the selected pet, not another profile with matching sex", () => {
  const result = resolveRecentPronoun(state(), "he");
  assert.equal(result.status, "resolved");
  assert.equal(result.entity.petId, "pebble");
});

test("an explicit recent pet subject overrides the selected-pet anchor", () => {
  const result = resolveRecentPronoun(state([
    { role: "user", text: "Atlas chased a ball." },
  ]), "he");
  assert.equal(result.status, "resolved");
  assert.equal(result.entity.petId, "atlas");
});

test("assistant wording cannot silently switch discourse focus", () => {
  const result = resolveRecentPronoun(state([
    { role: "furvise", text: "Maybe Atlas is what you mean." },
  ]), "he");
  assert.equal(result.status, "resolved");
  assert.equal(result.entity.petId, "pebble");
});

test("a mere mention of another pet does not outrank an explicit selected-pet subject", () => {
  const result = resolveRecentPronoun(state([
    { role: "user", text: "Pebble sat beside Atlas." },
  ]), "he");
  assert.equal(result.status, "resolved");
  assert.equal(result.entity.petId, "pebble");
});

test("equally recent competing subjects remain ambiguous", () => {
  const s = state([
    { role: "user", text: "Atlas ran. Pixel jumped." },
  ]);
  const result = resolveRecentPronoun(s, "he");
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(new Set(result.candidatePetIds), new Set(["atlas", "pixel"]));
});
