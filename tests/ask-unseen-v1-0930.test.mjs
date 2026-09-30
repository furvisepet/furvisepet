import {fixtureSemanticsPage} from '../scripts/audits/helpers/source-semantics-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return s === 'server-only'
  ? { url: 'data:text/javascript,export {};', format: 'module', shortCircuit: true } : next(s, c); } });
globalThis.fetch = async () => { throw Error('OFFLINE_ONLY'); };
const { createEffectiveWindowResolver } = await import('../app/lib/intelligence/history-retrieval.ts');
const { retrieveReadTicket } = await import('../app/lib/furvise-brain/lungs.ts');
const { bindCompositionalReadTicket, eventOrder } = await import('../app/lib/furvise-brain/read-selection.ts');
const scope = { userId: 'owner', ownedPetIds: ['a','b','c'], from: '2010-01-01T00:00:00Z',
  to: '2027-01-01T00:00:00Z', asOf: '2026-09-20T00:00:00Z' };
const at = i => new Date(Date.UTC(2023,10,i+1)).toISOString();
const row = (pet, i, note='weight') => ({ id: pet+'-'+i, user_id:'owner', pet_profile_id:pet,
  occurred_at:at(i), created_at:at(i), updated_at:at(i), deleted_at:null, severity:null, title:null, note, category:'general' });
const clause = (direction='desc', count=1) => ({ orderBy:[{field:'event_at',direction}], take:{count,per:'group'} });
const plan = (pets=['a'], topic='weight', union=[clause()], limit=null) => bindCompositionalReadTicket({
  operation:'compare', temporal:{from:null,to:null,anchor:null,calendar:null}, predicates:[{kind:'text_any',terms:[topic]}],
  needs:[], selection:{groupBy:['subject'],union}, outputs:{completeness:'sufficient',ordering:'desc',limit},
},pets);
const claim = (id, pet, i, operation='assert', note='weight') => ({ id,user_id:'owner',subject_id:pet,subject_type:'pet',
  structured_value:{note,title:null,severity:null}, occurred_at:at(i), recorded_at:operation==='assert'?at(i):'2026-01-01T00:00:00Z',
  operation_type:operation, knowledge_status:'effective', persistence_destination:'history', claim_kind:'observation',
  concept_key:'observation', canonical_concept_key:null, concept_resolution_status:'unresolved', provenance_classification:'owner_report' });
const link = (claimId, sourceId) => ({user_id:'owner',claim_id:claimId,legacy_row_id:sourceId,legacy_table:'pet_care_entries',claim_role:'primary'});
const edge = (from,to,relation_type='supersedes') => ({id:from+'-'+to,user_id:'owner',from_claim_id:from,to_claim_id:to,relation_type});
function fixture(rows, graph={}, pets=['a']) {
  const pages=[], calls=[];
  // SQL-faithful bounded RPC mock. In particular tombstone markers for care
  // roots are returned ONLY for p_care_ids, not for merely linked sources.
  const db={rpc(name,args){if(name==='read_ask_source_semantics')return {abortSignal:async()=>fixtureSemanticsPage([...rows,...(graph.sources||[])],args,graph.sourceSemantics)};assert.equal(name,'read_ask_history_correction_page'); calls.push(args);
    return {abortSignal:async()=>{
      const claims=graph.claims||[], edges=graph.edges||[], links=graph.links||[];
      const seeds=claims.filter(c=>args.p_seed_pet_ids.includes(c.subject_id)
        && ['correct','supersede'].includes(c.operation_type)
        && (!args.p_event_from||c.occurred_at>=args.p_event_from)&&(!args.p_event_to||c.occurred_at<args.p_event_to)
        && edges.some(e=>e.from_claim_id===c.id&&['corrects','supersedes'].includes(e.relation_type)));
      const roots=new Set([...args.p_claim_ids,...seeds.map(c=>c.id),...links.filter(l=>args.p_care_ids.includes(l.legacy_row_id)).map(l=>l.claim_id)]);
      const relations=edges.filter(e=>roots.has(e.from_claim_id)||roots.has(e.to_claim_id));
      const ids=new Set([...roots,...relations.flatMap(e=>[e.from_claim_id,e.to_claim_id])]);
      const lineage=links.filter(l=>ids.has(l.claim_id));
      const sources=new Set([...args.p_care_ids,...lineage.map(l=>l.legacy_row_id)]);
      return {error:null,data:{claims:structuredClone(claims.filter(c=>ids.has(c.id))),relations,lineage,
        sources:[...rows,...(graph.sources||[])].filter(r=>sources.has(r.id)&&!(graph.missing||[]).includes(r.id)),
        withheld_source_ids:(graph.removedSources||[]).filter(id=>args.p_care_ids.includes(id)),
        withheld_claim_ids:(graph.removedClaims||[]).filter(id=>ids.has(id)),
        truncated:!!graph.truncated || (graph.partialPets||[]).some(p=>args.p_seed_pet_ids.includes(p))}};
    }};
  }};
  const coverage={plan:{from:scope.from,to:scope.to,terms:[],interpretation:'period'},candidateIds:[],queryCount:0,
    retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown',continuation:[],reasons:[],
    consistency:'read_committed_no_snapshot',perPet:[],provenance:[],claimSources:[],excludedIds:[]};
  const effectiveWindow=createEffectiveWindowResolver({owned:new Set(scope.ownedPetIds),petIds:pets,userId:'owner',db,coverage,deadline:Date.now()+60000});
  const store={effectiveWindow,effective:async()=>{throw Error('must use correction-aware stream');},
    page:async input=>{pages.push(input);return rows.filter(r=>r.pet_profile_id===input.petId&&!r.deleted_at
      && r.occurred_at>=input.from&&r.occurred_at<input.to).sort((a,b)=>input.ordering==='asc'?eventOrder(a,b):eventOrder(b,a))
      .slice(input.offset,input.offset+input.limit);}};
  return {store,pages,calls,coverage};
}
async function run(rows, graph={}, ticket=plan()) {
  const f=fixture(rows,graph,ticket.subjects.petIds);
  return {...f,result:await retrieveReadTicket(ticket,scope,f.store)};
}
const selected = r => r.coverage.effectiveStream.flatMap(s=>s.certifiedSelectedIds).sort();

const {validateAppendJob}=await import('../app/lib/furvise-brain/append-job.ts');
const {receiptCompletionText}=await import('../app/lib/intelligence/receipt-completion.ts');
const {recoverIdempotentRpc}=await import('../app/lib/security/idempotent-rpc-recovery.ts');
const {buildEvidenceNeedCoverage,completedEmptyEvidenceNeeds,historyCompletionLimits}=await import('../app/lib/intelligence/evidence-need-coverage.ts');
const {detectImmediateAskEmergency}=await import('../app/lib/ask-safety-context.ts');
const {exceedsSelectedPetRead}=await import('../app/lib/intelligence/selected-pet-read.ts');
const {createAnswerAssessment}=await import('../app/lib/intelligence/answer-assessment.ts');
const {bindCalculatePlan}=await import('../app/lib/furvise-brain/calculate-plan.ts');
const {publicV1AskCapability}=await import('../app/lib/public-v1-capabilities.ts');
const fs=await import('node:fs');
const cases=[];
const add=(category,name,expected,execute)=>cases.push({category,name,expected,execute});
const baseRows=()=>['a','b','c'].flatMap((p,k)=>[row(p,0,'weight '+(13+k)+' kg'),row(p,14,'weight '+(17+k)+' kg'),row(p,30,'weight '+(23+k)+' kg')]);
for(const [name,change,expected] of [
 ['late value correction',claim('amend','a',30,'correct','weight 21.75 kg'),['claim-amend']],
 ['correction moves before former earliest',claim('amend','a',-3,'correct','weight 21.75 kg'),['a-14']],
 ['correction removes predicate',claim('amend','a',30,'correct','diet changed to lamb'),['a-14']],
])add('corrections',name,expected,async expected=>{
 const r=await run(baseRows(),{claims:[claim('original','a',30,'assert','weight 23 kg'),change],edges:[edge('amend','original','corrects')],links:[link('original','a-30')]});
 assert.deepEqual(selected(r.result),expected);
 assert.ok(!r.result.records.some(x=>x.id==='a-30'));
});
add('corrections','two corrections preserve final chain',['claim-second'],async expected=>{
 const graph={claims:[claim('original','a',30,'assert','weight 23 kg'),claim('first','a',30,'correct','weight 21.75 kg'),claim('second','a',30,'correct','weight 20.25 kg')],
 edges:[edge('first','original','corrects'),edge('second','first','corrects')],links:[link('original','a-30')]};
 const r=await run(baseRows(),graph);assert.deepEqual(selected(r.result),expected);assert.equal(r.result.records[0].note,'weight 20.25 kg');
});
for(const [name,from,to,expected] of [
 ['November half-open','2023-11-01T00:00:00Z','2023-12-01T00:00:00Z',['a-14']],
 ['December boundary inclusive','2023-12-01T00:00:00Z','2023-12-02T00:00:00Z',['a-30']],
 ['one-day exact lower boundary','2023-11-15T00:00:00Z','2023-11-16T00:00:00Z',['a-14']],
 ['empty intervening day','2023-11-16T00:00:00Z','2023-11-17T00:00:00Z',[]],
])add('time_windows',name,expected,async expected=>{
 const ticket=bindCompositionalReadTicket({operation:'read',temporal:{from,to,anchor:null},predicates:[{kind:'text_any',terms:['weight']}],
 selection:{groupBy:['subject'],union:[clause()]},outputs:{completeness:'sufficient',ordering:'desc',limit:null}},['a']);
 const r=await run(baseRows(),{},ticket);assert.deepEqual(selected(r.result),expected);
});
for(const order of [['b','a','c'],['c','b','a'],['a','c','b']])
 add('multi_pet_isolation','subject permutation '+order.join(''),['a-30','b-30','c-30'],async expected=>{
 const r=await run(baseRows(),{},plan(order));assert.deepEqual(selected(r.result),expected);
 });
add('multi_pet_isolation','foreign raw row never certifies',[],async expected=>{
 const f=fixture(baseRows());f.store.page=async()=>[{...row('a',30),user_id:'foreign-owner'}];
 const r=await retrieveReadTicket(plan(),scope,f.store);assert.deepEqual(selected(r),expected);assert.deepEqual(r.records,[]);
});
add('multi_pet_isolation','unowned explicit widening blocked',true,expected=>{
 assert.equal(exceedsSelectedPetRead({readOnly:true,petIds:['b','foreign'],request:{mode:'read',evidenceBasis:'saved_history'}},'a',['a','b'],['b','foreign']),expected);
});
for(const [name,graph] of [
 ['truncated correction graph',{truncated:true}],
 ['missing linked original',{claims:[claim('unseen','a',0),claim('amend','a',30,'correct')],edges:[edge('amend','unseen','corrects')],links:[link('unseen','absent-row')]}],
 ['ambiguous attributed correction',{sourceSemantics:{'a-30':{classification:'attributed_correction',target:{kind:'target_unknown'}}}}],
])add('provenance',name,[],async expected=>{
 const r=await run(baseRows(),graph);assert.deepEqual(selected(r.result),expected);
 assert.equal(r.result.coverage.groups[0].selectionStatus,'partial');
});
add('provenance','one pet unresolved keeps independent pets',['a-30','c-30'],async expected=>{
 const r=await run(baseRows(),{partialPets:['b']},plan(['c','b','a']));assert.deepEqual(selected(r.result),expected);
});
for(const [operator,quotes,roles,unit] of [
 ['difference',['31.625 kg','9.125 kg'],['target','reference'],'kg'],
 ['mean',['1.125 kg','2.875 kg'],['member','member'],'kg'],
 ['ratio',['0 kg','7 kg'],['reference','target'],'scalar'],
 ['percent_change',['14 kg','21 kg'],['reference','target'],'%'],
])add('calculations','V1 excludes '+operator,{available:false,reason:'calculation'},expected=>{
 const text='Given '+quotes.join(' and ')+', calculate '+operator+'.';
 const p=bindCalculatePlan({operation:'calculate',resultSelection:null,calculations:[{id:'new-'+operator,operator,
 operands:quotes.map((quote,i)=>({kind:'premise',role:roles[i],sourceTurnId:null,quote,unit:'kg'})),resultUnit:unit,precision:null}]},null,[],{id:'fresh-user',role:'user',text});
 assert.deepEqual(p.calculations[0].operands.map(x=>x.source.text),quotes);
 const decision=publicV1AskCapability({mode:'read',evidenceBasis:'supplied_context',calculatePlan:p});
 assert.equal(decision.available,expected.available);assert.equal(decision.reason,expected.reason);
});
const pet={id:'a',user_id:'owner',name:'Kestrel'};
function writeFixture(){
 const bodies=['2024-02-29: Kestrel ate 43 g of salmon.','2024-03-02: Kestrel walked for 19 minutes.','2024-03-04: Kestrel weighed 12.625 kg.'];
 const text='Save these:\n'+bodies.join('\n')+'\nShow the latest recorded weight.';
 const source={id:'unseen-user-write',role:'user',text,createdAt:'2026-09-30T12:00:00Z'};
 const job=validateAppendJob({operation:'append',petName:pet.name,items:bodies.map(bodyQuote=>({bodyQuote,dateQuote:bodyQuote.slice(0,10),occurredAt:bodyQuote.slice(0,10)})),companionQuote:'Show the latest recorded weight.'},source,[pet],'owner');
 const requestedItems=job.items.map(x=>({sourceSpanId:x.body.id,body:x.body.text,occurredAt:x.occurredAt,petId:job.petId,sourceMessageId:job.sourceMessageId}));
 const records=requestedItems.map((x,i)=>({id:'unseen-row-'+i,note:x.body,occurredAt:x.occurredAt,petId:x.petId,sourceMessageId:x.sourceMessageId,sourceSpanId:x.sourceSpanId}));
 return {job,source,receipt:{sourceMessageId:job.sourceMessageId,petId:job.petId,requestText:'Display only',answerPersisted:true,requestedItems,records}};
}
add('writes_idempotency','V1 excludes mixed append while retaining canonical obligations','mutation',expected=>{
 const {job}=writeFixture();assert.equal(job.items.length,3);
 assert.equal(publicV1AskCapability({mode:'mixed',appendJob:job,readTicket:{}}).reason,expected);
});
for(const kind of ['body','date','pet','source','span','missing','duplicate'])
 add('writes_idempotency','exact receipt rejects '+kind,'2 of 3 requested',expected=>{
 const r=writeFixture().receipt;
 if(kind==='body')r.records[1].note+=' invented';
 if(kind==='date')r.records[1].occurredAt='2024-03-03T00:00:00Z';
 if(kind==='pet')r.records[1].petId='b';
 if(kind==='source')r.records[1].sourceMessageId='different-user-turn';
 if(kind==='span')r.records[1].sourceSpanId='different-span';
 if(kind==='missing')r.records.splice(1,1);
 if(kind==='duplicate')r.records[1]=structuredClone(r.records[0]);
 assert.ok(receiptCompletionText(r).startsWith(expected));
});
add('writes_idempotency','lost acknowledgment preserves one durable effect',{calls:2,effects:1},async expected=>{
 let calls=0;const rows=new Map();const payload=Object.freeze({request:'fresh-unique-write',petId:'a',body:'Kestrel drank 63 ml.'});const observed=[];
 const r=await recoverIdempotentRpc(async()=>{calls++;observed.push(payload);if(!rows.has(payload.request))rows.set(payload.request,{id:'durable-one',body:payload.body});
 if(calls===1)throw Object.assign(new Error('socket reset'),{code:'ECONNRESET'});
 return {data:rows.get(payload.request),error:null};});
 assert.equal(calls,expected.calls);assert.equal(rows.size,expected.effects);assert.equal(observed[0],observed[1]);assert.equal(r.data.body,payload.body);
});
for(const error of ['42501','22023'])add('writes_idempotency','no retry for '+error,1,async expected=>{
 let count=0;await recoverIdempotentRpc(async()=>{count++;return{data:null,error:{code:error}};});assert.equal(count,expected);
});
add('missing_data','exhausted empty pet is explicitly empty',[],async expected=>{
 const r=await run([],{},plan(['a']));assert.deepEqual(selected(r.result),expected);assert.equal(r.result.coverage.groups[0].selectionStatus,'complete_empty');
});
add('missing_data','unavailable page cannot establish absence','partial',async expected=>{
 const f=fixture([]);f.store.page=async()=>{throw Error('synthetic unavailable');};
 const r=await retrieveReadTicket(plan(),scope,f.store);assert.equal(r.coverage.groups[0].selectionStatus,expected);assert.deepEqual(selected(r),[]);
});
for(const [name,source,pets] of [
 ['repeated exact quote',{id:'u',role:'user',text:'Observation. Observation.'},[pet]],
 ['assistant source',{id:'u',role:'furvise',text:'Observation.'},[pet]],
 ['duplicate names',{id:'u',role:'user',text:'Observation.'},[pet,{...pet,id:'b'}]],
])add('ambiguity',name,'rejected',()=>{
 assert.throws(()=>validateAppendJob({operation:'append',petName:'Kestrel',items:[{bodyQuote:'Observation.',dateQuote:null,occurredAt:null}],companionQuote:null},source,pets,'owner'),/ASK_REQUEST_INVALID/);
});
for(const [text,expected] of [
 ['Kestrel cannot breathe. Tansy is breathing normally.',true],
 ['Kestrel is having a seizure. Tansy stopped seizing.',true],
 ['I think Kestrel cannot breathe right now.',true],
 ['What if Kestrel cannot breathe?',false],
 ['In 2021 Kestrel was gasping.',false],
 ['Kestrel cannot breathe. Kestrel is breathing normally now.',false],
])add('safety',text,expected,expected=>assert.equal(!!detectImmediateAskEmergency(text),expected));
function needsFixture(){
 const text='Ate 43 g of salmon.';
 return {scope:{authorizedPetIds:['a','b']},interpretation:{request:{evidenceNeeds:[
 {id:'need:weight',petIds:['a'],quote:'latest weight',terms:['weight'],order:'latest'},
 {id:'need:food',petIds:['b'],quote:'food history',terms:['salmon'],order:'context'}]}},
 history:{needs:[{petId:'a',needId:'need:weight',candidateIds:[],exhausted:true,status:'unknown'},
 {petId:'b',needId:'need:food',candidateIds:['care:food-b'],exhausted:true,status:'unknown'}],provenance:[]},
 sources:[{petId:'b',status:'loaded',loadedIds:['care:food-b']}],losses:[],
 represented:[{petId:'b',sourceId:'care:food-b',sourceType:'care_update',occurredAt:'2024-02-29T12:00:00Z',text,start:0,end:text.length}]};
}
add('companion_obligations','empty first obligation cannot erase populated companion',['["need:weight","a"]'],expected=>{
 const e=needsFixture();assert.deepEqual(completedEmptyEvidenceNeeds(e),expected);
 const c=buildEvidenceNeedCoverage(e);assert.deepEqual(c[1].pets[0].representedSourceIds,['care:food-b']);assert.equal(c[1].semanticSupport,'unverified');
});
add('companion_obligations','lost companion source cannot certify empty or complete',[],expected=>{
 const e=needsFixture();e.losses=[{sourceId:'care:food-b',reason:'prompt_budget'}];e.history.requiredSourceIds=['care:food-b'];
 assert.deepEqual(buildEvidenceNeedCoverage(e)[1].pets[0].representedSourceIds,expected);
 assert.ok(historyCompletionLimits(e).includes('required_evidence_missing'));
});
for(const check of ['taskCompletion','evidenceSupport','calculationCorrectness'])
 add('companion_obligations','successful main task cannot mask '+check,'not-complete',()=>{
 const checks={structuralValidity:'passed',evidenceSupport:'passed',subjectDateCorrectness:'passed',calculationCorrectness:'passed',taskCompletion:'passed'};
 checks[check]='not_evaluated';
 assert.notEqual(createAnswerAssessment({checks,body:'Main task succeeded; companion not verified.',evidence:[]}).outcome,'complete');
});
const manifest=cases.map(({category,name,expected},i)=>({id:'UV1-'+String(i+1).padStart(3,'0'),category,name,expected}));
if(process.env.FURVISE_CAMPAIGN_MANIFEST_ONLY){
 fs.writeFileSync(process.env.FURVISE_CAMPAIGN_MANIFEST_ONLY,JSON.stringify({version:1,groundTruth:'Fixed literal expectations authored before execution; no production answer-derived oracle.',cases:manifest},null,2),{flag:'wx'});
}else{
 test('fresh synthetic public V1 campaign; halt at first semantic assertion',async()=>{
 const receipt={baseHead:'f5d153e204af694369a587d09eff578ac803b6fd',providerCalls:0,completed:[],firstFailure:null,total:cases.length};
 try{
  for(const [i,c]of cases.entries()){
   try{await c.execute(structuredClone(c.expected));receipt.completed.push(manifest[i]);console.log('CAMPAIGN_PASS '+JSON.stringify(manifest[i]));}
   catch(e){receipt.firstFailure={...manifest[i],error:String(e),stack:e.stack};throw e;}
  }
 }finally{
  if(process.env.FURVISE_CAMPAIGN_RESULT)fs.writeFileSync(process.env.FURVISE_CAMPAIGN_RESULT,JSON.stringify(receipt,null,2),{flag:'wx'});
 }
 });
}
