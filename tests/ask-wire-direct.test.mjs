import test from "node:test";
import assert from "node:assert/strict";
import {createDirectSemanticAskWirePlan, DIRECT_ASK_FORMAT_VERSION} from "../app/lib/intelligence/ask-wire-direct.mjs";
const mockWire={
 encode(value) { if (value.request?.version!=="ask-request.v2" || typeof value.request?.question!=="string" || !Object.keys(value.request).every(k=>["version","question","mode"].includes(k)))throw Error("ASK_WIRE_CANONICAL_SCHEMA");return{graph:"server-owned",value}; },
 decode(encoded){if(encoded.graph!=="server-owned")throw Error("ASK_WIRE_INVALID_EDGE");return encoded.value;}
};
const required=["mode","version","question","requirements","readTicket","appendJob","writeJob","scope","petNames","selection","evidenceBasis"];
const policy=["Return canonical semantic proposal in lossless wire format. nodes: supporting postorder tree;", "ROOT root.F references the request node.", "FIELDS a=operation F=request", "TAGS", "POLICY", "Semantic contract policy. ".repeat(100)].join("\n");
const plan=()=>createDirectSemanticAskWirePlan(mockWire,policy,required,()=>{});
test("model never creates graph indices, while the server builds and decodes its canonical graph",()=>{
 const p=plan(),canonical={request:{version:"ask-request.v2",question:"Which saved measurement is earliest?",mode:"read"}};
 const generated=p.encode(canonical,()=>{});
 assert.equal(generated.format,DIRECT_ASK_FORMAT_VERSION);
 assert.deepEqual(Object.keys(generated).sort(),["format","requestJson"]);
 assert.ok(!p.instructions.includes("nodes[]"));
 assert.deepEqual(p.decode(JSON.parse(JSON.stringify(generated)),()=>{}),canonical);
 assert.ok(p.instructions.includes("readTicket"));
});
test("unknown envelope and invalid semantic bodies never receive authority",()=>{
 const p=plan();
 for(const bad of [
 {format:"unknown",requestJson:'{"version":"ask-request.v2"}'},
 {format:DIRECT_ASK_FORMAT_VERSION,requestJson:'{"version":"ask-request.v2","question":"x","unknown":true}'},
 {format:DIRECT_ASK_FORMAT_VERSION,requestJson:'[]'},
 {format:DIRECT_ASK_FORMAT_VERSION,requestJson:'{"question":"x"'},
 {format:DIRECT_ASK_FORMAT_VERSION,requestJson:'{"version":"ask-request.v2","question":"x"}',other:"attack"}
 ])assert.throws(()=>p.decode(bad,()=>{}));
});
test("provider string containing reference-shaped text remains untrusted data",()=>{
 const p=plan(); const request={request:{version:"ask-request.v2",question:'Literal {"@":500} quoted by owner'}};
 assert.deepEqual(p.decode(p.encode(request,()=>{}),()=>{}),request);
});
