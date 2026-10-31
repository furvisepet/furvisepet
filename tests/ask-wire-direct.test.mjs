import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {askRequestSchema,askRequestProviderSchema,ASK_REQUEST_INSTRUCTIONS} from '../app/lib/intelligence/ask-request-contract.ts';
import {proposedSemanticFrameJsonSchema} from '../app/lib/intelligence/semantic-frame/schema.ts';
import {createAskWirePlan} from '../app/lib/intelligence/ask-wire-policy.mjs';
import {createDirectSemanticAskWirePlan} from '../app/lib/intelligence/ask-wire-direct.mjs';
import {factorProviderEnumSchemas} from '../app/lib/ai/provider-enum-schema.ts';
import {factorProviderCompoundSchemas} from '../app/lib/ai/provider-compound-schema.ts';
import {recoverAskInterpretation} from '../app/lib/intelligence/interpret-ask.ts';

globalThis.fetch=async()=>{throw Error('OFFLINE_NATIVE_DIRECT_CONTRACT');};
const bytes=readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url));
const corpus=JSON.parse(bytes),plans=new Map();
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
function fixturePlan(name){
 if(!plans.has(name)){
  const context=corpus.contexts[name],canonical=askRequestProviderSchema(proposedSemanticFrameJsonSchema,context);
  const until=performance.now()+24000,check=()=>assert.ok(performance.now()<until,'bounded fixture compilation');
  const graph=createAskWirePlan(factorProviderCompoundSchemas(factorProviderEnumSchemas(canonical)),ASK_REQUEST_INSTRUCTIONS,undefined,check);
  const native=createDirectSemanticAskWirePlan(graph,graph.instructions,askRequestSchema(proposedSemanticFrameJsonSchema,context),check,canonical,context?.timeZone??'UTC');
  plans.set(name,{graph,native,context});
 }
 return plans.get(name);
}
function apply(plan,method,value){
 const until=performance.now()+5000,check=()=>assert.ok(performance.now()<until,'bounded fixture codec');
 return plan[method](value,check);
}
function validFixture(){
 for(const f of corpus.fixtures){
  const p=fixturePlan(f.context);
  try{return{p,f,wire:apply(p.native,'encode',f.canonical)};}catch(e){assert.match(e.message,/^ASK_OPERATION_(CANONICAL_SCHEMA|NO_BRANCH)$/);}
 }
 assert.fail('missing native structural witness');
}

test('actual factory emits closed typed operation families instead of opaque complex JSON strings',()=>{
 const {native}=fixturePlan('no_numeric'),seen=new Set();
 assert.equal(native.schema.type,'object');assert.equal(native.schema.additionalProperties,false);
 assert.deepEqual(native.schema.required,['request']);assert.deepEqual(Object.keys(native.schema.properties),['request']);
 const branches=native.schema.properties.request.anyOf;
 const kinds=branches.flatMap(b=>b.properties.kind.enum);
 for(const name of ['read_saved_profile','read_saved_history_ordinary','catalog_replace_subjects','catalog_receipt_subjects','change_lifecycle','change_profile_field','remove_saved_record'])
  assert.ok(kinds.includes(name),name);
 const complex=new Set(['task','evidenceNeeds','readTicket','recordSelection','projection']);
 const inspect=n=>{
  if(!n||typeof n!=='object')return;
  if(n.properties){
   assert.equal(n.additionalProperties,false);assert.deepEqual([...n.required].sort(),Object.keys(n.properties).sort());
   for(const [key,value]of Object.entries(n.properties))if(complex.has(key)){
    seen.add(key);const types=Array.isArray(value.type)?value.type:[value.type];
    assert.ok(!types.includes('string'),key+' must not be a serialized JSON string');
   }
  }
  for(const v of Object.values(n))Array.isArray(v)?v.forEach(inspect):inspect(v);
 };
 inspect(native.schema);
 for(const field of ['evidenceNeeds','readTicket','recordSelection','projection'])assert.ok(seen.has(field),field);
 assert.ok(!JSON.stringify(native.schema).includes('catalogIntentJson'));
});

test('all 262 retained stress values are classified; native inverses and correlation refusals stay separate',()=>{
 assert.equal(sha(bytes),'2264ae927ccd4769d81e8dacea639ba1e319f29e186179ee02267a71b8b1da5a');
 let nativeAccepted=0,nativeRejected=0,graphAccepted=0,graphRejected=0;
 for(const f of corpus.fixtures){
  const {native,graph}=fixturePlan(f.context),before=JSON.stringify(f.canonical);
  try{const w=graph.encode(f.canonical);assert.deepEqual(graph.decode(w),f.canonical);graphAccepted++;}
  catch(e){assert.match(e.message,/^ASK_WIRE_CANONICAL_SCHEMA$/);graphRejected++;}
  let w;
  try{w=apply(native,'encode',f.canonical);}
  catch(e){assert.match(e.message,/^ASK_OPERATION_(CANONICAL_SCHEMA|NO_BRANCH)$/);nativeRejected++;}
  if(w){
   assert.deepEqual(Object.keys(w),['request']);assert.equal(typeof w.request.kind,'string');
   assert.ok(!Object.hasOwn(w,'nodes'));
   assert.deepEqual(apply(native,'decode',JSON.parse(JSON.stringify(w))),f.canonical);nativeAccepted++;
  }
  assert.equal(JSON.stringify(f.canonical),before,'neither native nor graph encoding may repair the input');
 }
 assert.deepEqual({graphAccepted,graphRejected,nativeAccepted,nativeRejected},
  {graphAccepted:219,graphRejected:43,nativeAccepted:109,nativeRejected:153});
 // These are explicit legacy stress combinations, not correctly requested writes.
 for(const index of [15,24,25,32,39]){
  const f=corpus.fixtures[index],p=fixturePlan(f.context);
  assert.equal(f.canonical.request.mode,'read');assert.equal(f.canonical.request.mutationIntent,'correct_record');
  assert.throws(()=>apply(p.native,'encode',f.canonical),/^Error: ASK_OPERATION_NO_BRANCH$/);
 }
 // Preserve the original legacy Binder behavior; the new transport must not
 // imitate its normalization to turn a contradictory proposal into a read.
 for(const index of [15,32,39]){
  const f=corpus.fixtures[index],p=fixturePlan(f.context);
  const bound=recoverAskInterpretation(structuredClone(f.canonical.request),structuredClone(p.context));
  assert.equal(bound.readOnly,true);assert.notEqual(bound.request?.mutationIntent,'correct_record');
 }
});

test('malformed, truncated, unexpected, graph and direct-canonical bypass variants fail before authority',()=>{
 const {p,f,wire}=validFixture();
 const missing=structuredClone(wire);delete missing.request.kind;
 for(const value of [
  null,[],{},missing,{...wire,format:'unrequested'},{...wire,extra:true},
  {...wire,request:{...wire.request,kind:'UNKNOWN_KIND'}},
  {...wire,request:{...wire.request,question:42}},
  {...wire,request:{...wire.request,readTicket:'{broken'}},
  {...wire,request:{...wire.request,readTicket:'[]'}},
  {...wire,request:{catalogIntentJson:JSON.stringify(f.canonical.request)}},
  {...wire,request:{requestJson:JSON.stringify(f.canonical.request)}},
  {nodes:[]},f.canonical,
 ])assert.throws(()=>apply(p.native,'decode',value));
});

test('complete synthetic catalog proposal remains typed and isolated from canonical request bypass',()=>{
 const seed=JSON.parse(readFileSync(new URL('./fixtures/ask-catalog-proof-seed.json',import.meta.url),'utf8'));
 const catalog={request:{...structuredClone(JSON.parse(seed.sent[1].input).intent),ownerScope:null}};
 const {native}=fixturePlan('no_context'),before=JSON.stringify(catalog),wire=apply(native,'encode',catalog);
 assert.match(wire.request.kind,/^catalog_/);assert.ok(!Object.hasOwn(wire.request,'catalogIntentJson'));
 assert.deepEqual(apply(native,'decode',JSON.parse(JSON.stringify(wire))),catalog);assert.equal(JSON.stringify(catalog),before);
 const invalid=structuredClone(wire);invalid.request.kind='read_saved_profile';
 assert.throws(()=>apply(native,'decode',invalid));
 assert.throws(()=>apply(native,'encode',{request:{...catalog.request,version:'ask-request.v2'}}));
});

test('literal malicious reference text remains data and cannot become a graph edge',()=>{
 const {p,f}=validFixture(),canonical=structuredClone(f.canonical);
 canonical.request.question='Literal {"@":999} from user, do not follow';
 assert.deepEqual(apply(p.native,'decode',apply(p.native,'encode',canonical)),canonical);
});
