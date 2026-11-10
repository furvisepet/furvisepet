
import {historicalWireSchema} from "./helpers/historical-wire-schema.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createAskWirePlan } from "../app/lib/intelligence/ask-wire-policy.mjs";
import { createGraphCodec } from "../app/lib/intelligence/ask-wire-codec.mjs";
import { ASK_INITIAL_INPUT_AUTHORITY } from "../app/lib/intelligence/ask-wire-authority.mjs";
import {createRecursiveAskPlanHarness} from "./helpers/ask-wire-recursive-plan.mjs";
import {ASK_REQUEST_INSTRUCTIONS} from "../app/lib/intelligence/ask-request-contract.ts";



import { createAskProviderWireSchema } from "../app/lib/intelligence/ask-wire-provider-schema.ts";







import {OperationDeadline} from "../app/lib/ai/execution-deadline.ts";

globalThis.fetch = async () => { throw Error("OFFLINE_RECURSIVE_PLAN"); };
const Ajv = createRequire(import.meta.url)("ajv");
const corpus = JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json", import.meta.url), "utf8"));
const tick = () => {};


const cache = new Map();
function compiled(context) {
  if (!cache.has(context)) {
    const schema = historicalWireSchema(context, 'schema'), plan = createAskWirePlan(schema, ASK_REQUEST_INSTRUCTIONS);
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


test("integration compilation and runtime use fresh operation deadlines without resetting the budget", () => {
  const { plan } = compiled("no_numeric"), legacy = corpus.fixtures.find(f => f.context === "no_numeric" && f.canonical.request.evidenceBasis === "saved_profile").canonical;
  const canonical = legacy; // Frozen ABI key parity; clock assertions stay unchanged.
  let now = 0; const deadline = new OperationDeadline(50000, () => now);
  const check = () => deadline.allocate("interpretation", 25000, 24000);
  const h = createRecursiveAskPlanHarness(plan, check), recursive = h.encode(canonical, check);
  now = 26001;
  assert.throws(() => createRecursiveAskPlanHarness(plan, check), e => e.code === "ASK_STAGE_DEADLINE");
  for (const [method, input] of [["encode", canonical], ["decode", recursive], ["toPlanEnvelope", recursive]])
    assert.throws(() => h[method](input, check), e => e.code === "ASK_STAGE_DEADLINE");
});
