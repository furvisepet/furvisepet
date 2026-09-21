import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {commonHistoryPathEntered}=await import('../app/lib/intelligence/ordinary-history-boundary.ts');
const {retrieveFurviseMemory}=await import('../app/lib/furvise-brain/memory-organ.ts');
const {bindReadTicket}=await import('../app/lib/furvise-brain/read-ticket.ts');
const {bindCompositionalReadTicket}=await import('../app/lib/furvise-brain/read-selection.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {buildAskContext,latestNeedScopedCareIds}=await import('../app/lib/ai/ask-reasoning.ts');
const {deterministicReadProjection}=await import('../app/lib/intelligence/read-projection.ts');
const {derivePublicationAuthority}=await import('../app/lib/intelligence/publication-authority.ts');
const {evidenceSource}=await import('../app/lib/intelligence/ask-evidence.ts');
const {buildLabsList}=await import('../app/lib/intelligence/labs-list.ts');
const pets=['a','b'].map(id=>({id,user_id:'owner',name:id.toUpperCase(),species:'dog',weight_value:99,weight_unit:'kg',avoid_ingredients:[]}));
const row=(id,pet,day,note)=>({id,user_id:'owner',pet_profile_id:pet,note,title:null,category:'general',deleted_at:null,occurred_at:'2025-01-'+day+'T12:00:00Z',created_at:'2025-01-'+day+'T12:00:00Z'});
const rows=[row('a-old','a','01','weight 3 kg. food'),row('a-new','a','03','body weight was 4 kg.'),row('b-new','b','04','weight 5 kg.'),row('dental','a','02','dental visit')];
const raw=(selection=true)=>({operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['weight']}],outputs:{completeness:selection?'sufficient':'exhaustive',ordering:'desc',limit:null},searchHints:[],...(selection?{selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}}:{})});
async function fixture({selected=true,anchor=false,hints=[],single=false,global=false}={}){
 const p=raw(selected);p.searchHints=hints;if(anchor){p.operation='read_since_event';p.temporal.anchor={concept:'dental',relation:'after'};}
 if(global){p.selection.groupBy=[];p.selection.union[0].take.per='result';}
 const ids=anchor||single?['a']:['a','b'];const ticket=selected?bindCompositionalReadTicket(p,ids):bindReadTicket(p,ids);
 const result=await retrieveReadTicket(ticket,{userId:'owner',ownedPetIds:ids,from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'}, {
 page:async q=>rows.filter(r=>r.pet_profile_id===q.petId&&r.occurred_at>=q.from&&r.occurred_at<q.to).sort((a,b)=>q.ordering==='desc'?b.occurred_at.localeCompare(a.occurred_at):a.occurred_at.localeCompare(b.occurred_at)).slice(q.offset,q.offset+q.limit),
 effective:async rows=>({records:rows,reliable:true})});
 const evidence={version:'ask-evidence.v1',petNames:{a:'A',b:'B'},scope:{authorizedPetIds:ids,requestText:'original',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
 interpretation:{operation:'recall',readOperation:'recall',petIds:ids,readOnly:true,request:{readTicket:ticket,mode:'read',quantity:'records',evidenceBasis:'saved_history',requirements:[],referenceTurnIds:[],profileFields:[]}},
 history:{ticketCoverage:result.coverage,provenance:[],candidateIds:result.records.map(r=>'care:'+r.id),eventCandidateIds:[],reasons:[],needs:[]},sources:ids.map(id=>evidenceSource(id,'care_entries',result.records.filter(r=>r.pet_profile_id===id).map(r=>'care:'+r.id))),represented:[],losses:[],verifiedFacts:[],completeness:{retrieval:'unknown',corrections:'complete',extraction:'unknown',grouping:'unknown'}};
 return {ticket,result,evidence};
}
function context(f,question){return buildAskContext({evidenceContract:f.evidence,profiles:pets,careEntries:f.result.records,memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question,now:new Date('2026-09-20T00:00:00Z')},false);}
test('ordinary history without a ticket stops before any DB call',async()=>{
 let calls=0;const db={from(){calls++;throw Error('DB');}};
 await assert.rejects(retrieveFurviseMemory({feature:'ask',askInterpretation:{request:{mode:'read',evidenceBasis:'saved_history'}}},db,{}),/ASK_MEMORY_READ_TICKET_REQUIRED/);assert.equal(calls,0);
});
test('general conversation and profile obligations are not reclassified as history',()=>{
 for(const request of [{mode:'conversation',evidenceBasis:'general'},{mode:'read',evidenceBasis:'saved_profile'}]){assert.equal(commonHistoryPathEntered({interpretation:{request}}),false);}
});
for(const options of [{selected:true,single:true},{selected:true},{selected:false},{selected:true,anchor:true},{selected:true,global:true}])test('bound facts ignore raw wording '+JSON.stringify(options),async()=>{
 const f=await fixture(options);const variants=['show the records','only mention the old food one','compare the current profile instead in CSV'];
 const expected=f.result.records.map(r=>'care:'+r.id);const certificate=JSON.stringify(f.result.coverage);let authority,values;
 for(const q of variants){f.evidence.scope.requestText=q;f.evidence.interpretation.request.question=q;const c=context(f,q);const derived=derivePublicationAuthority(c.promptContext.evidenceContract);const ids=derived?.authorizedSourceIds||c.records.map(r=>r.id);const facts=c.records.map(r=>[r.id,r.text,r.occurredAt]);if(authority){assert.deepEqual(ids,authority);assert.deepEqual(facts,values);}authority=ids;values=facts;assert.equal(JSON.stringify(f.result.coverage),certificate);assert.deepEqual(c.records.filter(r=>r.sourceType==='care_update').map(r=>r.id),expected);assert.equal(c.records.some(r=>r.sourceType==='profile'),false);}
});
test('prose table and CSV cannot enter factual projection or change Labs IDs',async()=>{
 const f=await fixture();for(const format of ['prose','table','csv']){f.evidence.interpretation.request.outputFormat=format;const before=JSON.stringify(f.evidence);const limitation=deterministicReadProjection(f.evidence);
 assert.deepEqual(limitation,{sentences:[{text:"I couldn\u2019t verify the specific event you asked about from the records retrieved for this answer. That doesn\u2019t establish that it never happened.",sourceIds:[],calculations:[]}]});
 assert.equal(JSON.stringify(f.evidence),before);assert.doesNotMatch(JSON.stringify(limitation),/care:|profile:|4 kg|5 kg|99 kg|certified/);
 const labs=buildLabsList(f.evidence,f.result.records);assert.deepEqual(labs.records.map(r=>r.id),f.result.records.map(r=>r.id));}
});
test('ordinary hint toward old food or foreign profile cannot change winners',async()=>{
 const a=await fixture(),b=await fixture({hints:['food','another pet profile 99']});assert.deepEqual(a.result.records,b.result.records);assert.deepEqual(a.result.coverage,b.result.coverage);
});
test('protected legacy shapes, proposals and confirmed continuations remain outside firewall',async()=>{
 const f=await fixture();assert.equal(commonHistoryPathEntered(f.evidence),true);
 for(const patch of [{outputs:{...f.ticket.outputs,strategy:'calendar_samples'}},{temporal:{...f.ticket.temporal,calendar:'oldest_year'}},{episode:{operation:'count'}}]){
  const e=structuredClone(f.evidence);Object.assign(e.interpretation.request.readTicket,patch);assert.equal(commonHistoryPathEntered(e),false);
 }
 const e=structuredClone(f.evidence);delete e.history;assert.equal(commonHistoryPathEntered(e),false);
 const continuation={...f.evidence,completedOwnerNote:{}};assert.equal(commonHistoryPathEntered(continuation),false);
 const legacy=structuredClone(f.evidence);legacy.interpretation.request.evidenceNeeds=[{id:'need:0'}];assert.equal(commonHistoryPathEntered(legacy),false);
});
test('typed needs never invoke quote-based latest prompt reselection',async()=>{
 const f=await fixture();f.evidence.interpretation.request.evidenceNeeds=[{id:'need:0',order:'latest',quote:'last saved note',petIds:['a']}];f.evidence.scope.authorizedPetIds=['a'];f.evidence.interpretation.request.readTicket={...f.ticket,needs:[{id:'need:0'}]};
 assert.equal(latestNeedScopedCareIds(f.evidence,[]),null);
});

test('a real legacy factual projection is blocked for the same common ticket and candidate sources',async()=>{
 const f=await fixture({single:true});f.evidence.scope.requestText='latest recorded weight';f.evidence.history.eventCandidateIds=f.result.records.map(r=>'care:'+r.id);
 const e=context(f,'latest recorded weight').promptContext.evidenceContract;
 assert.equal(commonHistoryPathEntered(e),true);assert.ok(e.represented.some(r=>r.sourceId==='care:a-new'));
 const legacy=structuredClone(e);delete legacy.interpretation.request.readTicket;
 const selected=deterministicReadProjection(legacy);assert.ok(selected);assert.deepEqual(selected.sentences.flatMap(s=>s.sourceIds),['care:a-new']);assert.match(selected.sentences[0].text,/4 kg/);
 for(const format of ['prose','table','csv']){e.interpretation.request.outputFormat=format;const before=JSON.stringify(e);assert.equal(deterministicReadProjection(e),null);assert.equal(JSON.stringify(e),before);}
});
