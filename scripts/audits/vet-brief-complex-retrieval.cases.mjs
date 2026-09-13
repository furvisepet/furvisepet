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
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:'milo',feature:'vet_brief',dateRange:{from:'2026-06-01',to:'2026-09-04'},currentMessage:options.message || 'Prepare for vaccinations and discuss historical blood results and the taper.'});
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


test('tomorrow appointment retains historical RPC bounds and does not request future records',async t=>{
 clock(t); const result=await run({message:'For tomorrow’s appointment, compare the historical vaccination reaction and prednisone course.'});
 const queries=result.db.queries.filter(q=>q.table==='read_ask_history_candidates');
 assert.ok(queries.length);
 for(const query of queries){
  assert.ok(query.args.p_from);
  assert.ok(query.args.p_to);
  assert.ok(Date.parse(query.args.p_to)<=Date.now()+1);
 }
 for(const id of ['old-vaccine','recent-med']) assert.ok(result.bundle.allowedIds.includes(id));
});

test('six topics plus six date anchors cannot round every query allocation down to zero', async t => {
 clock(t);
 const terms=Array.from({length:6},(_,i)=>'facet'+i);
 const many=terms.map((term,i)=>care('dense-'+i,'milo',`2024-02-0${i+1}`,'general',`${term}: relevant dated evidence.`));
 const db=database(many);
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:'milo',feature:'vet_brief',dateRange:{from:'2024-01-01',to:'2026-09-04'},currentMessage:'Review '+many.map(r=>r.occurred_at.slice(0,10)).join(', ')});
 const result=await retrieveAskHistory(context,db,['milo'],{plan:{from:null,to:'2026-09-05T00:00:00Z',terms,interpretation:'lexical'},termGroups:terms.map(t=>[t]),periodFrom:'2024-01-01T00:00:00Z'});
 for(const row of many) assert.ok(result.askHistory.entries.some(r=>r.id===row.id),row.id);
 assert.ok(result.askHistory.coverage.queryCount>6);
 assert.ok(result.askHistory.coverage.queryCount<=20);
 assert.ok(result.askHistory.coverage.candidateIds.length<=64);
});

for(const years of [5,10,20,100]) test(`${years}-year evidence survives 100000 newer records with fixed retrieval bounds`,async t=>{
 clock(t);
 const year=2026-years;
 const old=care('decisive-old','milo',`${year}-02-03`,'vet_visit','Vaccination reaction: swelling resolved; no breathing difficulty.');
 const mid=care('decisive-middle','milo',`${Math.floor((year+2026)/2)}-04-09`,'vet_visit','Creatinine 1.2 mg/dL; reference range 0.5 to 1.6 mg/dL.');
 const recent=care('decisive-recent','milo','2026-09-03','medication','Prednisone prescription; administration not confirmed.');
 const noise=Array.from({length:100000},(_,i)=>care('bulk-'+i,'milo','2026-08-01','general','Routine household cleaning.'));
 const db=database([old,mid,recent,care('foreign-risk','bruno',`${year}-02-03`,'vet_visit','Vaccination reaction belonging only to Bruno.'),...noise]);
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:'milo',feature:'vet_brief',dateRange:{from:`${year}-01-01`,to:'2026-09-04'},currentMessage:`Review ${years} years of vaccination reactions, creatinine and prednisone.`});
 const result=await retrieveAskHistory(context,db,['milo'],{plan:{from:null,to:'2026-09-05T00:00:00Z',terms:['vaccination','creatinine','prednisone'],interpretation:'lexical'},termGroups:[['vaccination'],['creatinine'],['prednisone']],periodFrom:'2026-06-01T00:00:00Z'});
 const bundle=vetBriefEvidence(result,{focus:'Visit',topics});
 for(const id of [old.id,mid.id,recent.id])assert.ok(bundle.allowedIds.includes(id),id);
 assert.ok(!bundle.allowedIds.includes('foreign-risk'));
 assert.ok(result.askHistory.coverage.queryCount<=20);assert.ok(result.askHistory.coverage.candidateIds.length<=64);assert.ok(bundle.evidence.records.length<=32);
 assert.ok(JSON.stringify(bundle.evidence.records).length<25000);
 t.diagnostic(`years=${years}, source rows=100004, history queries=${result.askHistory.coverage.queryCount}, retained=${bundle.evidence.records.length}`);
});
test('a late authoritative correction to decades-old evidence replaces the obsolete statement',async t=>{
 clock(t);
 const original=care('old-correctable','milo','2001-02-03','vet_visit','Vaccination caused severe ongoing swelling.');
 const claim={id:'old-claim',user_id:ownerId,subject_type:'pet',subject_id:'milo',claim_kind:'event',operation_type:'assert',concept_key:'vaccination',canonical_concept_key:'vaccination',concept_resolution_status:'canonical',persistence_destination:'history',knowledge_status:'effective',occurred_at:original.occurred_at,recorded_at:original.created_at,provenance_classification:'imported_legacy',structured_value:{title:null,note:original.note,severity:null}};
 const corrected={...claim,id:'new-claim',operation_type:'correct',recorded_at:'2026-08-20T12:00:00Z',structured_value:{title:null,note:'Vaccination swelling resolved the same evening; no breathing difficulty.',severity:null}};
 const db=database([original],{graph:{claims:[claim,corrected],relations:[{id:'correction-edge',user_id:ownerId,from_claim_id:corrected.id,to_claim_id:claim.id,relation_type:'corrects'}],lineage:[{user_id:ownerId,claim_id:claim.id,legacy_row_id:original.id,legacy_table:'pet_care_entries',claim_role:'primary'}],sources:[original]}});
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:'milo',feature:'vet_brief',dateRange:{from:'2001-01-01',to:'2026-09-04'},currentMessage:'Review vaccination reaction history.'});
 const result=await retrieveAskHistory(context,db,['milo'],{plan:{from:null,to:'2026-09-05T00:00:00Z',terms:['vaccination'],interpretation:'lexical'},termGroups:[['vaccination']]});
 const bundle=vetBriefEvidence(result,{focus:'Visit',topics});const text=JSON.stringify(bundle.evidence);
 assert.ok(!text.includes('severe ongoing swelling'));assert.ok(text.includes('resolved the same evening'));assert.ok(text.includes('no breathing difficulty'));
});
