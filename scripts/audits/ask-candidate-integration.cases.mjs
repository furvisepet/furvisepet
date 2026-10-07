import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,database,clock} from './helpers/lifetime-harness.mjs';
import {datedSelectionProposal} from './helpers/dated-selection-fixture.mjs';
import {care,irrelevant,ownerId,pets} from './fixtures/ask-lifetime-history.mjs';
const {buildFurviseContext}=await import('../../app/lib/intelligence/retrieve-context.ts');
const {retrieveAskHistory,planHistoricalQuery}=await import('../../app/lib/intelligence/history-retrieval.ts');
// The legacy lexical RPC is a Vet Brief reader component. Ordinary Ask requires
// a bound ticket and uses its certified table read; no test restores the old fallback.
const plan=(terms,from=null,to=null)=>({terms,from,to,interpretation:terms.length?'lexical':'period'});
async function legacyRead(question,{readPlan,rows=[],...options}){
 assert.ok(readPlan);const db=database(rows,options);
 const initial=await buildFurviseContext({feature:'vet_brief',supabase:db,userId:ownerId,petId:'milo',currentMessage:question});
 const context=await retrieveAskHistory(initial,db,['milo'],{plan:readPlan,termGroups:readPlan.terms.length?[readPlan.terms]:[]});
 assert.equal(context.feature,'vet_brief');return {context,queries:db.queries};
}
test('Vet Brief lexical reader uses candidate RPC and preserves exact title-only old evidence',async t=>{
 clock(t);const old={...care('old-title','milo','2011-02-01','symptom','Result pending; not confirmed.'),title:'Urine test'};
 const run=await legacyRead('What did the February 1, 2011 urine-test result say?',{readPlan:plan(['urine','urinalysis'],'2011-02-01T00:00:00Z','2011-02-02T00:00:00Z'),rows:[old,...irrelevant('milo',1000)]});
 const calls=run.queries.filter(q=>q.table==='read_ask_history_candidates');
 assert.equal(calls.length,2);assert.ok(run.queries.some(q=>q.table==='read_ask_history_correction_page'));
 assert.deepEqual(calls[0].args.p_terms,['urine','urinalysis']);assert.equal(calls[0].args.p_pet_id,'milo');
 assert.ok(!('p_owner_id' in calls[0].args));assert.ok(calls[0].signal instanceof AbortSignal);
 const retained=run.context.askHistory.entries.find(row=>row.id===old.id);assert.ok(retained);assert.equal(retained.note,old.note);assert.equal(retained.title,old.title);
});
for(const [code,reason] of [['THROW_ABORT','candidate_rpc_timeout'],['57014','candidate_rpc_timeout'],['PGRST202','candidate_rpc_unavailable'],['42883','candidate_rpc_unavailable'],['55000','candidate_rpc_timeout_configuration'],['XX000','candidate_rpc_unavailable']]){
 test('Vet Brief candidate failure '+code+' is coverage loss, not absence',async t=>{
  clock(t);const run=await legacyRead('How many weight records has Milo ever had?',{readPlan:plan(['weight','weigh']),candidateError:code});
  const history=run.context.askHistory.coverage;assert.notEqual(history.retrieval,'complete');
  assert.ok(history.reasons.includes(reason));assert.equal(history.perPet[0].exhausted,false);assert.deepEqual(run.context.askHistory.entries,[]);
 });
}
test('current three-pet dated selections use certified RLS periods without legacy RPC fallback',async t=>{
 clock(t);const question='Give me one dated September 2026 fact for Milo, one dated September 2026 fact for Luna, and one dated September 2026 fact for Oscar.';
 const rows=[care('milo-sep','milo','2026-09-02','general','On September 2, 2026, Milo played for 17 minutes.'),care('luna-sep','luna','2026-09-02','general','On September 2, 2026, Luna rested after lunch.'),care('oscar-sep','oscar','2026-09-02','general','On September 2, 2026, Oscar walked normally.')];
 const run=await exercise(question,{history:true,fixturePets:pets,rows,candidateError:'PGRST202',
  interpretationProposal:datedSelectionProposal({question,petNames:['Milo','Luna','Oscar'],requests:['Milo','Luna','Oscar'].map(name=>({quote:'one dated September 2026 fact for '+name,petNames:[name],from:'2026-09-01T00:00:00Z',to:'2026-10-01T00:00:00Z'}))})});
 assert.equal(run.result.reasoning.model,'server-labs-list');assert.deepEqual(new Set(run.result.reasoning.relevantContextIds),new Set(rows.map(row=>'care:'+row.id)));
 for(const record of run.result.reasoning.labsList.records)assert.equal(record.body,rows.find(row=>'care:'+row.id===record.sourceId).note);
 assert.equal(run.context.askHistory.coverage.ticketCoverage.status,'complete');assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
 assert.equal(run.queries.filter(q=>q.table==='read_ask_history_candidates').length,0);
 assert.ok(run.queries.some(q=>q.table==='pet_care_entries'&&q.filters.length>=5));
});
test('all emitted lexical vocabulary fits the production RPC validator',()=>{
 const expected=['vomit','threw up','thrown up','stool','diarrh','weight','weigh','food','rice','diet','litter','medication','stiff','urine','urinalysis','blood','diagnos'],emitted=new Set();
 for(const topic of ['vomiting','soft stool','weight','food','litter','medication','urine','blood','diagnosis']){
  const p=planHistoricalQuery('What '+topic+' records have I reported?');assert.ok(p);
  for(const term of p.terms){assert.match(term,/^[A-Za-z][A-Za-z -]*[A-Za-z]$/);assert.ok(term.length>=3&&term.length<=32);emitted.add(term);}
 }assert.deepEqual([...emitted].sort(),expected.sort());
});
test('Vet Brief date-only requests keep the ordered table path',async t=>{
 clock(t);const run=await legacyRead('Summarize the records in 2011.',{readPlan:plan([],'2011-01-01T00:00:00Z','2012-01-01T00:00:00Z'),rows:[care('old','milo','2011-02-01','general','Owner reported rest.')]});
 const supplementary=run.queries.filter(q=>q.table==='read_ask_history_candidates');
 assert.equal(supplementary.length,0);assert.ok(run.queries.some(q=>q.table==='read_ask_history_correction_page'));
 assert.ok(run.queries.some(q=>q.table==='pet_care_entries'&&q.orders.some(([key,asc])=>key==='id'&&!asc)));
});
for(const patch of [{user_id:'foreign-owner'},{pet_profile_id:'bruno'},{deleted_at:'2026-09-03T00:00:00Z'}])test('invalid legacy RPC source fails closed: '+JSON.stringify(patch),async t=>{
 clock(t);const source={...care('foreign','milo','2011-02-01','weight','Milo weighed 28.4 kg.'),...patch};
 const run=await legacyRead('What weight records exist?',{readPlan:plan(['weight','weigh']),rows:[],candidateRowsOverride:[source]});
 assert.equal(run.context.askHistory.coverage.retrieval,'unavailable');assert.deepEqual(run.context.askHistory.entries,[]);assert.equal(run.context.owner.userId,ownerId);
});
test('current Ask title-only read certifies exact wording with zero answer SDK and no lexical RPC',async t=>{
 clock(t);const question='What did the February 1, 2011 urine-test result say?',old={...care('title-current','milo','2011-02-01','symptom','Result pending; not confirmed.'),title:'Urine test'};
 const run=await exercise(question,{history:true,rows:[old,...irrelevant('milo',1000)],candidateError:'PGRST202',
  interpretationProposal:datedSelectionProposal({question,petNames:['Milo'],requests:[{quote:'February 1, 2011 urine-test',from:'2011-02-01T00:00:00Z',to:'2011-02-02T00:00:00Z',terms:['urine','urinalysis']}]})});
 assert.equal(run.result.reasoning.model,'server-labs-list');assert.equal(run.result.reasoning.labsList.records[0].body,old.note);assert.deepEqual(run.result.reasoning.relevantContextIds,['care:title-current']);
 assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);assert.equal(run.queries.filter(q=>q.table==='read_ask_history_candidates').length,0);
 assert.deepEqual(run.result.acceptedCareActions,[]);assert.deepEqual(run.result.acceptedLearnings,[]);
});
