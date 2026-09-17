import assert from "node:assert/strict";
import test from "node:test";

import {
  ASK_POST_REVIEW_FINALIZATION_STAGES,
  finalizeAskPostReview,
} from "../app/lib/furvise-brain/post-review-finalizer.ts";

function operations(calls, overrides = {}) {
  return {
    persistReviewedAnswer: async () => { calls.push("persist_reviewed_answer"); return "persisted"; },
    mintActionCapabilities: async persisted => { calls.push("mint_action_capabilities"); assert.equal(persisted, "persisted"); return "capabilities"; },
    persistAuthorizedIntelligence: async input => { calls.push("persist_authorized_intelligence"); assert.equal(input.capabilities, "capabilities"); return "intelligence"; },
    executeAuthorizedActions: async input => { calls.push("execute_authorized_actions"); assert.equal(input.intelligence, "intelligence"); return "actions"; },
    resolveCarePresentation: input => { calls.push("resolve_care_presentation"); assert.equal(input.actions, "actions"); return "care"; },
    assessTaskCompletion: input => { calls.push("assess_task_completion"); assert.equal(input.care, "care"); return "assessment"; },
    settleCreditDisposition: async input => { calls.push("settle_credit_disposition"); assert.equal(input.assessment, "assessment"); return "settlement"; },
    finalizeDurableAnswer: async input => { calls.push("finalize_durable_answer"); assert.equal(input.settlement, "settlement"); return { kind: "committed", receipt: "durable" }; },
    invalidateCommittedState: async snapshot => {
      calls.push("invalidate_committed_state");
      assert.equal(snapshot.durable.kind, "committed");
      assert.equal(snapshot.durable.receipt, "durable");
    },
    publishSuccess: snapshot => { calls.push("publish_success"); assert.equal(snapshot.settlement, "settlement"); return "response"; },
    ...overrides,
  };
}

test("Brain executive control owns the complete post-review stage order", async () => {
  const calls = [];
  const result = await finalizeAskPostReview(operations(calls));
  assert.equal(result, "response");
  assert.deepEqual(calls, ASK_POST_REVIEW_FINALIZATION_STAGES);
});

test("a persistence-stage early response stops every later effect", async () => {
  const calls = [];
  const result = await finalizeAskPostReview(operations(calls, {
    persistReviewedAnswer: async () => {
      calls.push("persist_reviewed_answer");
      return { kind: "early_response", response: "stored-response" };
    },
  }));
  assert.equal(result, "stored-response");
  assert.deepEqual(calls, ["persist_reviewed_answer"]);
});

test("a durable replay still invalidates committed state but skips a second publication", async () => {
  const calls = [];
  const result = await finalizeAskPostReview(operations(calls, {
    finalizeDurableAnswer: async () => {
      calls.push("finalize_durable_answer");
      return { kind: "replay", response: "stored-response" };
    },
    invalidateCommittedState: async snapshot => {
      calls.push("invalidate_committed_state");
      assert.equal(snapshot.durable.kind, "replay");
      assert.equal(snapshot.durable.response, "stored-response");
    },
  }));
  assert.equal(result, "stored-response");
  assert.deepEqual(calls, ASK_POST_REVIEW_FINALIZATION_STAGES.slice(0, 9));
  assert.equal(calls.includes("publish_success"), false);
});

test("a failed effect stage stops all later finalization authority", async () => {
  const calls = [];
  const failure = new Error("capability failed closed");
  await assert.rejects(finalizeAskPostReview(operations(calls, {
    mintActionCapabilities: async () => {
      calls.push("mint_action_capabilities");
      throw failure;
    },
  })), error => error === failure);
  assert.deepEqual(calls, ["persist_reviewed_answer", "mint_action_capabilities"]);
});
