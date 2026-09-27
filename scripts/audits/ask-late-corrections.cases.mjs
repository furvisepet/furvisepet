import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { decisive, care } from './fixtures/ask-lifetime-history.mjs';
import {stressProposal} from './helpers/current-stress-harness.mjs';
import {fixtureSourceSemantics} from './helpers/source-semantics-fixture.mjs';
const meaning=(from,to)=>({classification:'attributed_correction',target:{kind:'scope',from,to,conceptKey:null}});
const unrelated=meaning('2015-01-01T00:00:00Z','2016-01-01T00:00:00Z');
const clocked=new WeakSet();
async function run(t,question,options={}){
 if(!clocked.has(t)){clock(t);clocked.add(t);}
 const r=await exercise(question,{history:true,expectedProviderCalls:0,expectedReviewCalls:0,
  interpretationProposal:stressProposal({question,authority:'effective_fact',petNames:['Milo'],from:'2014-07-01',to:'2014-08-01'}),...options});
 assert.equal(r.interpretationRequests.length,1);
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
 assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedLearnings,[]);
 assert.deepEqual(r.result.acceptedSemanticEvents,[]);
 return r;
}
const coverage=r=>r.context.askHistory.coverage.ticketCoverage;
const limited=r=>assert.equal(r.result.answerValidation.assessment.outcome,'limited');
const lineage=r=>coverage(r).sourceLineage||[];
test('actual callback discovers and qualifies a later unlinked correction',async t=>{
 const r=await run(t,'Did Milo vomit in July 2014?');
 assert.ok(JSON.stringify(lineage(r)).includes('milo-correction'));limited(r);
 assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
});
test('later correction never broadens pet authority or becomes a write',async t=>{
 const foreign=care('foreign-correction','milo','2026-08-20','general','Correction July 2014',{user_id:'foreign-owner'});
 const r=await run(t,'Did Milo vomit in July 2014?',{rows:[...decisive,foreign]});
 assert.ok(JSON.stringify(lineage(r)).includes('milo-correction'));
 assert.doesNotMatch(JSON.stringify(lineage(r)),/foreign-correction|bruno-correction/);
 assert.ok(r.queries.filter(q=>q.table==='read_ask_source_semantics').every(q=>q.args.p_pet_ids.every(id=>id==='milo')));
 limited(r);
});
test('changed or deleted supplemental correction is withheld after fresh lookup',async t=>{
 for(const graph of [{missingSourceIds:['milo-correction']},{sources:[{...decisive.find(r=>r.id==='milo-correction'),note:'Changed to an unrelated report.'}]}]){
  const r=await run(t,'Did Milo vomit in July 2014?',{graph});
  limited(r);assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
  assert.match(JSON.stringify(coverage(r)),/source_semantics_incomplete/);
  assert.ok(r.queries.some(q=>q.table==='read_ask_source_semantics'));
 }
});
test('supplemental RPC failure discloses uncertainty instead of confirming the old note',async t=>{
 const r=await run(t,'Summarize Milo history in July 2014.',{graph:{sourceSemanticsError:'55000'}});
 limited(r);assert.match(JSON.stringify(coverage(r)),/source_semantics_incomplete/);
 assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
});
test('unrelated year is not attached and cannot contaminate requested target',async t=>{
 const excluded=new Set(['milo-correction','bruno-correction','nori-correction','decade-correction']);
 const rows=decisive.filter(r=>!excluded.has(r.id));
 rows.push(care('other-year','milo','2026-08-20','general','Correction to the 2015 vomiting report.'));
 const r=await run(t,'Did Milo vomit in July 2014?',{rows,graph:{sourceSemantics:{'other-year':unrelated}}});
 assert.doesNotMatch(JSON.stringify(lineage(r)),/other-year/);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 assert.equal(r.result.reasoning.model,'server-labs-list');
 assert.ok(!r.result.reasoning.labsList.records.some(x=>x.id==='other-year'));
});
test('discovery is bounded even when unrelated correction notes exhaust the page',async t=>{
 const noise=Array.from({length:15},(_,i)=>care('correction-noise-'+i,'milo','2020-01-01','general','Correction to a 2015 report.'));
 const r=await run(t,'Did Milo vomit in July 2014?',{rows:[...decisive,...noise],
  graph:{sourceSemantics:Object.fromEntries(noise.map(x=>[x.id,unrelated]))}});
 limited(r);assert.match(JSON.stringify(coverage(r)),/source_semantics_incomplete/);
 const searches=r.queries.filter(q=>q.table==='read_ask_source_semantics');
 assert.ok(searches.length>0);assert.ok(searches.every(q=>q.args.p_source_ids.length<=64&&q.args.p_pet_ids.length===1&&q.args.p_pet_ids[0]==='milo'));
 assert.ok(!r.queries.some(q=>q.table==='read_ask_history_candidates'&&q.args.p_terms?.includes('correct')));
});
for(const patch of [{user_id:'foreign-owner'},{pet_profile_id:'bruno'},{deleted_at:'2026-08-21T00:00:00Z'}]){
 test('malformed supplemental boundary is rejected: '+JSON.stringify(patch),async t=>{
  const injected={...care('injected','milo','2026-08-20','general','Correction to 2014 report.'),...patch};
  const r=await run(t,'Summarize Milo history in July 2014.',{graph:{sourceSemanticsPage:{
   complete:true,limit:76,sources:[injected],claims:[fixtureSourceSemantics(injected,meaning('2014-07-01T00:00:00Z','2014-08-01T00:00:00Z'))]}}});
  limited(r);assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
  assert.match(JSON.stringify(coverage(r)),/source_semantics_scope/);
 });
}
