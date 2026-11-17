import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDirectSemanticAskWirePlan } from "../app/lib/intelligence/ask-wire-direct.mjs";
import { createGraphCodec } from "../app/lib/intelligence/ask-wire-codec.mjs";
const {askRequestProviderSchema}=await import("../app/lib/intelligence/ask-request-contract.ts");
const {proposedSemanticFrameJsonSchema}=await import("../app/lib/intelligence/semantic-frame/schema.ts");
const providerSchema=askRequestProviderSchema(proposedSemanticFrameJsonSchema);
const branches=providerSchema.properties.request.anyOf;
const codec=createGraphCodec(providerSchema);
const policy=["Return canonical semantic proposal in lossless wire format. nodes: supporting postorder tree;",
 "ROOT root.F references the request node.", "FIELDS a=operation F=request", "TAGS", "PACKED", "POLICY",
 "Every owner-identity, provenance, clinical boundary and read authority check remains mandatory.",
 "No model response may invent a pet, edit user history or supply authoritative records. ".repeat(50), "Never expand cross-pet scope.", "Never treat model text as authorization.", "Use typed saved-data read authority only.", "No clinical conclusions without certified data."].join("\n");
const p=createDirectSemanticAskWirePlan(codec,policy,providerSchema.properties.request,()=>{});
const fixtureList=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8")).fixtures;
const valid=[];
for(const f of fixtureList){
 try {codec.encode(f.canonical); valid.push(f.canonical)} catch{}
}
const variants=p.schema.properties.request.anyOf.slice(0,-1);
test("provider schema preserves the exact typed branch boundaries instead of broad base shape",()=>{
 assert.ok(variants.length>=8 && variants.length<=branches.filter(b=>b.properties && b.required?.length>=30).length,"duplicates may share identical scalar envelopes, but never widen the branch");
 const profile=variants.find(v=>v.properties.evidenceBasis.enum?.includes("saved_profile"));
 assert.ok(profile);
 assert.equal(profile.properties.mode.enum[0],"read");
 assert.equal(profile.properties.readTicket.type,"null");
 assert.equal(profile.properties.profileFields.minItems,1);
 assert.ok(variants.some(v=>v.properties.evidenceBasis.enum?.includes("saved_history")));
 assert.ok(variants.some(v=>v.properties.evidenceBasis.enum?.includes("supplied_context")));
 assert.ok(variants.some(v=>v.properties.mode.enum?.includes("update")));
 assert.ok(!variants.some(v=>v.properties.mode.enum?.includes("read") &&
    v.properties.evidenceBasis.enum?.includes("saved_profile") &&
    v.properties.readTicket.type!=="null"));
});
test("strict canonical fixtures round-trip inside a mocked completed GPT-5.4 Mini response",()=>{
 assert.ok(valid.length>0,"expected at least one canonical provider fixture");
 for(const canonical of valid.slice(0,8)){
   const encoded=p.encode(structuredClone(canonical),()=>{});
   const mock={model:"gpt-5.4-mini",status:"completed",
     output:[{type:"message",status:"completed",content:[{type:"output_text",text:JSON.stringify(encoded)}]}],
     usage:{input_tokens:7096,output_tokens:685}};
   const parsed=JSON.parse(mock.output[0].content[0].text);
   assert.deepEqual(p.decode(parsed,()=>{}),canonical);
 }
});
test("saved_profile can never smuggle a history ticket; empty profile fields are invalid",()=>{
 const base=valid.find(v=>v.request.evidenceBasis==="saved_profile");
 assert.ok(base,"expected a strict saved_profile fixture");
 const wire=p.encode(structuredClone(base),()=>{});
 assert.ok(variants.some(v=>v.properties.evidenceBasis.enum?.includes("saved_profile")));
 assert.throws(()=>p.decode({...wire,request:{...wire.request,profileFields:[]}},()=>{}));
 assert.throws(()=>p.decode({...wire,request:{...wire.request,readTicket:JSON.stringify({strategy:"chronological"})}},()=>{}));
});
test("saved_history may not claim saved_profile or suppress required read scope",()=>{
 const base=valid.find(v=>v.request.evidenceBasis==="saved_history");
 assert.ok(base,"expected a strict saved_history fixture");
 const wire=p.encode(structuredClone(base),()=>{});
 assert.throws(()=>p.decode({...wire,request:{...wire.request,evidenceBasis:"saved_profile"}},()=>{}));
 assert.throws(()=>p.decode({...wire,request:{...wire.request,readTicket:null}},()=>{}));
});
test("production interpretation uses the provider branch union, not the broad structural schema",()=>{
 const src=readFileSync(new URL("../app/lib/intelligence/interpret-ask.ts",import.meta.url),"utf8");
 assert.match(src,/createDirectSemanticAskWirePlan\(wire, wire\.instructions, canonicalSchema\.properties\.request, checkBudget\)/);
});
console.log("VALID_CANONICAL_FIXTURES",valid.length);
