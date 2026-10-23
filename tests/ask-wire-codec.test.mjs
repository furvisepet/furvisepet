import {retainedStressCodec,assertRetainedRoundTrip,assertArchivedExactOrRejected} from './helpers/retained-codec-domain.mjs';
import test from "node:test";
import {verifyCurrentPolicy} from "./helpers/producer-policy-review.mjs";
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
const currentReview=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-policy-current-review.json",import.meta.url),"utf8"));
const historicalRules=audit.readablePolicyReview.compiledPolicy.rules;

const plans=new Map();
function plan(name){
 if(!plans.has(name)){
  const schema=askRequestProviderSchema(proposedSemanticFrameJsonSchema,corpus.contexts[name]);
  plans.set(name,{schema,...createAskWirePlan(schema,ASK_REQUEST_INSTRUCTIONS)});
 }
 return plans.get(name);
}
test("wire policy retains every source section, reviewed clause and annotation disposition",()=>{
 const current=JSON.parse(readFileSync(new URL('./fixtures/ask-producer-contract-current.json',import.meta.url),'utf8'));
 verifyCurrentPolicy(POLICY_BUNDLE,ASK_REQUEST_INSTRUCTIONS,current);
 assert.equal(sha(readFileSync(new URL('./fixtures/ask-wire-policy-audit.json',import.meta.url),'utf8')),currentReview.historicalAuditSHA256);
 assert.equal(current.historicalAuditSHA256,currentReview.historicalAuditSHA256);
 assert.equal(sha(readFileSync(new URL('./fixtures/ask-wire-policy-current-review.json',import.meta.url),'utf8')),current.historicalReviewSHA256);
 // Historical source and compiled reviews remain immutable evidence. They are
 // not claimed to be current source coordinates or current runtime file pins.
 assert.deepEqual(currentReview.ruleChanges.map(row=>row.id),[3,18,35,39,42]);
 assert.deepEqual(currentReview.sourceMetadataDifferences.map(row=>row.id),[33,50]);
 for(const row of currentReview.ruleChanges){
  assert.equal(historicalRules[row.id],row.before);assert.equal(sha(row.before),row.beforeSHA256);assert.equal(sha(row.after),row.afterSHA256);
 }
 for(const row of currentReview.sourceMetadataDifferences)assert.equal(sha(row.currentSource),row.currentSourceSHA256);
 for(const[path,expected]of Object.entries(current.sourcePins))assert.equal(sha(readFileSync(new URL('../'+path,import.meta.url),'utf8')),expected,path);
 assert.deepEqual(Object.keys(current.sourcePins),Object.keys(currentReview.sourcePins));
 const delta=new Map(current.ruleDeltaReview.map(row=>[row.id,row]));
 assert.equal(delta.size,current.ruleDeltaReview.length);
 for(let i=0;i<POLICY_BUNDLE.rules.length;i++){
  const row=delta.get(i);
  if(row){assert.equal(row.before,historicalRules[i]??null);assert.equal(row.after,POLICY_BUNDLE.rules[i]);assert.ok(row.reason);}
  else assert.equal(POLICY_BUNDLE.rules[i],historicalRules[i]);
 }
 assert.equal(audit.clauseReview.clauses.length,205);
 for(const c of audit.clauseReview.clauses){
  assert.ok(audit.sourcePolicy[c.rule].rule.includes(c.before));
  assert.equal(sha(c.before),c.beforeSha256);assert.equal(sha(c.after),c.afterSha256);
  if(c.emissionDisposition){
   assert.ok(audit.priorCompactedPolicy[c.targetRule].rule.includes(c.targetExcerpt));assert.equal(sha(c.targetExcerpt),c.targetSha256);
  }else assert.ok(audit.priorCompactedPolicy[c.rule].rule.includes(c.after));
 }
 const counts={};
 for(const r of audit.annotationDispositions.dispositions){
  assert.equal(sha(r.sourceText),r.sourceSha256);assert.ok(audit.priorCompactedPolicy[r.targetRule].rule.includes(r.evidenceExcerpt));
  counts[r.disposition]=(counts[r.disposition]??0)+1;if(r.targetRule>=29)assert.equal(historicalRules[r.targetRule],r.sourceText);
 }
 assert.deepEqual(counts,{truly_missing_rule:17,structurally_covered_duplicate:38,schema_only_description:2});
 const review=audit.readablePolicyReview;
 assert.deepEqual(historicalRules,audit.compactedPolicy.map(r=>r.rule));
 assert.equal(POLICY_BUNDLE.header,review.compiledPolicy.header);assert.equal(POLICY_BUNDLE.packedHeader,review.compiledPolicy.packedHeader);
 assert.deepEqual(audit.priorCompactedPolicy.map(r=>sha(r.rule)),review.priorCompiledRuleHashes);
 assert.equal(review.clauseMapping.clauses.length,447);
 for(const c of review.clauseMapping.clauses){
  assert.equal(sha(c.sourceText),c.sourceSha256);assert.ok(audit.priorCompactedPolicy[c.sourceRule].rule.includes(c.sourceText));
  assert.ok(c.candidateRules.length&&c.candidateRules.every(i=>typeof historicalRules[i]==='string'));
 }
 for(let i=29;i<=47;i++)assert.equal(historicalRules[i],audit.priorCompactedPolicy[i].rule);
 for(const c of review.authorityRelocation.wrapper_clauses){
  assert.ok(review.authoritySources[c.source_key].includes(c.source_sentence));assert.ok(POLICY_BUNDLE.rules[c.target_rule].includes(c.target_excerpt));
 }
 assert.throws(()=>createAskWirePlan(plan('no_context').schema,ASK_REQUEST_INSTRUCTIONS,{...review.authoritySources,inputAuthority:'changed'}),/AUTHORITY_SOURCE_DRIFT/);
 for(const name of Object.keys(corpus.contexts).concat('no_context')){
  const p=plan(name),[header,body]=p.instructions.split('\nPOLICY\n');
  const fields=new Map(header.split('\nFIELDS ')[1].split('\n')[0].split(' ').map(s=>s.split('=')));
  assert.equal(body.replace(/\$([A-Za-z]+)/g,(_,a)=>fields.get(a)),POLICY_BUNDLE.rules.join('\n'));
 }
 assert.throws(()=>createAskWirePlan(plan('no_context').schema,ASK_REQUEST_INSTRUCTIONS+'\nchanged'),/SOURCE_DRIFT/);
 const schema=askRequestProviderSchema(proposedSemanticFrameJsonSchema);schema.description='Unreviewed annotation';
 assert.throws(()=>createAskWirePlan(schema,ASK_REQUEST_INSTRUCTIONS),/UNDISPOSITIONED_ANNOTATION/);
});

test("all 262 archived stress inputs retain exact inverses; current producer constraints remain authoritative",()=>{
 assert.equal(corpus.fixtures.length,262);
 assert.equal(sha(readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url),'utf8')),'2264ae927ccd4769d81e8dacea639ba1e319f29e186179ee02267a71b8b1da5a');
 let accepted=0,rejected=0,count=0;const domains={both:0,decoderOnly:0,producerOnly:0,neither:0};
 for(const name of Object.keys(corpus.contexts).concat('no_context')){
  const original=retainedStressCodec(proposedSemanticFrameJsonSchema,corpus.contexts[name]),p=plan(name);
  for(const f of corpus.fixtures.filter(f=>f.context===name)){
   // The archived Python alias bytes belong to the older schema. Preserve them
   // immutable, rather than falsely requiring aliases to survive schema changes.
   assert.ok(Array.isArray(f.wire.nodes)&&f.wire.nodes.length>0);
   assertRetainedRoundTrip(original,f.canonical);count++;
   const membership=original.membership(f.canonical);domains[membership.decoder?(membership.producer?'both':'decoderOnly'):(membership.producer?'producerOnly':'neither')]++;
   assertArchivedExactOrRejected(p,{root:f.wire.nodes.at(-1),nodes:f.wire.nodes.slice(0,-1)},f.canonical);
   let wire;
   try{wire=p.encode(f.canonical);}catch(e){assert.match(e.message,/ASK_WIRE_CANONICAL_SCHEMA/);rejected++;continue;}
   assert.deepEqual(p.decode(JSON.parse(JSON.stringify(wire))),f.canonical);accepted++;
  }
 }
 assert.equal(count,262);assert.equal(accepted,219);assert.equal(rejected,43);
 assert.deepEqual(domains,{both:206,decoderOnly:43,producerOnly:13,neither:0});
});

test("malformed graphs, unknown tags, collisions and noncanonical references fail closed",()=>{
 for(const name of Object.keys(corpus.contexts).concat('no_context')){
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
