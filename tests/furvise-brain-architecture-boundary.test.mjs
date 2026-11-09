import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public Ask has no owner-note write or confirmation path; private capabilities retain receipt validation", () => {
  const source = read("app/api/ask/route.ts");
  const confirmation = read("app/api/ask/actions/[messageId]/route.ts");
  const capabilities = read("app/lib/application-actions/capabilities.ts");
  assert.doesNotMatch(source, /persistOwnerNote|persist_ask_owner_note|executeAskTask/);
  assert.match(source, /runReadOnlyAsk/);
  assert.doesNotMatch(source, /prepareAppendTurn|executeActionCapability|continueConfirmedAppend/);
  assert.match(confirmation, /getAuthenticatedApiContext\(request\)/);
  assert.match(confirmation, /status:\s*404/);
  assert.match(confirmation, /"Cache-Control": "private, no-store"/);
  assert.doesNotMatch(confirmation, /executeActionCapability|continueConfirmedAppend|\.rpc\(|\.from\(/);
  assert.match(capabilities, /confirmFurviseWriteReceipt/);
});

test("model-derived intelligence has no automatic persistence executor",()=>{
 const source=read("app/lib/intelligence/persist-learnings.ts"),route=read("app/api/ask/route.ts");
 assert.doesNotMatch(source,/persistIntelligenceLearnings|\.rpc\(|persistCanonicalCareAction|persistCanonicalSemanticEvents/);
 assert.doesNotMatch(route,/persistIntelligenceLearnings\(/);
 assert.match(route,/runReadOnlyAsk/);
 assert.doesNotMatch(route,/prepareAppendTurn|continueConfirmedAppend/);
 assert.match(read("app/lib/intelligence/run-intelligence.ts"),/APPEND_REQUIRES_CONFIRMATION_CAPABILITY/);
});

test("legacy pending tasks cannot recreate mutation parameters or infer subjects after binding",()=>{
 const source=read("app/lib/intelligence/ask-task-continuation.ts");
 assert.doesNotMatch(source,/taskMutationParameters|resolvePendingTaskSubject|grantFurviseMutationAuthority|executeAskTask|apply_ask_task/);
 assert.match(source,/attachTaskReceipts/);
 const route=read("app/api/ask/route.ts");
 assert.match(route,/runReadOnlyAsk/);
 assert.doesNotMatch(route,/continueAskTask|executeAskTask|prepareAppendTurn/);
 assert.doesNotMatch(route,/taskMutationParameters|resolvePendingTaskSubject/);
});

test("application action capabilities cross the Action Organ before database execution", () => {
  const source = read("app/lib/application-actions/capabilities.ts");
  assert.match(source, /authorizeFurviseActionExecution/);
  const authorization=source.indexOf("authorizeFurviseActionExecution({");
  const execution=source.indexOf('const { data, error } = await admin.rpc(');
  assert.ok(authorization>=0&&execution>authorization);
  assert.match(source.slice(execution), /execute_ask_canonical_suggestion.*execute_ask_action_capability/);
});

test("Ask generation uses Brain-owned memory scope rather than direct history authority", () => {
  const source = read("app/lib/intelligence/generate-ask-history.ts");
  assert.match(source, /buildAskBrainTurn/);
  assert.match(source, /assertAskBrainScope/);
  assert.match(source, /retrieveFurviseMemory/);
  assert.doesNotMatch(source, /import\s*\{[^}]*retrieveAskHistory[^}]*\}\s*from/);
});

test("retained interpreter validates requests; public Ask binds authenticated context to the read-only engine",()=>{
 const source=read("app/lib/intelligence/interpret-ask.ts");
 assert.doesNotMatch(source,/resolveWorkingMemoryFollowup\(context.currentMessage/);
 assert.match(source,/validateAskRequest/);
 const route=read("app/api/ask/route.ts");
 assert.match(route,/loadReadOnlyContext\(\s*supabase\s*,\s*userId\s*,\s*petId/);
 assert.match(route,/runReadOnlyAsk\(\{\s*ownerId:\s*userId,\s*selectedPetId:\s*petId,\s*question[,}]/);
 assert.doesNotMatch(route,/readInterpretationSubject\(|prepareAppendTurn/);
});
