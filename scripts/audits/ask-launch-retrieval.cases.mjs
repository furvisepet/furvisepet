import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,clock,database} from './helpers/lifetime-harness.mjs';
import {care,now} from './fixtures/ask-lifetime-history.mjs';
const {retrieveAskHistory}=await import('../../app/lib/intelligence/history-retrieval.ts');
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';

const sourceDays=['2018-05-18','2026-05-21'];
const important=sourceDays.map((date,i)=>care(`dated-${i}`,'milo',date,'general',`Milo played for ${i ? 21 : 13} minutes.`));
const noise=Array.from({length:5000},(_,i)=>care(`noise-${String(i).padStart(5,'0')}`,'milo',new Date(Date.parse('2010-01-01')+i*115200000).toISOString().slice(0,10),'general','Routine household observation.'));
for(const question of ['Compare Milo on 18 May 2018 and 21 May 2026. Save nothing.',
 'Compara Milo el 18 de mayo de 2018 y el 21 de mayo de 2026. No guardes nada.',
 'Miloの2018年5月18日と2026年5月21日を比較。保存しないで。']) {
 test(`actual retrieval retains eight-year anchors behind 5000 other rows: ${question}`,async t=>{
  clock(t);
  const r=await exercise(question,{history:true,rows:[...important,...noise],messages:[],
   interpretationProposal:{operation:'comparison',readOperation:'comparison',selection:'summary',subject:'explicit',petNames:['Milo'],topic:'activity',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()},expectedReviewCalls:null});
  for(const row of important) assert.ok(r.context.askHistory.entries.some(entry=>entry.id===row.id),`missing dated source ${row.id}`);
  assert.ok(r.context.askHistory.coverage.queryCount<=20);
  assert.ok(r.context.askHistory.entries.length<=32);
  assert.equal(r.result.acceptedCareActions.length,0);
  assert.equal(r.result.acceptedSemanticEvents.length,0);
 });
}


test('slow optional reads cannot consume the mandatory correction-validation allowance',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now});
 t.mock.method(console,'info',()=>{});
 const question='Compare Milo on 18 May 2018 and 21 May 2026. Save nothing.';
 const rows=[...important,...noise];
 const initial=await exercise(question,{history:true,rows,messages:[],interpretationProposal:{operation:'comparison',readOperation:'comparison',selection:'summary',subject:'explicit',petNames:['Milo'],topic:'activity',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()},expectedReviewCalls:null});
 const db=database(rows);
 const delayed=chain=>{
  let signal;
  const abort=chain.abortSignal.bind(chain),then=chain.then.bind(chain);
  chain.abortSignal=value=>{signal=value;abort(value);return chain;};
  chain.then=(resolve,reject)=>{
   // Simulate 1.2-second transport reads, honoring an earlier caller deadline.
   for(let i=0;i<12&&!signal?.aborted;i++)t.mock.timers.tick(100);
   return then(resolve,reject);
  };
  return chain;
 };
 const slow={...db,from:(...args)=>delayed(db.from(...args)),rpc:(...args)=>delayed(db.rpc(...args))};
 const started=Date.now();
 const result=await retrieveAskHistory(initial.context,slow,['milo']);
 assert.notEqual(result.askHistory.coverage.corrections,'unavailable');
 for(const row of important)assert.ok(result.askHistory.entries.some(entry=>entry.id===row.id),row.id);
 assert.ok(Date.now()-started<=5000,'overall history budget must not increase');
 assert.ok(db.queries.some(query=>query.table==='read_ask_history_correction_page'));
});
