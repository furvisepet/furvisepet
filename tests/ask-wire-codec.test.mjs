import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { createGraphCodec } from "../app/lib/intelligence/ask-wire-codec.mjs";
import { createAskWirePlan } from "../app/lib/intelligence/ask-wire-policy.mjs";
import { POLICY_BUNDLE } from "../app/lib/intelligence/ask-wire-policy.generated.mjs";
registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export {}",shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error("OFFLINE_WIRE_CONTRACT");};
const {ASK_REQUEST_INSTRUCTIONS,askRequestProviderSchema}=await import("../app/lib/intelligence/ask-request-contract.ts");
const {proposedSemanticFrameJsonSchema}=await import("../app/lib/intelligence/semantic-frame/schema.ts");
const corpus=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8"));
const audit=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-policy-audit.json",import.meta.url),"utf8"));
const sha=s=>createHash("sha256").update(s,"utf8").digest("hex");
const plans=new Map();
function plan(name){
 if(!plans.has(name)){
  const schema=askRequestProviderSchema(proposedSemanticFrameJsonSchema,corpus.contexts[name]);
  plans.set(name,{schema,...createAskWirePlan(schema,ASK_REQUEST_INSTRUCTIONS)});
 }
 return plans.get(name);
}
test("wire policy retains every source section, reviewed clause and annotation disposition",()=>{
 const sections=ASK_REQUEST_INSTRUCTIONS.split("\n");
 assert.equal(sections.length,64);
 assert.deepEqual(POLICY_BUNDLE.sourceHashes,sections.map(sha));
 assert.deepEqual(audit.compactedPolicy.flatMap(r=>r.ids).sort((a,b)=>a-b),sections.map((_,i)=>i));
 for(const r of audit.compactedPolicy)assert.deepEqual(r.sourceHashes,r.ids.map(i=>sha(sections[i])));
 assert.deepEqual(POLICY_BUNDLE.rules,audit.compactedPolicy.map(r=>r.rule));
 assert.equal(audit.clauseReview.clauses.length,205);
 for(const c of audit.clauseReview.clauses){
  assert.ok(audit.sourcePolicy[c.rule].rule.includes(c.before));
  assert.equal(sha(c.before),c.beforeSha256);assert.equal(sha(c.after),c.afterSha256);
  if(c.emissionDisposition){
   assert.ok(audit.priorCompactedPolicy[c.targetRule].rule.includes(c.targetExcerpt));
   assert.equal(sha(c.targetExcerpt),c.targetSha256);
  }else assert.ok(audit.priorCompactedPolicy[c.rule].rule.includes(c.after));
 }
 const counts={};
 for(const r of audit.annotationDispositions.dispositions){
  assert.equal(sha(r.sourceText),r.sourceSha256);
  assert.ok(audit.priorCompactedPolicy[r.targetRule].rule.includes(r.evidenceExcerpt));
  counts[r.disposition]=(counts[r.disposition]??0)+1;
  if(r.targetRule>=29)assert.equal(POLICY_BUNDLE.rules[r.targetRule],r.sourceText);
 }
 assert.deepEqual(counts,{truly_missing_rule:17,structurally_covered_duplicate:38,schema_only_description:2});
 const review=audit.readablePolicyReview;
 assert.deepEqual(POLICY_BUNDLE.rules,review.compiledPolicy.rules);
 assert.equal(POLICY_BUNDLE.header,review.compiledPolicy.header);
 assert.equal(POLICY_BUNDLE.packedHeader,review.compiledPolicy.packedHeader);
 assert.deepEqual(audit.priorCompactedPolicy.map(r=>sha(r.rule)),review.priorCompiledRuleHashes);
 assert.equal(review.clauseMapping.clauses.length,447);
 for(const c of review.clauseMapping.clauses){
  assert.equal(sha(c.sourceText),c.sourceSha256);
  assert.ok(audit.priorCompactedPolicy[c.sourceRule].rule.includes(c.sourceText));
  assert.ok(c.candidateRules.length&&c.candidateRules.every(i=>typeof POLICY_BUNDLE.rules[i]==="string"));
 }
 for(let i=29;i<=47;i++)assert.equal(POLICY_BUNDLE.rules[i],audit.priorCompactedPolicy[i].rule);
 for(const c of review.authorityRelocation.wrapper_clauses){
  assert.ok(review.authoritySources[c.source_key].includes(c.source_sentence));
  assert.ok(POLICY_BUNDLE.rules[c.target_rule].includes(c.target_excerpt));
 }
 assert.throws(()=>createAskWirePlan(plan("no_context").schema,ASK_REQUEST_INSTRUCTIONS,{...review.authoritySources,inputAuthority:"changed"}),/AUTHORITY_SOURCE_DRIFT/);

 for(const name of Object.keys(corpus.contexts).concat("no_context")){
  const p=plan(name),[header,body]=p.instructions.split("\nPOLICY\n");
  const fields=new Map(header.split("\nFIELDS ")[1].split("\n")[0].split(" ").map(s=>s.split("=")));
  assert.equal(body.replace(/\$([A-Za-z]+)/g,(_,a)=>fields.get(a)),POLICY_BUNDLE.rules.join("\n"));
  for(const r of audit.sourcePolicy.slice(29,48))assert.ok(body.replace(/\$([A-Za-z]+)/g,(_,a)=>fields.get(a)).includes(r.rule));
 }
 assert.throws(()=>createAskWirePlan(plan("no_context").schema,ASK_REQUEST_INSTRUCTIONS+"\nchanged"),/SOURCE_DRIFT/);
 const schema=askRequestProviderSchema(proposedSemanticFrameJsonSchema);
 schema.description="Unreviewed annotation";
 assert.throws(()=>createAskWirePlan(schema,ASK_REQUEST_INSTRUCTIONS),/UNDISPOSITIONED_ANNOTATION/);
});
test("all prepared canonical families match independently generated Python wire vectors",()=>{
 assert.equal(corpus.fixtures.length,262);
 for(const f of corpus.fixtures){
  const p=plan(f.context),wire=p.encode(f.canonical);
  assert.deepEqual(wire,{root:f.wire.nodes.at(-1),nodes:f.wire.nodes.slice(0,-1)},f.context);
  assert.deepEqual(p.decode(JSON.parse(JSON.stringify(wire))),f.canonical,f.context);
 }
});
test("malformed graphs, unknown tags, collisions and noncanonical references fail closed",()=>{
 for(const name of Object.keys(corpus.contexts)){
  const p=plan(name),w=p.encode(corpus.fixtures.find(f=>f.context===name).canonical);
  for(const bad of [null,[],{}, {nodes:[]},{nodes:[{}]},{nodes:[{_:"UNKNOWN_TAG"}]},{...w,extra:null}])
   assert.throws(()=>p.decode(bad));
  const unreachable=structuredClone(w);unreachable.nodes.push(structuredClone(w.nodes.at(-1)));assert.throws(()=>p.decode(unreachable));
  let packed=false,reference=false;
  for(let i=0;i<w.nodes.length;i++){
   const n=w.nodes[i];
   for(const k of Object.keys(n)){
    if(!packed&&k.includes("~")){
     packed=true;const [field,tag]=k.split("~");
     for(const replacement of [field+"~UNKNOWN_TAG","UNKNOWN_FIELD~"+tag,k+"~extra"]){
      const bad=structuredClone(w);const v=bad.nodes[i][k];delete bad.nodes[i][k];bad.nodes[i][replacement]=v;
      assert.throws(()=>p.decode(bad));
     }
     for(const collision of ["_",field]){const bad=structuredClone(w);bad.nodes[i][collision]=tag;assert.throws(()=>p.decode(bad));}
    }
    const v=n[k];
    if(!reference&&v&&typeof v==="object"&&!Array.isArray(v)&&Object.hasOwn(v,"@")){
     reference=true;
     for(const index of [-1,0.5,true,i,w.nodes.length]){const bad=structuredClone(w);bad.nodes[i][k]={"@":index};assert.throws(()=>p.decode(bad));}
    }
   }
  }
  assert.ok(packed&&reference);
 }
});
test("data stays opaque while ECMAScript schema patterns remain authoritative",()=>{
 const schema={type:"object",additionalProperties:false,required:["payload","digits","fixed"],properties:{
  payload:{type:"string",maxLength:4000},digits:{type:"string",pattern:"^\\d+$"},fixed:{type:"string",enum:["constant"]}
 }};
 const g=createGraphCodec(schema);
 for(const payload of ["never recorded; SAVE 9; 7+8","__proto__","constructor","@0 _ UNKNOWN_TAG","😺","a\u0000b","\ud83d","\ude3a"]){
  const value={payload,digits:"9",fixed:"constant"};assert.deepEqual(g.decode(JSON.parse(JSON.stringify(g.encode(value)))),value);
 }
 assert.throws(()=>g.encode({payload:"unchanged",digits:"٩",fixed:"constant"}),/CANONICAL_SCHEMA/);
});
