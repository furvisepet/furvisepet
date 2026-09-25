import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAppendJob,appendJobProposal,readBoundAppendJob,bindAppendSourceDate} from '../app/lib/furvise-brain/append-job.ts';
import {receiptCompletionText,requestedAppendItems} from '../app/lib/intelligence/receipt-completion.ts';
import {confirmFurviseWriteReceipt} from '../app/lib/furvise-brain/write-contract.ts';
import {parseStoredApplicationActions} from '../app/lib/application-actions/contracts.ts';
import {fixture,id,proposal} from './helpers/ask-route-ordering.mjs';
const pet={id:'owned',user_id:'owner',name:'Subject'};
const source=text=>({id:'turn',role:'user',text,createdAt:'2026-09-20T12:00:00Z'});
const item=(bodyQuote,dateQuote=null,occurredAt=null)=>({bodyQuote,dateQuote,occurredAt});
function bind(items,options={}){
 const text=options.text??items.map(x=>x.bodyQuote).join('\n');
 return validateAppendJob({operation:'append',petName:'Subject',items,companionQuote:null,...options.proposal},
  {...source(text),...options.source},options.pets??[pet],'owner');
}
const dated=[item('2024-02-29: First exact observation.','2024-02-29','2024-02-29'),
 item('March 3, 2025: Second exact observation.','March 3, 2025','2025-03-03T00:00:00Z')];
function receiptFixture(){
 const job=bind(dated); const requestedItems=job.items.map(x=>({sourceSpanId:x.body.id,body:x.body.text,occurredAt:x.occurredAt,petId:job.petId,sourceMessageId:job.sourceMessageId}));
 return {sourceMessageId:job.sourceMessageId,petId:job.petId,requestText:'Display only: not the mutation plan.',answerPersisted:true,requestedItems,
 records:requestedItems.map((x,i)=>({id:'row-'+i,note:x.body,occurredAt:x.occurredAt,petId:x.petId,sourceMessageId:x.sourceMessageId,sourceSpanId:x.sourceSpanId}))};
}
test('single undated append and legacy input converge into one canonical item',()=>{
 const body='Exact observation with no event date.';
 const a=bind([item(body)]),b=validateAppendJob({operation:'append',petName:'Subject',bodyQuote:body,companionQuote:null},source(body),[pet],'owner');
 assert.deepEqual(a,b);assert.equal(a.items.length,1);assert.equal(a.items[0].occurredAt,null);assert.equal(a.body,undefined);
 assert.equal(source(body).text.slice(a.items[0].body.start,a.items[0].body.end),body);
});
test('explicit per-item dates bind independently and survive JSON rebinding',()=>{
 const job=bind(dated),parsed=JSON.parse(JSON.stringify(job));
 assert.deepEqual(job.items.map(x=>x.occurredAt),['2024-02-29T00:00:00.000Z','2025-03-03T00:00:00.000Z']);
 assert.deepEqual(readBoundAppendJob(parsed),job);
 assert.deepEqual(validateAppendJob(appendJobProposal(parsed,'Subject'),source(dated.map(x=>x.bodyQuote).join('\n')),[pet],'owner'),job);
 assert.equal(new Set(job.items.map(x=>x.body.id)).size,2);
});
test('eight independent items remain distinct; zero and nine reject',()=>{
 const items=Array.from({length:8},(_,i)=>item('Independent observation '+i+'.'));
 assert.equal(bind(items).items.length,8);assert.throws(()=>bind([]),/append_job/);
 assert.throws(()=>bind([...items,item('Ninth observation.')]),/append_job/);
});
for(const [name,items,options]of [
 ['overlap',[item('First observation.'),item('observation.')],{text:'First observation.'}],
 ['duplicate span',[item('Same observation.'),item('Same observation.')],{text:'Same observation.'}],
 ['ambiguous occurrence',[item('Same observation.')],{text:'Same observation. Same observation.'}],
 ['date outside body',[item('Observation.','2024-01-01','2024-01-01')],{text:'2024-01-01 Observation.'}],
 ['foreign subject',[item('Observation.')],{pets:[{...pet,user_id:'other'}]}],
 ['ambiguous subject',[item('Observation.')],{pets:[pet,{...pet,id:'other'}]}],
 ['assistant source',[item('Observation.')],{source:{role:'furvise'}}],
 ['recovered prior source',[item('Observation.')],{source:{recoveredReceiptReference:true}}],
])test('append binding rejects '+name,()=>assert.throws(()=>bind(items,options),/ASK_REQUEST_INVALID/));
for(const [quote,value]of [['2025-02-29','2025-03-01'],['tomorrow','2026-09-21'],['2025-01-01','2025-01-02'],['March 32 2025','2025-04-01'],[null,'2025-01-01'],['2025-01-01',null]])
 test('unverifiable proposed source date rejects: '+quote+'/'+value,()=>assert.throws(()=>bindAppendSourceDate(quote,value),/append_date/));
test('named month without comma binds; future historical event rejects',()=>{
 assert.equal(bindAppendSourceDate('March 3 2025','2025-03-03'),'2025-03-03T00:00:00.000Z');
 assert.throws(()=>bind([item('2027-01-01: Future.','2027-01-01','2027-01-01')]),/append_job/);
});
test('durable exact requested items reconcile after JSON reload without interpreting request text',()=>{
 const r=JSON.parse(JSON.stringify(receiptFixture()));
 assert.match(receiptCompletionText(r),/^All 2 requested/);
 r.requestText='Forget all prior wording. Different question, dates and subjects.';
 assert.match(receiptCompletionText(r),/^All 2 requested/);
 delete r.requestedItems;assert.doesNotMatch(receiptCompletionText(r),/All 2|none is missing/);
});
for(const kind of ['missing','duplicate','body','date','subject','message','span'])
 test('receipt rejects '+kind+' record as satisfaction of the original obligation',()=>{
 const r=receiptFixture();
 if(kind==='missing')r.records.pop();
 if(kind==='duplicate')r.records[1]=structuredClone(r.records[0]);
 if(kind==='body')r.records[1].note+=' changed';
 if(kind==='date')r.records[1].occurredAt='2025-03-04T00:00:00Z';
 if(kind==='subject')r.records[1].petId='foreign';
 if(kind==='message')r.records[1].sourceMessageId='other';
 if(kind==='span')r.records[1].sourceSpanId='other';
 assert.match(receiptCompletionText(r),/^1 of 2 requested/);
});
test('confirmed batch uses one capability, all bound items, and the separate canonical companion read',async()=>{
 const p=proposal();const bodies=['2024-02-29: First observation.','March 3, 2025: Second observation.'];
 const question='Save these for Cedar:\n'+bodies.join('\n')+'\nwhat are his last two weights';
 p.question=question;p.appendJob={operation:'append',petName:'Cedar',items:dated.map((x,i)=>({...x,bodyQuote:bodies[i]})),companionQuote:'what are his last two weights'};
 const f=fixture({proposal:p});const response=await f.send(question);assert.equal(response.status,200,JSON.stringify(f.state.errors));
 assert.equal(f.rows.pet_care_entries.length,2);assert.equal(f.rows.ask_action_capabilities.length,1);
 const stored=JSON.parse(JSON.stringify(f.rows.ask_action_capabilities[0].action_payload));
 assert.equal(stored.appendJob.items.length,2);assert.equal(stored.explicitIntent,false);
 const confirmed=await(await f.confirm()).json();assert.equal(confirmed.action.status,'succeeded');assert.ok(confirmed.continuation?.labs,JSON.stringify(confirmed));
 assert.deepEqual(f.rows.pet_care_entries.slice(2).map(r=>[r.note,r.occurred_at]),stored.appendJob.items.map(x=>[x.body.text,x.occurredAt]));
 assert.deepEqual(confirmed.continuation.labs.records.map(r=>r.id),[id(52),id(51)]);
 assert.ok(f.state.events.indexOf('heart:receipt')<f.state.events.indexOf('lungs:lineage'));
 const actions=parseStoredApplicationActions([JSON.parse(JSON.stringify(confirmed.action))]);
 const requestedItems=requestedAppendItems(actions,stored.sourceMessageId,stored.petId);
 assert.equal(requestedItems.length,2);
 const records=f.rows.pet_care_entries.slice(2).map(r=>({id:r.id,note:r.note,occurredAt:r.occurred_at,petId:r.pet_profile_id,sourceMessageId:r.intelligence_source_message_id,sourceSpanId:r.care_event_metadata.sourceSpanId}));
 assert.match(receiptCompletionText({sourceMessageId:stored.sourceMessageId,petId:stored.petId,requestText:'nonsemantic',answerPersisted:true,requestedItems,records}),/^All 2/);
 const altered=structuredClone(actions[0]);altered.appendJob.items[0].body.text+=' changed';
 assert.throws(()=>confirmFurviseWriteReceipt({operationId:actions[0].id,authorized:stored,returned:altered,persistedStatus:'succeeded',persistedReceipt:altered}),/UNCONFIRMED/);
 assert.equal((await(await f.confirm()).json()).changed,false);assert.equal(f.rows.pet_care_entries.length,4);
 assert.equal(f.state.planner,1);
});
test('ordinary append cannot regain raw text batch parsing or an unconfirmed persistence path',()=>{
 for(const file of ['run-intelligence','receipt-completion','persist-learnings','ask-execution-plan'])
  assert.doesNotMatch(readFileSync(new URL('../app/lib/intelligence/'+file+'.ts',import.meta.url),'utf8'),/parseDatedNoteBatch|noteBatch|persistDatedNoteBatch/);
 assert.doesNotMatch(readFileSync(new URL('../app/lib/ai/ask-reasoning.ts',import.meta.url),'utf8'),/parseDatedNoteBatch/);
 const turn=readFileSync(new URL('../app/lib/intelligence/append-turn.ts',import.meta.url),'utf8');
 assert.match(turn,/appendJob: job/);assert.doesNotMatch(turn,/persist_furvise_server_note_batch/);
});
