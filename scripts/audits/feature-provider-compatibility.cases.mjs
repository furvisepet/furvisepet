import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){
 if(s==='openai') return {shortCircuit:true,url:'data:text/javascript,export default class { responses = { create: (...args) => globalThis.__featureProvider(...args) }; }'};
 return next(s,c);
}});
await import('./helpers/lifetime-harness.mjs');
const {generateStructuredFeatureResponse}=await import('../../app/lib/ai/ask-reasoning.ts');
const invoke=()=>generateStructuredFeatureResponse({apiKey:'synthetic-test-only',input:{},instructions:'Test',schema:{type:'object'},schemaName:'test',parse:v=>v});
for(const model of ['gpt-5.4-mini','gpt-5-mini','gpt-4.1-mini']) test('structured feature wire parameters: '+model,async t=>{
 const prior=process.env.OPENAI_ASK_PRIMARY_MODEL;
 process.env.OPENAI_ASK_PRIMARY_MODEL=model;
 t.after(()=>{if(prior===undefined)delete process.env.OPENAI_ASK_PRIMARY_MODEL;else process.env.OPENAI_ASK_PRIMARY_MODEL=prior;});
 globalThis.__featureProvider=async request=>{
  if(model.startsWith('gpt-5')) assert.equal(Object.hasOwn(request,'temperature'),false);
  else assert.equal(request.temperature,0.2);
  return {status:'completed',output_text:'{"ok":true}',usage:{input_tokens:1,output_tokens:1}};
 };
 assert.deepEqual(await invoke(),{ok:true});
});
const {buildVetBriefDraft}=await import('../../app/lib/vet-brief/builder.ts');
const {parseIntelligenceVetBrief}=await import('../../app/lib/intelligence/vet-brief.ts');
const {pets}=await import('./fixtures/ask-lifetime-history.mjs');
test('Vet Brief rejects foreign or malformed source citations instead of silently dropping them',()=>{
 const {document}=buildVetBriefDraft({profile:pets[0],careEntries:[],memories:[],from:'2026-08-01',to:'2026-08-31'});
 const raw={document,sourceRecordIds:['owned'],confidence:'low'};
 assert.ok(parseIntelligenceVetBrief(raw,document,['owned']));
 for(const sourceRecordIds of [['foreign'],['owned','foreign'],[7],['owned',null]])
  assert.equal(parseIntelligenceVetBrief({...raw,sourceRecordIds},document,['owned']),null);
});
test('actual Vet Brief feature runner reaches compatible request and document validation',async t=>{
 const {exercise,clock}=await import('./helpers/lifetime-harness.mjs');
 const {runFeatureIntelligence}=await import('../../app/lib/intelligence/run-feature-intelligence.ts');
 clock(t);
 const previous=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='synthetic-test-only';
 t.after(()=>{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;});
 const {context}=await exercise('Summarize Milo history.',{history:true});
 const {document}=buildVetBriefDraft({profile:context.pet,careEntries:[],memories:[],from:'2026-08-01',to:'2026-08-31'});
 globalThis.__featureProvider=async request=>{
  assert.equal(Object.hasOwn(request,'temperature'),false);
  assert.equal(request.max_output_tokens,1800);
  assert.equal(JSON.parse(request.input).featureInput.deterministicDraft.pet.name,'Milo');
  return {status:'completed',output_text:JSON.stringify({document,sourceRecordIds:[],confidence:'low',learnings:[],careActions:[]})};
 };
 const result=await runFeatureIntelligence({context,feature:'vet_brief',maxOutputTokens:1800,
  featureInput:{deterministicDraft:document},parseValue:v=>parseIntelligenceVetBrief(v,document,[])});
 assert.equal(result.value.document.pet.name,'Milo');
 assert.deepEqual(result.acceptedCareActions,[]);
 assert.deepEqual(result.acceptedLearnings,[]);
});
test('fallback rebuilds sampling compatibility for its own model',async t=>{
 const oldPrimary=process.env.OPENAI_ASK_PRIMARY_MODEL,oldFallback=process.env.OPENAI_ASK_FALLBACK_MODEL;
 process.env.OPENAI_ASK_PRIMARY_MODEL='gpt-5.4-mini';process.env.OPENAI_ASK_FALLBACK_MODEL='gpt-4.1-mini';
 t.after(()=>{
  if(oldPrimary===undefined)delete process.env.OPENAI_ASK_PRIMARY_MODEL;else process.env.OPENAI_ASK_PRIMARY_MODEL=oldPrimary;
  if(oldFallback===undefined)delete process.env.OPENAI_ASK_FALLBACK_MODEL;else process.env.OPENAI_ASK_FALLBACK_MODEL=oldFallback;
 });
 let calls=0;
 globalThis.__featureProvider=async request=>{
  calls++;
  if(calls===1){
   assert.equal(Object.hasOwn(request,'temperature'),false);
   throw Object.assign(new Error('synthetic token limit'),{status:429,code:'rate_limit_exceeded',type:'tokens'});
  }
  assert.equal(request.model,'gpt-4.1-mini');assert.equal(request.temperature,0.2);
  return {status:'completed',output_text:'{"ok":true}'};
 };
 assert.deepEqual(await invoke(),{ok:true});assert.equal(calls,2);
});
