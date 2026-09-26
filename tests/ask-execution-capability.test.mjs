import assert from "node:assert/strict";
import test from "node:test";
import { assessAskExecutionCapability } from "../app/lib/intelligence/ask-execution-capability.ts";

const base = { version:"ask-interpretation.v1", operation:"recall", readOperation:"recall", selection:"summary",
  petIds:["a"], topic:"x", history:null, episodeTopic:null, ordinal:null, readOnly:true, clarification:null, frame:{} };

test("typed execution capability is derived only from validated semantic shapes", () => {
  assert.deepEqual(assessAskExecutionCapability({ ...base, request:{ mode:"read", readTicket:{} } }).kind,"history_read");
  assert.deepEqual(assessAskExecutionCapability({ ...base, request:{ mode:"read", storedRead:{} } }).kind,"stored_read");
  assert.deepEqual(assessAskExecutionCapability({ ...base, request:{ mode:"read", profileFields:["weight"] } }).kind,"profile_read");
  assert.deepEqual(assessAskExecutionCapability({ ...base, request:{ mode:"read", calculatePlan:{} } }),{kind:"calculation",supported:false});
  assert.deepEqual(assessAskExecutionCapability({ ...base, request:{ mode:"update", writeJob:{} } }),{kind:"mutation",supported:false});
  assert.deepEqual(assessAskExecutionCapability({ ...base, conversationOnly:true, request:undefined }),{kind:"conversation",supported:false});
});

test("read-only lifecycle precondition does not become mutation authority", () => {
  const lifecyclePlan={pendingDisposition:"keep",transition:null,requiredSubjectState:"active"};
  assert.deepEqual(assessAskExecutionCapability({ ...base, request:{mode:"read",readTicket:{},lifecyclePlan} }),{kind:"history_read",supported:true});
});
