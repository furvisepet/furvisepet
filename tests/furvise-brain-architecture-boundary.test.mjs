import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all direct owner-note writes cross the Brain mutation gate", () => {
  const source = read("app/lib/intelligence/persist-owner-note.ts");
  assert.match(source, /grantFurviseMutationAuthority/);
  assert.match(source, /assertFurviseMutationAllowed\(turn,\s*["']record_care["']\)/);
  assert.ok(source.indexOf("assertFurviseMutationAllowed") < source.indexOf("persist_ask_owner_note"));
});

test("model-derived intelligence cannot promote itself into authoritative care history", () => {
  const source = read("app/lib/intelligence/persist-learnings.ts");
  assert.match(source, /careWriteAuthority\?: FurviseTurnAuthority \| null/);
  assert.match(source, /if \(!input\.authority\) return false/);
  assert.match(source, /assertFurviseMutationAllowed\(input\.authority, input\.expectedKind\)/);
  assert.match(source, /FURVISE_MUTATION_SUBJECT_MISMATCH/);
  assert.ok(source.indexOf("authorizeIntelligenceCarePersistence({") < source.indexOf("persistDatedNoteBatch({"));
  assert.ok(source.indexOf("authorizeIntelligenceCarePersistence({") < source.indexOf("persistCanonicalSemanticEvents({"));
  assert.ok(source.indexOf("authorizeIntelligenceCarePersistence({") < source.indexOf("persistCanonicalCareAction({"));
});

test("pending note continuations re-verify and cross the Brain mutation gate", () => {
  const source = read("app/lib/intelligence/ask-task-continuation.ts");
  assert.match(source, /findExplicitCareRecordAuthorization/);
  assert.match(source, /grantFurviseMutationAuthority/);
  assert.match(source, /assertFurviseMutationAllowed/);
  assert.ok(source.indexOf("assertValidatedAskTaskAuthorization(task)") < source.indexOf("apply_ask_task"));
});

test("application action capabilities cross the Action Organ before database execution", () => {
  const source = read("app/lib/application-actions/capabilities.ts");
  assert.match(source, /authorizeFurviseActionExecution/);
  assert.ok(source.indexOf("authorizeFurviseActionExecution({") < source.indexOf('admin.rpc("execute_ask_action_capability"'));
});

test("Ask generation uses Brain-owned memory scope rather than direct history authority", () => {
  const source = read("app/lib/intelligence/generate-ask-history.ts");
  assert.match(source, /buildAskBrainTurn/);
  assert.match(source, /assertAskBrainScope/);
  assert.match(source, /retrieveFurviseMemory/);
  assert.doesNotMatch(source, /import\s*\{[^}]*retrieveAskHistory[^}]*\}\s*from/);
});

test("normal Ask language reaches Brain planning before topic-specific execution", () => {
  const interpretation = read("app/lib/intelligence/interpret-ask.ts");
  const route = read("app/api/ask/route.ts");
  assert.doesNotMatch(interpretation, /fastLatestSavedWeightPlan|fastSinceAnchorReadPlan|resolveWorkingMemoryFollowup/);
  assert.match(interpretation, /Brain-first contract/);
  assert.match(route, /ownerNote = noteMode && petId !== "all"/);
  assert.match(route, /semantic routing is owned by the model-generated request contract/);
});
