import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createAskWirePlan } from "../app/lib/intelligence/ask-wire-policy.mjs";
import { createGraphCodec } from "../app/lib/intelligence/ask-wire-codec.mjs";
import { ASK_INITIAL_INPUT_AUTHORITY } from "../app/lib/intelligence/ask-wire-authority.mjs";
import { createRecursiveAskPlanHarness, prepareRecursiveAskRequestHarness } from "./helpers/ask-wire-recursive-plan.mjs";
import { ASK_REQUEST_INSTRUCTIONS, askRequestProviderSchema } from "../app/lib/intelligence/ask-request-contract.ts";
import { proposedSemanticFrameJsonSchema } from "../app/lib/intelligence/semantic-frame/schema.ts";
import { factorProviderEnumSchemas } from "../app/lib/ai/provider-enum-schema.ts";
import { factorProviderCompoundSchemas } from "../app/lib/ai/provider-compound-schema.ts";
import { createAskProviderWireSchema } from "../app/lib/intelligence/ask-wire-provider-schema.ts";
import { prepareAskInterpretationRequest, recoverAskInterpretation, ASK_INTERPRETATION_LIMITS } from "../app/lib/intelligence/interpret-ask.ts";
import { ASK_USER_SOURCE_INSTRUCTIONS, askRequestFitsInputBudget, assertAskRequestInputBudget } from "../app/lib/intelligence/ask-interpretation-sources.ts";
import { executeAdmittedResponsesRequest, boundedProviderTimeout } from "../app/lib/ai/usage-guard/provider-call-budget.ts";
import { admitAiOperation } from "../app/lib/ai/usage-guard/admission.ts";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { AI_FEATURE_POLICIES } from "../app/lib/ai/usage-guard/features.ts";
import { estimateInputTokens } from "../app/lib/ai/usage-guard/cost-estimator.ts";
import { OperationDeadline, withProviderDeadline } from "../app/lib/ai/execution-deadline.ts";

globalThis.fetch = async () => { throw Error("OFFLINE_RECURSIVE_PLAN"); };
const Ajv = createRequire(import.meta.url)("ajv");
const corpus = JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json", import.meta.url), "utf8"));
const tick = () => {};
const model = "gpt-5.4-mini";
// Keep the indexed reference measurement after local transport integration.
function indexedPrepared(context) {
  const p = prepareAskInterpretationRequest(context, model);
  return { ...p, request: { ...p.request, instructions: p.wire.instructions + "\n" + ASK_USER_SOURCE_INSTRUCTIONS,
    text: { ...p.request.text, format: { ...p.request.text.format, schema: createAskProviderWireSchema(p.wire.schema) } } } };
}

const factored = context => factorProviderCompoundSchemas(factorProviderEnumSchemas(askRequestProviderSchema(proposedSemanticFrameJsonSchema, context)));
const cache = new Map();
function compiled(context) {
  if (!cache.has(context)) {
    const schema = factored(corpus.contexts[context]), plan = createAskWirePlan(schema, ASK_REQUEST_INSTRUCTIONS);
    const raw = createGraphCodec(schema), harness = createRecursiveAskPlanHarness(plan, tick);
    const validate = new Ajv().compile(createAskProviderWireSchema(harness.schema));
    cache.set(context, { schema, plan, raw, harness, validate });
  }
  return cache.get(context);
}
function reverse(value) {
  if (Array.isArray(value)) return value.map(reverse);
  return value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)])) : value;
}

test("createAskWirePlan bridge has exact raw-codec and canonical parity for all 262 vectors", () => {
  let checked = 0;
  for (const fixture of corpus.fixtures) {
    const { plan, raw, harness, validate } = compiled(fixture.context);
    const originalSchema = JSON.stringify(plan.schema), originalInstructions = plan.instructions;
    const expected = plan.encode(fixture.canonical), graph = raw.encode(fixture.canonical);
    assert.deepEqual({ nodes: [...expected.nodes, expected.root] }, graph);
    assert.deepEqual(harness.rawBridge.decode(graph), raw.decode(graph));
    const recursive = harness.encode(fixture.canonical, tick);
    assert.ok(validate(recursive), JSON.stringify(validate.errors));
    const restored = harness.toPlanEnvelope(reverse(recursive), tick);
    assert.deepEqual(restored, expected);
    assert.deepEqual(plan.decode(restored), fixture.canonical);
    assert.deepEqual(harness.decode(JSON.parse(JSON.stringify(recursive)), tick), fixture.canonical);
    assert.equal(JSON.stringify(plan.schema), originalSchema); assert.equal(plan.instructions, originalInstructions);
    checked++;
  }
  assert.equal(checked, 262);
});

test("bridge rejects malformed roots, noncanonical graphs and forward/reused/unused references", () => {
  const { plan, raw, harness } = compiled("no_numeric");
  const fixture = corpus.fixtures.find(f => f.context === "no_numeric"), graph = raw.encode(fixture.canonical);
  const forward = structuredClone(graph); forward.nodes.at(-1)[raw.names.request] = { "@": forward.nodes.length };
  const unused = { nodes: [graph.nodes[0], ...graph.nodes] };
  const reused = structuredClone(graph), refs = [];
  const collect = value => { if (!value || typeof value !== "object") return; if (Object.hasOwn(value, "@")) refs.push(value); else Object.values(value).forEach(collect); };
  collect(reused); assert.ok(refs.length >= 2); refs[1]["@"] = refs[0]["@"];
  assert.throws(() => raw.decode(reused)); assert.throws(() => harness.rawBridge.decode(reused));
  for (const bad of [{ nodes: [] }, { nodes: [graph.nodes[0]] }, forward, unused,
    { nodes: graph.nodes, extra: true }, plan.encode(fixture.canonical)]) {
    assert.throws(() => harness.rawBridge.decode(bad));
  }
  const reversed = { nodes: [...graph.nodes].reverse() };
  assert.throws(() => raw.decode(reversed));
  assert.throws(() => harness.rawBridge.decode(reversed));
  assert.throws(() => harness.decode(plan.encode(fixture.canonical), tick), /ASK_RECURSIVE/);
  assert.throws(() => plan.decode(harness.encode(fixture.canonical, tick)), /ASK_WIRE_POLICY_ENVELOPE/);
});

test("only transport instructions change; all semantic policy, tags, aliases and authority remain pinned", () => {
  for (const context of Object.keys(corpus.contexts)) {
    const { schema, plan, harness } = compiled(context);
    assert.equal(harness.instructions.slice(harness.instructions.indexOf("\nFIELDS ")),
      plan.instructions.slice(plan.instructions.indexOf("\nFIELDS ")));
    assert.match(harness.instructions, /embed child objects recursively/);
    assert.doesNotMatch(harness.instructions.split("\nFIELDS ")[0], /implicit index|refer to earlier nodes/);
    assert.deepEqual(harness.schema.properties.root.required, plan.rootSchema.required);
    assert.deepEqual(Object.keys(harness.schema.properties.root.properties), Object.keys(plan.rootSchema.properties));
    assert.throws(() => createAskWirePlan(schema, ASK_REQUEST_INSTRUCTIONS + " "), /SOURCE_DRIFT/);
    assert.throws(() => createAskWirePlan(schema, ASK_REQUEST_INSTRUCTIONS,
      { ...ASK_INITIAL_INPUT_AUTHORITY, inputAuthority: ASK_INITIAL_INPUT_AUTHORITY.inputAuthority + " " }), /AUTHORITY_SOURCE_DRIFT/);
  }
  const { plan } = compiled("no_numeric");
  assert.throws(() => createRecursiveAskPlanHarness({ ...plan, instructions: "changed transport\n" + plan.instructions }, tick), /TRANSPORT_HEADER_DRIFT/);
});

const pets = ["Aster", "Birch", "Cedar", "Dahlia", "Elm"].map((name, i) => ({ id: "pet-" + i, user_id: "owner", name, species: "dog" }));
const turn = (id, text) => ({ id, role: "user", text, createdAt: "2026-10-06T00:00:00Z" });
function context(count, numeric) {
  const text = ((numeric ? "Compare 17 kg and 9 kg for " : "Compare the notes for ") + pets.map(p => p.name).join(", ") + ". " + "Preserve exact details. ".repeat(80)).slice(0, 1200);
  const current = turn("current", text), prior = Array.from({ length: count }, (_, i) => turn("prior-" + i, ("Earlier turn " + i + ". " + "Whole user text. ".repeat(100)).slice(0, 1200)));
  return { owner: { userId: "owner" }, pet: pets[0], eligiblePets: structuredClone(pets), currentMessage: text,
    currentTurn: current, conversationTurns: [...prior, current], conversationId: "conversation", timeZone: "UTC" };
}
const template = corpus.fixtures.find(f => f.canonical.request.evidenceBasis === "saved_profile").canonical.request;
const proposal = ctx => ({ request: { ...structuredClone(template), question: ctx.currentMessage, scope: "named", petNames: ["Aster"], topic: "profile" } });
const env = { NODE_ENV: "test", FURVISE_AI_DAILY_CALL_LIMIT: "20", FURVISE_AI_DAILY_COST_LIMIT_USD: "10", FURVISE_RATE_LIMIT_HASH_SECRET: "recursive-plan-offline-only".repeat(3) };
async function admitted(name, fn) {
  const admission = await admitAiOperation({ env, store: new MemoryAiGuardTestStore(), feature: "ask", intendedModel: model,
    userId: "owner", requestId: name, payload: { fixture: name }, now: new Date("2039-03-17T12:00:00Z") });
  try { return await admission.run(() => fn(admission)); } finally { await admission.release(); }
}
const quiet = t => { t.mock.method(console, "info", () => {}); t.mock.method(console, "warn", () => {}); };
const deadlineCheck = a => () => a.deadline.allocate("interpretation", ASK_INTERPRETATION_LIMITS.timeoutMs, 24000);

for (const numeric of [false, true]) for (const count of [0, 2, 8, 39])
  test("final direct semantic request and real admission: five pets, 1200 chars, turns=" + count + ", numeric=" + numeric, async t => {
    quiet(t);
    await admitted("direct-" + numeric + "-" + count, async admission => {
      const ctx = context(count, numeric), prepared = prepareAskInterpretationRequest(ctx, model);
      const check = deadlineCheck(admission), request = prepared.request;
      const input = JSON.parse(request.input);
      assert.equal(input.userSources.filter(s => s.id === "current").length, 1);
      assert.equal(input.userSources.find(s => s.id === "current").text, ctx.currentMessage);
      assert.equal(input.ownedPets.length, 5);
      assert.ok(input.userSources.length <= 9);
      assert.equal(input.sourceWindow.omittedPriorUserTurns, count - prepared.context.conversationTurns.length);
      assert.ok(askRequestFitsInputBudget(request));
      assert.equal(request.max_output_tokens, 8192);
      assert.deepEqual(request.reasoning, { effort: "none" });
      assert.equal(request.instructions, prepared.transport.instructions + "\n" + ASK_USER_SOURCE_INSTRUCTIONS);
      assert.equal(request.text.format.schema.properties.requestJson.type, "string");
      assert.equal(request.text.format.schema.properties.format.enum[0], "ask-semantic-json.v1");
      const canonical = proposal(ctx), proposed = prepared.transport.encode(canonical, check);
      assert.ok(!Object.hasOwn(proposed, "nodes"));
      assert.deepEqual(prepared.transport.decode(JSON.parse(JSON.stringify(proposed)), check), canonical);
      let dispatches = 0;
      const response = await executeAdmittedResponsesRequest({
        model, maxOutputTokens: ASK_INTERPRETATION_LIMITS.outputTokens, stage: "interpretation",
        reserveMs: 24000, request,
        invoke: async sent => {
          dispatches++;
          assert.equal(JSON.stringify(sent), JSON.stringify(request));
          return { status: "completed", output_text: JSON.stringify(proposed),
            usage: { input_tokens: estimateInputTokens(sent), output_tokens: 120 } };
        },
      });
      assert.equal(dispatches, 1);
      assert.deepEqual(prepared.transport.decode(JSON.parse(response.output_text), check), canonical);
      assert.deepEqual(recoverAskInterpretation(canonical.request, prepared.context),
        recoverAskInterpretation(prepared.transport.decode(proposed, check).request, prepared.context));
      console.log(JSON.stringify({kind:"direct_semantic_request",numeric,priorTurns:count,
        retained:prepared.context.conversationTurns.length,characters:JSON.stringify(request).length,
        estimatedInput:estimateInputTokens(request)}));
    });
  });

test("final serialized request boundaries reject before dispatch; output/accounting ceilings stay unchanged", async t => {
  quiet(t);
  const prepared = indexedPrepared(context(0, false));
  const h = prepareRecursiveAskRequestHarness(prepared, tick);
  function padded(size) {
    const request = structuredClone(h.request);
    request.instructions += " ".repeat(size - JSON.stringify(request).length);
    assert.equal(JSON.stringify(request).length, size); return request;
  }
  assert.ok(askRequestFitsInputBudget(padded(60000))); assert.equal(estimateInputTokens(padded(60000)), 20000);
  assert.equal(askRequestFitsInputBudget(padded(60001)), false);
  assert.throws(() => assertAskRequestInputBudget(padded(60001)), e => e.reason === "feature_token_budget_exceeded");
  let calls = 0;
  await admitted("recursive-oversize", async () => {
    await assert.rejects(executeAdmittedResponsesRequest({ model, maxOutputTokens: 8192, stage: "interpretation", reserveMs: 24000,
      request: padded(60001), invoke: async () => { calls++; throw Error("SDK_MUST_NOT_RUN"); } }), e => e.reason === "feature_token_budget_exceeded");
  });
  assert.equal(calls, 0);
  const tooLarge = { ...prepared, request: { ...prepared.request, input: JSON.stringify({ userSources: [{ text: "x".repeat(80001) }] }) } };
  assert.throws(() => prepareRecursiveAskRequestHarness(tooLarge, tick), e => e.reason === "feature_token_budget_exceeded");
  assert.equal(AI_FEATURE_POLICIES.ask.maxInputTokens, 20000);
  assert.equal(AI_FEATURE_POLICIES.ask.maxInputCharacters, 80000);
  assert.equal(AI_FEATURE_POLICIES.ask.maxOutputTokens, 100000);
  assert.equal(AI_FEATURE_POLICIES.ask.maximumProviderCalls, 6);
  assert.equal(ASK_INTERPRETATION_LIMITS.outputTokens, 8192);
  assert.equal(ASK_INTERPRETATION_LIMITS.timeoutMs, 25000);
});

test("integration compilation and runtime use fresh operation deadlines without resetting the budget", () => {
  const { plan } = compiled("no_numeric"), canonical = corpus.fixtures.find(f => f.context === "no_numeric").canonical;
  let now = 0; const deadline = new OperationDeadline(50000, () => now);
  const check = () => deadline.allocate("interpretation", 25000, 24000);
  const h = createRecursiveAskPlanHarness(plan, check), recursive = h.encode(canonical, check);
  now = 26001;
  assert.throws(() => createRecursiveAskPlanHarness(plan, check), e => e.code === "ASK_STAGE_DEADLINE");
  for (const [method, input] of [["encode", canonical], ["decode", recursive], ["toPlanEnvelope", recursive]])
    assert.throws(() => h[method](input, check), e => e.code === "ASK_STAGE_DEADLINE");
});
