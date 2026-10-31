import {createHash} from 'node:crypto';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareAskInterpretationRequest, interpretAskQuestion, recoverAskInterpretation } from "../app/lib/intelligence/interpret-ask.ts";
import { inspectAskWireContract } from "./helpers/ask-wire-contract.mjs";
import { admitAiOperation } from "../app/lib/ai/usage-guard/admission.ts";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { OperationDeadline } from "../app/lib/ai/execution-deadline.ts";

globalThis.fetch = async () => { throw Error("OFFLINE_RECURSIVE_TRANSPORT"); };
function replaceMethod(t, object, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  t.after(() => { if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key]; });
}
test.afterEach(t => console.log(JSON.stringify({ kind: "recursive_case_complete", name: t.name })));
const corpus = JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json", import.meta.url), "utf8"));
const ctx = structuredClone(corpus.contexts.no_numeric);
ctx.currentMessage = "What name is saved for " + ctx.pet.name + "?";
ctx.currentTurn.text = ctx.currentMessage; ctx.conversationTurns = []; ctx.ownerNoteSpans = [];
const good = { ...structuredClone(corpus.fixtures.find(f => f.canonical.request.evidenceBasis === "saved_profile").canonical.request),
  question: ctx.currentMessage, scope: "named", petNames: [ctx.pet.name], topic: "profile" };
const prepared = prepareAskInterpretationRequest(ctx, "gpt-5.4-mini");
const envelope = value => prepared.transport.encode({ request: value }, () => {});
const completed = value => ({ status: "completed", output_text: JSON.stringify(value), usage: { input_tokens: 10, output_tokens: 10 } });
const env = { NODE_ENV: "test", FURVISE_AI_DAILY_CALL_LIMIT: "20", FURVISE_AI_DAILY_COST_LIMIT_USD: "10",
  FURVISE_RATE_LIMIT_HASH_SECRET: "offline-recursive-runtime-only".repeat(3) };
async function admitted(t, name, fn) {
  t.mock.method(console, "info", () => {}); t.mock.method(console, "warn", () => {});
  const admission = await admitAiOperation({ env, store: new MemoryAiGuardTestStore(), feature: "ask", intendedModel: "gpt-5.4-mini",
    userId: ctx.owner.userId, requestId: name, payload: { fixture: name }, now: new Date("2039-03-17T12:00:00Z") });
  const prior = process.env.NODE_TEST_CONTEXT; delete process.env.NODE_TEST_CONTEXT;
  try { return await admission.run(() => fn(admission)); }
  finally { await admission.release(); if (prior === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = prior; }
}
function invoke(context, create, extras = {}) {
  return interpretAskQuestion({ context, model: "gpt-5.4-mini", client: { responses: { create } }, ...extras });
}

test("actual prepare/parse uses the reviewed native transport and retains the original canonical plan", async t => admitted(t, "recursive-success", async a => {
  const {transport: reference} = await inspectAskWireContract(prepared.request, ctx);
  assert.deepEqual(prepared.transport.schema, reference.schema); assert.equal(prepared.transport.instructions, reference.instructions);
  assert.equal(JSON.stringify(prepared.request.text.format.schema), JSON.stringify(reference.schema));
  assert.deepEqual(prepared.request.text.format.schema.required, ["request"]);
  assert.deepEqual(prepared.wire.schema.required, ["nodes", "root"]);
  const expected = recoverAskInterpretation(good, prepared.context), response = envelope(good);
  assert.deepEqual(prepared.transport.decode(response, () => {}), prepared.wire.decode(prepared.wire.encode({ request: good })));
  const begin = a.beginProviderCall.bind(a); let snapshot, calls = 0;
  a.beginProviderCall = async value => { snapshot = JSON.stringify(value.input); return begin(value); };
  const result = await invoke(ctx, async (request, options) => {
    calls++; assert.equal(JSON.stringify(request), snapshot); assert.ok(Object.isFrozen(request));
    assert.equal(JSON.stringify(request.text.format.schema), JSON.stringify(prepared.request.text.format.schema));
    assert.equal(request.instructions, prepared.request.instructions); assert.equal(request.input, prepared.request.input);
    assert.equal(request.max_output_tokens, 8192); assert.deepEqual(request.reasoning, { effort: "medium" });
    assert.equal(options.signal.aborted, false); return completed(response);
  });
  assert.equal(calls, 1); assert.deepEqual(result, expected);
}));

test("repair uses a fresh 12-second reserve after the compilation and initial parse budgets expire", async t => {
  let clock = 0; replaceMethod(t, performance, "now", () => clock);
  await admitted(t, "recursive-repair", async a => {
    const bad = { ...good, petNames: ["Unowned subject"] }, responses = [envelope(bad), envelope(good)];
    const sent = [], admitted = [], accounted = [];
    const begin = a.beginProviderCall.bind(a), record = a.recordProviderUsage.bind(a);
    a.beginProviderCall = async value => { admitted.push(JSON.stringify(value.input)); return begin(value); };
    a.recordProviderUsage = async (...args) => { accounted.push(args); return record(...args); };
    const result = await invoke(ctx, async request => {
      const index = sent.length; sent.push(request); assert.ok(index < 2);
      assert.equal(JSON.stringify(request), admitted[index]);
      assert.equal(JSON.stringify(request.text.format.schema), JSON.stringify(prepared.request.text.format.schema));
      const input = JSON.parse(request.input);
      if (index) {
        const original = JSON.parse(sent[0].input);
        assert.deepEqual(input.userSources, original.userSources); assert.deepEqual(input.sourceWindow, original.sourceWindow);
        assert.equal(input.contractRepair.validationCode, "ASK_REQUEST_CONTRACT_OWNERSHIP");
        assert.deepEqual(input.contractRepair.rejectedProposal, bad);
      }
      // The second response has only 18s left: enough for repair's 12s reserve,
      // but past both the old compilation deadline and the initial 24s reserve.
      clock = a.deadline.expiresAt - (index ? 18000 : 28000);
      return completed(responses[index]);
    });
    assert.equal(sent.length, 2); assert.equal(accounted.length, 2);
    assert.deepEqual(result, recoverAskInterpretation(good, prepared.context));
  });
});

test("initial decode honors the initial reserve and reports timeout instead of malformed JSON", async t => {
  let clock = 0; replaceMethod(t, performance, "now", () => clock);
  await admitted(t, "recursive-initial-expired", async a => {
    let calls = 0; const events = [];
    await assert.rejects(invoke(ctx, async () => { calls++; clock = a.deadline.expiresAt - 18000; return completed(envelope(good)); },
      { onProviderEvent: e => events.push(e) }), e => e.diagnostics?.providerErrorCode === "ASK_INTERPRETATION_TIMEOUT" && e.diagnostics.timedOut);
    assert.equal(calls, 1); assert.equal(events.filter(e => e.outcome === "succeeded").length, 0);
  });
});

test("deadline expiration inside recursive reconstruction escapes the generic JSON error classifier", async t => {
  let clock = 0; replaceMethod(t, performance, "now", () => clock);
  await admitted(t, "recursive-walk-expired", async a => {
    let returned = false, checks = 0, calls = 0;
    const allocate = OperationDeadline.prototype.allocate;
    replaceMethod(t, OperationDeadline.prototype, "allocate", function (...args) {
      if (returned && this === a.deadline && ++checks === 10) clock = a.deadline.expiresAt - 24000;
      return allocate.apply(this, args);
    });
    await assert.rejects(invoke(ctx, async () => { calls++; const response = completed(envelope(good)); returned = true; return response; }),
      e => e.diagnostics?.providerErrorCode === "ASK_INTERPRETATION_TIMEOUT" && e.diagnostics.timedOut);
    assert.equal(calls, 1); assert.equal(checks, 10);
  });
});

test("uncooperative provider times out once; a late valid recursive result grants no authority", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await admitted(t, "recursive-provider-timeout", async a => {
    let finish, signal, calls = 0, failures = 0; const events = [];
    const failure = a.recordProviderFailure.bind(a);
    a.recordProviderFailure = (...args) => { failures++; return failure(...args); };
    await assert.rejects(invoke(ctx, async (_request, options) => {
      calls++; signal = options.signal;
      const pending = new Promise(resolve => { finish = resolve; });
      t.mock.timers.tick(25001); return pending;
    }, { onProviderEvent: e => events.push(e) }), e => e.diagnostics?.providerErrorCode === "ASK_INTERPRETATION_TIMEOUT");
    assert.equal(calls, 1); assert.equal(failures, 1); assert.equal(signal.aborted, true);
    finish(completed(envelope(good))); await Promise.resolve(); await Promise.resolve();
    assert.equal(events.filter(e => e.outcome === "succeeded").length, 0);
  });
});

test("recursive catalog intent is canonically validated before public policy and hydration", async t => {
  await admitted(t, "recursive-catalog", async () => {
    const context = structuredClone(ctx); context.conversationId = "offline-recursive-catalog"; context.currentMessage = context.pet.name + " passed away."; context.currentTurn.text = context.currentMessage;
    const request = { ...good, question: context.currentMessage, mode: "update", operation: "general", evidenceBasis: null,
      temporalScope: null, profileFields: [], outputFormat: null, premiseQuotes: [],
      lifecyclePlan: { pendingDisposition: "keep", transition: { targetPetName: context.pet.name, toState: "deceased" }, requiredSubjectState: null, authorizationQuote: context.currentMessage } };
    const intent = { version: "ask-catalog-intent.v1", purpose: "lifecycle", scope: "subjects", ownerScope: null,
      sourceTurnId: context.currentTurn.id, instructionQuote: context.currentMessage, authorizationQuote: context.currentMessage,
      subjects: [{ basis: "named", petName: context.pet.name, sourceTurnId: context.currentTurn.id, quote: context.pet.name }], request };
    const p = prepareAskInterpretationRequest(context, "gpt-5.4-mini");
    const recursive = p.transport.encode({ request: intent }, () => {});
    assert.deepEqual(p.wire.decode(p.wire.encode({ request: intent })), { request: intent });
    let calls = 0, capabilities = 0, hydrates = 0;
    const catalogService = { requestId: "recursive-catalog", capability: () => { capabilities++; return { available: false, reason: "mutation", message: "Public mutations disabled." }; },
      hydrate: async () => { hydrates++; throw Error("NO_HYDRATION"); }, verify: async () => { throw Error("NO_VERIFY"); } };
    const result = await invoke(context, async () => { calls++; return completed(recursive); }, { catalogService });
    assert.equal(calls, 1); assert.equal(capabilities, 1); assert.equal(hydrates, 0);
    assert.equal(result.catalogLimitation.reason, "public_policy");
    // Preserve the original canonical validator for the existing Node-only
    // fixture compatibility branch too; extra catalog fields cannot bypass it.
    await admitted(t, "recursive-catalog-legacy-extra", async () => {
    process.env.NODE_TEST_CONTEXT = "test";
    await assert.rejects(invoke(context, async () => { calls++; return completed({ request: { ...intent, unexpected: true } }); }, { catalogService }),
      e => e.diagnostics?.providerErrorCode === "ASK_INTERPRETATION_VALIDATION");
    assert.equal(calls, 2); assert.equal(capabilities, 1); assert.equal(hydrates, 0);
    delete process.env.NODE_TEST_CONTEXT;
    });
  });
});

test("provider errors in initial and repair phases keep safe diagnostics and settle each attempted call once", async t => {
  const id = "req_0123456789abcdef0123456789abcdef";
  for (const repair of [false, true]) await t.test(repair ? "repair rejection" : "initial rejection", async t => admitted(t, "recursive-safe-error-" + repair, async a => {
    let calls = 0, failures = 0, usage = 0; const events = [];
    const fail = a.recordProviderFailure.bind(a), record = a.recordProviderUsage.bind(a);
    a.recordProviderFailure = (...args) => { failures++; return fail(...args); };
    a.recordProviderUsage = (...args) => { usage++; return record(...args); };
    const marker = "PRIVATE owner@example.invalid Cedar 9.4kg";
    const thrown = Object.assign(new Error(marker), { status: 400, code: "invalid_json_schema",
      type: "invalid_request_error", param: "text.format.schema", requestID: id,
      headers: { authorization: "sk-proj-OFFLINE_PRIVATE" }, body: { input: marker } });
    await assert.rejects(invoke(ctx, async (request, options) => {
      calls++; assert.equal(request.max_output_tokens, 8192); assert.deepEqual(request.reasoning, { effort: "medium" });
      assert.equal(options.signal.aborted, false);
      if (repair && calls === 1) return completed(envelope({ ...good, petNames: ["Unowned subject"] }));
      throw thrown;
    }, { onProviderEvent: e => events.push(e) }), e => {
      assert.equal(e.diagnostics.providerErrorCode, "ASK_INTERPRETATION_TRANSPORT");
      assert.equal(e.diagnostics.providerStatus, 400); assert.equal(e.diagnostics.timedOut, false);
      assert.deepEqual(e.diagnostics.providerError, { status: 400, code: "invalid_json_schema",
        type: "invalid_request_error", param: "text.format.schema", requestId: id,
        schema: {sha256:createHash("sha256").update(JSON.stringify(prepared.request.text.format.schema)).digest("hex"),rule:"unrecognized",path:null} });
      assert.ok(!JSON.stringify(e).includes(marker)); assert.ok(!e.message.includes(marker)); return true;
    });
    assert.equal(calls, repair ? 2 : 1); assert.equal(failures, 1); assert.equal(usage, repair ? 1 : 0);
    assert.equal(events.filter(e => e.outcome === "failed").length, 1);
    assert.equal(events.filter(e => e.outcome === "succeeded").length, 0);
    assert.equal(events.at(-1).providerError.requestId, id);
    assert.ok(!JSON.stringify(events).includes(marker)); assert.ok(!JSON.stringify(events).includes("sk-proj-OFFLINE_PRIVATE"));
  }));
});
