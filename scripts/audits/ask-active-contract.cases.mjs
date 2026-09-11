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
};
const context={owner:{userId:ownerId},pet:pets[0],eligiblePets:pets,conversationTurns:[],currentMessage:'Summarize Milo history.'};
test('provider validation rejects the retired planner shape and all unknown versions',()=>{
 for(const value of [{operation:'recall',subject:'selected',petNames:[]},{...proposal(context.currentMessage),version:'ask-request.v1'},{...proposal(context.currentMessage),version:'ask-request.v99'}])
 assert.throws(()=>recoverAskInterpretation(value,context),/ASK_REQUEST_CONTRACT_VERSION/);
 assert.equal(recoverAskInterpretation(proposal(context.currentMessage),context).request.version,'ask-request.v2');
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
test('subset approval cannot silently discard an unsupported claim from the current answer',async t=>{
 clock(t);const question='Summarize Milo history.';
 const r=await exercise(question,{history:true,messages:[],rows:[care('sleep','milo','2026-07-01','general','Milo slept through the night.')],
 interpretationProposal:proposal(question),expectedReviewCalls:2,
 providerOverrides:{historyNarrative:{sentences:[{text:'Milo slept through the night.',sourceIds:['care:sleep'],calculations:[]},{text:'Milo has no underlying medical problem.',sourceIds:['care:sleep'],calculations:[]}]}},
 reviewProviderResponse:async request=>{
  if(request.text.format.name==='furvise_history_repair')throw Object.assign(new Error('repair unavailable'),{name:'TimeoutError'});
  const input=JSON.parse(request.input);return {status:'completed',output_text:JSON.stringify({approved:true,retainedSentenceIndexes:[0],obligations:input.obligations.map(({index})=>({index,status:'answered',sentenceIndexes:[0]}))}),usage:{input_tokens:20,output_tokens:20}};
 }});
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');assert.doesNotMatch(JSON.stringify(r.result.reasoning.answer),/no underlying medical problem/);noWrites(r);
});
test('foreign cited evidence cannot become a complete answer',async t=>{
 clock(t);const q='Summarize Milo history.';
 const r=await exercise(q,{history:true,rows:[care('mine','milo','2026-07-01','general','Milo rested.'),care('other','luna','2026-07-01','general','Luna ate normally.')],messages:[],
 interpretationProposal:proposal(q),expectedReviewCalls:2,reviewResponse:{approved:true},
 providerOverrides:{historyNarrative:{sentences:[{text:'Milo ate normally.',sourceIds:['care:other'],calculations:[]}]}}});
 assert.notEqual(r.result.answerValidation.assessment.outcome,'complete');assert.doesNotMatch(JSON.stringify(r.result.reasoning.answer),/Milo ate normally/);noWrites(r);
});
test('a decade of records reaches both endpoints with source-bound arithmetic',async t=>{
 clock(t);const q='Compare Milo earliest and latest recorded weights and calculate the change.';
 const calc={operation:'difference',operands:[{sourceId:'care:decade-old-weight',field:'text',literal:'28.4 kg'},{sourceId:'care:decade-new-weight',field:'text',literal:'27.8 kg'}],value:0.6,unit:'kg'};
 const text='Milo weighed 28.4 kg on September 4, 2016 and 27.8 kg on September 3, 2026, a decrease of 0.6 kg between those records.';
 const r=await exercise(q,{history:true,fixturePets:stressPets,rows:decadeRows,messages:[],
 interpretationProposal:proposal(q,{operation:'comparison',selection:'comparison',quantity:'measurement',topic:'weight',terms:['weigh'],evidenceNeeds:[{quote:'earliest',sourceTurnId:null,petNames:['Milo'],terms:['weigh'],order:'earliest'},{quote:'latest recorded weights',sourceTurnId:null,petNames:['Milo'],terms:['weigh'],order:'latest'}]}),expectedReviewCalls:1,reviewResponse:{approved:true},
 providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:decade-old-weight','care:decade-new-weight'],calculations:[calc]}]}}});
 assert.equal(decadeRows.length,10968);assert.ok(r.serialized.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET);assert.ok(r.queries.length<80);
 for(const id of ['decade-old-weight','decade-new-weight'])assert.ok(r.prompt.contextRecords.some(s=>s.id==='care:'+id),id);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');assert.match(r.result.reasoning.answer.summary,/0\.6 kg/);noWrites(r);
});

test('malformed primary output remains a bounded incomplete answer without mutations',async t=>{
 clock(t); const q='Summarize Milo history.';
 const r=await exercise(q,{history:true,rows:[care('rest','milo','2026-07-01','general','Milo rested.')],messages:[],
 interpretationProposal:proposal(q),expectedProviderCalls:1,expectedReviewCalls:1,
 providerResponse:async()=>({status:'completed',output_text:'{}',usage:{input_tokens:20,output_tokens:2}})});
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');noWrites(r);
});

const { emptyProposedSemanticFrame } = await import('../../app/lib/intelligence/semantic-frame/extract-frame.ts');
const updateProposal = (question, patch = {}) => proposal(question, {
 mode: 'update', operation: 'general', quantity: null, evidenceBasis: null,
 frame: emptyProposedSemanticFrame(), ...patch,
});
for (const question of ['Milo had a 7 minute play session today. Save this update to care history.', 'Archive Milo.']) {
 test('owner update/action without prior evidence has an explicit valid contract: '+question, async()=>{
  let calls=0;
  const result=await interpretAskQuestion({context:{...context,currentMessage:question},model:'gpt-5-mini',client:{responses:{async create(request){
   calls++; assert.match(request.instructions,/evidenceBasis null when no saved facts are needed/);
   return {status:'completed',output_text:JSON.stringify(updateProposal(question)),usage:{input_tokens:12,output_tokens:8}};
  }}}});
  assert.equal(calls,1); assert.equal(result.request.evidenceBasis,null);
  assert.equal(result.readOnly,false); assert.deepEqual(result.petIds,[pets[0].id]);
  assert.equal(result.history,null); assert.deepEqual(result.frame,emptyProposedSemanticFrame());
 });
 for(const basis of ['general','supplied_context']) test('one re-interpretation repairs contradictory '+basis+' for '+question,async()=>{
  let calls=0;const events=[];
  const invalid=updateProposal(question,{evidenceBasis:basis,premiseQuotes:[question]});
  assert.throws(()=>recoverAskInterpretation(invalid,{...context,currentMessage:question}),/BASIS_UPDATE/);
  const result=await interpretAskQuestion({context:{...context,currentMessage:question},model:'gpt-5-mini',onProviderEvent:e=>events.push(e),client:{responses:{async create(request){
   calls++;if(calls===2)assert.match(request.instructions,/never relabel them as real updates/);
   return {status:'completed',output_text:JSON.stringify(calls===1?invalid:updateProposal(question)),usage:{input_tokens:12,output_tokens:8}};
  }}}});
  assert.equal(calls,2);assert.equal(result.request.evidenceBasis,null);assert.equal(result.readOnly,false);
  assert.equal(events.filter(e=>e.providerErrorCode==='ASK_REQUEST_CONTRACT_BASIS_UPDATE').length,1);
 });
}
for(const question of ['Fictional example: Milo missed breakfast. Save that.', 'If Milo missed breakfast, would you save that?', 'The quote says "Archive Milo." Explain it; do not archive him.']) {
 test('repair preserves non-writing fictional/hypothetical/quoted intent: '+question,async()=>{
  let calls=0;
  const result=await interpretAskQuestion({context:{...context,currentMessage:question},model:'gpt-5-mini',client:{responses:{async create(){
   calls++;const value=calls===1?updateProposal(question,{evidenceBasis:'supplied_context',premiseQuotes:[question]}):proposal(question,{mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'supplied_context',premiseQuotes:[question]});
   return {status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:12,output_tokens:8}};
  }}}});
  assert.equal(calls,2);assert.equal(result.readOnly,true);assert.equal(result.conversationOnly,true);
  assert.deepEqual(result.petIds,[]);assert.equal(result.history,null);assert.deepEqual(result.frame,emptyProposedSemanticFrame());
 });
}
for(const [name,patch,reason] of [
 ['repeated conflicting basis',{evidenceBasis:'general'},'BASIS_UPDATE'],
 ['foreign subject',{petNames:['NotOwned']},'OWNERSHIP'],
 ['missing frame',{frame:null},'FRAME'],
 ['unknown source reference',{referenceTurnIds:['not-a-user-turn']},'REFERENCE'],
]) test('repair remains bounded and rejects '+name,async()=>{
 let calls=0;const question='Archive Milo.';
 await assert.rejects(interpretAskQuestion({context:{...context,currentMessage:question},model:'gpt-5-mini',client:{responses:{async create(){
  calls++;return {status:'completed',output_text:JSON.stringify(updateProposal(question,calls===1?{evidenceBasis:'general'}:patch)),usage:{input_tokens:12,output_tokens:8}};
 }}}}),e=>e.diagnostics.providerErrorCode==='ASK_REQUEST_CONTRACT_'+reason);
 assert.equal(calls,2);
});
