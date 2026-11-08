import {nativeKey,nativeValue,nativeSlot} from "./helpers/direct-protocol.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {bindReadTicket} from '../app/lib/furvise-brain/read-ticket.ts';
import {directFixturePlan} from './helpers/recursive-wire-fixture.mjs';
import {prepareAskInterpretationRequest,interpretAskQuestion} from '../app/lib/intelligence/interpret-ask.ts';
import {admitAiOperation} from '../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../app/lib/ai/usage-guard/memory-test-store.ts';
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-fixture-identity-'.repeat(3)};
const usage={input_tokens:100,output_tokens:20,total_tokens:120};
const pet={id:'pet',user_id:'owner',name:'Aster',species:'cat'};
async function run(t,mode){
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 const event=mode==='event', effective=event || mode.startsWith('effective') || mode.startsWith('mixed') || mode.startsWith('ambiguous'), initial=mode.endsWith('initial') || mode==='initial';
 const text=event?'What happened after the dental visit?':mode.startsWith('effective')?'What is the corrected routine according to the records?':mode.startsWith('mixed')?'What did the note report, and what is the corrected routine?':mode.startsWith('ambiguous')?'What about the routine in the records?':"What did Aster's September 15 2026 care note say about her routine?";
 const currentTurn={id:'current',role:'user',text,createdAt:'2026-09-20T12:00:00Z'};
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:text,currentTurn,conversationTurns:[currentTurn],conversationId:'conversation',timeZone:'UTC'};
 const prepared=prepareAskInterpretationRequest(context,'gpt-5.4-mini');
 const ticket={authority:effective?'effective_fact':'stored_report',operation:event?'read_since_event':'read',subjectScope:'named',
 temporal:{from:event?null:'2026-09-15T00:00:00Z',to:event?null:'2026-09-16T00:00:00Z',anchor:event?{concept:'dental visit',relation:'after'}:null,calendar:null},
 predicates:[],outputs:{strategy:null,completeness:'sufficient',ordering:'asc',limit:null},searchHints:null,episode:null,selection:null,probes:[]};
 const request={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:ticket,writeJob:null,task:null,temporalScope:'historical',mutationIntent:null,recordSelection:null,profileFields:[],projection:null,version:'ask-request.v2',mode:'read',question:text,requirements:[],evidenceNeeds:[],outputFormat:null,evidenceBasis:'saved_history',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:'named',petNames:['Aster'],operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:event?null:'2026-09-15',to:event?null:'2026-09-16',episodeTopic:null,ordinal:null,frame:null};
 const plan=directFixturePlan(prepared.transport); const good=plan.encode({request});
 const bad=structuredClone(good),K=n=>nativeKey(plan,n);
 const transportBad=structuredClone(good);const frameSlot=nativeSlot(plan,transportBad,'frame');frameSlot.target[frameSlot.key]='{bad';
 const episodeBad=structuredClone(good);episodeBad.request.evidenceContext[K('readTicket')][K('episode')]=nativeValue(plan,{operation:'count',referent:null});episodeBad.request.evidenceContext[K('readTicket')][K('predicates')]=nativeValue(plan,[{kind:'text_any',terms:['routine']}]);
 if(event)bad.request.evidenceContext[K('readTicket')][K('temporalContext')][K('temporal')][K('anchor')]=null;
 else bad.request.evidenceContext[K('readTicket')][K('temporalContext')][K('temporal')][K('anchor')]=nativeValue(plan,{concept:'visit',relation:'after'});
 const store=new MemoryAiGuardTestStore();
 const admission=await admitAiOperation({env,store,feature:'ask',intendedModel:'gpt-5.4-mini',userId:'owner',requestId:'anchor-'+mode,payload:{case:mode},now:new Date('2039-01-01T00:00:00Z')});
 let calls=0;const purposes=[];const begin=admission.beginProviderCall.bind(admission);
 admission.beginProviderCall=async x=>{purposes.push(x.purpose??'initial');return begin(x)};
 try {
  const invoke=()=>interpretAskQuestion({context,model:'gpt-5.4-mini',client:{responses:{create:async req=>{
   calls++; assert.match(req.instructions,/For a user explicitly asking what a saved note says or reports/);assert.match(req.instructions,/For current, corrected, settled facts or calculations use effective_fact/);assert.match(req.instructions,/mixed request/); if(calls===2){
    const payload=JSON.parse(req.input),repair=payload.transportRepair;
    assert.equal(repair.validationCode,'ASK_WIRE_CANONICAL_SCHEMA');
    assert.ok(repair.fieldHints.includes(mode==='transport_then_anchor'?'frame':'readTicket'));
    assert.equal(Object.hasOwn(repair,'rejectedProposal'),false);
    assert.match(req.instructions,/An event anchor is present if and only if the ticket operation is read_since_event/);
    assert.match(req.instructions,/Episode, predicate, selection, needs, temporal, authority and output constraints must all remain mutually compatible/);
   }
   return {status:'completed',output_text:JSON.stringify(mode==='transport_then_anchor'?(calls===1?transportBad:bad):mode==='episode_invalid'?(calls===1?bad:episodeBad):(initial?good:calls===1||mode==='invalid'?bad:good)),usage};
  }}}});
  if(mode==='invalid'||mode==='transport_then_anchor'||mode==='episode_invalid') await assert.rejects(admission.run(invoke),e=>e.diagnostics?.providerErrorCode===(mode==='episode_invalid'?'ASK_REQUEST_CONTRACT_READ_TICKET':'ASK_INTERPRETATION_REPAIR_JSON'));
  else {const result=await admission.run(invoke);assert.equal(result.request.readTicket.operation,event?'read_since_event':'read');assert.deepEqual(result.request.readTicket.temporal.anchor,ticket.temporal.anchor);assert.deepEqual(result.request.readTicket.subjects.petIds,['pet']);assert.equal(result.request.readTicket.authority,effective?'effective_fact':'stored_report');}
  assert.equal(calls,initial?1:2);assert.deepEqual(purposes,initial?['initial']:['initial','interpretation_repair']);
 } finally {await admission.release();}
 assert.equal(store.getSnapshot('2039-01-01').calls,initial?1:2);
}
test('ordinary dated read repairs mismatched anchor',t=>run(t,'date'));
test('event-relative read repairs without losing its anchor',t=>run(t,'event'));
test('invalid repair stops without a third call',t=>run(t,'invalid'));

test('transport repair consumes shared allowance before an anchor failure',t=>run(t,'transport_then_anchor'));

test('episode plus text predicate after anchor repair is rejected without a third call',t=>run(t,'episode_invalid'));
test('genuine episode count binds when no incompatible predicates are proposed',()=>{
 const ticket={operation:'read',subjectScope:'named',temporal:{from:null,to:null,anchor:null,calendar:null},
 predicates:[],searchHints:null,episode:{operation:'count',referent:null},needs:null,
 outputs:{completeness:'sufficient',ordering:'asc',limit:null,strategy:null}};
 assert.equal(bindReadTicket(ticket,['pet']).episode.operation,'count');
});

test('initial attributed note request retains stored report authority',t=>run(t,'initial'));

test('initial effective fact authority remains effective',t=>run(t,'effective_initial'));
test('repair retains effective authority for corrected fact',t=>run(t,'effective_repair'));
test('mixed request retains proposed effective authority initially',t=>run(t,'mixed_initial'));
test('mixed request retains proposed effective authority in repair',t=>run(t,'mixed_repair'));

test('ambiguous input retains proposed effective authority initially',t=>run(t,'ambiguous_initial'));
test('ambiguous input retains proposed effective authority in repair',t=>run(t,'ambiguous_repair'));
