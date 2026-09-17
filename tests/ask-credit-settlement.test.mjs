import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createAskCreditSettlement } from "../app/lib/ai/ask-credit-settlement.ts";

const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");

function usage(overrides = {}) {
  return {
    allowed: true,
    count: 1,
    ledgerMode: "database",
    limit: 20,
    monthKey: "2026-09",
    planId: "plus",
    remaining: 19,
    ...overrides,
  };
}

function harness(overrides = {}) {
  const calls = [];
  const errors = [];
  const stages = [];
  const ledger = {
    getEvents: async () => [],
    getRemaining: async () => usage({ remaining: 18 }),
    isIntegrityError: () => false,
    reconcile: async (input) => {
      calls.push(["reconcile", input.requestId]);
      return { creditsUsed: 0, disposition: "release", remaining: 18, status: "released" };
    },
    setDisposition: async (input) => {
      calls.push(["disposition", input.disposition, input.requestId]);
      return { disposition: input.disposition, status: "reserved" };
    },
    ...overrides,
  };
  const settlement = createAskCreditSettlement({
    ledger,
    logAskServerError: (...args) => errors.push(args),
    logAskStage: (...args) => stages.push(args),
  });
  return { calls, errors, ledger, settlement, stages };
}

test("Ask credit release durably records release before reconciliation", async () => {
  const { calls, settlement, stages } = harness();
  const released = await settlement.safeReleaseAiCredit({
    logicalRequestId: "turn-1",
    payloadHash: "hash-1",
    requestId: "attempt-1",
    userId: "user-1",
  });
  assert.equal(released, true);
  assert.deepEqual(calls, [
    ["disposition", "release", "attempt-1"],
    ["reconcile", "attempt-1"],
  ]);
  assert.equal(stages[0]?.[0], "AI credit released");
});

test("non-integrity release reconciliation failure degrades without inventing completion", async () => {
  const { calls, errors, settlement } = harness({
    reconcile: async (input) => {
      calls.push(["reconcile", input.requestId]);
      throw new Error("temporary ledger outage");
    },
  });
  const released = await settlement.safeReleaseAiCredit({
    logicalRequestId: "turn-2",
    payloadHash: "hash-2",
    requestId: "attempt-2",
    userId: "user-2",
  });
  assert.equal(released, false);
  assert.deepEqual(calls[0], ["disposition", "release", "attempt-2"]);
  assert.equal(errors[0]?.[0], "credit_release_failed");
  assert.equal(calls.some((call) => call[1] === "complete"), false);
});

test("integrity failures remain answer-critical during release", async () => {
  const integrityError = new Error("AI_REQUEST_IDENTITY_CONFLICT");
  const { settlement } = harness({
    isIntegrityError: (error) => error === integrityError,
    reconcile: async () => { throw integrityError; },
  });
  await assert.rejects(
    settlement.safeReleaseAiCredit({
      logicalRequestId: "turn-3",
      payloadHash: "hash-3",
      requestId: "attempt-3",
      userId: "user-3",
    }),
    (error) => error === integrityError,
  );
});

test("replay reconciliation preserves terminal decisions and releases only undecided attempts", async () => {
  const states = [
    { disposition: "complete", logicalRequestId: "turn-4", payloadHash: "hash-4", requestId: "attempt-a", status: "completed" },
    { disposition: null, logicalRequestId: "turn-4", payloadHash: "hash-4", requestId: "attempt-b", status: "reserved" },
    { disposition: "release", logicalRequestId: "turn-4", payloadHash: "hash-4", requestId: "attempt-c", status: "released" },
  ];
  const { calls, settlement } = harness({
    getEvents: async () => states,
  });
  const next = await settlement.reconcilePersistedAskCredit({
    logicalRequestId: "turn-4",
    payloadHash: "hash-4",
    supabase: {},
    usage: usage(),
    userId: "user-4",
  });
  assert.equal(next.remaining, 18);
  assert.deepEqual(calls, [
    ["disposition", "release", "attempt-b"],
    ["reconcile", "attempt-b"],
  ]);
  assert.equal(states[0].disposition, "complete");
  assert.equal(states[1].disposition, "release");
});

test("replay reconciliation rejects multiple durable completion dispositions", async () => {
  const { settlement } = harness({
    getEvents: async () => [
      { disposition: "complete", logicalRequestId: "turn-5", payloadHash: "hash-5", requestId: "attempt-a", status: "completed" },
      { disposition: "complete", logicalRequestId: "turn-5", payloadHash: "hash-5", requestId: "attempt-b", status: "completed" },
    ],
  });
  await assert.rejects(
    settlement.reconcilePersistedAskCredit({
      logicalRequestId: "turn-5",
      payloadHash: "hash-5",
      supabase: {},
      usage: usage(),
      userId: "user-5",
    }),
    (error) => error?.cause?.message === "AI_CREDIT_DISPOSITION_CONFLICT",
  );
});

test("development without the ledger migration never touches settlement state", async () => {
  let touched = false;
  const { settlement } = harness({
    getEvents: async () => { touched = true; return []; },
    getRemaining: async () => { touched = true; return usage(); },
    reconcile: async () => { touched = true; },
    setDisposition: async () => { touched = true; },
  });
  const current = usage({ ledgerMode: "development_missing_migration" });
  const next = await settlement.reconcilePersistedAskCredit({
    logicalRequestId: "turn-6",
    payloadHash: "hash-6",
    supabase: {},
    usage: current,
    userId: "user-6",
  });
  assert.equal(next, current);
  assert.equal(touched, false);
});


test("Ask route delegates terminal credit settlement to the shared boundary", () => {
  assert.match(route, /createAskCreditSettlement\(\{ logAskServerError, logAskStage \}\)/);
  assert.doesNotMatch(route, /async function safeReleaseAiCredit|async function reconcilePersistedAskCredit/);
});
