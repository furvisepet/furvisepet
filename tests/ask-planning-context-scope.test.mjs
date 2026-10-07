import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/lib/intelligence/planning-context.ts", import.meta.url), "utf8");

test("initial planning reads identity and USER dialogue; factual catalogs require a bound permit", () => {
  assert.deepEqual([...source.matchAll(/\.from\("([^"]+)"\)/g)].map(m=>m[1]),["dog_profiles","ask_conversations","ask_conversation_messages"]);
  assert.match(source,/select\("id,user_id,name,species,sex"\)/);
  assert.doesNotMatch(source,/pet_concerns|pet_care_entries|loadReplaceReferences|concernReferences/);
  const hydration=readFileSync(new URL("../app/lib/intelligence/hydrate-planning-catalog.ts",import.meta.url),"utf8");
  assert.ok(hydration.indexOf("assertCatalogPermit(")<hydration.indexOf('db.from("pet_concerns")'));
  assert.match(hydration,/\.eq\("user_id", permit.ownerId\)\.in\("pet_profile_id", \[\.\.\.permit.subjectIds\]\)\.lte\("updated_at", permit.cutoff\)/);
  assert.match(hydration,/row.user_id !== permit.ownerId \|\| !permit.subjectIds.includes\(row.pet_profile_id\)/);
  assert.match(hydration,/ASK_CATALOG_SCOPE_CHANGED/);
});

test("owned pet catalog remains account-wide for subject resolution", () => {
  assert.match(source, /from\("dog_profiles"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(source, /eligiblePets/);
});
