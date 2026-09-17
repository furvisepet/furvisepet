import assert from "node:assert/strict";
import test from "node:test";

import { finalizeDurableAskAnswer } from "../app/lib/furvise-brain/durable-answer-finalization.ts";

test("durable Ask finalization returns immediately after a confirmed commit", async () => {
  let attempts = 0;
  let reads = 0;
  const result = await finalizeDurableAskAnswer({
    attemptFinalize: async () => { attempts += 1; return true; },
    createFailure: cause => cause,
    isMatchingReadback: () => false,
    readback: async () => { reads += 1; return null; },
  });
  assert.deepEqual(result, { kind: "committed" });
  assert.equal(attempts, 1);
  assert.equal(reads, 0);
});

test("durable Ask finalization retries one lost acknowledgement before readback", async () => {
  let attempts = 0;
  let reads = 0;
  const result = await finalizeDurableAskAnswer({
    attemptFinalize: async () => { attempts += 1; return attempts === 2; },
    createFailure: cause => cause,
    isMatchingReadback: () => false,
    readback: async () => { reads += 1; return null; },
  });
  assert.deepEqual(result, { kind: "committed" });
  assert.equal(attempts, 2);
  assert.equal(reads, 0);
});

test("matching durable readback recovers a committed answer after both acknowledgements fail", async () => {
  const state = { assistantMessageId: "assistant-1" };
  const failures = [new Error("ack one lost"), new Error("ack two lost")];
  let attempts = 0;
  let recovered = null;
  const result = await finalizeDurableAskAnswer({
    attemptFinalize: async () => { throw failures[attempts++]; },
    createFailure: cause => cause,
    isMatchingReadback: value => value?.assistantMessageId === "assistant-1",
    onRecoveredReadback: async (cause, value) => { recovered = { cause, value }; },
    readback: async () => state,
  });
  assert.deepEqual(result, { kind: "replay", state });
  assert.equal(attempts, 2);
  assert.equal(recovered.cause, failures[1]);
  assert.equal(recovered.value, state);
});

test("missing or mismatched readback fails closed with the finalization cause", async () => {
  const second = new Error("final acknowledgement lost");
  let attempts = 0;
  const wrapped = new Error("ASK_PERSISTENCE_UNCONFIRMED");
  wrapped.cause = second;
  await assert.rejects(
    finalizeDurableAskAnswer({
      attemptFinalize: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("first acknowledgement lost");
        throw second;
      },
      createFailure: cause => {
        assert.equal(cause, second);
        return wrapped;
      },
      isMatchingReadback: value => value?.assistantMessageId === "assistant-expected",
      readback: async () => ({ assistantMessageId: "assistant-other" }),
    }),
    error => error === wrapped,
  );
  assert.equal(attempts, 2);
});

test("false finalization acknowledgements also require matching durable proof", async () => {
  let attempts = 0;
  await assert.rejects(
    finalizeDurableAskAnswer({
      attemptFinalize: async () => { attempts += 1; return false; },
      createFailure: cause => {
        assert.match(String(cause), /ASK_RESPONSE_FINALIZE_FAILED/);
        return new Error("UNCONFIRMED");
      },
      isMatchingReadback: () => false,
      readback: async () => null,
    }),
    /UNCONFIRMED/,
  );
  assert.equal(attempts, 2);
});
