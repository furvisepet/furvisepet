import * as C from './helpers/calculation-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import {clock,exercise} from '../scripts/audits/helpers/lifetime-harness.mjs';
import {pets as templates,ownerId} from '../scripts/audits/fixtures/ask-lifetime-history.mjs';
import {stressProposal} from '../scripts/audits/helpers/current-stress-harness.mjs';
const {selectionPublication}=await import('../app/lib/intelligence/selection-publication.ts');
const {resultSetSnapshotMatches}=await import('../app/lib/intelligence/result-set-publication.ts');
const {labsListReviewFailure,serializeLabsList}=await import('../app/lib/intelligence/labs-list.ts');
const {publicationClaimFailures}=await import('../app/lib/intelligence/publication-authority.ts');
const {readTicketProviderSchema,calculationReadTicketProviderSchema}=await import('../app/lib/furvise-brain/read-ticket-provider-schema.ts');
const pets=['Quartz','Nyx'].map((name,i)=>({...templates[i],id:'phase3-'+i,name,user_id:ownerId}));
const row=(id,body,day=1,petId=pets[0].id)=>({...C.row(id,body,day,petId),user_id:ownerId});
const proposition=(authority='stored_report',selection='summary',names=[pets[0].name])=>stressProposal({
 authority,selection,petNames:names,from:'2024-01-01',to:'2025-01-01'});
async function run(t,rows,p=proposition(),extra={}){
 clock(t);const q='Show the requested stored observations.';
 const r=await exercise(q,{fixturePets:pets,petId:pets[0].id,conversationPetId:pets[0].id,rows,messages:[],
  history:true,interpretationProposal:{...p,question:q},expectedProviderCalls:0,expectedReviewCalls:0,...extra});
 assert.equal(r.interpretationRequests.length,1);
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
 assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedSemanticEvents,[]);
 return r;
}
for(const [label,a,b] of [
 ['mass','Body mass: 7 lb','Correction: body mass was 8 lb, not 7 lb.'],
 ['medication','Recorded dose: 3 mg each evening.','Correction: recorded dose was 4 mg each morning.'],
 ['routine','Rice served after a 12 min walk.','Correction: oats served before a 9 min walk.'],
 ['unicode','Observation: \u03b1\u0301 \ud83d\udc3e\nfirst | note','Correction: \u03b2\u2014second\nline.'],
])for(const selection of ['summary','comparison'])test('stored report '+label+'/'+selection+' preserves both quotations without settling truth',async t=>{
 const rows=[row(label+'-a',a),row(label+'-b',b,3)];
 const r=await run(t,rows,proposition('stored_report',selection)),labs=r.result.reasoning.labsList;
 assert.equal(r.result.reasoning.model,'server-labs-list');assert.equal(labs.ticket.authority,'stored_report');
 assert.deepEqual(labs.records.map(x=>x.body),rows.map(x=>x.note));
 assert.deepEqual(labs.records.map(x=>x.recorded_at),rows.map(x=>x.created_at));
 assert.deepEqual(labs.records.map(x=>x.sourceId),rows.map(x=>'care:'+x.id));
 for(const body of [a,b])assert.ok(r.result.reasoning.answer.summary.includes(JSON.stringify(body).replace(/[\\|]/g,'\\$&')));
 assert.match(r.result.reasoning.answer.summary,/Stored reports only/);
 assert.match(r.result.reasoning.answer.summary,/no supersession is certified/);
 assert.match(r.result.reasoning.answer.summary,/not one database snapshot/);
 assert.equal(labsListReviewFailure(r.result.reasoning),null);
 assert.deepEqual(JSON.parse(JSON.stringify(labs)),labs);
 const c=r.context.askHistory.coverage.ticketCoverage;
 assert.ok(c.sourceLineage.length);assert.ok(c.effectiveStream.every(s=>s.storedReportsCertified));
 if(!labs.ticket.selection)assert.equal(c.resultSet.subjects[0].lineageClosed,false);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
});
for(const selection of ['summary','latest'])test('effective/current proposition remains limited with unresolved lineage/'+selection,async t=>{
 const r=await run(t,[row('a','Body mass: 7 lb'),row('b','Correction: body mass was 8 lb.',3)],proposition('effective_fact',selection));
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
 assert.ok(!r.result.reasoning.labsList?.records.length);
});
test('effective arithmetic with unresolved measurement lineage never executes',async t=>{
 const p=proposition('effective_fact','comparison');
 p.quantity='measurement';p.calculatePlan={operation:'calculate',calculations:[C.calculation('difference',[
  {...C.slot(1,0,pets[0].name,'measurement','kg'),role:'target'},
  {...C.slot(0,0,pets[0].name,'measurement','kg'),role:'reference'}],'kg')],resultSelection:null};
 const r=await run(t,[row('a','Body mass: 7 kg'),row('b','Correction: body mass was 8 kg.',3)],p,{expectedCalculationModel:'server-calculation-unavailable'});
 assert.equal(r.result.reasoning.calculationLabs,undefined);
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
});
test('report ticket rejects direct, count and result-chain arithmetic before execution',()=>{
 const {probes: _probes,...input}=proposition('stored_report','comparison').readTicket; void _probes;
 const ticket=C.bindTypedReadTicket(input,pets.map(p=>p.id));
 const direct=C.calculation('difference',[C.slot(1,0,pets[0].name),C.slot(0,0,pets[0].name)]);
 assert.throws(()=>C.bindCalculatePlan({operation:'calculate',calculations:[direct]},ticket,pets));
 assert.throws(()=>C.bindCalculatePlan({operation:'calculate',calculations:[direct,C.calculation('convert',[{kind:'result',role:'source',calculationId:'c1'}],'g','next')]},ticket,pets));
 const {probes: _countProbes,...countInput}=proposition().readTicket; void _countProbes;
 const countTicket=C.bindTypedReadTicket(countInput,pets.map(p=>p.id));
 assert.throws(()=>C.bindCalculatePlan({operation:'calculate',calculations:[C.calculation('count_records',[],'records')]},countTicket,pets));
});
test('different subjects retain their own conflicting wording; foreign and deleted sources never certify',async t=>{
 const rows=pets.flatMap((p,i)=>[row('s'+i+'a','Recorded amount '+(2+i)+' ml',1,p.id),row('s'+i+'b','Correction: amount '+(5+i)+' ml',3,p.id)]);
 rows.push({...row('foreign','Foreign correction: 999 ml'),user_id:'another-owner'}, {...row('deleted','Deleted correction: 888 ml'),deleted_at:'2024-02-01T00:00:00Z'});
 const r=await run(t,rows,proposition('stored_report','comparison',pets.map(p=>p.name)));
 const labs=r.result.reasoning.labsList;assert.equal(labs.records.length,4);
 for(const x of labs.records)assert.equal(rows.find(y=>y.id===x.id).pet_profile_id,x.petId);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/999|888/);
 assert.equal(new Set(labs.records.map(x=>x.petId)).size,2);
});
for(const selection of ['summary','comparison'])test('receipt authority and exact publication resist tampering/'+selection,async t=>{
 const r=await run(t,[row('a','Length 7 cm'),row('b','Correction: length 8 cm',3)],proposition('stored_report',selection));
 const labs=r.result.reasoning.labsList, changed=structuredClone(labs.ticket);changed.authority='effective_fact';
 if(labs.ticket.selection){
  const selected=selectionPublication(changed,labs.coverage,labs.records);assert.equal(selected.complete,false);assert.equal(selected.transportValid,false);
  const forged=structuredClone(labs.coverage);forged.authority='effective_fact';
  assert.equal(selectionPublication(changed,forged,labs.records).complete,false);
 }else{
  assert.equal(resultSetSnapshotMatches(changed,labs.coverage,labs.records),false);
  const forged=structuredClone(labs.coverage);forged.authority='effective_fact';forged.resultSet.authority='effective_fact';
  assert.equal(resultSetSnapshotMatches(changed,forged,labs.records),false);
 }
 for(const mutate of [x=>x.labsList.records[0].body='Current settled length is 8 cm',x=>x.labsList.records[0].recorded_at='2020-01-01T00:00:00Z',
  x=>x.labsList.records[0].petId=pets[1].id,x=>x.labsList.ticket.authority='effective_fact',x=>x.answer.summary='The corrected value is 8 cm']){
  const changed=structuredClone(r.result.reasoning);mutate(changed);assert.notEqual(labsListReviewFailure(changed),null);
 }
 assert.deepEqual(publicationClaimFailures(r.result.reasoning.evidenceContract,[{obligationId:'result_set:'+pets[0].id,text:'The current length is 8 cm.',sourceIds:['care:b']}]),
  ['publication_stored_report_requires_labs']);
 assert.equal(serializeLabsList(labs),r.result.reasoning.answer.summary);
});
test('missing/changed source versions and graph failure cannot become report authority',async t=>{
 const rows=[row('a','Recorded 7 cm'),row('b','Correction: 8 cm',3)];
 for(const extra of [{failGraph:true},{graph:{missingSourceIds:['a']}},{graph:{sources:[{...rows[0],note:'Changed after acquisition'}]}}]){
  await t.test(JSON.stringify(extra),async sub=>{const r=await run(sub,rows,proposition(),extra);assert.deepEqual(r.result.reasoning.relevantContextIds,[]);});
 }
});
test('provider authority survives bind and JSON; omission remains effective-only compatibility',()=>{
 const read=proposition().readTicket,check=new Ajv({allErrors:true}).compile(readTicketProviderSchema);
 assert.equal(check(read),true,JSON.stringify(check.errors));
 const {probes,...input}=read; void probes;
 const bound=C.bindTypedReadTicket(input,[pets[0].id]);
 assert.equal(bound.authority,'stored_report');
 const {subjects,...reload}=JSON.parse(JSON.stringify(bound));
 assert.deepEqual(C.bindTypedReadTicket(reload,subjects.petIds),bound);
 const omitted=structuredClone(input);delete omitted.authority;
 assert.equal(C.bindTypedReadTicket(omitted,[pets[0].id]).authority,undefined);
 for(const authority of [null,'current','report',true])assert.throws(()=>C.bindTypedReadTicket({...input,authority},[pets[0].id]));
 const calcCheck=new Ajv({allErrors:true}).compile(calculationReadTicketProviderSchema(false));
 const selection=proposition('stored_report','comparison').readTicket;assert.equal(calcCheck(selection),false);
 selection.authority='effective_fact';assert.equal(calcCheck(selection),true,JSON.stringify(calcCheck.errors));
});

test('plain conflicting observations need no correction phrase to remain reports',async t=>{
 const rows=[row('plain-a','Body mass: 11 lb'),row('plain-b','Body mass: 13 lb',2)];
 const r=await run(t,rows);
 assert.deepEqual(r.result.reasoning.labsList.records.map(x=>x.body),rows.map(x=>x.note));
 assert.match(r.result.reasoning.answer.summary,/do not establish current or corrected facts/);
 assert.equal(r.result.reasoning.labsList.coverage.sourceLineage,undefined);
});
for(const format of ['list','table'])test('stored quotation publication preserves requested '+format+' format',async t=>{
 const p=proposition('stored_report','comparison');p.outputFormat=format==='list'?'bullets':format;
 const r=await run(t,[row('a','Length 4 cm | \u03b1'),row('b','Correction: 5 cm | \u03b2',3)],p);
 assert.equal(r.result.reasoning.labsList.presentation,format);
 assert.equal(labsListReviewFailure(r.result.reasoning),null);
 assert.match(r.result.reasoning.answer.summary,/Recorded at|recorded at/);
 assert.match(r.result.reasoning.answer.summary,/Stored reports only/);
 if(format==='table')assert.match(r.result.reasoning.answer.summary,/\\\|/);
});
test('joint result selection carries report authority and rejects fact relabeling',async t=>{
 const p=proposition('stored_report','comparison',pets.map(p=>p.name));
 p.readTicket.selection.groupBy=[];for(const c of p.readTicket.selection.union)c.take.per='result';
 const rows=[row('a','First wording',1),row('b','Correction: second wording',3,pets[1].id)];
 const r=await run(t,rows,p),labs=r.result.reasoning.labsList;
 assert.equal(labs.records.length,2);assert.equal(labs.coverage.resultSelection.length,2);
 assert.ok(labs.coverage.resultSelection.every(c=>c.authority==='stored_report'&&c.certified));
 const changed=structuredClone(labs.coverage);changed.resultSelection[0].authority='effective_fact';
 assert.equal(selectionPublication(labs.ticket,changed,labs.records).complete,false);
});
test('source authority cannot be minted by a store returning only effective-fact closure',async()=>{
 const {probes,...input}=proposition('stored_report','comparison').readTicket; void probes;
 const ticket=C.bindTypedReadTicket(input,[pets[0].id]),rows=[row('a','One record')];
 const result=await C.retrieveReadTicket(ticket,{userId:ownerId,ownedPetIds:[pets[0].id],from:'2024-01-01T00:00:00Z',to:'2025-01-01T00:00:00Z',asOf:'2025-01-01T00:00:00Z'},{
  page:async()=>rows,effective:async records=>({records,reliable:true}),
  effectiveWindow:async()=>({records:rows,lineageClosed:true,replacementSeedsExhausted:true,sourceLineage:[],reasons:[],graphCalls:1,lineageRows:1})});
 assert.deepEqual(result.records,[]);
 assert.equal(selectionPublication(ticket,result.coverage,[]).complete,false);
});
test('semantic anchors and episode obligations cannot silently become report-level facts',()=>{
 const {probes,...input}=proposition().readTicket; void probes;
 for(const patch of [{operation:'read_since_event',temporal:{...input.temporal,anchor:{concept:'event',relation:'after'}}},
  {temporal:{...input.temporal,calendar:'oldest_year'}},{episode:{operation:'membership',referent:null}},{outputs:{...input.outputs,strategy:'chronological'}}])
  assert.throws(()=>C.bindTypedReadTicket({...input,...patch},[pets[0].id]));
});

for(const authority of ['stored_report','effective_fact'])test('linked superseded wording and effective replacement remain distinct/'+authority,async t=>{
 const rows=[row('linked-old','Length 4 cm'),row('linked-new','Correction: length 5 cm',3)];
 const claims=rows.map((r,i)=>({id:'claim-'+r.id,user_id:ownerId,subject_type:'pet',subject_id:r.pet_profile_id,claim_kind:'event',
  operation_type:i?'correct':'assert',concept_key:'length',canonical_concept_key:'length',concept_resolution_status:'canonical',
  persistence_destination:'history',knowledge_status:'effective',occurred_at:r.occurred_at,recorded_at:r.created_at,
  provenance_classification:'imported_legacy',structured_value:{title:null,note:r.note,severity:null}}));
 const graph={claims,relations:[{id:'linked-edge',user_id:ownerId,from_claim_id:claims[1].id,to_claim_id:claims[0].id,relation_type:'corrects'}],
  lineage:claims.map((c,i)=>({user_id:ownerId,claim_id:c.id,legacy_row_id:rows[i].id,legacy_table:'pet_care_entries',claim_role:'primary'}))};
 const r=await run(t,rows,proposition(authority),{graph});
 assert.equal(r.result.reasoning.model,'server-labs-list');
 assert.deepEqual(r.result.reasoning.labsList.records.map(x=>x.id),authority==='stored_report'?['linked-old','linked-new']:['linked-new']);
 if(authority==='stored_report')assert.match(r.result.reasoning.answer.summary,/do not establish current or corrected facts/);
});

for(const authority of ['stored_report','effective_fact'])test('native correction statements remain source-exact without dropping intermediate reports/'+authority,async t=>{
 const old=row('native-root','Length 4 cm');
 const claim=(id,body,day,operation)=>({id,user_id:ownerId,subject_type:'pet',subject_id:pets[0].id,claim_kind:'event',
  operation_type:operation,concept_key:'length',canonical_concept_key:'length',concept_resolution_status:'canonical',
  persistence_destination:'history',knowledge_status:'effective',occurred_at:row('time','',day).occurred_at,recorded_at:row('time','',day).created_at,
  provenance_classification:'owner_report',structured_value:{title:null,note:body,severity:null}});
 const claims=[claim('root',old.note,1,'assert'),claim('middle','Length 5 cm',3,'correct'),claim('final','Length 6 cm',4,'correct')];
 const graph={claims,relations:[['middle','root'],['final','middle']].map(([from,to],i)=>({id:'edge-'+i,user_id:ownerId,from_claim_id:from,to_claim_id:to,relation_type:'corrects'})),
  lineage:[{user_id:ownerId,claim_id:'root',legacy_row_id:old.id,legacy_table:'pet_care_entries',claim_role:'primary'}]};
 const r=await run(t,[old],proposition(authority),{graph}),labs=r.result.reasoning.labsList;
 assert.equal(r.result.reasoning.model,'server-labs-list');
 assert.deepEqual(labs.records.map(x=>x.sourceId),authority==='stored_report'?['care:native-root','claim:middle','claim:final']:['claim:final']);
 assert.deepEqual(labs.records.map(x=>x.body),authority==='stored_report'?claims.map(c=>c.structured_value.note):['Length 6 cm']);
 if(authority==='stored_report')assert.deepEqual(labs.records.map(x=>x.recorded_at),claims.map(c=>c.recorded_at));
});

test('withheld roots cannot re-enter stored report authority',async t=>{
 const rows=[row('active','Visible note'),row('withheld','Secret old note',2)];
 const r=await run(t,rows,proposition(),{graph:{withheld_source_ids:['withheld']}});
 assert.deepEqual(r.result.reasoning.labsList.records.map(x=>x.id),['active']);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Secret old note/);
});
test('native report IDs require report-qualified provenance, not a claim-shaped row name',async()=>{
 const {careEvidenceId}=await import('../app/lib/intelligence/ask-evidence.ts');
 const history={provenance:[{sourceId:'claim:native',status:'attributed_report'}],ticketCoverage:{authority:'stored_report'}};
 assert.equal(careEvidenceId('claim-native',history),'claim:native');
 assert.equal(careEvidenceId('claim-native',{...history,ticketCoverage:{authority:'effective_fact'}}),'care:claim-native');
 assert.equal(careEvidenceId('claim-native',{...history,provenance:[]}), 'care:claim-native');
});
