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

test("casual follow-ups resolve through deterministic working memory before provider planning", () => {
  const source = read("app/lib/intelligence/interpret-ask.ts");
  const workingMemory = source.indexOf("resolveWorkingMemoryFollowup(context.currentMessage");
  const provider = source.indexOf("new OpenAI(");
  assert.ok(workingMemory >= 0 && provider >= 0 && workingMemory < provider);
});
