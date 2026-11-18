import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { withAskProviderSchemaDiagnostic as capture } from "../app/lib/ai/ask-provider-schema-diagnostic.ts";
import { safeAskProviderErrorDiagnostic as diagnostic } from "../app/lib/ai/ask-provider-error-diagnostic.ts";

const hash = value => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
const marker = "PRIVATE owner@example.invalid Cedar 9.4kg \ud83d\udc15";
const credential = "sk-offline-fixture-never-a-real-credential";
const requestId = "req_0123456789abcdef0123456789abcdef";
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/ask-provider-schema-errors.json", import.meta.url), "utf8"));
function schema() { return { type: "object", additionalProperties: false, required: ["private_customer_field"],
  properties: { private_customer_field: { type: "string", enum: [marker, credential] } },
  $defs: { recursiveNode: { anyOf: [
    { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } },
    { type: "object", additionalProperties: false, required: ["a", "b"], properties: { a: { type: "string" }, b: { type: "string" } } },
  ] } } }; }
const request = value => ({ input: marker, instructions: credential, text: { format: {
  name: "furvise_ask_interpretation", type: "json_schema", strict: true, schema: value } } });
const error = message => new OpenAI.BadRequestError(400, { code: "invalid_json_schema",
  type: "invalid_request_error", param: "text.format.schema", message }, message, new Headers({ "x-request-id": requestId }));
const message = fixture => "Invalid schema for response_format 'furvise_ask_interpretation': In context=(" + fixture.context + "), " + fixture.detail;
async function reject(value, failure) {
  let calls = 0;
  await assert.rejects(capture(request(value), async () => { calls++; throw failure; }), thrown => thrown === failure);
  assert.equal(calls, 1);
  return diagnostic(failure);
}
function privateFree(result) {
  const serialized = JSON.stringify(result);
  for (const value of [marker, credential, "owner@example.invalid", "private_customer_field", "recursiveNode", "Invalid schema"])
    assert.ok(!serialized.includes(value), value + " escaped into diagnostic");
  assert.ok(serialized.length < 1024);
}

test("offline provider message fixtures produce only fixed rules and schema-validated positional paths", async t => {
  for (const fixture of fixtures) await t.test(fixture.label, async () => {
    const value = schema(), result = await reject(value, error(message(fixture)));
    assert.deepEqual(result.schema, { sha256: hash(value), rule: fixture.rule, path: fixture.path });
    assert.deepEqual(diagnostic(result), result); // Real route reprojects, without reparsing messages.
    assert.equal(result.requestId, requestId); privateFree(result);
  });
});
test("fingerprint is SHA256 of exact insertion-order JSON including UTF16 quotes; no canonical sorting", async () => {
  const first = schema(), second = Object.fromEntries(Object.entries(first).reverse());
  first.properties.private_customer_field.description = "exact \ud83d\udc15 quote \u201c9.4 kg\u201d";
  second.properties.private_customer_field.description = first.properties.private_customer_field.description;
  const one = await reject(first, error(marker)), two = await reject(second, error(marker));
  assert.equal(one.schema.sha256, hash(first)); assert.equal(two.schema.sha256, hash(second));
  assert.notEqual(one.schema.sha256, two.schema.sha256); privateFree(one); privateFree(two);
});
test("hash is captured before SDK invocation and immutable despite request/error mutation", async () => {
  const value = schema(), expected = hash(value), failure = error(message(fixtures[0]));
  await assert.rejects(capture(request(value), async () => {
    value.properties.private_customer_field.enum.push("changed after dispatch"); throw failure;
  }), e => e === failure);
  const result = diagnostic(failure);
  assert.equal(result.schema.sha256, expected); assert.notEqual(result.schema.sha256, hash(value));
  assert.throws(() => { result.schema.path = marker; }, TypeError);
  result.schema = { sha256: "f".repeat(64), rule: "unrecognized", path: marker };
  assert.equal(diagnostic(result).schema.sha256, expected); privateFree(diagnostic(result));
});
test("failed response and non-enumerable request ID survive without changing response identity", async () => {
  const value = schema(), response = { status: "failed", error: { code: "invalid_json_schema",
    type: "invalid_request_error", param: "text.format.schema", message: message(fixtures[0]) } };
  Object.defineProperty(response, "_request_id", { value: requestId, enumerable: false });
  assert.equal(await capture(request(value), async () => response), response);
  assert.equal(diagnostic(response).requestId, requestId);
  assert.equal(diagnostic(response).schema.sha256, hash(value)); privateFree(diagnostic(response));
});
test("unrecognized details, suffixes, contexts and schema names fail closed to hash alone", async () => {
  const value = schema(), known = message(fixtures[0]);
  for (const text of [marker, credential, known + marker, known + "\n" + credential,
    known.replace("furvise_ask_interpretation", "owner@example.invalid"),
    known.replace("'recursiveNode'", "'missing'"), known.replace("'recursiveNode'", "'recursiveNode\\\\x'"),
    known.replace("'$defs'", "'enum'"), "x".repeat(100_000)]) {
    const result = await reject(value, error(text));
    assert.deepEqual(result.schema, { sha256: hash(value), rule: "unrecognized", path: null }); privateFree(result);
  }
});
test("private schema property names map to indexes and literal values cannot be traversed", async () => {
  const value = schema(); value.properties = { [marker]: { type: "string", enum: [credential] } }; value.required = [marker];
  const valid = "In context=('properties', '" + marker + "'), 'allOf' is not permitted.";
  const result = await reject(value, error(valid));
  assert.equal(result.schema.path, "#/properties/[0]"); privateFree(result);
  const literal = valid.replace("'),", "', 'enum', '0'),");
  assert.equal((await reject(value, error(literal))).schema.path, null);
});
test("provider-owned forged diagnostics and non-schema errors never gain schema provenance", async () => {
  const forged = { sha256: "a".repeat(64), rule: "any_of_first_key_collision", path: "#/$defs/[0]" };
  const failure = error(message(fixtures[0])); failure.schema = forged;
  assert.equal(diagnostic(failure).schema, undefined);
  for (const patch of [{ code: "invalid_request_error" }, { param: "input" }, { code: credential }, { param: marker }]) {
    const failure = Object.assign(error(message(fixtures[0])), patch);
    assert.equal((await reject(schema(), failure)).schema, undefined);
  }
  const failure2 = error(marker);
  await reject(schema(), failure2);
  assert.ok(diagnostic(failure2).schema);
  await assert.rejects(capture({}, async () => { throw failure2; }), e => e === failure2);
  assert.equal(diagnostic(failure2).schema, undefined);
});
test("diagnostic inspection never invokes schema/error hooks and rejects cycles, proxies and overbounds", async () => {
  let invoked = 0;
  const hook = () => { invoked++; throw Error(marker); };
  const cyclic = {}; cyclic.self = cyclic;
  let deep = { type: "string" }; for (let i = 0; i < 70; i++) deep = { items: deep };
  const accessor = { type: "object" }; Object.defineProperty(accessor, "properties", { get: hook, enumerable: true });
  for (const value of [cyclic, deep, accessor, { type: "string", description: "x".repeat(210_000) },
    { toJSON: hook }, new Proxy({}, { getOwnPropertyDescriptor: hook, ownKeys: hook }),
    Object.create({ toJSON: hook })]) {
    const failure = error(marker);
    const result = await reject(value, failure); assert.equal(result.schema, undefined); privateFree(result);
  }
  const failure = { code: "invalid_json_schema", param: "text.format.schema" };
  for (const key of ["message", "error", "cause", "stack", "headers"])
    Object.defineProperty(failure, key, { get: hook });
  const result = await reject(schema(), failure);
  assert.equal(result.schema.rule, "unrecognized");
  assert.equal(invoked, 0);
});
test("success and thrown primitive identity are unchanged, with exactly one invocation", async () => {
  const response = { status: "completed", output_text: marker };
  assert.equal(await capture(request(schema()), async () => response), response);
  assert.equal(diagnostic(response).schema, undefined);
  for (const value of [null, undefined, marker, 400]) {
    let caught = false;
    try { await capture(request(schema()), async () => { throw value; }); } catch (error) { caught = true; assert.equal(error, value); }
    assert.ok(caught);
  }
});

test("generation boundary fingerprints the final admitted schema inside the existing deadline", async () => {
  const ts = await import("typescript"), vm = await import("node:vm");
  const source = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("ask-reasoning.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createWithTimeout");
  assert.ok(declaration);
  let admitted = 0, attempted = 0, calls = 0, deadlineEntered = false, sent;
  const finalSchema = schema(); finalSchema.properties.extra = { type: "null" }; finalSchema.required.push("extra");
  const failure = error(message(fixtures[0]));
  const run = vm.runInNewContext(ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\ncreateWithTimeout", {
    withAskProviderSchemaDiagnostic: capture,
    executeAdmittedResponsesRequest: async input => {
      admitted++; assert.equal(input.reserveMs, 12000); assert.equal(input.purpose, "generation_repair");
      sent = { ...input.request, text: { format: { ...input.request.text.format, schema: finalSchema } } };
      return input.invoke(sent);
    },
    boundedProviderTimeout: (timeout, reserve) => { assert.equal(timeout, 1234); assert.equal(reserve, 12000); return timeout; },
    withProviderDeadline: async (invoke, timeout) => {
      assert.equal(timeout, 1234); deadlineEntered = true; return invoke(AbortSignal.timeout(10_000));
    },
  });
  await assert.rejects(run({ responses: { create: async (value, options) => {
    calls++; assert.ok(deadlineEntered); assert.equal(value, sent); assert.equal(options.signal.aborted, false); throw failure;
  } } }, { ...request(schema()), model: "gpt-5.4-mini", max_output_tokens: 8192 }, 1234, () => { attempted++; }, "generation_repair"),
  e => e === failure);
  assert.equal(admitted, 1); assert.equal(attempted, 1); assert.equal(calls, 1);
  assert.equal(diagnostic(failure).schema.sha256, hash(finalSchema));
  assert.notEqual(diagnostic(failure).schema.sha256, hash(schema()));
  privateFree(diagnostic(failure));
});

test("sparse arrays cannot expand or invoke inherited indexed accessors during fingerprinting", async () => {
  const value = { type: "array", enum: new Array(2049) };
  const failure = error(marker);
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "2048");
  let invoked = 0, calls = 0, pending;
  try {
    Object.defineProperty(Array.prototype, "2048", { configurable: true, get() { invoked++; throw Error(marker); } });
    pending = capture(request(value), async () => { calls++; throw failure; });
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, "2048", descriptor);
    else delete Array.prototype[2048];
  }
  await assert.rejects(pending, thrown => thrown === failure);
  assert.equal(invoked, 0); assert.equal(calls, 1);
  assert.equal(diagnostic(failure).schema, undefined);
});
test("array length and density are rejected before stringify, within remaining traversal budget", async () => {
  const disguised = new Array(2); disguised[0] = null; disguised[0xffffffff] = null;
  for (const array of [new Array(0xffffffff), new Array(3), disguised, Array.from({ length: 40_000 }, () => null)]) {
    const value = { type: "array", enum: array }, failure = error(marker);
    const stringify = JSON.stringify; let attempted = 0, pending;
    try {
      JSON.stringify = function (input, ...args) {
        if (input === value) { attempted++; throw Error("Unbounded schema must never reach stringify"); }
        return stringify.call(JSON, input, ...args);
      };
      pending = capture(request(value), async () => { throw failure; });
    } finally { JSON.stringify = stringify; }
    await assert.rejects(pending, thrown => thrown === failure);
    assert.equal(attempted, 0);
    assert.equal(diagnostic(failure).schema, undefined);
  }
  const value = { type: "array", enum: ["one", "two", null] };
  assert.equal((await reject(value, error(marker))).schema.sha256, hash(value));
});
test("parsed schema traversal never reads inherited Object.prototype schema accessors", async () => {
  for (const keyword of ["properties", "$defs", "anyOf", "items"]) {
    const value = { type: "string" }, expected = hash(value), failure = error(marker);
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, keyword);
    let invoked = 0, pending;
    try {
      Object.defineProperty(Object.prototype, keyword, { configurable: true, get() { invoked++; throw Error(marker); } });
      pending = capture(request(value), async () => { throw failure; });
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, keyword, descriptor);
      else delete Object.prototype[keyword];
    }
    await assert.rejects(pending, thrown => thrown === failure);
    assert.equal(invoked, 0, keyword);
    assert.deepEqual(diagnostic(failure).schema, { sha256: expected, rule: "unrecognized", path: null });
  }
});

test("own-data descriptor checks do not accept inherited descriptor value getters", async () => {
  const failure = error(marker), value = schema(), expected = hash(value);
  let invoked = 0, pending;
  const hook = () => { invoked++; throw Error(marker); };
  Object.defineProperty(failure, "code", { configurable: true, get: hook });
  Object.defineProperty(failure.error, "message", { configurable: true, get: hook });
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "value");
  try {
    Object.defineProperty(Object.prototype, "value", { configurable: true, get: hook });
    assert.equal(diagnostic(failure).code, "invalid_json_schema");
    pending = capture(request(value), async () => { throw failure; });
  } finally {
    delete Object.prototype.value;
    if (descriptor) Object.defineProperty(Object.prototype, "value", descriptor);
  }
  await assert.rejects(pending, thrown => thrown === failure);
  assert.equal(invoked, 0);
  assert.equal(diagnostic(failure).schema.sha256, expected);
});

test("inherited leave getters never run on internal traversal entries", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "leave");
  let invoked = 0, serialized = 0;
  const hook = { type: "string", toJSON() { serialized++; return { type: "string" }; } };
  for (const value of [{ type: "string" }, hook, { type: "object", properties: { child: hook } }]) {
    const safe = value.type === "string" && value !== hook;
    const expected = safe ? hash(value) : undefined, failure = error(marker);
    let pending, calls = 0;
    try {
      Object.defineProperty(Object.prototype, "leave", { configurable: true, get() { invoked++; return true; } });
      pending = capture(request(value), async () => { calls++; throw failure; });
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, "leave", descriptor);
      else delete Object.prototype.leave;
    }
    await assert.rejects(pending, thrown => thrown === failure);
    assert.equal(calls, 1);
    assert.equal(invoked, 0); assert.equal(serialized, 0);
    if (safe) assert.equal(diagnostic(failure).schema.sha256, expected);
    else assert.equal(diagnostic(failure).schema, undefined);
  }
});
test("truthy inherited leave cannot skip validation or enable schema serialization hooks", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "leave");
  let serialized = 0;
  const hook = { type: "string", toJSON() { serialized++; return { type: "string" }; } };
  const cyclic = { type: "object" }; cyclic.properties = { self: cyclic };
  for (const value of [hook, { type: "object", properties: { child: hook } }, cyclic, { type: "array", enum: new Array(100_000) }]) {
    const failure = error(marker);
    let pending, calls = 0;
    try {
      Object.defineProperty(Object.prototype, "leave", { configurable: true, writable: true, value: true });
      pending = capture(request(value), async () => { calls++; throw failure; });
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, "leave", descriptor);
      else delete Object.prototype.leave;
    }
    await assert.rejects(pending, thrown => thrown === failure);
    assert.equal(calls, 1); assert.equal(serialized, 0);
    assert.equal(diagnostic(failure).schema, undefined);
  }
});
