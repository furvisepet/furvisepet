import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/lib/intelligence/planning-context.ts", import.meta.url), "utf8");

test("single-pet Ask planning catalogs are scoped to the conversation pet", () => {
  assert.match(source, /from\("pet_concerns"\)[\s\S]*\.eq\("user_id", userId\)\.eq\("pet_profile_id", petId\)/);
  assert.match(source, /row\.user_id === userId && row\.pet_profile_id === petId/);
  assert.match(source, /loadReplaceReferences\(userId, \[petId\], currentTurn\.createdAt\)/);
  assert.doesNotMatch(source, /\.in\("pet_profile_id", eligiblePets\.map\(p => p\.id\)\)/);
  assert.doesNotMatch(source, /loadReplaceReferences\(userId, eligiblePets\.map/);
});

test("owned pet catalog remains account-wide for subject resolution", () => {
  assert.match(source, /from\("dog_profiles"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(source, /eligiblePets/);
});
