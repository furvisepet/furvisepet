import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {createDirectSemanticAskWirePlan, DIRECT_ASK_FORMAT_VERSION} from "../app/lib/intelligence/ask-wire-direct.mjs";
const {askRequestSchema} = await import("../app/lib/intelligence/ask-request-contract.ts");
const {proposedSemanticFrameJsonSchema} = await import("../app/lib/intelligence/semantic-frame/schema.ts");
const schema=askRequestSchema(proposedSemanticFrameJsonSchema);
const fixtures=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8")).fixtures;
let encodeCalls=0,decodeCalls=0;
const mockWire={
 encode(value) {
   encodeCalls++;
   if (!value || !value.request || !["ask-request.v2","ask-catalog-intent.v1"].includes(value.request.version))
     throw Error("ASK_WIRE_CANONICAL_SCHEMA");
   if(value.request.version==="ask-request.v2" &&
      (Object.keys(value.request).length!==schema.required.length ||
       schema.required.some(k=>!Object.hasOwn(value.request,k)) ||
       value.request.readTicket!==null && (typeof value.request.readTicket!=="object" || Array.isArray(value.request.readTicket))))
     throw Error("ASK_WIRE_CANONICAL_SCHEMA");
   return {verifiedServerGraph:true,canonical:structuredClone(value)};
 },
 decode(graph) {
   decodeCalls++;
   if(graph.verifiedServerGraph!==true)throw Error("ASK_WIRE_INVALID_EDGE");
   return graph.canonical;
 }
};
const policy=["Return canonical semantic proposal in lossless wire format. nodes: supporting postorder tree;",
 "ROOT root.F references the request node.", "FIELDS a=operation F=request", "TAGS", "PACKED", "POLICY",
 "Semantic context and ownership remain mandatory.", "Read-only plans cannot write.", "The original semantic source contract and all ownership rules remain mandatory. ".repeat(50)].join("\n");
const plan=()=>createDirectSemanticAskWirePlan(mockWire,policy,schema,()=>{});
test("schema forces every required semantic field; scalars are typed and complex values are JSON",()=>{
 const p=plan(),branch=p.schema.properties.request.anyOf[0];
 assert.equal(p.schema.type,"object");
 assert.deepEqual(p.schema.required,["format","request"]);
 assert.equal(branch.required.length,schema.required.length);
 assert.deepEqual([...branch.required].sort(),[...Object.keys(branch.properties)].sort());
 assert.equal(branch.additionalProperties,false);
 assert.equal(branch.properties.question.type,"string");
 assert.equal(branch.properties.mode.enum.includes("read"),true);
 assert.equal(branch.properties.petNames.type,"array");
 assert.ok(branch.properties.readTicket.type.includes("null"));
 for(const field of ["task","storedRead","recordSelection","evidenceNeeds"])
   assert.deepEqual(branch.properties[field],schema.properties[field]);
 assert.equal(p.schema.properties.request.anyOf[1].required[0],"catalogIntentJson");
 assert.ok(!p.instructions.includes("TAGS\n"));
});
test("each existing semantic fixture roundtrips through server-owned graph, never model refs",()=>{
 const p=plan();let passes=0;
 for(const f of fixtures){
   if(!f.canonical?.request || f.canonical.request.version!=="ask-request.v2")continue;
   const canonical=structuredClone(f.canonical);
   const result=p.encode(canonical,()=>{});
   assert.deepEqual(Object.keys(result),["format","request"]);
   assert.equal(result.format,DIRECT_ASK_FORMAT_VERSION);
   assert.equal(result.request.version,"ask-request.v2");
   assert.equal(typeof result.request.question,"string");
   for(const field of ["task","storedRead","recordSelection","evidenceNeeds"])
     assert.deepEqual(result.request[field],canonical.request[field]);
   if(canonical.request.readTicket!==null) assert.equal(typeof result.request.readTicket,"string");
   assert.deepEqual(p.decode(JSON.parse(JSON.stringify(result)),()=>{}),canonical);
   assert.ok(!Object.hasOwn(result.request,"nodes"));
   passes++;
 }
 assert.ok(passes>200,"fixture coverage");
 assert.ok(encodeCalls>200 && decodeCalls>200);
});
test("malformed, truncated, unexpected or bypass variants are rejected before authority",()=>{
 const p=plan(),good=p.encode(structuredClone(fixtures[0].canonical),()=>{});
 const bads=[
 {format:"wrong",request:good.request},
 {...good,other:"x"},
 {...good,request:{...good.request,readTicket:"{broken"}},
 {...good,request:{...good.request,question:42}},
 {...good,request:{...good.request,task:"{broken"}},
 {...good,request:{...good.request,storedRead:"null"}},
 {...good,request:{...good.request,recordSelection:"{}"}},
 {...good,request:{...good.request,evidenceNeeds:"[]"}},
 {...good,request:{...good.request,extra:"unreviewed"}},
 {...good,request:{...good.request,readTicket:"[]"}},
 {...good,request:{catalogIntentJson:JSON.stringify(good.request)}},
 {...good,request:{"requestJson":JSON.stringify(good.request)}},
 ];
 const missing=structuredClone(good);delete missing.request.scope;bads.push(missing);
 for(const value of bads)assert.throws(()=>p.decode(value,()=>{}));
});
test("catalog envelope stays isolated and subject to original codec",()=>{
 const p=plan(),catalog={request:{version:"ask-catalog-intent.v1",purpose:"receipt",sourceTurnId:"u1"}};
 const wire=p.encode(catalog,()=>{});
 assert.deepEqual(Object.keys(wire.request),["catalogIntentJson"]);
 assert.deepEqual(p.decode(wire,()=>{}),catalog);
 assert.throws(()=>p.decode({format:DIRECT_ASK_FORMAT_VERSION,
   request:{catalogIntentJson:JSON.stringify({version:"ask-request.v2",mode:"read"})}},()=>{}));
});
test("literal malicious reference text remains data and cannot become a graph edge",()=>{
 const p=plan(),canonical=structuredClone(fixtures[0].canonical);
 canonical.request.question='Literal {"@":999} from user, do not follow';
 assert.deepEqual(p.decode(p.encode(canonical,()=>{}),()=>{}),canonical);
});

test("provider-valid string may contain malformed nested JSON but never reaches canonical authority",async()=>{
 const {makeValidator}=await import("../app/lib/intelligence/ask-wire-codec.mjs");
 const p=plan(),good=p.encode(structuredClone(fixtures[0].canonical),()=>{});
 const bad=structuredClone(good);bad.request.readTicket="{broken";
 const valid=makeValidator(p.schema);
 assert.equal(valid(p.schema,bad),true);
 const before=encodeCalls;
 assert.throws(()=>p.decode(bad,()=>{}),e=>e.message==="ASK_DIRECT_FIELD_JSON"&&e.cause?.field==="readTicket");
 assert.equal(encodeCalls,before);
});
