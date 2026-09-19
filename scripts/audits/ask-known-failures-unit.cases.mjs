import { requestProposal } from './helpers/request-proposal.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only') return {shortCircuit:true,url:'data:text/javascript,export default {}'};
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
    const url=new URL(specifier,context.parentURL);
    for(const suffix of ['.ts','/index.ts']) if(existsSync(fileURLToPath(url.href+suffix))) return next(url.href+suffix,context);
  }
  return next(specifier,context);
}});
globalThis.fetch=async()=>{throw new Error('Network forbidden');};
const {analyzeOwnerAssertions}=await import('../../app/lib/ai/owner-assertion.ts');
const {discoverDatedCorrectionNotes}=await import('../../app/lib/intelligence/dated-correction-notes.ts');
const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
for(const q of [
  'Milo had June and August stool notes. Put those two periods in order without calling June later.',
  'Aster has saved weight records. Compare them.',
  'Birch had January and February vomiting reports.',
]) test('historical premise cannot authorize a write: '+q,()=>assert.equal(analyzeOwnerAssertions(q).hasOwnerAssertion,false));
for(const q of [
  'Milo had soft stool today. Compare that with his June notes.',
  'Milo had June stool notes. He vomited today.',
  'Save that Milo had soft stool in June.',
  'Correction: Milo had vomiting yesterday, not Bruno.',
]) test('independent observation remains an assertion: '+q,()=>assert.equal(analyzeOwnerAssertions(q).hasOwnerAssertion,true));
const plan={from:'2026-08-19T00:00:00.000Z',to:'2026-08-20T00:00:00.000Z',terms:['vomit'],interpretation:'lexical'};
const row={id:'correction',pet_profile_id:'a',user_id:'owner',occurred_at:'2026-08-20T16:00:00.000Z',note:"Correction to yesterday's vomiting note: that was Bruno, not Aster.",deleted_at:null};
test('discover yesterday correction even without original candidate',async()=>{
 const coverage={plan,queryCount:0,reasons:[],corrections:'unknown'};
 const db={rpc(){return {abortSignal:async()=>({data:[row],error:null})}}};
 assert.deepEqual(await discoverDatedCorrectionNotes([],['a'],'owner',db,coverage,Date.now()+5000),[row]);
});
test('wrong day and foreign correction remain excluded',async()=>{
 for(const patch of [{occurred_at:'2026-08-22T00:00:00Z'},{user_id:'other'},{pet_profile_id:'b'},{deleted_at:'2026-08-21'}]){
 const coverage={plan,queryCount:0,reasons:[],corrections:'unknown'};
 const db={rpc(){return {abortSignal:async()=>({data:[{...row,...patch}],error:null})}}};
 assert.deepEqual(await discoverDatedCorrectionNotes([],['a'],'owner',db,coverage,Date.now()+5000),[]);
 }
});
const context={owner:{userId:'owner'},pet:{id:'a',name:'Aster',user_id:'owner'},eligiblePets:[{id:'a',name:'Aster',user_id:'owner'}],currentMessage:'What are Aster recorded weights?',conversationTurns:[]};
test('SDK user-abort caused by our deadline is classified as timeout',async t=>{
 const {setTimeout: realTimeout}=await import('node:timers');
 t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>realTimeout(fn,Math.min(ms,5),...args));
 const client={responses:{create:async(_request,{signal})=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>{const error=new Error('sensitive text');error.name='APIUserAbortError';reject(error);},{once:true});
 })}};
 await assert.rejects(interpretAskQuestion({context,model:'gpt-5-mini',client}),e=>e.diagnostics.timedOut===true&&e.diagnostics.providerErrorCode==='ASK_INTERPRETATION_TIMEOUT'&&!JSON.stringify(e.diagnostics).includes('sensitive'));
});
test('ordinary connection failure is not mislabeled timeout',async()=>{
 const client={responses:{create:async()=>{const e=new Error('secret transport');e.name='APIConnectionError';throw e;}}};
 await assert.rejects(interpretAskQuestion({context,model:'gpt-5-mini',client}),e=>e.diagnostics.timedOut===false&&e.diagnostics.providerErrorCode==='ASK_INTERPRETATION_TRANSPORT');
});


test('HTTP rejection and invalid JSON never retry',async()=>{
 for(const mode of ['http','json']){
 let calls=0;
 const client={responses:{create:async()=>{
 calls++;if(mode==='http'){const e=new Error('rejected');e.status=429;throw e;}
 return {status:'completed',output_text:'invalid',usage:{input_tokens:1,output_tokens:1}};
 }}};
 await assert.rejects(interpretAskQuestion({context,model:'gpt-5-mini',client}));assert.equal(calls,1);
 }
});

test('a valid interpretation taking sixteen seconds survives the former cutoff',async()=>{
 const {emptyProposedSemanticFrame}=await import('../../app/lib/intelligence/semantic-frame/extract-frame.ts');
 const proposal={selection:'summary',operation:'recall',readOperation:'recall',subject:'explicit',petNames:['Aster'],topic:'weight',terms:['weight'],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()};
 let calls=0;
 const client={responses:{create:(request,{signal})=>new Promise((resolve,reject)=>{
  calls++;
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve({status:'completed',output_text:JSON.stringify(requestProposal(proposal,context.currentMessage)),usage:{input_tokens:100,output_tokens:100}});},16000);
  const abort=()=>{clearTimeout(timer);const e=new Error('aborted');e.name='APIUserAbortError';reject(e);};
  signal.addEventListener('abort',abort,{once:true});
 })}};
 const result=await interpretAskQuestion({context,model:'gpt-5-mini',client});
 assert.equal(result.readOnly,true);assert.equal(calls,1);
});
