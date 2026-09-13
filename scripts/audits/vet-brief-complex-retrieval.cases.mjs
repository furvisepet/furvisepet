import assert from 'node:assert/strict';
import test from 'node:test';
import {database,clock} from './helpers/lifetime-harness.mjs';
import {care,ownerId} from './fixtures/ask-lifetime-history.mjs';
const {buildFurviseContext}=await import('../../app/lib/intelligence/retrieve-context.ts');
const {retrieveAskHistory}=await import('../../app/lib/intelligence/history-retrieval.ts');
const {vetBriefEvidence}=await import('../../app/lib/vet-brief/evidence.ts');
const topics=[{label:'Vaccination',terms:['vaccin','reaction']},{label:'Labs',terms:['blood','creatinine']},{label:'Medication',terms:['prednisone','taper']}];
const rows=[care('old-vaccine','milo','2001-02-03','vet_visit','Vaccination record; owner reported a reaction the following day.'),care('middle-lab','milo','2014-04-09','vet_visit','Blood result: creatinine 1.2 mg/dL; original reference interval missing.'),care('recent-med','milo','2026-09-03','medication','Prednisone taper starts tomorrow; last dose has not yet occurred.'),care('foreign','bruno','2001-02-03','medication','Prednisone 90 mg belongs to Bruno.'),...Array.from({length:5000},(_,i)=>care('routine-'+i,'milo','2026-08-01','general','Routine bedding washed.'))];
async function run(options={}){
 const db=database(rows,options);
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:'milo',feature:'vet_brief',dateRange:{from:'2026-06-01',to:'2026-09-04'},currentMessage:'Prepare for vaccinations and discuss historical blood results and the taper.'});
 const retrieved=await retrieveAskHistory({...context,...(options.historyAccess?{historyAccess:options.historyAccess}:{})},db,['milo'],{plan:{from:null,to:'2026-09-05T00:00:00Z',terms:topics.flatMap(t=>t.terms),interpretation:'lexical'},termGroups:topics.map(t=>t.terms),periodFrom:'2026-06-01T00:00:00Z'});
 return {context,retrieved,db,bundle:vetBriefEvidence(retrieved,{focus:'Visit',topics})};
}
test('independent appointment topics retain decades-old, middle and recent evidence through shared bundle amid 5000 routine records',async t=>{
 clock(t);const result=await run();
 assert.ok(!result.context.careEntries.some(r=>r.id==='old-vaccine'));
 for(const id of ['old-vaccine','middle-lab','recent-med']) assert.ok(result.bundle.allowedIds.includes(id),id);
 assert.ok(!result.bundle.allowedIds.includes('foreign'));
 assert.ok(result.bundle.evidence.records.length<=32);
 assert.ok(result.retrieved.askHistory.coverage.queryCount<=20);
 assert.ok(result.bundle.warnings.some(w=>/Only part/.test(w)));
});
test('changed source is withheld and coverage loss is visible instead of raw record fallback',async t=>{
 clock(t);const result=await run({graph:{sources:rows.map(r=>r.id==='recent-med'?{...r,note:'Changed medication record'}:r)}});
 assert.ok(!result.bundle.allowedIds.includes('recent-med'));
 assert.ok(!JSON.stringify(result.bundle).includes('last dose has not yet occurred'));
 assert.match(result.bundle.warnings.join(' '),/Only part|could not/);
});
test('historical transport failure keeps partial coverage explicit without leaking unverified recent originals',async t=>{
 clock(t);const result=await run({failGraph:true});
 assert.deepEqual(result.bundle.evidence.records,[]);
 assert.match(result.bundle.warnings.join(' '),/could not be verified/);
});

test('background searches preserve subscription bounds while recent context has its own period',async t=>{
 clock(t);const result=await run({historyAccess:{months:60,from:'2021-09-04T00:00:00Z',to:'2026-09-05T00:00:00Z'}});
 assert.ok(!result.bundle.allowedIds.includes('old-vaccine'));
 assert.ok(!result.bundle.allowedIds.includes('middle-lab'));
 assert.ok(result.bundle.allowedIds.includes('recent-med'));
 assert.equal(result.retrieved.askHistory.coverage.plan.from,'2021-09-04T00:00:00Z');
});

test('six requested topics each retain a search slot even when the purpose names several dates',async t=>{
 clock(t);
 const sixTopics=Array.from({length:6},(_,i)=>({label:'Topic '+i,terms:['facet'+i]}));
 const many=[...Array.from({length:6},(_,i)=>care('facet-'+i,'milo','2024-01-0'+(i+1),'general','Unique facet'+i+' recorded.')),...rows];
 const db=database(many);
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:'milo',feature:'vet_brief',dateRange:{from:'2026-06-01',to:'2026-09-04'},currentMessage:'Compare all six topics with records on 2024-01-01, 2024-01-02 and 2024-01-03.'});
 const result=await retrieveAskHistory(context,db,['milo'],{plan:{from:null,to:'2026-09-05T00:00:00Z',terms:sixTopics.flatMap(t=>t.terms),interpretation:'lexical'},termGroups:sixTopics.map(t=>t.terms),periodFrom:'2026-06-01T00:00:00Z'});
 for(let i=0;i<6;i++) assert.ok(result.askHistory.entries.some(r=>r.id==='facet-'+i),'facet '+i);
 assert.ok(result.askHistory.coverage.queryCount<=20);
 assert.ok(result.askHistory.coverage.candidateIds.length<=64);
 assert.ok(result.askHistory.entries.length<=32);
});

test('an explicit middle-history month survives broad endpoint context and earlier matching measurements',async t=>{
 clock(t);
 const weights=[...Array.from({length:45},(_,i)=>care('weight-old-'+i,'milo','2022-01-01','general','Body weight 4 kg.')),
 care('weight-april','milo','2024-04-09','general','Body weight 3.97 kg on a household scale.'),care('weight-latest','milo','2026-09-03','general','Body weight 3.8 kg.'),...rows];
 const db=database(weights);
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:'milo',feature:'vet_brief',dateRange:{from:'2024-04-01',to:'2024-04-30'},currentMessage:'Compare April 2024 body weight with the current profile weight.'});
 const result=await retrieveAskHistory(context,db,['milo'],{plan:{from:null,to:'2026-09-05T00:00:00Z',terms:['weight'],interpretation:'lexical'},termGroups:[['weight']],periodFrom:'2024-04-01T00:00:00Z',periodTo:'2024-05-01T00:00:00Z'});
 assert.ok(result.askHistory.entries.some(r=>r.id==='weight-april'));
 assert.ok(result.askHistory.coverage.queryCount<=20);
 assert.ok(result.askHistory.coverage.candidateIds.length<=64);
 assert.ok(result.askHistory.entries.length<=32);
});
