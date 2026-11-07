import test from 'node:test';
import assert from 'node:assert/strict';
import {findScopedStoredReportCandidate, certifyScopedStoredReport} from '../app/lib/intelligence/scoped-stored-report.ts';

const row = () => ({id:'one', user_id:'owner', pet_profile_id:'pet', category:'general', title:null,
 note:'A morning observation.', severity:null, occurred_at:'2025-03-09T08:30:00Z',
 created_at:'2025-03-09T09:00:00Z', updated_at:'2025-03-09T09:00:00Z', deleted_at:null});
const ticket = () => ({authority:'stored_report', operation:'read', subjects:{petIds:['pet']},
 temporal:{from:'2025-03-09T08:00:00Z',to:'2025-03-10T07:00:00Z',anchor:null,calendar:null},
 predicates:[{kind:'text_any',terms:['observation']}],
 outputs:{completeness:'sufficient',ordering:'asc',limit:null,strategy:null}});
async function find(rows, overrides={}) {
 let calls=0, window;
 const input={userId:'owner',ownedPetIds:['pet'],ticket:ticket(),
  from:'2025-03-09T08:15:00Z',to:'2025-03-10T08:00:00Z',pageSize:4,
  page:async (...args)=>{calls++;window=args;if(rows instanceof Error) throw rows;return rows;},...overrides};
 const candidate=await findScopedStoredReportCandidate(input);
 return {candidate,calls,window};
}
test('finds one matching source inside clipped DST-length window', async()=>{
 const r=await find([row()]);
 assert.deepEqual(r.candidate,row());
 assert.deepEqual(r.window,['2025-03-09T08:15:00.000Z','2025-03-10T07:00:00.000Z',4]);
});
test('found source requires independent fresh proof',async()=>{
 const {candidate}=await find([row()]);
 const db={rpc:()=>({abortSignal:async()=>({data:{sources:[row()],claims:[],relations:[],lineage:[],withheld_claim_ids:[],withheld_source_ids:[],truncated:false},error:null})})};
 assert.equal((await certifyScopedStoredReport({db,userId:'owner',ownedPetIds:['pet'],ticket:ticket(),candidate,deadline:Date.now()+5000})).sourceId,'one');
 const changed={...row(),note:'Changed'};
 const bad={rpc:()=>({abortSignal:async()=>({data:{sources:[changed],claims:[],relations:[],lineage:[],withheld_claim_ids:[],withheld_source_ids:[],truncated:false},error:null})})};
 assert.equal(await certifyScopedStoredReport({db:bad,userId:'owner',ownedPetIds:['pet'],ticket:ticket(),candidate,deadline:Date.now()+5000}),null);
});
for (const [name,rows] of [
 ['multiple matches',[row(),{...row(),id:'two'}]],
 ['full page',[row(),{...row(),id:'two'},{...row(),id:'three'},{...row(),id:'four'}]],
 ['no match',[{...row(),note:'Unrelated'}]],
 ['foreign record',[{...row(),user_id:'other'}]],
 ['outside access window',[{...row(),occurred_at:'2025-03-09T08:05:00Z'}]],
 ['read error',new Error('failed')]
]) test(name+' is not a source candidate',async()=>assert.equal((await find(rows)).candidate,null));
for(const [name,mutate] of [
 ['missing date',t=>t.temporal.from=null],
 ['effective fact',t=>t.authority='effective_fact'],
 ['exhaustive results',t=>t.outputs.completeness='exhaustive'],
 ['event anchor',t=>t.temporal.anchor={concept:'x'}],
 ['multiple pets',t=>t.subjects.petIds.push('other')]
]) test(name+' never invokes a source-window scan',async()=>{
 const t=ticket();mutate(t);const r=await find([row()],{ticket:t});assert.equal(r.candidate,null);assert.equal(r.calls,0);
});
test('unowned pet and empty accessible window never scan',async()=>{
 assert.equal((await find([row()],{ownedPetIds:[]})).calls,0);
 assert.equal((await find([row()],{to:'2025-03-09T08:00:00Z'})).calls,0);
});
