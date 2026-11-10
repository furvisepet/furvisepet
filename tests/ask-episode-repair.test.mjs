import {nativeKey,nativeValue} from './helpers/direct-protocol.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {directFixturePlan} from './helpers/recursive-wire-fixture.mjs';
import {prepareAskInterpretationRequest,interpretAskQuestion} from '../app/lib/intelligence/interpret-ask.ts';
import {admitAiOperation} from '../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../app/lib/ai/usage-guard/memory-test-store.ts';
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-fixture-identity-'.repeat(3)};
const usage={input_tokens:100,output_tokens:20,total_tokens:120};
const pet={id:'pet',user_id:'owner',name:'Aster',species:'cat'};
async function run(t,mode){
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 const episode=mode==='episode',text=episode?'How many vomiting episodes did Aster have?':"What did Aster's September 15 2026 note say about her routine?";
 const currentTurn={id:'current',role:'user',text,createdAt:'2026-09-20T12:00:00Z'};
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:text,currentTurn,conversationTurns:[currentTurn],conversationId:'conversation',timeZone:'UTC'};
 const prepared=prepareAskInterpretationRequest(context,'gpt-5.4-mini');
 const ticket={authority:'effective_fact',operation:'read',subjectScope:'named',
 temporal:{from:episode?null:'2026-09-15T00:00:00Z',to:episode?null:'2026-09-16T00:00:00Z',anchor:null,calendar:null},
 predicates:episode?[]:[{kind:'text_any',terms:['routine']}],outputs:{strategy:null,completeness:'sufficient',ordering:'asc',limit:null},searchHints:null,episode:episode?{operation:'count',referent:null}:null,selection:null,probes:[]};
 const request={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:ticket,writeJob:null,task:null,temporalScope:'historical',mutationIntent:null,recordSelection:null,profileFields:[],projection:null,version:'ask-request.v2',mode:'read',question:text,requirements:[],evidenceNeeds:[],outputFormat:null,evidenceBasis:'saved_history',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:'named',petNames:['Aster'],operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:episode?null:'2026-09-15',to:episode?null:'2026-09-16',episodeTopic:null,ordinal:null,frame:null};
 const good=directFixturePlan(prepared.transport).encode({request}),bad=structuredClone(good),transportBad=structuredClone(good);
 const K=name=>nativeKey(prepared.transport,name),native=value=>nativeValue(prepared.transport,value);
 const badTicket=bad.request.evidenceContext[K('readTicket')];
 assert.ok(badTicket,'the malformed episode must target the actual encoded ticket');
 badTicket[K('episode')]=native({operation:'count',referent:null});
 badTicket[K('predicates')]=native([{kind:'text_any',terms:[episode?'vomiting':'routine']}]);
 transportBad.request.evidenceContext[K('readTicket')][K('temporalContext')][K('temporal')][K('anchor')]=native({concept:'dental visit',relation:'after'});
 const store=new MemoryAiGuardTestStore();
 const admission=await admitAiOperation({env,store,feature:'ask',intendedModel:'gpt-5.4-mini',userId:'owner',requestId:'episode-'+mode,payload:{case:mode},now:new Date('2039-01-01T00:00:00Z')});
 let calls=0;const purposes=[];const begin=admission.beginProviderCall.bind(admission);
 admission.beginProviderCall=async x=>{purposes.push(x.purpose??'initial');return begin(x)};
 try{
  const invoke=()=>interpretAskQuestion({context,model:'gpt-5.4-mini',client:{responses:{create:async req=>{
   try { calls++;if(calls===2&&mode!=='transport'){const h=JSON.parse(req.input).contractRepair;assert.equal(h.field,'predicates');assert.equal(h.rule,'incompatible_with_episode');assert.equal(Object.hasOwn(h,'rejectedProposal'),false);assert.match(req.instructions,/check the entire read ticket together/);assert.match(req.instructions,/Preserve genuine episode/);assert.match(req.instructions,/do not drop, invent or rewrite/);}
   return {status:'completed',output_text:JSON.stringify(mode==='transport'?(calls===1?transportBad:bad):(calls===1||mode==='twice'?bad:good)),usage}; } catch(error) { console.error('Offline episode provider assertion',error); throw error; }
  }}}});
  if(mode==='twice'||mode==='transport') await assert.rejects(admission.run(invoke),e=>e.diagnostics?.providerErrorCode==='ASK_REQUEST_CONTRACT_READ_TICKET');
  else {const result=await admission.run(invoke);if(episode)assert.ok(result.clarification || result.request.readTicket.episode);else {assert.equal(result.request.readTicket.episode,null);assert.equal(result.request.readTicket.predicates[0].terms[0],'routine');assert.deepEqual(result.request.readTicket.subjects.petIds,['pet']);}}
  assert.equal(calls,2);assert.deepEqual(purposes,['initial','interpretation_repair']);
 } finally {await admission.release();}
 assert.equal(store.getSnapshot('2039-01-01').calls,2);
}
test('initial episode/predicate mismatch repairs to ordinary dated record',t=>run(t,'record'));
test('initial mismatch can preserve genuine episode intent',t=>run(t,'episode'));
test('invalid repair fails closed with no third call',t=>run(t,'twice'));
test('transport repair consumes the same allowance',t=>run(t,'transport'));
