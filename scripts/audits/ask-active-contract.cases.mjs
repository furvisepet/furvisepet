import {getAiFeaturePolicy as admittedFeaturePolicy} from "../../app/lib/ai/usage-guard/features.ts";
import {ticketedProposal} from './helpers/ticketed-proposal.mjs';
import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import * as C from "../../tests/helpers/canonical-calculation-retirement.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock, ASK_PROMPT_CONTEXT_CHAR_BUDGET } from './helpers/lifetime-harness.mjs';
import { care, pets, ownerId } from './fixtures/ask-lifetime-history.mjs';
import { rows as decadeRows, stressPets } from './fixtures/ask-ten-year-history.mjs';
const { recoverAskInterpretation, interpretAskQuestion } = await import('../../app/lib/intelligence/interpret-ask.ts');
const proposal=(question,patch={})=>({version:'ask-request.v2',mode:'read',question,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Milo'],
 operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,
 evidenceBasis:'saved_history',premiseQuotes:[],...patch});
const noWrites=r=>{
 assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedLearnings,[]);assert.deepEqual(r.result.acceptedSemanticEvents,[]);
 assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer,false);
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
};
const context={owner:{userId:ownerId},pet:pets[0],eligiblePets:pets,conversationTurns:[],currentMessage:'Summarize Milo history.'};
test('provider validation rejects the retired planner shape and all unknown versions',()=>{
 for(const value of [{operation:'recall',subject:'selected',petNames:[]},{...proposal(context.currentMessage),version:'ask-request.v1'},{...proposal(context.currentMessage),version:'ask-request.v99'}])
 assert.throws(()=>recoverAskInterpretation(value,context),/ASK_REQUEST_CONTRACT_VERSION/);
 assert.equal(recoverAskInterpretation(ticketedProposal(proposal(context.currentMessage)),context).request.version,'ask-request.v2');
});
test('current contract rejects foreign identities and preserves typed failure diagnostics',async()=>{
 const events=[];
 await assert.rejects(interpretAskQuestion({context,model:'gpt-5-mini',onProviderEvent:e=>events.push(e),client:{responses:{async create(){
 return {status:'completed',output_text:JSON.stringify(proposal(context.currentMessage,{petNames:['NotOwned']})),usage:{input_tokens:12,output_tokens:8}};
 }}}}),e=>e.stage==='interpretation_failed'&&e.diagnostics.providerErrorCode==='ASK_REQUEST_CONTRACT_OWNERSHIP');
 assert.deepEqual(events.map(e=>e.outcome),['started','failed']);assert.equal(events.at(-1).inputTokens,12);
});
const topics=[['sleep','slept through the night'],['grooming','tolerated brushing'],['activity','rested after a walk'],['food','ate the usual food'],['water','drank after playing'],['behavior','greeted a visitor calmly']];
for(const [topic,fact] of topics) for(const pet of pets.slice(0,2)) test('same reviewed pipeline: '+pet.name+' '+topic,async t=>{
 clock(t);const question=`Summarize ${pet.name} ${topic} history.`;
 const text=`On July 1, 2026, ${pet.name} ${fact}.`;
 const r=await exercise(question,{history:true,petId:pet.id,rows:[care('fact',pet.id,'2026-07-01','general',text)],messages:[],
 interpretationProposal:proposal(question,{petNames:[pet.name],topic,terms:[]}),expectedReviewCalls:1,reviewResponse:{approved:true},
 providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:fact'],calculations:[]}]}}});
 assert.equal(r.publication.failure,null);assert.equal(r.result.answerValidation.assessment.outcome,'complete');assert.ok(r.result.reasoning.answer.summary.includes(fact));noWrites(r);
});
test('unused provider subset approval cannot introduce an unsupported claim',async t=>{
 clock(t);const question='Summarize Milo history.';
 const r=await exercise(question,{history:true,messages:[],rows:[care('sleep','milo','2026-07-01','general','Milo slept through the night.')],
 interpretationProposal:proposal(question),expectedReviewCalls:2,
 providerOverrides:{historyNarrative:{sentences:[{text:'Milo slept through the night.',sourceIds:['care:sleep'],calculations:[]},{text:'Milo has no underlying medical problem.',sourceIds:['care:sleep'],calculations:[]}]}},
 reviewProviderResponse:async request=>{
  if(request.text.format.name==='furvise_history_repair')throw Object.assign(new Error('repair unavailable'),{name:'TimeoutError'});
  const input=JSON.parse(request.input);return {status:'completed',output_text:JSON.stringify({approved:true,retainedSentenceIndexes:[0],obligations:input.obligations.map(({index})=>({index,status:'answered',sentenceIndexes:[0]}))}),usage:{input_tokens:20,output_tokens:20}};
 }});
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 assert.deepEqual(r.result.reasoning.relevantContextIds,['care:sleep']);
 assert.equal(r.result.reasoning.labsList.records[0].body,'Milo slept through the night.');
 assert.doesNotMatch(JSON.stringify(r.result.reasoning.answer),/no underlying medical problem/);noWrites(r);
});
test('unused provider citations cannot substitute foreign evidence',async t=>{
 clock(t);const q='Summarize Milo history.';
 const r=await exercise(q,{history:true,rows:[care('mine','milo','2026-07-01','general','Milo rested.'),care('other','luna','2026-07-01','general','Luna ate normally.')],messages:[],
 interpretationProposal:proposal(q),expectedReviewCalls:2,reviewResponse:{approved:true},
 providerOverrides:{historyNarrative:{sentences:[{text:'Milo ate normally.',sourceIds:['care:other'],calculations:[]}]}}});
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 assert.deepEqual(r.result.reasoning.relevantContextIds,['care:mine']);
 assert.equal(r.result.reasoning.labsList.records[0].body,'Milo rested.');
 assert.doesNotMatch(JSON.stringify(r.result.reasoning.answer),/Milo ate normally/);noWrites(r);
});
for(const dense of [false,true])test(dense?'unresolved decade correction blocks arithmetic without factual provider calls':'certified endpoint observations produce source-bound arithmetic',async t=>{
 clock(t);const q='Compare Milo earliest and latest recorded weights and calculate the change.';
 const calc={operation:'difference',operands:[{sourceId:'care:decade-old-weight',field:'text',literal:'28.4 kg'},{sourceId:'care:decade-new-weight',field:'text',literal:'27.8 kg'}],value:0.6,unit:'kg'};
 const text='Milo weighed 28.4 kg on September 4, 2016 and 27.8 kg on September 3, 2026, a decrease of 0.6 kg between those records.';
 const r=await exercise(q,{history:true,fixturePets:stressPets,rows:dense?decadeRows:decadeRows.filter(r=>['decade-old-weight','decade-new-weight'].includes(r.id)),messages:[],expectedCalculationModel:dense?'server-calculation-unavailable':'server-calculation-labs',
 interpretationProposal:proposal(q,{operation:'recall',selection:'summary',quantity:'measurement',topic:'weight',terms:[],
 readTicket:{...C.rawTicket(),subjectScope:'named',predicates:[{kind:'text_any',terms:['weigh']}]},
 calculatePlan:{operation:'calculate',calculations:[C.calculation('difference',[C.slot(1,0,'Milo'),C.slot(0,0,'Milo')],'kg')]}}),expectedReviewCalls:1,reviewResponse:{approved:true},
 providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:decade-old-weight','care:decade-new-weight'],calculations:[calc]}]}}});
 assert.equal(decadeRows.length,10968);assert.ok(r.serialized.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET);assert.ok(r.queries.length<80);
 if(dense){assert.equal(r.result.reasoning.model,'server-calculation-unavailable');assert.ok(r.context.askHistory.coverage.ticketCoverage.reasons.includes('unlinked_correction_uncertain'));assert.equal(r.result.answerValidation.assessment.outcome,'limited');assert.deepEqual(r.result.reasoning.relevantContextIds,[]);assert.equal(r.result.reasoning.calculationLabs,undefined);noWrites(r);return;}
 for(const id of ['decade-old-weight','decade-new-weight'])assert.ok(r.result.reasoning.calculationLabs.execution.results[0].sourceIds.includes('care:'+id),id);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');assert.match(r.result.reasoning.answer.summary,/0\.6 kg/);noWrites(r);
});

test('malformed unused primary output cannot interfere with certified publication',async t=>{
 clock(t); const q='Summarize Milo history.';
 const r=await exercise(q,{history:true,rows:[care('rest','milo','2026-07-01','general','Milo rested.')],messages:[],
 interpretationProposal:proposal(q),expectedProviderCalls:1,expectedReviewCalls:1,
 providerResponse:async()=>({status:'completed',output_text:'{}',usage:{input_tokens:20,output_tokens:2}})});
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 assert.deepEqual(r.result.reasoning.relevantContextIds,['care:rest']);
 assert.equal(r.result.reasoning.labsList.records[0].body,'Milo rested.');noWrites(r);
});


const {readFileSync}=await import('node:fs');
const {prepareAskInterpretationRequest}=await import('../../app/lib/intelligence/interpret-ask.ts');
const {admitAiOperation}=await import('../../app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore}=await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
const {publicV1AskCapability,PUBLIC_V1_CAPABILITIES}=await import('../../app/lib/public-v1-capabilities.ts');
const canonicalDefaults=JSON.parse(JSON.parse(readFileSync(new URL('../../tests/fixtures/ask-catalog-proof-seed.json',import.meta.url),'utf8')).sent[1].input).intent.request;
function full(p){return {...structuredClone(canonicalDefaults),draftAnswer:null,writeJob:null,appendJob:null,removeJob:null,lifecyclePlan:null,stateTransitionJob:null,fieldMutationJob:null,calculatePlan:null,storedRead:null,readTicket:null,task:null,frame:null,mutationIntent:null,profileFields:[],evidenceNeeds:[],requirements:[],referenceTurnIds:[],excludedPetNames:[],...p};}
function sourceContext(q){return {...context,conversationId:'current-conversation',currentMessage:q,currentTurn:{id:'current-source',role:'user',text:q,createdAt:'2026-09-04T18:00:00Z'}};}
const appendQuestion='Milo had a 7 minute play session today. Save this update to care history.';
const appendProposal=()=>full(proposal(appendQuestion,{mode:'update',evidenceBasis:null,quantity:null,operation:'general',appendJob:{operation:'append',petName:'Milo',companionQuote:null,items:[{bodyQuote:'Milo had a 7 minute play session today.',dateQuote:null,occurredAt:null,semantics:{classification:'observation',target:null}}]}}));
async function wireCall(ctx,p,{raw=false,catalogService,expectedCalls=1}={}){
 const a=await admitAiOperation({feature:'ask',userId:ownerId,requestId:crypto.randomUUID(),payload:{fixture:'active-contract'},intendedModel:'gpt-5.4-mini',env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1'},store:new MemoryAiGuardTestStore()});
 const prior=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;let calls=0;
 try{return await a.run(async()=>{
  const prepared=prepareAskInterpretationRequest(ctx,'gpt-5.4-mini');
  try{const response=raw?p:prepared.transport.encode({request:p},()=>{});
  return await interpretAskQuestion({context:ctx,model:'gpt-5.4-mini',catalogService,client:{responses:{create:async request=>{
   calls++;assert.equal(calls,1,'non-profile repair cannot grant another attempt');
   assert.equal(request.max_output_tokens,admittedFeaturePolicy('ask').maxOutputTokens);assert.deepEqual(request.reasoning,{effort:'none'});
   assert.deepEqual(request.text.format.schema,prepared.request.text.format.schema);
   return {status:'completed',output_text:JSON.stringify(response),usage:{input_tokens:12,output_tokens:10}};
  }}}});}finally{assert.equal(calls,expectedCalls);}
 });}finally{await a.release();if(prior===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=prior;}
}
test('explicit append survives strict wire and Binder while public mutations remain unavailable',async()=>{
 const ctx=sourceContext(appendQuestion),r=await wireCall(ctx,appendProposal());
 assert.equal(r.readOnly,false);assert.equal(r.request.evidenceBasis,null);assert.deepEqual(r.petIds,['milo']);
 assert.equal(r.request.appendJob.items[0].body.text,'Milo had a 7 minute play session today.');
 assert.equal(PUBLIC_V1_CAPABILITIES.askMutations,false);assert.equal(publicV1AskCapability(r.request).available,false);
});
test('explicit archive catalog intent stops at public policy before hydration or selection',async()=>{
 const q='Archive Milo.',ctx=sourceContext(q);
 const p=full(proposal(q,{mode:'update',evidenceBasis:null,quantity:null,operation:'general',lifecyclePlan:{pendingDisposition:'keep',transition:{targetPetName:'Milo',toState:'archived'},requiredSubjectState:null,authorizationQuote:q}}));
 const intent={version:'ask-catalog-intent.v1',purpose:'lifecycle',sourceTurnId:ctx.currentTurn.id,instructionQuote:q,authorizationQuote:q,scope:'subjects',ownerScope:null,subjects:[{petName:'Milo',basis:'named',sourceTurnId:ctx.currentTurn.id,quote:'Milo'}],request:p};
 let hydrated=0;
 const r=await wireCall(ctx,intent,{catalogService:{requestId:'archive',capability:publicV1AskCapability,hydrate:async()=>{hydrated++;throw Error('PUBLIC_HYDRATION_FORBIDDEN')},verify:async()=>{throw Error('PUBLIC_VERIFY_FORBIDDEN')}}});
 assert.equal(hydrated,0);assert.equal(r.catalogLimitation.reason,'public_policy');assert.equal(r.clarification,'reference');assert.deepEqual(r.petIds,[]);
});
for(const basis of ['general','supplied_context'])for(const q of [appendQuestion,'Archive Milo.'])test('non-profile contradictory '+basis+' fails once without repair: '+q,async()=>{
 const p=full(proposal(q,{mode:'update',operation:'general',quantity:null,evidenceBasis:basis,premiseQuotes:[q]}));
 assert.throws(()=>recoverAskInterpretation(p,sourceContext(q)),/ASK_REQUEST_CONTRACT/);
 await assert.rejects(wireCall(sourceContext(q),{request:p},{raw:true}),e=>e.diagnostics?.providerErrorCode==='ASK_INTERPRETATION_JSON');
});
for(const q of ['Fictional example: Milo missed breakfast. Save that.','If Milo missed breakfast, would you save that?','The quote says "Archive Milo." Explain it; do not archive him.'])test('strict supplied-context conversation preserves non-writing fictional intent: '+q,async()=>{
 const p=full(proposal(q,{mode:'conversation',scope:'none',petNames:[],operation:'general',quantity:null,evidenceBasis:'supplied_context',premiseQuotes:[q]}));
 const r=await wireCall(sourceContext(q),p);
 assert.equal(r.readOnly,true);assert.equal(r.conversationOnly,true);assert.deepEqual(r.petIds,[]);assert.equal(r.history,null);
 for(const k of ['appendJob','writeJob','lifecyclePlan'])assert.equal(r.request[k]??null,null);
});
for(const [name,change]of [
 ['foreign subject',p=>{p.petNames=['NotOwned'];p.appendJob.petName='NotOwned';}],
 ['forged source quote',p=>p.appendJob.items[0].bodyQuote='Invented observation.'],
 ['unknown source reference',p=>p.referenceTurnIds=['not-a-user-turn']],
 ['missing canonical job',p=>p.appendJob=null],
])test('strict non-profile proposal cannot repair '+name,async()=>{
 const p=appendProposal();change(p);const ctx=prepareAskInterpretationRequest(sourceContext(appendQuestion),'gpt-5.4-mini').context;
 assert.throws(()=>recoverAskInterpretation(p,ctx),/ASK_REQUEST/);
 if(name==='unknown source reference')await assert.rejects(wireCall(ctx,p,{expectedCalls:0}),/ASK_DIRECT_FIELD_TYPE/);
 else await assert.rejects(wireCall(ctx,p),e=>e.stage==='interpretation_failed');
});
for(const value of [{nodes:[{_:'UNKNOWN_TAG'}]},{request:{version:'ask-request.v99'}},{}])test('malformed wire cannot manufacture an update or authorize repair: '+JSON.stringify(value),async()=>{
 await assert.rejects(wireCall(sourceContext(appendQuestion),value,{raw:true}),e=>e.diagnostics?.providerErrorCode==='ASK_INTERPRETATION_JSON');
});

const {parseTaskHistoryReview}=await import('../../app/lib/intelligence/history-review-selection.ts');
const {inspectAskPublication}=await import('../../app/lib/intelligence/inspect-ask-publication.ts');
const readNavigation={kind:'navigation.open_pet_profile',evidence:"Open Milo's profile"};
const historicalRead=(text,navigationActions=[])=>({readVersion:'history-answer.v1',layout:'prose',table:null,json:null,limitation:null,
 historyNarrative:{sentences:[{text,sourceIds:['care:rest'],calculations:[]}]},navigationActions,
 safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:rest']});
const providerJson=value=>({status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:20,output_tokens:20}});
const navReview=(payload,status='answered')=>({approved:true,retainedSentenceIndexes:[0],rejectionReason:null,
 obligations:payload.obligations.map(({index})=>({index,status,sentenceIndexes:[0],actionIndexes:index===0?[0]:[]}))});

test("canonical calculation publication cannot carry navigation writes or fabricated targets",async()=>{
 const f=await C.fixture();for(const action of [{kind:"care_history.add"},{kind:"navigation.open_pet_profile",petId:"foreign"},{kind:"navigation.open_pet_profile",href:"/evil"}]){const r={...f.response,applicationActions:[action]};assert.ok(C.calculationPublicationFailure(r));}assert.equal(f.calls(),0);
});
test('history action review rejects nonexistent, duplicate, or unreviewed action indexes',()=>{
 const valid={approved:true,retainedSentenceIndexes:[0],obligations:[{index:0,status:'answered',sentenceIndexes:[0],actionIndexes:[0]}]};
 assert.equal(parseTaskHistoryReview(valid,1,1,1).approved,true);
 for(const indexes of [[],[1],[0,0]]) assert.throws(()=>parseTaskHistoryReview({...valid,obligations:[{...valid.obligations[0],actionIndexes:indexes}]},1,1,1));
});
for(const repair of [false,true]) test('unexecutable navigation remains residual with no action publication'+(repair?' with an unused repair fixture':''),async t=>{
 clock(t);const q="Open Milo's profile and summarize his recorded rest. Do not change any records.";
 let calls=0;
 const r=await exercise(q,{history:true,messages:[],rows:[care('rest','milo','2026-07-01','general','Milo rested.')],
 interpretationProposal:proposal(q,{requirements:["Open Milo's profile."]}),expectedReviewCalls:repair?3:1,
 providerResponse:async()=>providerJson(historicalRead('Milo rested.',repair?[]:[readNavigation])),
 reviewProviderResponse:async request=>{
   calls++;const payload=JSON.parse(request.input);
   if(request.text.format.name==='furvise_history_repair')return providerJson(historicalRead('Milo rested.',[readNavigation]));
   assert.equal(payload.question,q);
   if(repair&&calls===1){assert.deepEqual(payload.actions,[]);return providerJson({approved:false,retainedSentenceIndexes:[],rejectionReason:'Missing requested profile action.',obligations:payload.obligations.map(({index})=>({index,status:'missing',sentenceIndexes:[],actionIndexes:[]}))});}
   assert.equal(payload.actions[0].kind,'navigation.open_pet_profile');assert.equal(payload.actions[0].petId,'milo');
   return providerJson(navReview(payload));
 }});
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');assert.equal(r.publication.failure,null);
 assert.deepEqual(r.publication.displayed.applicationActions||[],[]);
 assert.deepEqual(r.result.reasoning.relevantContextIds,['care:rest']);
 const injected={...r.publication.response,applicationActions:[{kind:'navigation.open_pet_profile',petId:'foreign',href:'/evil'}]};
 const inspected=inspectAskPublication(r.result.reasoning.answer,injected,true,r.result.reasoning.evidenceContract);
 assert.equal(inspected.failure,null);assert.deepEqual(inspected.displayed.applicationActions||[],[]);
 assert.equal(inspected.displayed.summary,r.publication.displayed.summary);
 assert.doesNotMatch(JSON.stringify(inspected.displayed),/foreign|\/evil/);
 noWrites(r);
});
test('missing collar evidence remains source-free and incomplete',async t=>{
 clock(t);const q="Open Milo's profile and tell me the exact color of his collar at birth. Do not change any records.";
 const r=await exercise(q,{history:true,messages:[],rows:[care('rest','milo','2026-07-01','general','Milo rested.')],
 interpretationProposal:proposal(q,{terms:['collar'],requirements:["Open Milo's profile."]}),expectedReviewCalls:1,
 providerResponse:async()=>providerJson(historicalRead('These records do not establish the collar color at birth.',[readNavigation])),
 reviewProviderResponse:async request=>providerJson(navReview(JSON.parse(request.input),'limited'))});
 assert.equal(r.result.answerValidation.valid,true);assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.equal(r.result.answerValidation.assessment.checks.taskCompletion,'failed');
 assertSourceFreePublication(r);
 assert.deepEqual(r.publication.displayed.applicationActions||[],[]);
 noWrites(r);
});
