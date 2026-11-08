import test from 'node:test';
import assert from 'node:assert/strict';
import { directFixturePlan } from './helpers/recursive-wire-fixture.mjs';
import { prepareAskInterpretationRequest, interpretAskQuestion } from '../app/lib/intelligence/interpret-ask.ts';
import { admitAiOperation } from '../app/lib/ai/usage-guard/admission.ts';
import { MemoryAiGuardTestStore } from '../app/lib/ai/usage-guard/memory-test-store.ts';
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'fixture-0123456789012345678901234567890123456789'};
const usage={input_tokens:100,output_tokens:30};
const pet={id:'pet',user_id:'owner',name:'Willow',species:'dog'};
async function run(t,mode){
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 const episode=mode==='episode'||mode==='membership',event=mode==='event',effective=mode==='effective',bounded=mode==='report';
 const text=mode==='membership'?'Is that recorded breathing episode in the displayed list?':episode?'Count the recorded breathing episodes for Willow.':event?'What happened after Willow’s dental visit?':effective?'What is Willow’s corrected recorded measurement?':'What did Willow’s April 5, 2026 saved note say about her routine?';
 const currentTurn={id:'current',role:'user',text,createdAt:'2026-04-20T12:00:00Z'};
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:text,currentTurn,conversationTurns:[currentTurn],conversationId:'conversation',timeZone:'UTC'};
 const prepared=prepareAskInterpretationRequest(context,'gpt-5.4-mini');
 const ticket={authority:event||episode||effective?'effective_fact':'stored_report',operation:event?'read_since_event':'read',subjectScope:'named',temporal:{from:bounded?'2026-04-05T00:00:00Z':null,to:bounded?'2026-04-06T00:00:00Z':null,anchor:event?{concept:'dental visit',relation:'after'}:null,calendar:null},predicates:event||episode?[]:[{kind:'text_any',terms:['routine']}],outputs:{strategy:null,completeness:'sufficient',ordering:'asc',limit:null},searchHints:null,episode:episode?(mode==='membership'?{operation:'membership',referent:{basis:'displayed_list',topic:'breathing',ordinal:'that'}}:{operation:'count',referent:null}):null,selection:null,probes:[]};
 const request={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:ticket,writeJob:null,task:null,temporalScope:'historical',mutationIntent:null,recordSelection:null,profileFields:[],projection:null,version:'ask-request.v2',mode:'read',question:text,requirements:[],evidenceNeeds:[],outputFormat:null,evidenceBasis:'saved_history',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:'named',petNames:['Willow'],operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,draftAnswer:null};
 const good=directFixturePlan(prepared.transport).encode({request}),bad=structuredClone(good),second=structuredClone(good);
 const firstEpisode=mode!=='reverse';
 if(firstEpisode){bad.request.evidenceContext.readTicket.temporalContext.operation='read';bad.request.evidenceContext.readTicket.temporalContext.temporal.anchor=null;bad.request.evidenceContext.readTicket.episode={operation:'count',referent:null};bad.request.evidenceContext.readTicket.predicates=[{kind:'text_any',terms:['routine']}];}
 else {bad.request.evidenceContext.readTicket.temporalContext.operation='read';bad.request.evidenceContext.readTicket.temporalContext.temporal.anchor={concept:'visit',relation:'after'};}
 if(mode==='forward'){second.request.evidenceContext.readTicket.temporalContext.operation='read';second.request.evidenceContext.readTicket.temporalContext.temporal.anchor={concept:'visit',relation:'after'};}
 if(mode==='malformed'){second.format='invalid';}
 if(mode==='reverse'){second.request.evidenceContext.readTicket.episode={operation:'count',referent:null};second.request.evidenceContext.readTicket.predicates=[{kind:'text_any',terms:['routine']}];}
 const store=new MemoryAiGuardTestStore();
 const admission=await admitAiOperation({env,store,feature:'ask',intendedModel:'gpt-5.4-mini',userId:'owner',requestId:'whole-'+mode,payload:{case:mode},now:new Date('2039-01-01T00:00:00Z')});
 let calls=0,firstInput,secondInput,secondInstructions;
 try {
  const invoke=()=>interpretAskQuestion({context,model:'gpt-5.4-mini',client:{responses:{create:async req=>{
   calls++;const input=JSON.parse(req.input);
   if(calls===1)firstInput=input;
   if(calls===2){secondInput=input;secondInstructions=req.instructions;}
   return {status:'completed',output_text:JSON.stringify(calls===1?bad:second),usage};
  }}}});
  if(['forward','reverse','malformed'].includes(mode)){await assert.rejects(admission.run(invoke),e=>mode==='malformed' ? !!e : e.diagnostics?.providerErrorCode===(mode==='forward'?'ASK_INTERPRETATION_REPAIR_JSON':'ASK_REQUEST_CONTRACT_READ_TICKET'));}
  else {const result=await admission.run(invoke);assert.equal(result.request.readTicket.authority,ticket.authority);assert.equal(result.request.readTicket.operation,ticket.operation);assert.deepEqual(result.request.readTicket.temporal.anchor,ticket.temporal.anchor);assert.deepEqual(result.request.readTicket.subjects.petIds,['pet']);assert.equal(result.request.writeJob,null);if(episode)assert.equal(result.request.readTicket.episode.operation,mode==='membership'?'membership':'count');if(bounded)assert.equal(result.request.readTicket.temporal.from,'2026-04-05T00:00:00Z');}
  assert.equal(calls,2);
  const {contractRepair,transportRepair,...original}=secondInput;
  assert.deepEqual(original,firstInput);
  if(firstEpisode)assert.equal(contractRepair.field,"predicates");
  else {assert.equal(transportRepair.validationCode,"ASK_WIRE_CANONICAL_SCHEMA");assert.ok(transportRepair.fieldHints.includes("readTicket"));}
  assert.match(secondInstructions,/check the entire read ticket together/);
  assert.match(secondInstructions,/if and only if/);
  assert.match(secondInstructions,/do not drop, invent or rewrite/);
 } finally {await admission.release();}
 assert.equal(store.getSnapshot('2039-01-01').calls,2);
}
test('episode mismatch followed by anchor mismatch fails without third call',t=>run(t,'forward'));
test('anchor mismatch followed by episode mismatch fails without third call',t=>run(t,'reverse'));
test('malformed second response fails without third call',t=>run(t,'malformed'));
test('repair preserves a genuine event-relative read',t=>run(t,'event'));
test('repair preserves a genuine episode count',t=>run(t,'episode'));
test('repair preserves a genuine episode membership',t=>run(t,'membership'));
test('repair preserves explicitly attributed report authority',t=>run(t,'report'));
test('repair preserves genuine effective-fact authority',t=>run(t,'effective'));
