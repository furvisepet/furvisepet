import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {buildLabsList,serializeLabsList,labsTaskComplete}=await import('../app/lib/intelligence/labs-list.ts');
const {selectionPublication}=await import('../app/lib/intelligence/selection-publication.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const {generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {bindCompositionalReadTicket}=await import('../app/lib/furvise-brain/read-selection.ts');
const noProvider={responses:{create:async()=>{throw Error('No publication model for certified reports');}}};
const petIds=['4714932a-35b0-46be-b979-3d25f7f68361','5056000c-55b0-4933-a054-0fcb29179447','69f15630-f14e-41af-a5e7-2eac77862f12'];
const eventIds=['733f2393-3ffa-4e62-a193-c9397cadb53a','ec4cf968-f867-44a1-9da6-94498621adca','f711f92e-ee75-49f1-a51b-e681e527650f'];
const pets=['Aster','Bramble','Echo'].map((name,i)=>({id:petIds[i],name,user_id:'owner',species:'dog',avoid_ingredients:[]}));
const clause=(direction='desc',count=1)=>({orderBy:[{field:'event_at',direction}],take:{count,per:'group'}});
async function fixture(topic='weight',union=[clause()]){
 const ticket=bindCompositionalReadTicket({operation:'read',subjectScope:'named',needs:[],episode:null,
  temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[{kind:'text_any',terms:[topic]}],
  outputs:{completeness:'sufficient',ordering:'desc',limit:null},selection:{groupBy:['subject'],union}},petIds);
 const rows=pets.flatMap((pet,i)=>[15,14,13].map(day=>({id:day===15?eventIds[i]:pet.id+'-'+day,
  user_id:'owner',pet_profile_id:pet.id,category:'general',title:null,deleted_at:null,
  occurred_at:'2026-09-'+day+'T12:00:00Z',created_at:'2026-09-'+day+'T12:00:00Z',
  note:topic==='weight'?pet.name+' weight '+[30.31,4.71,7.01][i]+' kg.':pet.name+' '+topic+' recorded.'})));
 const scope={userId:'owner',ownedPetIds:petIds,from:'1900-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'};
 const result=await retrieveReadTicket(ticket,scope,{
  page:async({petId,offset,limit,ordering})=>rows.filter(r=>r.pet_profile_id===petId)
   .sort((a,b)=>ordering==='desc'?b.occurred_at.localeCompare(a.occurred_at):a.occurred_at.localeCompare(b.occurred_at)).slice(offset,offset+limit),
  effective:async()=>{throw Error('directional path expected');},
  effectiveWindow:async({rows})=>({records:rows,lineageClosed:true,replacementSeedsExhausted:true,
   sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:['no_cross_query_snapshot']})});
 const evidence={version:'ask-evidence.v1',petNames:Object.fromEntries(pets.map(p=>[p.id,p.name])),
  scope:{authorizedPetIds:petIds,requestText:'most recent matching record for each',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{operation:'recall',readOperation:'recall',petIds,readOnly:true,request:{readTicket:ticket,
   mode:'read',quantity:topic==='weight'?'measurement':'records',evidenceBasis:'saved_history',requirements:[],referenceTurnIds:[]}},
  history:{ticketCoverage:result.coverage,provenance:[],candidateIds:result.records.map(r=>'care:'+r.id),
   eventCandidateIds:result.records.map(r=>'care:'+r.id),reasons:[],needs:[]},
  sources:[],represented:[],losses:[],verifiedFacts:[],completeness:{retrieval:'partial',corrections:'complete',extraction:'unknown',grouping:'unknown'}};
 return {evidence,rows:result.records,context:{currentMessage:evidence.scope.requestText,pet:pets[0],eligiblePets:pets,
  memories:[],careEntries:result.records,askHistory:{entries:result.records,coverage:{ticketCoverage:result.coverage}}}};
}
function publish(f){
 const labs=buildLabsList(f.evidence,f.rows);assert.ok(labs);
 return {labsList:labs,evidenceContract:f.evidence,answer:{title:'Furvise',summary:serializeLabsList(labs),sections:[],safetyNote:null},
  relevantContextIds:labs.records.map(r=>r.sourceId),applicationActions:[],careActions:[],semanticEvents:[],learnings:[],
  proposedHistoryUpdate:{shouldOffer:false},safetyLevel:'normal',responseMode:'practical_guidance',suggestedFollowUps:[]};
}
async function reviewed(f,r=publish(f)){
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),true);
 return validateGeneratedAnswer(r,f.context,'routine',petIds);
}

test('A1 certified selections publish despite partial global history, without mutation obligations',async()=>{
 const f=await fixture(),r=publish(f);
 assert.equal(f.evidence.history.ticketCoverage.status,'partial');
 assert.deepEqual(r.labsList.records.map(r=>r.id).sort(),[...eventIds].sort());
 const v=await reviewed(f,r);
 assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'complete');
 for(const p of pets)assert.ok(v.response.answer.summary.includes(p.name));
 for(const weight of ['30.31','4.71','7.01'])assert.ok(v.response.answer.summary.includes(weight));
 assert.match(v.response.answer.summary,/broader history was not exhaustively reviewed/);
 assert.equal(f.evidence.history.ticketCoverage.status,'partial');
 assert.deepEqual(v.response.applicationActions,[]);
});
test('one uncertified subject preserves independently certified subjects as a limited answer',async()=>{
 const f=await fixture(),g=f.evidence.history.ticketCoverage.groups[1];
 g.blocked=true;g.selectionStatus='partial';g.clauses[0].certified=false;
 const r=publish(f),v=await reviewed(f,r);
 assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');
 assert.deepEqual(r.labsList.records.map(r=>r.id).sort(),[eventIds[0],eventIds[2]].sort());
 assert.match(r.answer.summary,/Bramble could not be certified/);assert.doesNotMatch(r.answer.summary,/4\.71/);
});
test('exhaustive requirement is not discharged by bounded selection certificates',async()=>{
 const f=await fixture();
 f.evidence.interpretation.request.readTicket=structuredClone(f.evidence.interpretation.request.readTicket);
 f.evidence.interpretation.request.readTicket.outputs.completeness='exhaustive';
 const v=await reviewed(f);assert.equal(v.assessment.outcome,'limited');
});

test('a certified selected source lost before publication fails closed',async()=>{
 const f=await fixture();f.rows=f.rows.filter(r=>r.id!==eventIds[1]);
 const r=publish(f);assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),false);
});
test('changed ID, value, date, subject, omitted row or unsupported claim cannot pass exact review',async()=>{
 for(const mutate of [r=>r.labsList.records[0].id='other',r=>r.labsList.records[0].body='weight 99 kg',
  r=>r.labsList.records[0].event_at='2010-01-01',r=>r.labsList.records[0].petId=petIds[1],
  r=>r.labsList.records.pop(),r=>r.answer.summary+=' All vomiting episodes ever: none.']){
  const f=await fixture(),r=publish(f);mutate(r);
  assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),false);
 }
});
test('blocked lineage cannot certify a present record',async()=>{
 const f=await fixture();f.evidence.history.ticketCoverage.effectiveStream[1].lineageClosed=false;
 const r=publish(f),v=await reviewed(f,r);
 assert.equal(v.assessment.outcome,'limited');
 assert.ok(!r.labsList.records.some(r=>r.id===eventIds[1]));
 assert.doesNotMatch(r.answer.summary,/4\.71/);
});
test('food and medication use the same certificate and publication machinery',async()=>{
 for(const topic of ['food','medication']){
  const f=await fixture(topic),v=await reviewed(f);
  assert.equal(v.assessment.outcome,'complete');assert.ok(v.response.answer.summary.includes(topic));
 }
});

test('earliest, take two and union preserve clause-specific source certification',async()=>{
 for(const union of [[clause('asc')],[clause('desc',2)],[clause('asc'),clause('desc')]]){
  const f=await fixture('food',union),r=publish(f),v=await reviewed(f,r);
  assert.equal(v.assessment.outcome,'complete');
  const proof=selectionPublication(r.labsList.ticket,r.labsList.coverage,r.labsList.records);
  assert.equal(proof.certificates.length,3*union.length);
  assert.ok(proof.certificates.every(c=>c.certified));
 }
});
test('counts, episodes, comparisons and aggregates are not certified by selection alone',async()=>{
 for(const operation of ['count','episode','comparison']){
  const f=await fixture();f.evidence.interpretation.operation=operation;f.evidence.interpretation.readOperation=operation;
  assert.equal(buildLabsList(f.evidence,f.rows),null);
 }
 const f=await fixture();f.evidence.interpretation.request.quantity='duration';
 assert.equal(buildLabsList(f.evidence,f.rows),null);
});
test('certificate shape mismatch never silently certifies another clause',async()=>{
 const f=await fixture();f.evidence.history.ticketCoverage.groups[0].clauses[0].direction='asc';
 const v=await reviewed(f);assert.equal(v.assessment.outcome,'limited');
 assert.ok(!v.response.labsList.records.some(r=>r.id===eventIds[0]));
});
test('real generation and review consume the same Labs snapshot without a publication provider',async()=>{
 const f=await fixture();
 const r=await generateContextAwareAskResponse({evidenceContract:f.evidence,profiles:pets,careEntries:f.rows,
  memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question:f.context.currentMessage,
  requestId:'offline-publication',locale:'en-CA',client:noProvider});
 assert.equal(r.model,'server-labs-list');assert.equal(r.labsList.records.length,3);
 assert.equal((await reviewed(f,r)).assessment.outcome,'complete');
});

test('missing certificates cannot turn global partial or empty evidence into task completion',async()=>{
 const f=await fixture();delete f.evidence.history.ticketCoverage.groups;
 const r=publish(f),v=await reviewed(f,r);
 assert.equal(r.labsList.records.length,0);assert.equal(v.assessment.outcome,'limited');
 assert.doesNotMatch(r.answer.summary,/No matching records were found/);
});
test('explicit exhaustive record read without selection still remains limited on partial coverage',async()=>{
 const f=await fixture(),ticket=structuredClone(f.evidence.interpretation.request.readTicket);
 delete ticket.selection;ticket.outputs.completeness='exhaustive';
 f.evidence.interpretation.request.readTicket=ticket;
 const v=await reviewed(f);assert.equal(v.assessment.outcome,'limited');
 assert.match(v.response.answer.summary,/partial results/);
});
test('certificate cannot be used for a changed clause, subject label, or injected action',async()=>{
 const f=await fixture(),r=publish(f);
 f.evidence.petNames[petIds[0]]='Other pet';
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),false);
 const f2=await fixture(),r2=publish(f2);r2.applicationActions=[{kind:'care_history.save'}];
 assert.equal(await reviewHistoricalAnswer({result:r2,client:noProvider}),false);
});
