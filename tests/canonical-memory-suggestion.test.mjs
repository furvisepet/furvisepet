import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {fixture,harness as authorityHarness,owner,id,continueCanonicalSuggestion} from './helpers/canonical-suggestion.mjs';
const source=readFileSync(new URL('../app/api/ask/suggestions/[id]/route.ts',import.meta.url),'utf8');
function harness({kind='append',legacy=false,missing=false,foreign=false}={}){
 const f=fixture(kind);if(legacy){f.s.canonical_payload=null;f.s.canonical_capability_id=null;f.s.type=kind;f.s.payload={note:'Legacy detail',semanticTopic:'Unbound topic'};}
 const h=authorityHarness(f),from=h.db.from.bind(h.db),rpc=h.db.rpc.bind(h.db),workflow=[];
 h.db.auth={getUser:async()=>({data:{user:{id:foreign?id(99):owner}}})};
 h.db.from=table=>table==='ai_update_suggestions'?{select(){return this},eq(){return this},maybeSingle:async()=>({data:missing?null:f.s,error:null})}:from(table);
 h.db.rpc=(name,args)=>{
  if(name==='edit_ask_canonical_suggestion'||name==='transition_ask_suggestion'){workflow.push({name,args});return Promise.resolve({data:[name.startsWith('edit')?{...f.s,invalidated_at:'2026-09-23T00:00:00Z'}:{suggestion_id:f.s.id,apply_status:'dismissed'}],error:null});}
  return rpc(name,args);
 };
 const mocks={
 '@supabase/supabase-js':{createClient:()=>h.db},
 '../../../../lib/security/headers/origin-policy':{validateSensitiveRequestOriginResponse:()=>null},
 '../../../../lib/security/logging':{safeErrorForLog:()=>({})},
 '../../../../lib/security/request':{API_BODY_LIMITS:{standard:1000},isUuid:v=>v===f.s.id,hasOnlyKeys:(o,keys)=>o&&Object.keys(o).every(k=>keys.includes(k)),readBoundedJson:r=>r.json(),RequestBoundaryError:class extends Error{}},
 '../../../../lib/security/idempotency':{beginIdempotentRateLimitedOperation:async()=>({operation:{execute:fn=>fn()}})},
 '../../../../lib/intelligence/care-authority-client.ts':{createCanonicalCareAuthorityClient:()=>h.db},
 '../../../../lib/intelligence/canonical-suggestion-continuation.ts':{continueCanonicalSuggestion},
 '../../../../lib/intelligence/append-turn.ts':{continueConfirmedAppend:async()=>null},
 };
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:n=>{assert.ok(n in mocks,n);return mocks[n]},Response,crypto:globalThis.crypto,console:{error(){}},
 process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://unused.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'offline'}}});
 return {...h,f,workflow,run:body=>exports.PATCH(new Request('https://fixture.invalid/api/ask/suggestions/'+f.s.id,{method:'PATCH',headers:{authorization:'Bearer offline'},body:JSON.stringify(body||{action:'save'})}),{params:Promise.resolve({id:f.s.id})})};
}
for(const kind of ['append','replace','state_transition'])test('actual PATCH executes '+kind+' through its exact stored capability',async()=>{const h=harness({kind});const r=await h.run();assert.equal(r.status,200);const body=await r.json();assert.equal(body.status,'applied');assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'execute_ask_canonical_suggestion');assert.equal(h.calls[0].args.p_user_id,owner);assert.equal(body.action.status,'succeeded')});
for(const kind of ['history','concern_opening','concern_resolution','memory'])test('actual PATCH refuses proofless legacy '+kind+' without factual RPC',async()=>{const h=harness({kind,legacy:true});assert.equal((await h.run()).status,409);assert.equal(h.calls.length,0);assert.equal(h.workflow.length,0)});
test('owner preference still fails at existing unsupported executor',async()=>{const h=harness({kind:'owner_preference'});assert.equal((await h.run()).status,409);assert.equal(h.f.c.status,'failed')});
test('actual PATCH replay uses same durable receipt',async()=>{const h=harness();assert.equal((await h.run()).status,200);const replay=await h.run();assert.equal(replay.status,200);assert.equal((await replay.json()).status,'already_applied')});
test('client cannot submit canonical payload, target, subject or job',async()=>{for(const key of ['canonical_payload','appendJob','petId','targetId']){const h=harness();assert.equal((await h.run({action:'save',[key]:{}})).status,400);assert.equal(h.calls.length,0)}});
test('monitor never reaches a factual RPC',async()=>{const h=harness({kind:'state_transition'});assert.equal((await h.run({action:'monitor'})).status,422);assert.equal(h.calls.length,0);assert.equal(h.workflow.length,0)});
test('edit uses invalidation workflow and never submits canonical meaning',async()=>{const h=harness();const original=structuredClone(h.f.s.canonical_payload);const r=await h.run({action:'edit',details:'New display text'});assert.equal(r.status,200);assert.deepEqual(h.f.s.canonical_payload,original);assert.equal(h.calls.length,0);assert.equal(h.workflow[0].name,'edit_ask_canonical_suggestion');assert.deepEqual(Object.keys(h.workflow[0].args).sort(),['p_details','p_suggestion_id','p_user_id'])});
test('legacy dismiss remains non-factual workflow',async()=>{const h=harness({kind:'memory',legacy:true});assert.equal((await h.run({action:'dismiss'})).status,200);assert.equal(h.calls.length,0);assert.equal(h.workflow[0].args.p_action,'dismiss')});
test('missing and foreign suggestions cannot reach execution',async()=>{const missing=harness({missing:true});assert.equal((await missing.run()).status,404);const foreign=harness({foreign:true});assert.equal((await foreign.run()).status,409);assert.equal(foreign.calls.length,0)});
