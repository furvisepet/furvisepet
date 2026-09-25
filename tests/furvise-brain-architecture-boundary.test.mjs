import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Ask owner-note writes have no direct RPC path and require Heart capability confirmation", () => {
  const source = read("app/api/ask/route.ts");
  const confirmation = read("app/api/ask/actions/[messageId]/route.ts");
  const capabilities = read("app/lib/application-actions/capabilities.ts");
  assert.doesNotMatch(source, /persistOwnerNote|persist_ask_owner_note|executeAskTask/);
  assert.match(source, /prepareAppendTurn/);
  assert.match(confirmation, /executeActionCapability/);
  assert.match(capabilities, /confirmFurviseWriteReceipt/);
});

test("model-derived intelligence has no automatic persistence executor",()=>{
 const source=read("app/lib/intelligence/persist-learnings.ts"),route=read("app/api/ask/route.ts");
 assert.doesNotMatch(source,/persistIntelligenceLearnings|\.rpc\(|persistCanonicalCareAction|persistCanonicalSemanticEvents/);
 assert.doesNotMatch(route,/persistIntelligenceLearnings\(/);
 assert.match(route,/prepareAppendTurn/);
 assert.match(read("app/lib/intelligence/run-intelligence.ts"),/APPEND_REQUIRES_CONFIRMATION_CAPABILITY/);
});

test("legacy pending tasks cannot recreate mutation parameters or infer subjects after binding",()=>{
 const source=read("app/lib/intelligence/ask-task-continuation.ts");
 assert.doesNotMatch(source,/taskMutationParameters|resolvePendingTaskSubject|grantFurviseMutationAuthority|executeAskTask|apply_ask_task/);
 assert.match(source,/attachTaskReceipts/);
 const route=read("app/api/ask/route.ts");
 assert.match(route,/interpretation\.request\?\.task/);
 assert.doesNotMatch(route,/taskMutationParameters|resolvePendingTaskSubject/);
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

test("working memory supplies Brain context but cannot replace the canonical interpreter",()=>{
 const source=read("app/lib/intelligence/interpret-ask.ts");
 assert.doesNotMatch(source,/resolveWorkingMemoryFollowup\(context.currentMessage/);
 assert.match(source,/validateAskRequest/);
 assert.match(read("app/api/ask/route.ts"),/readInterpretationSubject\(interpretation, petId/);
});
