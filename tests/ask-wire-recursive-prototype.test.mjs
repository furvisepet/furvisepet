import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileGraphCodec, createGraphCodec } from "../app/lib/intelligence/ask-wire-codec.mjs";
import { createRecursiveProviderPrototype, RECURSIVE_PROTOTYPE_LIMITS } from "../scripts/prototypes/ask-wire-recursive.mjs";

globalThis.fetch = async () => { throw Error("OFFLINE_RECURSIVE_PROTOTYPE"); };
const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const { askRequestProviderSchema } = await import("../app/lib/intelligence/ask-request-contract.ts");
const { proposedSemanticFrameJsonSchema } = await import("../app/lib/intelligence/semantic-frame/schema.ts");
const { createAskProviderWireSchema } = await import("../app/lib/intelligence/ask-wire-provider-schema.ts");
const corpus = JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json", import.meta.url), "utf8"));
const tick = () => {};
const plans = new Map();
function plan(name) {
  if (!plans.has(name)) {
    const codec = createGraphCodec(askRequestProviderSchema(proposedSemanticFrameJsonSchema, corpus.contexts[name]));
    const before = JSON.stringify(codec.schema), prototype = createRecursiveProviderPrototype(codec);
    assert.equal(JSON.stringify(codec.schema), before);
    const valid = new Ajv({ allErrors: false }).compile(createAskProviderWireSchema(prototype.schema));
    plans.set(name, { codec, prototype, valid });
  }
  return plans.get(name);
}
function reversed(value) {
  if (Array.isArray(value)) return value.map(reversed);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)]));
  return value;
}
test("all 262 independent canonical vectors round-trip through recursive provider nodes with exact graph parity", () => {
  assert.equal(corpus.fixtures.length, 262);
  for (const fixture of corpus.fixtures) {
    const { codec, prototype, valid } = plan(fixture.context);
    const graph = codec.encode(fixture.canonical);
    assert.deepEqual(graph, fixture.wire, fixture.context);
    const envelope = prototype.fromGraph(graph, tick);
    assert.ok(valid(envelope), JSON.stringify(valid.errors));
    assert.deepEqual(prototype.toGraph(reversed(envelope), tick), graph);
    assert.deepEqual(prototype.decode(JSON.parse(JSON.stringify(envelope)), tick), fixture.canonical);
    assert.deepEqual(prototype.fromGraph(prototype.toGraph(envelope, tick), tick), envelope);
  }
  for (const [context, p] of plans) console.log(JSON.stringify({
    kind: "recursive_schema_measurement", context,
    indexedSchemaCharacters: JSON.stringify(createAskProviderWireSchema(p.codec.schema)).length,
    recursiveSchemaCharacters: JSON.stringify(createAskProviderWireSchema(p.prototype.schema)).length,
  }));
});

const simpleSchema = { type: "object", additionalProperties: false, required: ["request"], properties: {
  request: { type: "object", additionalProperties: false, required: ["text", "digits"], properties: {
    text: { type: "string", maxLength: 10000 }, digits: { type: "string", pattern: "^\\d+$" },
  } },
} };
const simple = compileGraphCodec(simpleSchema);
const adapter = createRecursiveProviderPrototype(simple);
const simpleGraph = simple.encode({ request: { text: "Cedar", digits: "12" } });
const simpleEnvelope = adapter.fromGraph(simpleGraph, tick);

test("packed prefix aliases preserve the pre-packing child traversal order", () => {
  const fillers = Array.from({ length: 51 }, (_, i) => "v" + i);
  const leaf = { type: "object", additionalProperties: false, required: ["value"], properties: { value: { type: "string" } } };
  const properties = { left: leaf, right: leaf, kind: { type: "string", enum: ["record"] },
    ...Object.fromEntries(fillers.map(k => [k, { type: "null" }])) };
  const schema = { type: "object", additionalProperties: false, required: ["request"], properties: {
    request: { type: "object", additionalProperties: false, required: Object.keys(properties), properties },
  } };
  const codec = compileGraphCodec(schema, ["left", ...fillers, "right", "request", "kind", "value"]);
  assert.equal(codec.names.left, "a"); assert.equal(codec.names.right, "aa");
  const value = { request: { left: { value: "LEFT" }, right: { value: "RIGHT" }, kind: "record",
    ...Object.fromEntries(fillers.map(k => [k, null])) } };
  const graph = codec.encode(value), prototype = createRecursiveProviderPrototype(codec);
  assert.ok(graph.nodes.some(n => Object.keys(n).some(k => k.startsWith("a~"))));
  assert.deepEqual(prototype.toGraph(reversed(prototype.fromGraph(graph, tick)), tick), graph);
});

test("UTF16 quotes and data resembling wire references remain byte-exact", () => {
  for (const text of ['"@":0', "\ud83d", "\ude3a", "🐾 cafe\u0301", "a\u0000b", "__proto__ constructor", "never recorded; SAVE 9"]) {
    const value = { request: { text, digits: "9" } };
    assert.deepEqual(adapter.decode(adapter.fromGraph(simple.encode(value), tick), tick), value);
  }
});

test("both invalid graph classes remain rejected rather than being guessed into trees", () => {
  const { codec, prototype } = plan("no_numeric");
  const fixture = corpus.fixtures.find(f => f.context === "no_numeric");
  const graph = codec.encode(fixture.canonical);
  const semanticRoot = { nodes: [graph.nodes[0]] };
  assert.throws(() => codec.decode(semanticRoot), /ASK_WIRE_COMPACT_SCHEMA/);
  assert.throws(() => prototype.fromGraph(semanticRoot, tick), /ASK_WIRE_COMPACT_SCHEMA/);
  const badEdge = structuredClone(graph);
  badEdge.nodes.at(-1)[codec.names.request] = { "@": badEdge.nodes.length };
  assert.throws(() => codec.decode(badEdge), /INVALID_EDGE/);
  assert.throws(() => prototype.fromGraph(badEdge, tick), /INVALID_EDGE/);
});

test("provider root shape and authoritative child-type checks remain separate and strict", () => {
  const { codec, prototype, valid } = plan("no_numeric");
  const graph = codec.encode(corpus.fixtures.find(f => f.context === "no_numeric").canonical);
  const leaf = graph.nodes[0], wrongChild = { root: { [codec.names.request]: leaf } };
  assert.equal(valid({ root: leaf }), false);
  assert.throws(() => prototype.decode({ root: leaf }, tick), /ASK_WIRE/);
  assert.ok(valid(wrongChild), "generic compiled node union cannot prove semantic child type");
  assert.throws(() => prototype.decode(wrongChild, tick), /ASK_WIRE_COMPACT_SCHEMA/);
  const validEnvelope = prototype.fromGraph(graph, tick);
  assert.equal(valid({ ...validEnvelope, extra: true }), false);
  assert.equal(valid({ root: { [codec.names.request]: { "@": 0 } } }), false);
  assert.throws(() => prototype.decode({ root: { [codec.names.request]: { "@": 0 } } }, tick), /INDEXED_REFERENCE/);
  const badValue = structuredClone(simpleEnvelope);
  badValue.root[simple.names.request][simple.names.digits] = "٩";
  assert.throws(() => adapter.decode(badValue, tick), /ASK_WIRE/);
});

test("plain own-root, data descriptors, JSON values and array shapes fail closed before strict decode", () => {
  let decoded = 0, getterCalls = 0;
  const guarded = createRecursiveProviderPrototype({ ...simple, decode: g => { decoded++; return simple.decode(g); } });
  const inherited = Object.create({ root: simpleEnvelope.root });
  const accessor = Object.defineProperty({}, "root", { enumerable: true, get() { getterCalls++; return simpleEnvelope.root; } });
  const hidden = Object.defineProperty({}, "root", { value: simpleEnvelope.root });
  const symbol = { ...simpleEnvelope, [Symbol("extra")]: 1 };
  const arrayGetter = []; Object.defineProperty(arrayGetter, "0", { enumerable: true, get() { getterCalls++; return 1; } });
  const sparse = new Array(1), extraArray = Object.assign([], { extra: 1 });
  for (const bad of [null, [], {}, inherited, accessor, hidden, symbol,
    { root: null }, { root: [] }, { root: {} , extra: true },
    { root: { x: arrayGetter } }, { root: { x: sparse } }, { root: { x: extraArray } },
    { root: { x: new Date() } }, { root: { x: undefined } },
    { root: { x: NaN } }, { root: { x: Infinity } }, { root: { x: 1n } }, { root: { x() {} } },
  ]) assert.throws(() => guarded.decode(bad, tick), /ASK_RECURSIVE/);
  assert.equal(decoded, 0); assert.equal(getterCalls, 0);
  const nullRoot = Object.assign(Object.create(null), simpleEnvelope);
  assert.deepEqual(adapter.decode(nullRoot, tick), { request: { text: "Cedar", digits: "12" } });
});

test("object and array cycles, repeated identities and excess depth are bounded before decoder entry", () => {
  let decoded = 0;
  const guarded = createRecursiveProviderPrototype({ ...simple, decode: g => { decoded++; return simple.decode(g); } });
  const object = {}; object.self = object;
  const array = []; array.push(array);
  const shared = {};
  for (const root of [object, { array }, { a: shared, b: shared }])
    assert.throws(() => guarded.decode({ root }, tick), /CYCLE_OR_REUSED_CONTAINER/);
  for (const arrays of [false, true]) {
    let root = "end";
    for (let i = 0; i < 70; i++) root = arrays ? [root] : { x: root };
    assert.throws(() => guarded.decode({ root: { nested: root } }, tick), /DEPTH/);
  }
  assert.equal(decoded, 0);
});

test("resource limits account for escaped serialized characters and cannot exceed hard ceilings", () => {
  for (const [limits, value, code] of [
    [{ maxContainers: 2 }, { root: { a: {} } }, "CONTAINER_LIMIT"],
    [{ maxValues: 2 }, { root: { a: 1 } }, "VALUE_LIMIT"],
    [{ maxContainerEntries: 1 }, { root: { a: 1, b: 2 } }, "ENTRY_LIMIT"],
    [{ maxStringUnits: 4 }, { root: { a: "12345" } }, "STRING_LIMIT"],
    [{ maxSerializedCharacters: 30 }, { root: { a: "\u0000".repeat(4) } }, "SERIALIZED_LIMIT"],
  ]) assert.throws(() => createRecursiveProviderPrototype(simple, tick, limits).decode(value, tick), new RegExp(code));
  assert.throws(() => createRecursiveProviderPrototype(simple, tick, { maxDepth: 65 }), /LIMIT_CONFIGURATION/);
  assert.throws(() => createRecursiveProviderPrototype(simple, tick, { unknown: 1 }), /LIMIT_CONFIGURATION/);
  assert.throws(() => createRecursiveProviderPrototype(simple, tick, { maxDepth: 1.5 }), /LIMIT_CONFIGURATION/);
  assert.ok(Object.isFrozen(RECURSIVE_PROTOTYPE_LIMITS));
});

test("fresh runtime deadlines are mandatory, separate from compilation, and checked during and after decoding", () => {
  const expired = Error("TEST_RUNTIME_EXPIRED");
  let compiling = true;
  const p = createRecursiveProviderPrototype(simple, () => { if (!compiling) throw expired; });
  compiling = false;
  assert.deepEqual(p.decode(simpleEnvelope, tick), { request: { text: "Cedar", digits: "12" } });
  for (const method of ["decode", "toGraph", "fromGraph"]) {
    const value = method === "fromGraph" ? simpleGraph : simpleEnvelope;
    assert.throws(() => p[method](value), /RUNTIME_DEADLINE_REQUIRED/);
    assert.throws(() => p[method](value, () => { throw expired; }), e => e === expired);
    let calls = 0;
    assert.throws(() => p[method](value, () => { if (++calls === 5) throw expired; }), e => e === expired);
  }
  let expiredAfterDecode = false;
  const post = createRecursiveProviderPrototype({ ...simple, decode: graph => {
    const result = simple.decode(graph); expiredAfterDecode = true; return result;
  } });
  assert.throws(() => post.decode(simpleEnvelope, () => { if (expiredAfterDecode) throw expired; }), e => e === expired);
  let checks = 0;
  assert.throws(() => createRecursiveProviderPrototype(simple, () => { if (++checks === 4) throw expired; }), e => e === expired);
});
