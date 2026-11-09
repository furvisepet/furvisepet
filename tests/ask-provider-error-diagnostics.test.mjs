import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { safeAskProviderErrorDiagnostic as diagnostic } from "../app/lib/ai/ask-provider-error-diagnostic.ts";

const requestId = "req_0123456789abcdef0123456789abcdef";
const safe = { status: 400, code: "invalid_json_schema", type: "invalid_request_error", param: "text.format.schema", requestId };
const marker = "PRIVATE owner@example.invalid Cedar weighs 9.4kg";
const credential = "sk-proj-OFFLINE_CREDENTIAL_DO_NOT_LOG";
const error = () => new OpenAI.BadRequestError(400,
  { code: safe.code, type: safe.type, param: safe.param, message: marker + credential },
  marker, new Headers({ "x-request-id": requestId, authorization: credential, "set-cookie": marker }));

test("actual SDK errors retain exactly the bounded provider fields", () => {
  const e = error();
  e.prompt = marker; e.body = { input: marker }; e.cause = { apiKey: credential }; e.stack = marker;
  assert.deepEqual(diagnostic(e), safe);
  assert.deepEqual(Object.keys(diagnostic(e)).sort(), ["code", "param", "requestId", "status", "type"]);
  assert.ok(JSON.stringify(diagnostic(e)).length < 400);
  assert.equal(e.error.message, marker + credential);
});
test("nested payload fields and own request ID aliases are supported without traversing causes or headers", () => {
  assert.deepEqual(diagnostic({ status: 400, error: { code: safe.code, type: safe.type, param: safe.param }, request_id: requestId }), safe);
  assert.equal(diagnostic({ headers: new Headers({ "x-request-id": requestId }) }).requestId, null);
  assert.equal(diagnostic({ cause: error() }).code, null);
});
test("every diagnostic string rejects credentials, prompts, personal data and oversized values", () => {
  for (const value of [marker, credential, "owner@example.invalid", "Cedar", "555-123-4567",
    "invalid_json_schema\n" + credential, "text.format.schema." + marker, requestId + marker,
    "req_" + "Cedar".repeat(7), "x".repeat(1_000_000), {}, [], 123, true]) {
    const result = diagnostic({ status: value, code: value, type: value, param: value, requestID: value });
    assert.equal(result.status, null); assert.equal(result.code, "other");
    assert.equal(result.type, "other"); assert.equal(result.param, "other"); assert.equal(result.requestId, null);
    assert.ok(JSON.stringify(result).length < 150);
  }
  for (const value of [NaN, Infinity, -1, 200, 600, 400.5, "400"]) assert.equal(diagnostic({ status: value }).status, null);
});
test("projection does not execute getters, coercion, serialization or walk cyclic graphs", () => {
  let invoked = 0;
  const value = { toJSON() { invoked++; throw Error(marker); }, toString() { invoked++; throw Error(marker); } };
  const e = { status: 400, code: value, type: value, param: value, requestID: value };
  e.error = e; e.cause = e;
  for (const key of ["message", "stack", "headers", "prompt"]) Object.defineProperty(e, key, { get() { invoked++; throw Error(marker); } });
  assert.doesNotThrow(() => JSON.stringify(diagnostic(e)));
  const getters = {};
  for (const key of ["status", "code", "type", "param", "requestID", "request_id", "requestId", "_request_id", "error", "name"])
    Object.defineProperty(getters, key, { get() { invoked++; throw Error(marker); } });
  assert.deepEqual(diagnostic(getters), { status: null, code: null, type: null, param: null, requestId: null });
  assert.doesNotThrow(() => diagnostic(new Proxy({}, { getOwnPropertyDescriptor() { throw Error(marker); } })));
  assert.equal(invoked, 0);
  assert.equal(diagnostic(Object.create({ code: safe.code, requestID: requestId })).code, null);
});
for(const failedCall of [1,2])test("actual read-only Ask route logs safe diagnostics and releases credit on SDK call "+failedCall,async t=>{
 const {readOnlyFailureRouteFixture}=await import("./helpers/ask-read-only-failure-route.mjs");
 const logs=[];let calls=0,wireSchemaHash;
 t.mock.method(console,"info",(...args)=>logs.push(args));
 t.mock.method(console,"warn",(...args)=>logs.push(args));
 t.mock.method(console,"error",(...args)=>logs.push(args));
 const param=failedCall===1?"tools":"text.format.schema";
 const nativeClient={responses:{create:async request=>{
  calls++;
  if(calls===failedCall){
   wireSchemaHash=createHash("sha256").update(JSON.stringify(failedCall===1?request.tools:request.text.format.schema)).digest("hex");
   throw new OpenAI.BadRequestError(400,{code:safe.code,type:safe.type,param,message:marker+credential},marker,new Headers({"x-request-id":requestId}));
  }
  return {status:"completed",output:[{type:"function_call",call_id:"read-one",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0,order:"desc"})}],usage:{input_tokens:8,output_tokens:2}};
 }}};
 const f=readOnlyFailureRouteFixture(null,undefined,{nativeClient,realProviderLog:true});
 const response=await f.send(),body=await response.json();
 assert.equal(response.status,503);assert.equal(calls,failedCall);assert.equal(f.state.calls,failedCall);assert.equal(f.state.reads,failedCall-1);
 const event=logs.find(x=>x[0]==="[Ask provider] stage failed")?.[1];
 assert.deepEqual(event.providerError,{...safe,param});
 assert.equal(event.providerErrorCode,"invalid_json_schema");assert.equal(event.providerStatus,400);
 assert.ok(!JSON.stringify(body).includes(wireSchemaHash));
 for(const value of [marker,credential])assert.ok(!JSON.stringify({logs,body,errors:f.state.errors}).includes(value));
 assert.ok(!JSON.stringify(body).includes(requestId));assert.ok(!JSON.stringify(body).includes("invalid_json_schema"));
 assert.deepEqual([...new Set(f.state.tables)],["dog_profiles"]);
 assert.deepEqual(f.state.credit,{status:"released",disposition:"release"});
 assert.equal(f.state.traces.at(-1).providerCallCount,failedCall);
});

test("generation diagnostics preserve request-rate-limit classification without exposing arbitrary types", async () => {
  const { readFileSync } = await import("node:fs");
  const ts = await import("typescript");
  const vm = await import("node:vm");
  const source = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("ask-reasoning.ts", source, ts.ScriptTarget.Latest, true);
  const code = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === "providerDiagnostics").map(n => n.getText(ast)).join("\n");
  const project = vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\nproviderDiagnostics",
    { safeAskProviderErrorDiagnostic: diagnostic, Headers, Error });
  for (const type of ["requests", "requests_per_minute", "Private account requests " + marker]) {
    const result = project({ status: 429, type, code: "rate_limit_exceeded", param: "model", requestID: requestId,
      headers: { "retry-after": "2", authorization: credential } });
    assert.equal(result.providerStatus, 429); assert.equal(result.providerErrorType, "requests");
    assert.equal(result.providerErrorCode, "rate_limit_exceeded"); assert.equal(result.retryAfterMs, 2000);
    assert.ok(!JSON.stringify(result).includes(marker)); assert.ok(!JSON.stringify(result).includes(credential));
  }
  const timeout = project({ name: "APIConnectionTimeoutError", code: "ABORT_ERR" });
  assert.equal(timeout.timedOut, true); assert.equal(timeout.providerErrorCode, "ABORT_ERR");
});
test("generation failed-response diagnostics exclude raw provider messages and arbitrary error enums", async () => {
  const { readFileSync } = await import("node:fs");
  const ts = await import("typescript");
  const vm = await import("node:vm");
  const { interpretStructuredProviderResponse } = await import("../app/lib/ai/ask-provider.ts");
  const { AskPipelineError } = await import("../app/lib/ai/ask-reasoning.ts");
  const { AiAdmissionError } = await import("../app/lib/ai/usage-guard/errors.ts");
  const source = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("ask-reasoning.ts", source, ts.ScriptTarget.Latest, true);
  const code = ast.statements.filter(n => ts.isFunctionDeclaration(n) && ["runProviderRequest", "providerDiagnostics", "supportsReasoningEffort"].includes(n.name?.text)).map(n => n.getText(ast)).join("\n");
  let calls = 0; const events = [];
  const run = vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + "\nrunProviderRequest",
    { safeAskProviderErrorDiagnostic: diagnostic, Headers, Error, Date, AskPipelineError, AiAdmissionError, interpretStructuredProviderResponse,
      createWithTimeout: async () => { calls++;
        const response = { status: "failed", error: { code: marker, type: credential, param: marker, message: marker + credential },
          incomplete_details: { reason: marker }, output_text: marker };
        Object.defineProperty(response, "_request_id", { value: requestId, enumerable: false });
        return response;
      } });
  await assert.rejects(run({ client: {}, model: "offline", onEvent: e => events.push(e), parseOutput: () => assert.fail("failed provider response cannot parse"),
    request: { max_output_tokens: 8192 }, stage: "primary", timeoutMs: 1000 }), e => {
    assert.equal(e.stage, "primary_invalid_output"); assert.equal(e.diagnostics.providerErrorCode, "other");
    assert.ok(!e.message.includes(marker)); assert.ok(!JSON.stringify(e).includes(marker));
    assert.equal(e.diagnostics.parsingAttempted, false);
    assert.equal(e.diagnostics.providerError.requestId, requestId); return true;
  });
  assert.equal(calls, 1); assert.equal(events.length, 1);
  assert.equal(events[0].providerError.requestId, requestId);
  for (const value of [marker, credential]) assert.ok(!JSON.stringify(events).includes(value));
});

test("non-enumerable failed-response request IDs use the same strict own-data validation", () => {
  const response = { status: "failed", error: { code: "server_error", message: marker } };
  Object.defineProperty(response, "_request_id", { value: requestId, enumerable: false });
  assert.equal(Object.keys(response).includes("_request_id"), false);
  assert.equal(diagnostic(response).requestId, requestId);
  assert.equal(diagnostic(response).code, "server_error");
  assert.equal(diagnostic(Object.create(response)).requestId, null);
  for (const value of [marker, credential, requestId + marker, "req_" + "a".repeat(33), 123, {}]) {
    const invalid = Object.defineProperty({ status: "failed" }, "_request_id", { value, enumerable: false });
    assert.equal(diagnostic(invalid).requestId, null);
  }
  const preferred = { requestID: "req_abcdef0123456789abcdef0123456789", _request_id: requestId };
  assert.equal(diagnostic(preferred).requestId, preferred.requestID);
});
